import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { network } from 'hardhat'
import { getAddress, zeroAddress } from 'viem'
import { randomBytes } from '../attestation.ts'

describe('IssuerRegistry', async () => {
  const { viem } = await network.create()
  const [admin, signer, stranger, newSigner] = await viem.getWalletClients()

  async function deployWithIssuer() {
    const registry = await viem.deployContract('IssuerRegistry')
    const issuerId = randomBytes(16)
    await registry.write.register([issuerId, signer.account.address, 'https://issuer.example'])
    return { registry, issuerId }
  }

  it('registers an issuer with its admin, signer and metadata', async () => {
    const registry = await viem.deployContract('IssuerRegistry')
    const issuerId = randomBytes(16)

    await viem.assertions.emitWithArgs(
      registry.write.register([issuerId, signer.account.address, 'https://issuer.example']),
      registry,
      'IssuerRegistered',
      [
        issuerId,
        getAddress(admin.account.address),
        getAddress(signer.account.address),
        'https://issuer.example',
      ],
    )
    assert.deepEqual(await registry.read.getIssuer([issuerId]), {
      admin: getAddress(admin.account.address),
      signer: getAddress(signer.account.address),
      metadataURI: 'https://issuer.example',
    })
  })

  it('rejects a zero id, a zero signer and a taken id', async () => {
    const { registry, issuerId } = await deployWithIssuer()

    await viem.assertions.revertWithCustomError(
      registry.write.register(['0x00000000000000000000000000000000', signer.account.address, '']),
      registry,
      'InvalidIssuerId',
    )
    await viem.assertions.revertWithCustomError(
      registry.write.register([randomBytes(16), zeroAddress, '']),
      registry,
      'InvalidSigner',
    )
    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.register([issuerId, stranger.account.address, ''], {
        account: stranger.account,
      }),
      registry,
      'IssuerExists',
      [issuerId],
    )
  })

  it('reports an unknown issuer', async () => {
    const registry = await viem.deployContract('IssuerRegistry')
    const unknown = randomBytes(16)

    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.read.getIssuer([unknown]),
      registry,
      'UnknownIssuer',
      [unknown],
    )
    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.rotateSigner([unknown, newSigner.account.address]),
      registry,
      'UnknownIssuer',
      [unknown],
    )
  })

  it('lets only the admin rotate the signer', async () => {
    const { registry, issuerId } = await deployWithIssuer()

    for (const caller of [signer, stranger]) {
      await viem.assertions.revertWithCustomErrorWithArgs(
        registry.write.rotateSigner([issuerId, caller.account.address], {
          account: caller.account,
        }),
        registry,
        'NotIssuerAdmin',
        [issuerId, getAddress(caller.account.address)],
      )
    }
  })

  it('rotates the signer key', async () => {
    const { registry, issuerId } = await deployWithIssuer()

    await viem.assertions.emitWithArgs(
      registry.write.rotateSigner([issuerId, newSigner.account.address]),
      registry,
      'SignerRotated',
      [issuerId, getAddress(signer.account.address), getAddress(newSigner.account.address)],
    )
    const issuer = await registry.read.getIssuer([issuerId])
    assert.equal(issuer.signer, getAddress(newSigner.account.address))
    assert.equal(issuer.admin, getAddress(admin.account.address))
  })

  it('rejects rotating to the zero address or to the same key', async () => {
    const { registry, issuerId } = await deployWithIssuer()

    for (const key of [zeroAddress, signer.account.address]) {
      await viem.assertions.revertWithCustomError(
        registry.write.rotateSigner([issuerId, key]),
        registry,
        'InvalidSigner',
      )
    }
  })
})
