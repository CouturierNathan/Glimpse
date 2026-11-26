/*
 * End-to-end smoke test of the holder journey against a running server, with the FAKE test
 * documents: sign-in, the identity gate, valid / forged / tampered proofs, matching and
 * mismatching documents, and both languages. It signs with throwaway keys made for each run, so
 * it can run again on the same server.
 *
 * Run: npm run dev -w apps/web (with PADES_TRUST_ANCHORS set to the FAKE test CA), then
 *      npm run e2e -w apps/web            (GLIMPSE_URL defaults to http://localhost:3000)
 */
import { randomBytes, webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
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
  await call('/api/vault/holder')
  const keys = await webcrypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['wrapKey', 'unwrapKey'],
  )
  const spki = Buffer.from(await webcrypto.subtle.exportKey('spki', keys.publicKey))
  await call('/api/vault/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientKeyId: randomBytes(16).toString('hex'),
      publicKey: spki.toString('base64url'),
    }),
  })
  return { account, call }
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
const claims = (ok.body.claims as { attribute: string }[] | undefined) ?? []
check(ok.status === 200 && claims.length === 3, 'matching document imports', ok)
// Needs poppler (pdftotext) on the server: a host without it answers 422, and the check says so.
const signed = await importDocument(camille, 'FAKE-signed-synthetic-certificate.pdf', [
  'full_name',
  'school',
])
const source = signed.body.source as { provenance?: { class?: string } } | undefined
check(
  signed.status === 422 || source?.provenance?.class === 'B',
  signed.status === 422
    ? 'signed PDF skipped: no poppler on the server'
    : 'signed PDF imports as class B',
  signed,
)
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
