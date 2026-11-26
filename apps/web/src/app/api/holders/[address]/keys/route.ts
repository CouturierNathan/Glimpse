import { isAddress } from 'viem'

import { getSession } from '@/lib/auth/server.ts'
import { errorResponse, noStore, signedOut } from '@/lib/vault/http.ts'
import { holders } from '@/lib/vault/server.ts'

/**
 * The public keys a holder's browsers registered, so an organisation can encrypt an attestation
 * for that holder. Public keys only; asked by a signed-in wallet. An empty list means the holder
 * has never opened Glimpse: the organisation then hands over the file.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/holders/[address]/keys'>,
) {
  const session = await getSession()
  if (!session) return signedOut()
  const { address } = await params
  if (!isAddress(address)) return errorResponse(400, 'The request was malformed.')
  return Response.json(await holders.publicKeysOf(address, session.chainId), { headers: noStore })
}
