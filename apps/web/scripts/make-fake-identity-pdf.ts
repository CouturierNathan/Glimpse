/*
 * Generates the FAKE France Identité test fixtures in fixtures/identity/: a TEST certificate
 * authority, a PDF signed (PAdES B-B) by a signer it certifies, and the same PDF signed by a
 * look-alike signer from another, untrusted TEST authority, and a synthetic demo certificate
 * signed by the trusted TEST signer (its claims import as class B). Nothing here is a real
 * identity document or a real trust anchor. Keys are generated in memory and never written: rerun the
 * script to make new fixtures. Run: npm run fixtures:identity -w apps/web
 */
import { createHash, webcrypto } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'

import * as asn1js from 'asn1js'
import * as pkijs from 'pkijs'

const out = new URL('../fixtures/identity/', import.meta.url)
/** Served by the app at /demo/<file>, so the demo needs nothing but a browser. */
const demo = new URL('../public/demo/', import.meta.url)
const SIGNING_TIME = new Date('2026-11-07T09:00:00.000Z')
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' }

function name(cn: string) {
  const rdn = new pkijs.RelativeDistinguishedNames()
  rdn.typesAndValues.push(
    new pkijs.AttributeTypeAndValue({
      type: '2.5.4.6',
      value: new asn1js.PrintableString({ value: 'FR' }),
    }),
    new pkijs.AttributeTypeAndValue({
      type: '2.5.4.10',
      value: new asn1js.Utf8String({ value: 'FAKE Glimpse Test' }),
    }),
    new pkijs.AttributeTypeAndValue({
      type: '2.5.4.3',
      value: new asn1js.Utf8String({ value: cn }),
    }),
  )
  return rdn
}

async function certificate(options: {
  subject: string
  serial: number
  ca: boolean
  publicKey: webcrypto.CryptoKey
  issuer?: pkijs.Certificate
  issuerKey: webcrypto.CryptoKey
  notAfter: Date
}) {
  const cert = new pkijs.Certificate()
  cert.version = 2
  cert.serialNumber = new asn1js.Integer({ value: options.serial })
  cert.subject = name(options.subject)
  cert.issuer = options.issuer ? options.issuer.subject : cert.subject
  cert.notBefore.value = new Date('2026-01-01T00:00:00.000Z')
  cert.notAfter.value = options.notAfter
  const constraints = new pkijs.BasicConstraints({ cA: options.ca })
  cert.extensions = [
    new pkijs.Extension({
      extnID: '2.5.29.19',
      critical: true,
      extnValue: constraints.toSchema().toBER(false),
      parsedValue: constraints,
    }),
  ]
  await cert.subjectPublicKeyInfo.importKey(options.publicKey)
  await cert.sign(options.issuerKey, 'SHA-256')
  return cert
}

async function authority(cn: string) {
  const keys = await webcrypto.subtle.generateKey(ECDSA, true, ['sign', 'verify'])
  const ca = await certificate({
    subject: 'FAKE Glimpse Test CA',
    serial: 1,
    ca: true,
    publicKey: keys.publicKey,
    issuerKey: keys.privateKey,
    notAfter: new Date('2036-01-01T00:00:00.000Z'),
  })
  const signerKeys = await webcrypto.subtle.generateKey(ECDSA, true, ['sign', 'verify'])
  const signer = await certificate({
    subject: cn,
    serial: 2,
    ca: false,
    publicKey: signerKeys.publicKey,
    issuer: ca,
    issuerKey: keys.privateKey,
    notAfter: new Date('2031-01-01T00:00:00.000Z'),
  })
  return { ca, signer, signerKey: signerKeys.privateKey }
}

const sha256 = (bytes: Uint8Array) => new Uint8Array(createHash('sha256').update(bytes).digest())
const der = (cert: pkijs.Certificate) => new Uint8Array(cert.toSchema().toBER())

