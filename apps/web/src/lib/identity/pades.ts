import { createHash, randomBytes } from 'node:crypto'

import { type IdentityValidationReport, parseContract } from '@glimpse/shared'
import * as asn1js from 'asn1js'
import * as pkijs from 'pkijs'

/*
 * PAdES baseline (B-B) validation of a signed PDF, in Node. It mirrors the checks and the
 * indications of the EU DSS validator (ETSI EN 319 102-1): byte range integrity, CMS signature,
 * signing-certificate binding, chain to a configured trust anchor, certificate validity dates and
 * the claimed signing time. A DSS service can replace it later: it produces the same
 * IdentityValidationReport with `validator: "dss"`.
 *
 * ponytail: no revocation (CRL/OCSP), no timestamps (B-T and above), no DocMDP or form-field
 * modification analysis, no signature policy. DSS covers them when it takes over.
 */

type Checks = IdentityValidationReport['checks']
type SubIndication = NonNullable<IdentityValidationReport['subIndication']>

class Failure {
  readonly check: keyof Checks
  readonly indication: 'TOTAL_FAILED' | 'INDETERMINATE'
  readonly subIndication: SubIndication
  constructor(
    check: keyof Checks,
    indication: 'TOTAL_FAILED' | 'INDETERMINATE',
    subIndication: SubIndication,
  ) {
    this.check = check
    this.indication = indication
    this.subIndication = subIndication
  }
}

const OID = {
  signedData: '1.2.840.113549.1.7.2',
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
  signingCertificateV2: '1.2.840.113549.1.9.16.2.47',
  basicConstraints: '2.5.29.19',
}
const HASHES: Record<string, string> = {
  '2.16.840.1.101.3.4.2.1': 'sha256',
  '2.16.840.1.101.3.4.2.2': 'sha384',
  '2.16.840.1.101.3.4.2.3': 'sha512',
}
const NAMES: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.5': 'serialNumber',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.97': 'organizationIdentifier',
}
const MAX_CHAIN = 5
const CLOCK_SKEW_MS = 5 * 60 * 1000

const hex = (bytes: Uint8Array | ArrayBuffer) => Buffer.from(new Uint8Array(bytes)).toString('hex')
const digest = (algorithm: string, bytes: Uint8Array) =>
  new Uint8Array(createHash(algorithm).update(bytes).digest())
const der = (cert: pkijs.Certificate) => new Uint8Array(cert.toSchema().toBER())

function dn(name: pkijs.RelativeDistinguishedNames): string {
  return name.typesAndValues
    .map((tv) => `${NAMES[tv.type] ?? tv.type}=${String(tv.value.valueBlock.value)}`)
    .join(', ')
    .slice(0, 512)
}

/** The last signature's byte range and CMS blob, if the file has one covering it whole. */
function locateSignature(pdf: Uint8Array) {
  const text = Buffer.from(pdf).toString('latin1')
  const ranges = [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)]
  const last = ranges.at(-1)
  if (!text.startsWith('%PDF-') || !last) {
    throw new Failure('format', 'TOTAL_FAILED', 'FORMAT_FAILURE')
  }
  const [a, b, c, d] = last.slice(1, 5).map(Number) as [number, number, number, number]
  const gap = text.slice(a + b, c).match(/^<([0-9a-fA-F]+)>$/)
  if (a !== 0 || b <= 0 || c <= b || c + d > pdf.length || !gap?.[1] || gap[1].length % 2) {
    throw new Failure('format', 'TOTAL_FAILED', 'FORMAT_FAILURE')
  }
  return {
    signedBytes: Buffer.concat([pdf.subarray(0, b), pdf.subarray(c, c + d)]),
    cms: new Uint8Array(Buffer.from(gap[1], 'hex')),
    coversWholeFile: c + d === pdf.length,
  }
}

function attribute(signerInfo: pkijs.SignerInfo, type: string): asn1js.AsnType | undefined {
  return signerInfo.signedAttrs?.attributes.find((a) => a.type === type)?.values[0]
}

