import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
  packEncryptedItem,
  verifyEncryptedItem,
} from '@glimpse/vault'
import {
  createPrivateExtractionService,
  syntheticDemoModel,
  createOllamaModel,
  createFileStorageBackend,
  createVaultStorage,
  createShareService,
} from '@glimpse/vault/server'
import type { AuthenticatedHolder, ConsentDecision } from '@glimpse/vault/server'

// All identities/consent here are explicit synthetic demo adapters, NOT live SIWE authorization.
const root = await mkdtemp(join(tmpdir(), 'glimpse-pole-b-demo-'))
const owner = await generateEncryptionKeys(generateOpaqueId())
const requester = await generateEncryptionKeys(generateOpaqueId())
let actor = owner
const authenticate = (): Promise<AuthenticatedHolder> =>
  Promise.resolve({
    holderId: actor.recipientId,
    encryptionKeyIds: [actor.recipientKeyId],
    expiresAt: Date.now() + 60_000,
  })
try {
  const documentId = generateOpaqueId()
  const realModel = process.argv.includes('--ollama')
  const extraction = createPrivateExtractionService({
    authenticate,
    attributes: [{ attribute: 'student_status', label: 'Student', type: 'boolean' }],
    readConsent: () =>
      Promise.resolve({
        holderId: owner.recipientId,
        documentId,
        documentVersion: 1,
        purpose: 'extract-attributes',
        policyVersion: '1',
        granted: true,
        attributes: ['student_status'],
        expiresAt: Date.now() + 60_000,
      }),
    model: realModel
      ? createOllamaModel(process.env.OLLAMA_MODEL ?? 'qwen2.5:0.5b')
      : syntheticDemoModel(),
  })
  const pdf = await readFile(new URL('../fixtures/education-synthetic.pdf', import.meta.url))
  const [claim] = await extraction.extractPdf(
    pdf,
    { documentId, documentVersion: 1, kind: 'synthetic' },
    ['student_status'],
  )
  assert.ok(claim)
  const item = await encryptItem(claim, claim.document, owner, {
    itemId: generateOpaqueId(),
    itemVersion: 1,
    grantId: generateOpaqueId(),
  })
  const backend = await createFileStorageBackend({ directory: root })
  const vault = createVaultStorage({ backend, authenticate })
  const packed = await packEncryptedItem({ record: item.record, envelopes: [item.envelope] })
  const reference = await vault.putBytes(packed.bytes)
  const reopened = createVaultStorage({
    backend: await createFileStorageBackend({ directory: root }),
    authenticate,
  })
  const downloaded = await reopened.getBytes(reference)
  assert.ok(downloaded)
  const stored = await verifyEncryptedItem(downloaded, packed.digest)
  assert.deepEqual(
    await decryptItem(stored.record, stored.envelopes[0], owner, {
      ...item.record,
      grantId: item.envelope.grantId,
      recordDigest: item.recordDigest,
    }),
    claim,
  )
  const decision: ConsentDecision = {
    outcome: 'allow',
    holderId: owner.recipientId,
    recipientId: requester.recipientId,
    recipientKeyId: requester.recipientKeyId,
    itemId: item.record.itemId,
    itemVersion: 1,
    consentRequestId: generateOpaqueId(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }
  const sharing = createShareService({
    backend,
    authenticate,
    readDecision: () => Promise.resolve(decision),
  })
  const ticket = await sharing.authorize(reference, decision.consentRequestId)
  const envelope = await wrapForRequester(
    item.record,
    item.envelope,
    owner,
    { ...item.record, grantId: item.envelope.grantId, recordDigest: item.recordDigest },
    ticket.grant,
    requester,
  )
  await sharing.publish(ticket.shareReference, envelope)
  actor = requester
  const delivery = await sharing.receive(ticket.shareReference)
  assert.deepEqual(
    await decryptItem(delivery.record, delivery.envelope, requester, {
      ...delivery.record,
      grantId: delivery.grant.grantId,
      recordDigest: item.recordDigest,
    }),
    claim,
  )
  actor = owner
  await sharing.revoke(ticket.shareReference)
  actor = requester
  await assert.rejects(sharing.receive(ticket.shareReference))
  const attestation = parseContract('AttestationRecord', fixtures.valid.AttestationRecord)
  const encryptedC = await encryptAttestation(attestation, owner, {
    itemId: generateOpaqueId(),
    itemVersion: 1,
    grantId: generateOpaqueId(),
  })
  assert.deepEqual(
    await decryptAttestation(encryptedC.record, encryptedC.envelope, owner, {
      ...encryptedC.record,
      grantId: encryptedC.envelope.grantId,
      recordDigest: encryptedC.recordDigest,
    }),
    attestation,
  )
  process.stdout.write(
    JSON.stringify({
      mode: realModel ? 'local-ollama' : 'explicit-synthetic-offline',
      extraction: true,
      pdf: true,
      encryption: true,
      persistentStorage: true,
      requesterSharing: true,
      revocationRejected: true,
      CFixtureRoundTrip: true,
      privateKeys: 'memory-only',
      temporaryFiles: 'purged-on-exit',
    }) + '\n',
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