async function cms(
  signed: Uint8Array,
  { ca, signer, signerKey }: Awaited<ReturnType<typeof authority>>,
) {
  const attr = (type: string, value: asn1js.AsnType) =>
    new pkijs.Attribute({ type, values: [value] })
  const signingCertificateV2 = new asn1js.Sequence({
    value: [
      new asn1js.Sequence({
        value: [
          new asn1js.Sequence({
            value: [new asn1js.OctetString({ valueHex: sha256(der(signer)) })],
          }),
        ],
      }),
    ],
  })
  const data = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: '1.2.840.113549.1.7.1' }),
    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({
          issuer: signer.issuer,
          serialNumber: signer.serialNumber,
        }),
        signedAttrs: new pkijs.SignedAndUnsignedAttributes({
          type: 0,
          attributes: [
            attr(
              '1.2.840.113549.1.9.3',
              new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.7.1' }),
            ),
            attr('1.2.840.113549.1.9.4', new asn1js.OctetString({ valueHex: sha256(signed) })),
            attr('1.2.840.113549.1.9.5', new asn1js.UTCTime({ valueDate: SIGNING_TIME })),
            attr('1.2.840.113549.1.9.16.2.47', signingCertificateV2),
          ],
        }),
      }),
    ],
    certificates: [signer, ca],
  })
  await data.sign(signerKey, 0, 'SHA-256')
  const info = new pkijs.ContentInfo({
    contentType: '1.2.840.113549.1.7.2',
    content: data.toSchema(true),
  })
  return new Uint8Array(info.toSchema().toBER())
}

const CONTENTS_HEX = 16384
const BYTE_RANGE = '/ByteRange [0 0000000000 0000000000 0000000000]'

/** A one-page PDF with an empty signature field, laid out so the signature fills a fixed gap. */
const IDENTITY_TEXT = [
  'FAKE FRANCE IDENTITE PROOF - TEST FIXTURE ONLY',
  'This is not a real identity document.',
  'Signed by the FAKE Glimpse Test CA for automated tests.',
  'Holder: FAKE TEST HOLDER',
]
/*
 * The demo documents. The extractor is literal: one line per attribute, written
 * `<label>: <value>; period <start> to <end>`, with the period as the only two ISO dates on the
 * line. Labels match apps/web/src/lib/vault/attributes.ts. The person is invented.
 */
const PERIOD = '; period 2026-01-01 to 2026-12-31'
const HEADER = 'SYNTHETIC DEMO - invented person, no real identity or secret'

const IDENTITY_LINES = [
  'Name: CAMILLE SYNTHETIQUE',
  'Date of birth: 12/04/2001',
  'Age: 25',
  'Nationality: French',
  'Over 18: true',
]
const ADDRESS_LINES = [
  'Address: 14 rue des Lilas',
  'Postal code: 75011',
  'City: Paris',
  'Country: France',
]
const EDUCATION_LINES = [
  'Student: true',
  'School: Epitech Paris',
  'Study level: Master 2',
  'Score: 42',
  'Graduation year: 2027',
]
const WORK_LINES = [
  'Employed: true',
  'Employer: Atelier Dubois',
  'Job title: Backend engineer',
  'Contract type: Apprenticeship',
  'Annual salary: 24000',
]

const dated = (lines: string[]) => lines.map((line) => line + PERIOD)
const compose = (title: string, ...groups: string[][]) => [
  HEADER,
  title,
  ...groups.flatMap((group) => dated(group)),
]

const CERTIFICATE_TEXT = compose(
  'STUDENT CERTIFICATE',
  IDENTITY_LINES,
  ADDRESS_LINES,
  EDUCATION_LINES,
)
const EMPLOYMENT_TEXT = compose('EMPLOYMENT CERTIFICATE', IDENTITY_LINES, WORK_LINES)
const COMPLETE_TEXT = compose(
  'COMPLETE SYNTHETIC RECORD',
  IDENTITY_LINES,
  ADDRESS_LINES,
  EDUCATION_LINES,
  WORK_LINES,
)

