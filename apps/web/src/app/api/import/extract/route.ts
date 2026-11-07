import { NextResponse } from 'next/server'

import { documentKinds } from '@/lib/vault/attributes.ts'
import { errorResponse, noStore, readLimitedBody, vaultErrorResponse } from '@/lib/vault/http.ts'
import { consents, extractionService, requireHolder } from '@/lib/vault/server.ts'

const OPAQUE_ID = /^[0-9a-f]{32}$/
/** The extraction service accepts PDFs up to 5 MiB; the rest is multipart overhead. */
const MAX_BODY_BYTES = 5 * 1024 * 1024 + 64 * 1024
const MAX_PAGES = 12
const kinds = new Set<string>(documentKinds.map((k) => k.kind))

type Kind = (typeof documentKinds)[number]['kind']

/** A text document, one page per form feed. */
function textPages(bytes: Uint8Array) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  return text.split('\f').map((pageText, i) => ({ page: i + 1, text: pageText }))
}

/**
 * Reads the consented attributes from a document. The text is processed in memory and never
 * stored; only the extracted claims go back to the browser, which encrypts them itself.
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
    const id = form?.get('documentId')
    const kind = form?.get('kind')
    const file = form?.get('file')
    const attributes = form?.getAll('attributes')
    if (
      typeof id !== 'string' ||
      !OPAQUE_ID.test(id) ||
      typeof kind !== 'string' ||
      !kinds.has(kind) ||
      !(file instanceof File) ||
      !attributes?.every((a) => typeof a === 'string')
    ) {
      return errorResponse(400, 'Choose a document, its type and the attributes to extract.')
    }
    documentId = id
    const names = attributes as string[]
    const metadata = { documentId, documentVersion: 1, kind: kind as Kind }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const service = await extractionService()

    let claims
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
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
