import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixtures, parseContract } from '@glimpse/shared'
import {
  generateEncryptionKeys,
  generateOpaqueId,
  encryptItem,
  decryptItem,
  wrapForRequester,
  encryptAttestation,
  decryptAttestation,
} from '@glimpse/vault'
import type { EncryptionIdentity } from '@glimpse/vault'
import {
  createVaultStorage,
  createShareService,
  createFileStorageBackend,
} from '@glimpse/vault/server'
import type { AuthenticatedHolder, ConsentDecision } from '@glimpse/vault/server'
import { createMemoryStorageBackendForTests } from '@glimpse/vault/server/testing'
import { attestationCommitment, attestationTypes, attestationDomain } from '@glimpse/verifier'
import { recoverTypedDataAddress } from 'viem'
let owner: EncryptionIdentity
let requester: EncryptionIdentity
let stranger: EncryptionIdentity
before(async () => {
  owner = await generateEncryptionKeys(generateOpaqueId())
  requester = await generateEncryptionKeys(generateOpaqueId())
  stranger = await generateEncryptionKeys(generateOpaqueId())
})
const session = (p: EncryptionIdentity): AuthenticatedHolder => ({
  holderId: p.recipientId,
  encryptionKeyIds: [p.recipientKeyId],
  expiresAt: Date.now() + 60_000,
})
const expect = (
  r: { itemId: string; itemVersion: number; keyId: string; sourceClass: 'A' | 'B' | 'C' },
  grantId: string,
  recordDigest: string,
) => ({ ...r, grantId, recordDigest })
async function setup(backend = createMemoryStorageBackendForTests()) {
  const claim = parseContract('ExtractedClaim', fixtures.valid.ExtractedClaim)
  const item = await encryptItem(claim, claim.document, owner, {
    itemId: generateOpaqueId(),
    itemVersion: 1,
    grantId: generateOpaqueId(),
  })
  const reference = await createVaultStorage({
    backend,
    authenticate: () => Promise.resolve(session(owner)),
  }).put({ record: item.record, envelopes: [item.envelope] })
  let actor = owner
  let d: ConsentDecision | null = {
    outcome: 'allow',
    holderId: owner.recipientId,
    recipientId: requester.recipientId,
    recipientKeyId: requester.recipientKeyId,
    itemId: item.record.itemId,
    itemVersion: 1,
    consentRequestId: generateOpaqueId(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }
  const create = () =>
    createShareService({
      backend,
      authenticate: () => Promise.resolve(session(actor)),
      readDecision: () => Promise.resolve(d),
    })
  return {
    item,
    claim,
    reference,
    create,
    actor: (p: EncryptionIdentity) => {
      actor = p
    },
    decision: () => {
      assert.ok(d)
      return d
    },
    change: (v: ConsentDecision | null) => {
      d = v
    },
  }
}
test('recipient receives exactly one granted attribute and no holder key', async () => {
  const f = await setup()
  const service = f.create()
  const ticket = await service.authorize(f.reference, f.decision().consentRequestId)
  const e = await wrapForRequester(
    f.item.record,
    f.item.envelope,
    owner,
    expect(f.item.record, f.item.envelope.grantId, f.item.recordDigest),
    ticket.grant,
    requester,
  )
  assert.equal(e.recipientKeyId, requester.recipientKeyId)
  await service.publish(ticket.shareReference, e)
  f.actor(requester)
  const received = await service.receive(ticket.shareReference)
  assert.deepEqual(
    await decryptItem(
      received.record,
      received.envelope,
      requester,
      expect(received.record, received.grant.grantId, f.item.recordDigest),
    ),
    f.claim,
  )
  assert.deepEqual(Object.keys(received).sort(), ['envelope', 'grant', 'record'])
  assert.equal(JSON.stringify(received).includes('privateKey'), false)
  await assert.rejects(
    decryptItem(
      f.item.record,
      f.item.envelope,
      requester,
      expect(f.item.record, f.item.envelope.grantId, f.item.recordDigest),
    ),
  )
  const other = await encryptItem(f.claim, f.claim.document, owner, {
    itemId: generateOpaqueId(),
    itemVersion: 1,
    grantId: generateOpaqueId(),
  })
  await assert.rejects(
    decryptItem(
      other.record,
      e,
      requester,
      expect(other.record, ticket.grant.grantId, other.recordDigest),
    ),
  )
  f.actor(stranger)
  await assert.rejects(service.receive(ticket.shareReference))
  await assert.rejects(service.revoke(ticket.shareReference))
})
test('missing, denied or mismatched AccessDecision adapter never issues a grant', async () => {
  for (const change of [
    null,
    { outcome: 'deny' as const },
    { holderId: generateOpaqueId() },
    { itemVersion: 2 },
    { recipientKeyId: 'invalid' },
  ]) {
    const f = await setup()
    const id = f.decision().consentRequestId
    f.change(change === null ? null : { ...f.decision(), ...change })
    await assert.rejects(f.create().authorize(f.reference, id))
  }
})
test('replay, revoked consent and wrong recipient keys fail closed', async () => {
  const f = await setup()
  const s = f.create()
  const ticket = await s.authorize(f.reference, f.decision().consentRequestId)
  await assert.rejects(s.authorize(f.reference, f.decision().consentRequestId))
  const e = await wrapForRequester(
    f.item.record,
    f.item.envelope,
    owner,
    expect(f.item.record, f.item.envelope.grantId, f.item.recordDigest),
    ticket.grant,
    requester,
  )
  await assert.rejects(
    s.publish(ticket.shareReference, { ...e, recipientKeyId: stranger.recipientKeyId }),
  )
  await s.publish(ticket.shareReference, e)
  f.actor(requester)
  f.change({ ...f.decision(), outcome: 'deny' })
  await assert.rejects(s.receive(ticket.shareReference))
})
test('expiry is checked during envelope creation and every delivery', async () => {
  const f = await setup()
  const s = f.create()
  const ticket = await s.authorize(f.reference, f.decision().consentRequestId)
  const expired = {
    ...ticket.grant,
    createdAt: '2020-01-01T00:00:00.000Z',
    expiresAt: '2020-01-02T00:00:00.000Z',
  }
  await assert.rejects(
    wrapForRequester(
      f.item.record,
      f.item.envelope,
      owner,
      expect(f.item.record, f.item.envelope.grantId, f.item.recordDigest),
      expired,
      requester,
    ),
  )
  const e = await wrapForRequester(
    f.item.record,
    f.item.envelope,
    owner,
    expect(f.item.record, f.item.envelope.grantId, f.item.recordDigest),
    ticket.grant,
    requester,
  )
  await s.publish(ticket.shareReference, e)
  f.actor(requester)
  f.change({ ...f.decision(), expiresAt: '2020-01-02T00:00:00.000Z' })
  await assert.rejects(s.receive(ticket.shareReference))
})
test('file-persisted revocation survives a new service/adapter and cannot be replayed', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'glimpse-share-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const f = await setup(await createFileStorageBackend({ directory: root }))
  const s = f.create()
  const ticket = await s.authorize(f.reference, f.decision().consentRequestId)
  const e = await wrapForRequester(
    f.item.record,
    f.item.envelope,
    owner,
    expect(f.item.record, f.item.envelope.grantId, f.item.recordDigest),
    ticket.grant,
    requester,
  )
  await s.publish(ticket.shareReference, e)
  await s.revoke(ticket.shareReference)
  f.actor(requester)
  await assert.rejects(f.create().receive(ticket.shareReference))
  const fresh = createShareService({
    backend: await createFileStorageBackend({ directory: root }),
    authenticate: () => Promise.resolve(session(requester)),
    readDecision: () => Promise.resolve(f.decision()),
  })
  await assert.rejects(fresh.receive(ticket.shareReference))
  f.actor(owner)
  await assert.rejects(s.authorize(f.reference, f.decision().consentRequestId))
})
test('C signed fixture commitment/signature survives holder encryption and requester sharing', async () => {
  const a = parseContract('AttestationRecord', fixtures.valid.AttestationRecord)
  assert.equal(
    attestationCommitment({
      ...a,
      attestationId: `0x${a.attestationId}`,
      holder: a.holder as `0x${string}`,
      salt: a.salt as `0x${string}`,
    }),
    a.commitment,
  )
  const signer = await recoverTypedDataAddress({
    domain: attestationDomain(a.proof.chainId, a.proof.verifyingContract as `0x${string}`),
    types: attestationTypes,
    primaryType: 'Attestation',
    message: {
      attestationId: `0x${a.attestationId}`,
      issuerId: `0x${a.issuerId}`,
      commitment: a.commitment as `0x${string}`,
      issuedAt: BigInt(Date.parse(a.issuedAt) / 1000),
      expiresAt: BigInt(Date.parse(a.expiresAt) / 1000),
    },
    signature: a.proof.signature as `0x${string}`,
  })
  assert.equal(signer.toLowerCase(), fixtures.valid.IssuerRegistryEntry.signer.toLowerCase())
  const item = await encryptAttestation(a, owner, {
    itemId: generateOpaqueId(),
    itemVersion: 1,
    grantId: generateOpaqueId(),
  })
  assert.deepEqual(
    await decryptAttestation(
      item.record,
      item.envelope,
      owner,
      expect(item.record, item.envelope.grantId, item.recordDigest),
    ),
    a,
  )
  const grant = parseContract('ShareGrant', {
    schemaVersion: '1.0.0',
    grantId: generateOpaqueId(),
    itemId: item.record.itemId,
    itemVersion: 1,
    holderId: owner.recipientId,
    recipientId: requester.recipientId,
    consentRequestId: generateOpaqueId(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    revocation: { status: 'active' },
  })
  const e = await wrapForRequester(
    item.record,
    item.envelope,
    owner,
    expect(item.record, item.envelope.grantId, item.recordDigest),
    grant,
    requester,
  )
  assert.deepEqual(
    await decryptAttestation(
      item.record,
      e,
      requester,
      expect(item.record, grant.grantId, item.recordDigest),
    ),
    a,
  )
  await assert.rejects(
    decryptAttestation(
      item.record,
      e,
      stranger,
      expect(item.record, grant.grantId, item.recordDigest),
    ),
  )
})