function unsignedPdf(text: string[]): string {
  const stream = `BT /F1 14 Tf 50 780 Td 18 TL ${text.map((t) => `(${t}) '`).join(' ')} ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [5 0 R] /SigFlags 3 >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R /Annots [5 0 R] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Annot /Subtype /Widget /FT /Sig /T (Signature1) /Rect [0 0 0 0] /F 132 /P 3 0 R /V 7 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached /M (D:20261107090000Z) ${BYTE_RANGE} /Contents <${'0'.repeat(CONTENTS_HEX)}> >>`,
  ]
  let pdf = '%PDF-1.7\n'
  const offsets = objects.map((body, i) => {
    const offset = pdf.length
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return pdf
}

async function signedPdf(signer: Awaited<ReturnType<typeof authority>>, text = IDENTITY_TEXT) {
  let pdf = unsignedPdf(text)
  const start = pdf.indexOf('/Contents <') + '/Contents '.length
  const end = start + CONTENTS_HEX + 2
  const range =
    `/ByteRange [0 ${start} ${end} ${pdf.length - end}`.padEnd(BYTE_RANGE.length - 1) + ']'
  pdf = pdf.replace(BYTE_RANGE, range)
  const bytes = Buffer.from(pdf, 'latin1')
  const signature = await cms(
    Buffer.concat([bytes.subarray(0, start), bytes.subarray(end)]),
    signer,
  )
  const contents = Buffer.from(signature).toString('hex').padEnd(CONTENTS_HEX, '0')
  return Buffer.concat([
    bytes.subarray(0, start + 1),
    Buffer.from(contents, 'latin1'),
    bytes.subarray(end - 1),
  ])
}

const pem = (label: string, cert: pkijs.Certificate) =>
  `${label}\n-----BEGIN CERTIFICATE-----\n${Buffer.from(der(cert))
    .toString('base64')
    .match(/.{1,64}/g)
    ?.join('\n')}\n-----END CERTIFICATE-----\n`

const trusted = await authority('FAKE France Identite Test Signer')
const impostor = await authority('FAKE France Identite Test Signer')
await mkdir(out, { recursive: true })
await mkdir(demo, { recursive: true })

const caPem = pem(
  'FAKE TEST CA, NOT A REAL TRUST ANCHOR. Generated by scripts/make-fake-identity-pdf.ts.',
  trusted.ca,
)
const validProof = await signedPdf(trusted)
const forgedProof = await signedPdf(impostor)
const studentPdf = await signedPdf(trusted, CERTIFICATE_TEXT)
const employmentPdf = await signedPdf(trusted, EMPLOYMENT_TEXT)

/** Written to both trees: fixtures/ is what the tests and PADES_TRUST_ANCHORS read. */
async function both(file: string, bytes: Uint8Array | string) {
  await writeFile(new URL(file, out), bytes)
  await writeFile(new URL(file, demo), bytes)
}

await both('FAKE-test-ca.pem', caPem)
await both('FAKE-identity-proof.pdf', validProof)
await both('FAKE-identity-proof-wrong-signer.pdf', forgedProof)
await both('FAKE-signed-synthetic-certificate.pdf', studentPdf)
await writeFile(new URL('FAKE-signed-employment-certificate.pdf', demo), employmentPdf)

// Text copies of the same documents. They carry no signature, so they import as class A, but
// they need no PDF tooling: they are the ones that work on any machine and on a hosted deployment.
const text = (lines: string[]) => lines.join('\n') + '\n'
await writeFile(new URL('demo-student-certificate.txt', demo), text(CERTIFICATE_TEXT))
await writeFile(new URL('demo-employment-certificate.txt', demo), text(EMPLOYMENT_TEXT))
await writeFile(new URL('demo-complete-record.txt', demo), text(COMPLETE_TEXT))

process.stdout.write(
  `Wrote the FAKE identity fixtures to ${out.pathname}\nWrote the demo documents to ${demo.pathname}\n`,
)
