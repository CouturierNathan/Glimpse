/*
 * End-to-end smoke test of the holder journey against a running server, with the FAKE test
 * documents: sign-in, the identity gate, valid / forged / tampered proofs, matching and
 * mismatching documents, a request for several pieces answered by a holder and checked by an
 * anonymous requester, and both languages. It signs with throwaway keys made for each run, so
 * it can run again on the same server.
 *
 * Run: npm run dev -w apps/web (with PADES_TRUST_ANCHORS set to the FAKE test CA), then
 *      npm run e2e -w apps/web            (GLIMPSE_URL defaults to http://localhost:3000)
 */
import { randomBytes, webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import type { ExtractedClaim, ShareGrant, VerificationRequest } from '@glimpse/shared'
import {
  decryptItem,
  encryptItem,
  generateEncryptionKeys,
  generateOpaqueId,
  type ItemExpectation,
  packEncryptedItem,
  verifyEncryptedItem,
  wrapForRequester,
} from '@glimpse/vault'
import { requestDomain, requestMessage, requestTypes, verify } from '@glimpse/verifier'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { requesterProofMessage } from '../src/lib/request-proof.ts'
import { createSiweMessage } from 'viem/siwe'

const base = process.env.GLIMPSE_URL ?? 'http://localhost:3000'
const documents = new URL('../../../tests/fixtures/documents/', import.meta.url)

let failures = 0
function check(ok: boolean, what: string, detail?: unknown) {
  if (!ok) failures++
  process.stdout.write(
    `${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : ` — ${JSON.stringify(detail)}`}\n`,
  )
}

async function session() {
  const account = privateKeyToAccount(generatePrivateKey())
  let cookie = ''
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(base + path, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), cookie },
    })
    const set = res.headers.getSetCookie().map((c) => c.split(';')[0])
    if (set.length) cookie = [cookie, ...set].filter(Boolean).join('; ')
    return res
  }
  const { nonce } = (await (await call('/api/auth/nonce')).json()) as { nonce: string }
  const url = new URL(base)
  const issuedAt = new Date()
  const message = createSiweMessage({
    address: account.address,
    chainId: 84532,
    domain: url.host,
    uri: url.origin,
    nonce,
    version: '1',
    issuedAt,
    expirationTime: new Date(issuedAt.getTime() + 5 * 60_000),
  })
  const signature = await account.signMessage({ message })
  const signedIn = await call('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  })
  check(signedIn.ok, `sign in ${account.address.slice(0, 8)}`, await signedIn.clone().json())

  // The browser registers an encryption key before any vault call.
  const { holderId } = (await (await call('/api/vault/holder')).json()) as { holderId: string }
  const identity = await generateEncryptionKeys(holderId)
  const spki = Buffer.from(await webcrypto.subtle.exportKey('spki', identity.publicKey))
  await call('/api/vault/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientKeyId: identity.recipientKeyId,
      publicKey: spki.toString('base64url'),
    }),
  })
  return { account, call, identity }
}

type Session = Awaited<ReturnType<typeof session>>

async function verifyProof({ call }: Session, file: string) {
  const form = new FormData()
  form.set('file', new Blob([await readFile(new URL(file, documents))]), file)
  const res = await call('/api/identity/verify', { method: 'POST', body: form })
  return (await res.json()) as {
    report: { reportId: string; indication: string; subIndication?: string }
    binding: string | null
    nameFound: boolean
  }
}

async function bind(s: Session, file: string) {
  const { report, binding } = await verifyProof(s, file)
  if (!binding) return null
  const signature = await s.account.signMessage({ message: binding })
  return s.call('/api/identity/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId: report.reportId, signature }),
  })
}