/** ESS signing-certificate-v2: the signer certificate's hash, under the signature. */
function bindsCertificate(signerInfo: pkijs.SignerInfo, cert: pkijs.Certificate): boolean {
  const value = attribute(signerInfo, OID.signingCertificateV2)
  if (!(value instanceof asn1js.Sequence)) return false
  const certs = value.valueBlock.value[0]
  const first = certs instanceof asn1js.Sequence ? certs.valueBlock.value[0] : undefined
  if (!(first instanceof asn1js.Sequence)) return false
  const [algorithm, second] = first.valueBlock.value
  const hash = algorithm instanceof asn1js.Sequence ? second : algorithm
  let name = 'sha256' // the ASN.1 default when hashAlgorithm is absent
  if (algorithm instanceof asn1js.Sequence) {
    const oid = algorithm.valueBlock.value[0]
    name = (oid instanceof asn1js.ObjectIdentifier && HASHES[oid.valueBlock.toString()]) || ''
  }
  return (
    name !== '' &&
    hash instanceof asn1js.OctetString &&
    Buffer.from(hash.valueBlock.valueHexView).equals(digest(name, der(cert)))
  )
}

async function issuedBy(cert: pkijs.Certificate, issuer: pkijs.Certificate): Promise<boolean> {
  return issuer.subject.isEqual(cert.issuer) && (await cert.verify(issuer).catch(() => false))
}

function isCA(cert: pkijs.Certificate): boolean {
  const ext = cert.extensions?.find((e) => e.extnID === OID.basicConstraints)
  return ext?.parsedValue instanceof pkijs.BasicConstraints && ext.parsedValue.cA === true
}

/** Parses a PEM bundle into DER certificates. */
export function pemCertificates(pem: string): Uint8Array[] {
  return [...pem.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/g)].map(
    (m) => new Uint8Array(Buffer.from((m[1] ?? '').replace(/\s+/g, ''), 'base64')),
  )
}

/**
 * Validates the last PAdES signature of a PDF against the given trust anchors (DER). Checks run in
 * DSS's order and stop at the first failure; the ones not reached stay `unknown`.
 */
