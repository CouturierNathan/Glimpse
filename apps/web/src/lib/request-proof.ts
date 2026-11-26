import { type Address, type Hex, verifyMessage } from 'viem'

/*
 * A requester has no wallet and no account: their browser makes a throwaway signing key for each
 * request, signs the request with it (so the verifier's own checks hold), and proves it still holds
 * that key to read the answer. The header carries `<ISO time>.<signature>`.
 */
export const REQUESTER_PROOF_HEADER = 'x-glimpse-requester'
const MAX_SKEW_MS = 5 * 60 * 1000

export function requesterProofMessage(requestId: string, at: string): string {
  return ['Glimpse requester access', `Request: ${requestId}`, `At: ${at}`].join('\n')
}

/** Whether the header proves possession of the requester key, for this request, recently. */
export async function verifyRequesterProof(
  header: string | null,
  requestId: string,
  requester: Address,
  now = Date.now(),
): Promise<boolean> {
  // The time has its own dot (milliseconds): the signature is after the last one.
  const cut = header?.lastIndexOf('.') ?? -1
  const at = cut > 0 ? header?.slice(0, cut) : undefined
  const signature = cut > 0 ? header?.slice(cut + 1) : undefined
  if (!at || !signature || !/^0x[0-9a-f]{130}$/i.test(signature)) return false
  const time = Date.parse(at)
  if (!Number.isFinite(time) || Math.abs(now - time) > MAX_SKEW_MS) return false
  return verifyMessage({
    address: requester,
    message: requesterProofMessage(requestId, at),
    signature: signature as Hex,
  }).catch(() => false)
}