async function importDocument({ call }: Session, file: string, attributes: string[]) {
  const mediaType = file.endsWith('.pdf') ? 'application/pdf' : 'text/plain'
  const upload = {
    schemaVersion: '1.0.0',
    documentId: randomBytes(16).toString('hex'),
    documentVersion: 1,
    kind: 'synthetic',
    mediaType,
    attributes,
  }
  const consent = await call('/api/import/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(upload),
  })
  if (!consent.ok) {
    return { status: consent.status, body: (await consent.json()) as Record<string, unknown> }
  }
  const form = new FormData()
  form.set('request', JSON.stringify(upload))
  form.set('file', new Blob([await readFile(new URL(file, documents))], { type: mediaType }), file)
  const res = await call('/api/import/extract', { method: 'POST', body: form })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const camille = await session()
const status = async (s: Session) =>
  ((await (await s.call('/api/identity/status')).json()) as { verified: boolean }).verified

check((await status(camille)) === false, 'identity starts unverified')
const early = await importDocument(camille, 'demo-student-certificate.txt', ['full_name', 'school'])
check(
  early.status === 403 && early.body.code === 'IDENTITY_REQUIRED',
  'import blocked before identity',
  early,
)
const store = await camille.call('/api/vault/items', { method: 'POST', body: new Uint8Array(64) })
check(store.status === 403, 'vault write blocked before identity', store.status)

const tampered = await verifyProof(camille, 'FAKE-identity-proof-tampered.pdf')
check(
  tampered.report.subIndication === 'HASH_FAILURE' && !tampered.binding,
  'tampered proof refused',
  tampered.report,
)
const forged = await verifyProof(camille, 'FAKE-identity-proof-wrong-signer.pdf')
check(
  forged.report.subIndication === 'NO_CERTIFICATE_CHAIN_FOUND' && !forged.binding,
  'forged signer refused',
  forged.report,
)
check((await status(camille)) === false, 'failed proofs leave the identity unverified')

const bound = await bind(camille, 'FAKE-identity-proof.pdf')
check(bound?.ok === true, 'valid proof binds', bound && (await bound.clone().json()))
check((await status(camille)) === true, 'identity verified after binding')

const ok = await importDocument(camille, 'demo-student-certificate.txt', [
  'full_name',
  'school',
  'over_18',
])
const claims = (ok.body.claims as ExtractedClaim[] | undefined) ?? []
check(ok.status === 200 && claims.length === 3, 'matching document imports', ok)
// A signed PDF is read in process (pdf.js) and its signature checked: it imports as class B.
const signed = await importDocument(camille, 'FAKE-signed-synthetic-certificate.pdf', [
  'full_name',
  'school',
])
const source = signed.body.source as { provenance?: { class?: string } } | undefined
check(source?.provenance?.class === 'B', 'signed PDF imports as class B', signed)
const other = await importDocument(camille, 'demo-other-person-certificate.txt', [
  'full_name',
  'school',
])
check(
  other.status === 403 && other.body.code === 'NAME_MISMATCH',
  "another person's document refused",
  other,
)
const nameless = await importDocument(camille, 'demo-student-certificate.txt', ['school'])
check(nameless.status === 400, 'an import that skips the name is refused', nameless)

const jordan = await session()
await bind(jordan, 'FAKE-identity-proof-other-person.pdf')
check((await status(jordan)) === true, 'second holder verified with their own proof')
const swapped = await importDocument(jordan, 'demo-student-certificate.txt', [
  'full_name',
  'school',
])
check(
  swapped.status === 403 && swapped.body.code === 'NAME_MISMATCH',
  "Camille's document refused for Jordan",
  swapped,
)
const own = await importDocument(jordan, 'demo-other-person-certificate.txt', [
  'full_name',
  'school',
])
check(own.status === 200, "Jordan's own document imports", own)

