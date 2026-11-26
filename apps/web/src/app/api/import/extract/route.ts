import type { DocumentReference, ExtractedClaim, IdentityValidationReport } from '@glimpse/shared'
import { NextResponse } from 'next/server'

import { identityReports, namesVerifiedHolder, validateSignedPdf } from '@/lib/identity/server.ts'
import { RequestError } from '@/lib/requests.ts'
import { NAME_ATTRIBUTE, readUploadRequest } from '@/lib/vault/attributes.ts'
import { errorResponse, noStore, readLimitedBody, vaultErrorResponse } from '@/lib/vault/http.ts'
import { consents, extractionService, requireHolder } from '@/lib/vault/server.ts'

/** The extraction service accepts PDFs up to 5 MiB; the rest is multipart overhead. */
const MAX_BODY_BYTES = 5 * 1024 * 1024 + 64 * 1024
const MAX_PAGES = 12

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** A text document, one page per form feed. */
function textPages(bytes: Uint8Array) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  return text.split('\f').map((pageText, i) => ({ page: i + 1, text: pageText }))
}

/**
 * Reads the consented attributes from a document, described by the shared DocumentUploadRequest
 * in the `request` part. The text is processed in memory and never stored; only the extracted
 * claims go back to the browser, which encrypts them itself. Only a holder whose identity is
 * verified imports, and only a document whose name is theirs.
 */
export async function POST(request: Request) {
  const { holder, failure } = await requireHolder()
  if (failure) return failure

  let documentId: string | undefined
  try {
    const identity = await identityReports.requireVerified(holder.holderId)
    const raw = await readLimitedBody(request, MAX_BODY_BYTES)
    const form = await new Response(Uint8Array.from(raw), {
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    })
      .formData()
      .catch(() => null)
    const part = form?.get('request')
    const file = form?.get('file')
    const upload = typeof part === 'string' ? readUploadRequest(parseJson(part)) : null
    if (!upload || !(file instanceof File)) {
      return errorResponse(400, 'Choose a document and the attributes to extract.')
    }
    documentId = upload.documentId
    if (!upload.attributes.includes(NAME_ATTRIBUTE)) {
      throw new RequestError(400, 'The full name is always read, to match it with your identity.')
    }
    const names = upload.attributes
    const metadata = { documentId, documentVersion: upload.documentVersion, kind: upload.kind }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const service = await extractionService()

    let claims: ExtractedClaim[]
    let report: IdentityValidationReport | null = null
    if (upload.mediaType === 'application/pdf') {
      claims = await service.extractPdf(bytes, metadata, names)
      report = await validateSignedPdf(bytes)
    } else {
      let pages
      try {
        pages = textPages(bytes)
      } catch {
        return errorResponse(415, 'Import a PDF or a UTF-8 text file.')
      }
      if (pages.length > MAX_PAGES) return errorResponse(413, 'The document has too many pages.')
      claims = await service.extract({ ...metadata, pages }, names)
    }
    const name = claims.find((claim) => claim.attribute === NAME_ATTRIBUTE)?.value
    if (name?.type !== 'string') {
      throw new RequestError(
        422,
        'No full name could be read from this document, so it cannot be matched with your identity.',
        'NAME_MISMATCH',
      )
    }
    if (!namesVerifiedHolder(identity.name, name.value)) {
      throw new RequestError(
        403,
        'The name on this document does not match your verified identity.',
        'NAME_MISMATCH',
      )
    }
    // The extractor always says class A. Only a signature this server verified makes the claims
    // class B, with the report as evidence; nothing here can make them class C.
    let source: DocumentReference = {
      documentId,
      documentVersion: upload.documentVersion,
      provenance: { class: 'A' },
    }
    if (report?.indication === 'TOTAL_PASSED') {
      await identityReports.add(holder.holderId, report)
      source = {
        ...source,
        provenance: { class: 'B', signatureVerificationId: report.reportId },
      }
      claims = claims.map((claim) => ({ ...claim, document: source }))
    }
    return NextResponse.json({ claims, source, report }, { headers: noStore })
  } catch (error) {
    return vaultErrorResponse(error)
  } finally {
    // One consent covers one extraction run.
    if (documentId) await consents.withdraw(holder.holderId, documentId)
  }
}
