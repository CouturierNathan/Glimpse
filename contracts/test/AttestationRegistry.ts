import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { network } from 'hardhat'
import { getAddress, stringToHex, type Hex } from 'viem'
import {
  attestationCommitment,
  attestationDomain,
  attestationTypes,
  randomBytes,
  type AttestationContent,
} from '../attestation.ts'

const YEAR = 365 * 24 * 60 * 60
const Status = { Unknown: 0, Active: 1, Expired: 2, Revoked: 3 }

describe('AttestationRegistry', async () => {
  const { viem, networkHelpers } = await network.create()
  const publicClient = await viem.getPublicClient()
  const [admin, signer, relayer, stranger, newSigner, holder] = await viem.getWalletClients()
  const chainId = await publicClient.getChainId()

  async function deploy() {
    const issuers = await viem.deployContract('IssuerRegistry')
    const registry = await viem.deployContract('AttestationRegistry', [issuers.address])
    const issuerId = randomBytes(16)
    await issuers.write.register([issuerId, signer.account.address, 'https://school.example'])
    return { issuers, registry, issuerId }
  }

  async function attestation(
    issuerId: Hex,
    { signedBy = signer, domain = {}, validFor = YEAR } = {},
  ) {
    const now = BigInt(await networkHelpers.time.latest())
    const content: AttestationContent = {
      salt: randomBytes(32),
      attestationId: randomBytes(16),
      holder: holder.account.address,
      attribute: 'age_over_18',
      value: { type: 'boolean', value: true },
    }
    const message = {
      attestationId: content.attestationId,
      issuerId,
      commitment: attestationCommitment(content),
      issuedAt: now,
      expiresAt: now + BigInt(validFor),
    }
    const signature = await signedBy.signTypedData({
      account: signedBy.account,
      domain,
      types: attestationTypes,
      primaryType: 'Attestation',
      message,
    })
    return { content, message, signature }
  }

  async function signed(registry: { address: Hex }, issuerId: Hex, options = {}) {
    return attestation(issuerId, {
      domain: attestationDomain(chainId, registry.address),
      ...options,
    })
  }

  function args(a: Awaited<ReturnType<typeof attestation>>) {
    const m = a.message
    return [
      m.attestationId,
      m.issuerId,
      m.commitment,
      m.issuedAt,
      m.expiresAt,
      a.signature,
    ] as const
  }

  it('anchors a signed attestation sent by anyone and reads it back', async () => {
    const { registry, issuerId } = await deploy()
    const a = await signed(registry, issuerId)

    await viem.assertions.emitWithArgs(
      registry.write.anchor(args(a), { account: relayer.account }),
      registry,
      'AttestationAnchored',
      [
        a.message.attestationId,
        issuerId,
        getAddress(signer.account.address),
        a.message.commitment,
        a.message.issuedAt,
        a.message.expiresAt,
      ],
    )
    assert.deepEqual(await registry.read.getAnchor([a.message.attestationId]), {
      issuerId,
      signer: getAddress(signer.account.address),
      issuedAt: a.message.issuedAt,
      expiresAt: a.message.expiresAt,
      revokedAt: 0n,
      commitment: a.message.commitment,
    })
    assert.equal(await registry.read.statusOf([a.message.attestationId]), Status.Active)
  })

  it('puts nothing about the holder or the attribute on chain', async () => {
    const { registry, issuerId } = await deploy()
    const a = await signed(registry, issuerId)

    const hash = await registry.write.anchor(args(a))
    const tx = await publicClient.getTransaction({ hash })
    const receipt = await publicClient.getTransactionReceipt({ hash })
    const onChain = [tx.input, ...receipt.logs.flatMap((log) => [log.data, ...log.topics])]
      .join('')
      .toLowerCase()

    for (const secret of [
      a.content.holder,
      a.content.salt,
      stringToHex(a.content.attribute),
      stringToHex(JSON.stringify(a.content.value.value)),
    ]) {
      assert.ok(!onChain.includes(secret.slice(2).toLowerCase()), `${secret} leaked on chain`)
    }
  })

  it('rejects a signature from a key that is not the issuer signer', async () => {
    const { registry, issuerId } = await deploy()
    const a = await signed(registry, issuerId, { signedBy: stranger })

    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.anchor(args(a)),
      registry,
      'NotIssuerSigner',
      [issuerId, getAddress(stranger.account.address)],
    )
  })

  it('rejects an unknown issuer', async () => {
    const { issuers, registry } = await deploy()
    const unknown = randomBytes(16)
    const a = await signed(registry, unknown)

    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.anchor(args(a)),
      issuers,
      'UnknownIssuer',
      [unknown],
    )
  })

  it('rejects a field changed after signing', async () => {
    const { registry, issuerId } = await deploy()
    const a = await signed(registry, issuerId)
    const tampered = { ...a, message: { ...a.message, expiresAt: a.message.expiresAt + 1n } }

    await viem.assertions.revertWithCustomError(
      registry.write.anchor(args(tampered)),
      registry,
      'NotIssuerSigner',
    )
  })

  it('rejects a replay on the same contract, another contract or another chain', async () => {
    const { issuers, registry, issuerId } = await deploy()
    const a = await signed(registry, issuerId)
    await registry.write.anchor(args(a))

    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.anchor(args(a)),
      registry,
      'AlreadyAnchored',
      [a.message.attestationId],
    )

    const other = await viem.deployContract('AttestationRegistry', [issuers.address])
    await viem.assertions.revertWithCustomError(
      other.write.anchor(args(a)),
      other,
      'NotIssuerSigner',
    )

    const otherChain = await attestation(issuerId, {
      domain: attestationDomain(chainId + 1, registry.address),
    })
    await viem.assertions.revertWithCustomError(
      registry.write.anchor(args(otherChain)),
      registry,
      'NotIssuerSigner',
    )
  })

  it('rejects a zero id and an attestation that is not valid now', async () => {
    const { registry, issuerId } = await deploy()
    const zeroId = await signed(registry, issuerId)
    zeroId.message.attestationId = '0x00000000000000000000000000000000'
    await viem.assertions.revertWithCustomError(
      registry.write.anchor(args(zeroId)),
      registry,
      'InvalidAttestationId',
    )

    const expired = await signed(registry, issuerId, { validFor: 0 })
    const future = await signed(registry, issuerId)
    future.message.issuedAt += 3600n
    const noIssuedAt = await signed(registry, issuerId)
    noIssuedAt.message.issuedAt = 0n
    for (const a of [expired, future, noIssuedAt]) {
      await viem.assertions.revertWithCustomError(
        registry.write.anchor(args(a)),
        registry,
        'InvalidValidity',
      )
    }
  })

  it('accepts only the new key after a rotation and keeps older anchors', async () => {
    const { issuers, registry, issuerId } = await deploy()
    const before = await signed(registry, issuerId)
    await registry.write.anchor(args(before))

    await issuers.write.rotateSigner([issuerId, newSigner.account.address])

    await viem.assertions.revertWithCustomError(
      registry.write.anchor(args(await signed(registry, issuerId))),
      registry,
      'NotIssuerSigner',
    )
    await registry.write.anchor(args(await signed(registry, issuerId, { signedBy: newSigner })))
    assert.equal(await registry.read.statusOf([before.message.attestationId]), Status.Active)
  })

  it('lets the issuer admin or signer revoke, once', async () => {
    const { registry, issuerId } = await deploy()

    for (const by of [admin, signer]) {
      const a = await signed(registry, issuerId)
      await registry.write.anchor(args(a))
      const id = a.message.attestationId

      const revokedAt = BigInt(await networkHelpers.time.latest()) + 1n
      await viem.assertions.emitWithArgs(
        registry.write.revoke([id], { account: by.account }),
        registry,
        'AttestationRevoked',
        [id, issuerId, revokedAt],
      )
      assert.equal(await registry.read.statusOf([id]), Status.Revoked)
      assert.equal((await registry.read.getAnchor([id])).revokedAt, revokedAt)
      await viem.assertions.revertWithCustomErrorWithArgs(
        registry.write.revoke([id], { account: by.account }),
        registry,
        'AlreadyRevoked',
        [id],
      )
    }
  })

  it('refuses a revocation by anyone else or of an unknown attestation', async () => {
    const { registry, issuerId } = await deploy()
    const a = await signed(registry, issuerId)
    await registry.write.anchor(args(a))

    for (const caller of [stranger, holder]) {
      await viem.assertions.revertWithCustomErrorWithArgs(
        registry.write.revoke([a.message.attestationId], { account: caller.account }),
        registry,
        'NotIssuer',
        [issuerId, getAddress(caller.account.address)],
      )
    }
    const unknown = randomBytes(16)
    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.revoke([unknown]),
      registry,
      'UnknownAttestation',
      [unknown],
    )
    assert.equal(await registry.read.statusOf([unknown]), Status.Unknown)
  })

  it('reports an attestation as expired once its validity ends', async () => {
    const { registry, issuerId } = await deploy()
    const a = await signed(registry, issuerId, { validFor: 60 })
    await registry.write.anchor(args(a))

    await networkHelpers.time.increase(60)

    assert.equal(await registry.read.statusOf([a.message.attestationId]), Status.Expired)
  })
})

describe('attestationCommitment', () => {
  const content: AttestationContent = {
    salt: randomBytes(32),
    attestationId: randomBytes(16),
    holder: '0x000000000000000000000000000000000000dEaD',
    attribute: 'age_over_18',
    value: { type: 'boolean', value: true },
  }

  it('is deterministic for the same content and salt', () => {
    assert.equal(attestationCommitment(content), attestationCommitment({ ...content }))
  })

  it('changes with the salt, so the same low-entropy value gives unrelated commitments', () => {
    assert.notEqual(
      attestationCommitment(content),
      attestationCommitment({ ...content, salt: randomBytes(32) }),
    )
  })

  it('binds the holder, the attribute, the value and its type', () => {
    const variants: AttestationContent[] = [
      { ...content, holder: '0x000000000000000000000000000000000000bEEF' },
      { ...content, attribute: 'age_over_21' },
      { ...content, value: { type: 'boolean', value: false } },
      { ...content, value: { type: 'string', value: 'true' } },
      { ...content, attestationId: randomBytes(16) },
    ]
    for (const variant of variants) {
      assert.notEqual(attestationCommitment(variant), attestationCommitment(content))
    }
  })
})
