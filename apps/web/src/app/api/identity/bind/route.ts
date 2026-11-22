import { type Address, type Hex, isHex } from 'viem'

import { bindingMessage } from '@/lib/identity/binding.ts'
import { identityReports, signedBy } from '@/lib/identity/server.ts'
import { readJson } from '@/lib/requests-http.ts'
import { RequestError } from '@/lib/requests.ts'
import { noStore, vaultErrorResponse } from '@/lib/vault/http.ts'
import { requireHolder } from '@/lib/vault/server.ts'

/**
 * Binds the signed-in wallet to one of the holder's passed reports. The server rebuilds the
 * message from its own report and the session, so the browser cannot change what was signed.
 */
export async function POST(request: Request) {
  const { holder, session, failure } = await requireHolder()
  if (failure) return failure
  try {
    const body = (await readJson(request)) as { reportId?: unknown; signature?: unknown }
    const entry =
      typeof body.reportId === 'string' ? identityReports.get(holder.holderId, body.reportId) : null
    if (!entry) throw new RequestError(404, 'This report does not exist.')
    if (typeof body.signature !== 'string' || !isHex(body.signature)) {
      throw new RequestError(400, 'The request was malformed.')
    }
    const message = bindingMessage(entry.report, session)
    if (!(await signedBy(session.address as Address, message, body.signature as Hex))) {
      throw new RequestError(401, 'The signature does not match your wallet.')
    }
    identityReports.bind(holder.holderId, entry.report.reportId, session.address, body.signature)
    return Response.json({ address: session.address }, { headers: noStore })
  } catch (error) {
    return vaultErrorResponse(error)
  }
}
