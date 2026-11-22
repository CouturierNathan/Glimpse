import { NextResponse } from 'next/server'

import { readUploadRequest } from '@/lib/vault/attributes.ts'
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
 * claims go back to the browser, which encrypts them itself.
 */
export async function POST(request: Request) {
  const { holder, failure } = await requireHolder()
  if (failure) return failure

  let documentId: string | undefined
  try {
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
      return errorResponse(400, 'Choose a document, its type and the attributes to extract.')
    }
    documentId = upload.documentId
    const names = upload.attributes
    const metadata = { documentId, documentVersion: upload.documentVersion, kind: upload.kind }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const service = await extractionService()

    let claims
    if (upload.mediaType === 'application/pdf') {
      claims = await service.extractPdf(bytes, metadata, names)
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
    return NextResponse.json({ claims }, { headers: noStore })
  } catch (error) {
    return vaultErrorResponse(error)
  } finally {
    // One consent covers one extraction run.
    if (documentId) consents.withdraw(holder.holderId, documentId)
  }
}