// ---- A request for several pieces: an anonymous requester, Camille answers, the requester checks.
const requester = privateKeyToAccount(generatePrivateKey())
const requesterKeys = await generateEncryptionKeys(generateOpaqueId())
const bundleId = generateOpaqueId()
const createdAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString()
const expiresAt = new Date(Date.parse(createdAt) + 3600_000).toISOString()
const asked: VerificationRequest[] = []
for (const attribute of ['school', 'annual_salary']) {
  const body = {
    schemaVersion: '1.0.0' as const,
    requestId: generateOpaqueId(),
    requester: requester.address,
    attribute,
    purpose: 'Admission check',
    recipientId: requesterKeys.recipientId,
    recipientKeyId: requesterKeys.recipientKeyId,
    createdAt,
    expiresAt,
  }
  const signature = await requester.signTypedData({
    domain: requestDomain(84532),
    types: requestTypes,
    primaryType: 'VerificationRequest',
    message: requestMessage(body),
  })
  asked.push({ ...body, proof: { type: 'EIP712', chainId: 84532, signature } })
}
const created = await fetch(`${base}/api/requests`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    bundleId,
    requesterName: 'E2E Admissions',
    publicKey: Buffer.from(
      await webcrypto.subtle.exportKey('spki', requesterKeys.publicKey),
    ).toString('base64url'),
    requests: asked,
  }),
})
check(
  created.status === 201,
  'anyone creates a request without an account or a wallet',
  created.status,
)

const proofFor = async () => {
  const at = new Date().toISOString()
  const signature = await requester.signMessage({ message: requesterProofMessage(bundleId, at) })
  return { 'x-glimpse-requester': `${at}.${signature}` }
}
interface View {
  role: string
  status: string
  items: { requestId: string; state: string }[]
}
const view = async (headers?: Record<string, string>, as?: Session): Promise<View> => {
  const res = as
    ? await as.call(`/api/requests/${bundleId}`)
    : await fetch(`${base}/api/requests/${bundleId}`, { headers })
  return (await res.json()) as View
}

const visitor = await view()
check(
  visitor.role === 'visitor' && visitor.items.length === 2,
  'anyone with the link reads the request',
  visitor,
)

// Camille keeps her school, encrypted as her browser does, then shares it and refuses the salary.
const schoolClaim = claims.find((c) => c.attribute === 'school') as ExtractedClaim | undefined
let reference = ''
let expected: ItemExpectation | undefined
let digest = ''
if (schoolClaim) {
  const item = await encryptItem(schoolClaim, schoolClaim.document, camille.identity, {
    itemId: generateOpaqueId(),
    itemVersion: 1,
    grantId: generateOpaqueId(),
  })
  const packed = await packEncryptedItem({ record: item.record, envelopes: [item.envelope] })
  digest = packed.digest
  const stored = await camille.call('/api/vault/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: packed.bytes,
  })
  reference = ((await stored.json()) as { reference: string }).reference
  expected = {
    itemId: item.record.itemId,
    itemVersion: item.record.itemVersion,
    keyId: item.record.keyId,
    sourceClass: item.record.sourceClass,
    grantId: item.envelope.grantId,
    recordDigest: item.recordDigest,
  }
}
check(Boolean(reference && expected), 'Camille stores an encrypted item')

const [schoolRequest, salaryRequest] = asked
const decided = await camille.call(`/api/requests/${schoolRequest?.requestId}/decision`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ outcome: 'allow', reference }),
})
const decision = (await decided.json()) as {
  grant: ShareGrant
  recipient: { recipientId: string; recipientKeyId: string; publicKey: string }
}
const bytes = new Uint8Array(
  await (await camille.call(`/api/vault/items/${reference}`)).arrayBuffer(),
)
const packedItem = await verifyEncryptedItem(bytes, digest)
const ownEnvelope = packedItem.envelopes.find(
  (e) => e.recipientKeyId === camille.identity.recipientKeyId,
)
const wrapped =
  ownEnvelope && expected
    ? await wrapForRequester(
        packedItem.record,
        ownEnvelope,
        camille.identity,
        expected,
        decision.grant,
        {
          recipientId: decision.recipient.recipientId,
          recipientKeyId: decision.recipient.recipientKeyId,
          publicKey: await webcrypto.subtle.importKey(
            'spki',
            Buffer.from(decision.recipient.publicKey, 'base64url'),
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            true,
            ['wrapKey'],
          ),
        },
      )
    : null