export async function validatePades(
  pdf: Uint8Array,
  options: { trustAnchors: readonly Uint8Array[]; now?: Date },
): Promise<IdentityValidationReport> {
  const now = options.now ?? new Date()
  const checks: Checks = {
    format: 'unknown',
    integrity: 'unknown',
    signature: 'unknown',
    chain: 'unknown',
    validity: 'unknown',
  }
  const report: Record<string, unknown> = {
    schemaVersion: '1.0.0',
    reportId: randomBytes(16).toString('hex'),
    validator: 'glimpse-pades',
    documentDigest: `0x${hex(digest('sha256', pdf))}`,
    checks,
    validatedAt: now.toISOString(),
  }

  try {
    const { signedBytes, cms, coversWholeFile } = locateSignature(pdf)
    let signedData: pkijs.SignedData
    try {
      const info = pkijs.ContentInfo.fromBER(cms)
      if (info.contentType !== OID.signedData) throw new Error('not SignedData')
      signedData = new pkijs.SignedData({ schema: info.content })
    } catch {
      throw new Failure('format', 'TOTAL_FAILED', 'FORMAT_FAILURE')
    }
    const signerInfo = signedData.signerInfos[0]
    const algorithm = signerInfo && HASHES[signerInfo.digestAlgorithm.algorithmId]
    const signedDigest = signerInfo && attribute(signerInfo, OID.messageDigest)
    if (
      signedData.signerInfos.length !== 1 ||
      !signerInfo ||
      !algorithm ||
      !(signedDigest instanceof asn1js.OctetString)
    ) {
      throw new Failure('format', 'TOTAL_FAILED', 'FORMAT_FAILURE')
    }
    checks.format = 'pass'

    // Bytes appended after signing (an incremental update) are not covered: refuse them.
    if (!coversWholeFile) throw new Failure('integrity', 'TOTAL_FAILED', 'FORMAT_FAILURE')
    if (!Buffer.from(signedDigest.valueBlock.valueHexView).equals(digest(algorithm, signedBytes))) {
      throw new Failure('integrity', 'TOTAL_FAILED', 'HASH_FAILURE')
    }
    checks.integrity = 'pass'

    let signer: pkijs.Certificate | null = null
    try {
      const result = await signedData.verify({
        signer: 0,
        data: Uint8Array.from(signedBytes).buffer,
        extendedMode: true,
        checkChain: false,
      })
      if (result.signatureVerified) signer = result.signerCertificate ?? null
    } catch (error) {
      if (error instanceof pkijs.SignedDataVerifyError && !error.signerCertificate) {
        throw new Failure('signature', 'INDETERMINATE', 'NO_SIGNING_CERTIFICATE_FOUND')
      }
    }
    if (!signer) throw new Failure('signature', 'TOTAL_FAILED', 'SIG_CRYPTO_FAILURE')
    report.signer = {
      subject: dn(signer.subject),
      issuer: dn(signer.issuer),
      serialNumber: hex(signer.serialNumber.valueBlock.valueHexView).replace(/^0+(?=.)/, ''),
      notBefore: signer.notBefore.value.toISOString(),
      notAfter: signer.notAfter.value.toISOString(),
    }
    const signingTime = attribute(signerInfo, OID.signingTime)
    const claimed =
      signingTime instanceof asn1js.UTCTime || signingTime instanceof asn1js.GeneralizedTime
        ? signingTime.toDate()
        : undefined
    if (claimed) report.signingTime = claimed.toISOString()
    if (!bindsCertificate(signerInfo, signer)) {
      throw new Failure('signature', 'INDETERMINATE', 'NO_SIGNING_CERTIFICATE_FOUND')
    }
    checks.signature = 'pass'

    const anchors = options.trustAnchors.map((bytes) =>
      pkijs.Certificate.fromBER(Uint8Array.from(bytes)),
    )
    const pool = (signedData.certificates ?? []).filter(
      (c): c is pkijs.Certificate => c instanceof pkijs.Certificate && isCA(c),
    )
    const path = [signer]
    let anchor: pkijs.Certificate | undefined
    for (let cert = signer; !anchor && path.length <= MAX_CHAIN;) {
      for (const candidate of anchors) if (await issuedBy(cert, candidate)) anchor = candidate
      if (anchor) break
      let next: pkijs.Certificate | undefined
      for (const candidate of pool) {
        if (!path.includes(candidate) && (await issuedBy(cert, candidate))) next = candidate
      }
      if (!next) break
      path.push(next)
      cert = next
    }
    if (!anchor) throw new Failure('chain', 'INDETERMINATE', 'NO_CERTIFICATE_CHAIN_FOUND')
    report.trustAnchor = `0x${hex(digest('sha256', der(anchor)))}`
    checks.chain = 'pass'

    // No timestamp means no proof of existence before now: every certificate must be valid now.
    for (const cert of [...path, anchor]) {
      if (now > cert.notAfter.value) {
        throw new Failure('validity', 'INDETERMINATE', 'OUT_OF_BOUNDS_NO_POE')
      }
      if (now < cert.notBefore.value) {
        throw new Failure('validity', 'INDETERMINATE', 'NOT_YET_VALID')
      }
    }
    // The claimed signing time must fall within the signer certificate and not in the future.
    if (claimed && claimed > signer.notAfter.value) {
      throw new Failure('validity', 'INDETERMINATE', 'OUT_OF_BOUNDS_NO_POE')
    }
    if (
      claimed &&
      (claimed < signer.notBefore.value || claimed.getTime() > now.getTime() + CLOCK_SKEW_MS)
    ) {
      throw new Failure('validity', 'INDETERMINATE', 'NOT_YET_VALID')
    }
    checks.validity = 'pass'
    report.indication = 'TOTAL_PASSED'
  } catch (error) {
    if (!(error instanceof Failure)) throw error
    checks[error.check] = 'fail'
    report.indication = error.indication
    report.subIndication = error.subIndication
  }
  return parseContract('IdentityValidationReport', report)
}
