import { NextResponse } from 'next/server'

import { bindingMessage } from '@/lib/identity/binding.ts'
import { identityReports, validateSignedPdf } from '@/lib/identity/server.ts'
import { errorResponse, noStore, readLimitedBody, vaultErrorResponse } from '@/lib/vault/http.ts'
import { requireHolder } from '@/lib/vault/server.ts'

/** A France Identité PDF is a few hundred kilobytes; the rest is multipart overhead. */
const MAX_BODY_BYTES = 5 * 1024 * 1024 + 64 * 1024

/**
 * Checks the PAdES signature of a France Identité PDF and keeps the report for the holder. The PDF
 * is read in memory, never stored, and never reaches the extractor. A passed report comes back
 * with the binding message the holder's wallet signs next.
 */
export async function POST(request: Request) {
  const { holder, session, failure } = await requireHolder()
  if (failure) return failure
  try {
    const raw = await readLimitedBody(request, MAX_BODY_BYTES)
    const form = await new Response(Uint8Array.from(raw), {
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    })
      .formData()
      .catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return errorResponse(400, 'Choose the PDF to check.')

    const report = await validateSignedPdf(new Uint8Array(await file.arrayBuffer()))
    identityReports.add(holder.holderId, report)
    const binding = report.indication === 'TOTAL_PASSED' ? bindingMessage(report, session) : null
    return NextResponse.json({ report, binding }, { headers: noStore })
  } catch (error) {
    return vaultErrorResponse(error)
  }
}
