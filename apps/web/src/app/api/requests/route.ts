import { appChain } from '@/lib/chains.ts'
import { readJson } from '@/lib/requests-http.ts'
import { validateBundle } from '@/lib/requests.ts'
import { importAttributes } from '@/lib/vault/attributes.ts'
import { noStore, vaultErrorResponse } from '@/lib/vault/http.ts'
import { isEncryptionKey } from '@/lib/vault/keys.ts'
import { requests } from '@/lib/vault/server.ts'

const attributes = new Set(importAttributes.map((a) => a.attribute))

/**
 * Stores a request for one or more pieces of information. Anyone may ask: no account and no
 * wallet. Each piece is a VerificationRequest signed by the requester's throwaway key, so the
 * requester's verifier can check it later; the reply is the id the shared link carries.
 */
export async function POST(request: Request) {
  try {
    const { bundle, requests: list } = await validateBundle(await readJson(request, 32 * 1024), {
      chainId: appChain.id,
      attributes,
      isEncryptionKey,
    })
    await requests.create(bundle, list)
    return Response.json({ requestId: bundle.bundleId }, { status: 201, headers: noStore })
  } catch (error) {
    return vaultErrorResponse(error)
  }
}