const published = await camille.call(`/api/requests/${schoolRequest?.requestId}/envelope`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    envelope: wrapped,
    expected: { ...expected, grantId: decision.grant.grantId },
  }),
})
const refused = await camille.call(`/api/requests/${salaryRequest?.requestId}/decision`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ outcome: 'deny' }),
})
check(
  decided.ok && published.status === 204 && refused.status === 204,
  'Camille shares one piece and refuses the other',
  [decided.status, published.status, refused.status],
)

const intruder = await jordan.call(`/api/requests/${salaryRequest?.requestId}/decision`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ outcome: 'deny' }),
})
check(intruder.status === 409, 'a second holder with the same link cannot answer', intruder.status)

const afterVisitor = await view()
check(
  afterVisitor.items.every((i) => i.state === 'answered'),
  'a visitor never learns how it was answered',
  afterVisitor,
)
const asHolder = await view(undefined, camille)
check(asHolder.role === 'holder', 'the holder who answered sees her answers', asHolder.role)
const asRequester = await view(await proofFor())
check(
  asRequester.role === 'requester' &&
    asRequester.items.map((i) => i.state).join() === 'shared,refused',
  'the requester sees one piece shared and one refused',
  asRequester,
)

const stolen = await fetch(`${base}/api/requests/${schoolRequest?.requestId}/share`)
check(
  stolen.status === 403,
  'without the requester key, the shared piece stays closed',
  stolen.status,
)
const forgedProof = await fetch(`${base}/api/requests/${schoolRequest?.requestId}/share`, {
  headers: { 'x-glimpse-requester': `${new Date().toISOString()}.0x${'1'.repeat(130)}` },
})
check(forgedProof.status === 403, 'a forged requester proof is refused', forgedProof.status)

const delivery = await fetch(`${base}/api/requests/${schoolRequest?.requestId}/share`, {
  headers: await proofFor(),
})
const sharedItem = (await delivery.json()) as {
  record: Parameters<typeof decryptItem>[0]
  envelope: Parameters<typeof decryptItem>[1]
  expected: ItemExpectation
}
const opened = delivery.ok
  ? await decryptItem(sharedItem.record, sharedItem.envelope, requesterKeys, sharedItem.expected)
  : null
check(
  opened?.value.value === 'Epitech Paris',
  'the requester decrypts the shared value in its browser',
  opened?.value,
)
const result =
  opened && schoolRequest
    ? await verify(schoolRequest, opened, {
        client: { readContract: () => Promise.reject(new Error('no chain needed')) },
        chainId: 84532,
        attestationRegistry: '0x0000000000000000000000000000000000000000',
        requester: requester.address,
        trustedIssuers: [],
        answered: new Set(),
      })
    : null
check(
  result?.verdict === 'declared' && result.checks.replay === 'pass',
  'its own verifier accepts the signed request and reads the imported value as declared',
  result,
)

const withdrawn = await camille.call(`/api/requests/${schoolRequest?.requestId}/share`, {
  method: 'DELETE',
})
const late = await fetch(`${base}/api/requests/${schoolRequest?.requestId}/share`, {
  headers: await proofFor(),
})
check(
  withdrawn.status === 204 && late.status >= 400,
  'after a withdrawal the requester can no longer download',
  [withdrawn.status, late.status],
)

for (const [locale, text] of [
  ['fr', 'Révélez moins'],
  ['en', 'Reveal less'],
] as const) {
  const html = await (await fetch(base, { headers: { cookie: `glimpse-locale=${locale}` } })).text()
  check(html.includes(`lang="${locale}"`) && html.includes(text), `home page in ${locale}`)
}
const signedOut = await fetch(`${base}/dashboard`, { redirect: 'manual' })
check(
  signedOut.status === 307 || signedOut.status === 308,
  'signed-out visitor redirected',
  signedOut.status,
)

if (failures > 0) {
  process.stdout.write(`\n${failures} check(s) failed.\n`)
  process.exitCode = 1
}
