import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { network } from 'hardhat'
import { getAddress } from 'viem'
import {
  attestationCommitment,
  attestationDomain,
  attestationTypes,
  indexRegistries,
  randomBytes,
} from '@glimpse/verifier'

describe('indexRegistries', async () => {
  const { viem } = await network.create()
  const publicClient = await viem.getPublicClient()
  const [admin, signer, newSigner, holder] = await viem.getWalletClients()
  const chainId = await publicClient.getChainId()

  it('folds registrations, rotations, anchors and revocations, then catches up', async () => {
    const fromBlock = (await publicClient.getBlockNumber()) + 1n
    const issuers = await viem.deployContract('IssuerRegistry')
    const registry = await viem.deployContract('AttestationRegistry', [issuers.address])
    const issuerId = randomBytes(16)
    await issuers.write.register([issuerId, signer.account.address, 'https://school.example'])
    const now = (await publicClient.getBlock()).timestamp
    const message = {
      attestationId: randomBytes(16),
      issuerId,
      commitment: attestationCommitment({
        salt: randomBytes(32),
        attestationId: randomBytes(16),
        holder: holder.account.address,
        attribute: 'student_status',
        value: { type: 'boolean', value: true },
      }),
      issuedAt: now,
      expiresAt: now + 3600n,
    }
    const signature = await signer.signTypedData({
      account: signer.account,
      domain: attestationDomain(chainId, registry.address),
      types: attestationTypes,
      primaryType: 'Attestation',
      message,
    })
    const { attestationId, commitment, issuedAt, expiresAt } = message
    await registry.write.anchor([
      attestationId,
      issuerId,
      commitment,
      issuedAt,
      expiresAt,
      signature,
    ])

    // A step of 2 blocks makes the indexer page through several getLogs calls.
    const config = {
      client: publicClient,
      issuerRegistry: issuers.address,
      attestationRegistry: registry.address,
      fromBlock,
      step: 2n,
    }
    const index = await indexRegistries(config)
    assert.deepEqual(index.issuers.get(issuerId), {
      admin: getAddress(admin.account.address),
      signer: getAddress(signer.account.address),
      metadataURI: 'https://school.example',
    })
    assert.deepEqual(index.attestations.get(attestationId), {
      issuerId,
      signer: getAddress(signer.account.address),
      commitment,
      issuedAt,
      expiresAt,
      revokedAt: 0n,
    })

    await issuers.write.rotateSigner([issuerId, newSigner.account.address])
    await registry.write.revoke([attestationId])
    const caughtUp = await indexRegistries(config, index)
    assert.equal(caughtUp.issuers.get(issuerId)?.signer, getAddress(newSigner.account.address))
    assert.equal(
      caughtUp.attestations.get(attestationId)?.revokedAt,
      (await registry.read.getAnchor([attestationId])).revokedAt,
    )
    assert.equal(caughtUp.toBlock, await publicClient.getBlockNumber())

    // Several ranges in flight at once fold to the same index, and report their progress.
    const progress: number[] = []
    const parallel = await indexRegistries({
      ...config,
      concurrency: 4,
      onProgress: (done) => progress.push(done),
    })
    assert.deepEqual(parallel, caughtUp)
    assert.equal(progress.at(-1), 1)
    assert.ok(progress.every((p, i) => i === 0 || p >= (progress[i - 1] ?? 0)))
  })
})
