import { findRequest, readJson } from '@/lib/requests-http.ts'
import { claimBundle, RequestError } from '@/lib/requests.ts'
import { noStore, vaultErrorResponse } from '@/lib/vault/http.ts'
import { requireHolder, shareService, vaultStorage } from '@/lib/vault/server.ts'

type Context = RouteContext<'/api/requests/[requestId]/decision'>

/**
 * The holder's answer to one piece of a request. A refusal ends that piece. A consent names one of
 * the holder's items: the server checks it owns that item, creates the grant, and returns what the
 * holder's browser needs to wrap the item key for the requester. The server never sees the item
 * key or its content. The first holder to answer a request is the only one who can.
 */
export async function POST(request: Request, { params }: Context) {
  const { holder, failure } = await requireHolder()
  if (failure) return failure
  const { requestId } = await params
  try {
    const { bundle, store, save } = await findRequest(requestId)
    claimBundle(bundle, holder.holderId)
    const body = (await readJson(request)) as { outcome?: unknown; reference?: unknown }

    if (body.outcome === 'deny') {
      store.decide(requestId, holder.holderId, { outcome: 'deny' })
      await save()
      return new Response(null, { status: 204, headers: noStore })
    }
    if (body.outcome !== 'allow' || typeof body.reference !== 'string') {
      throw new RequestError(400, 'Choose the item to share, or refuse the request.')
    }

    const { publicKey } = bundle

    const item = await (await vaultStorage()).get(body.reference)
    if (!item) throw new RequestError(404, 'This item is not in your vault.')

    store.decide(requestId, holder.holderId, {
      outcome: 'allow',
      itemId: item.record.itemId,
      itemVersion: item.record.itemVersion,
    })
    // Saved first: the share service reads the live consent back from the store.
    await save()
    let ticket
    try {
      ticket = await (await shareService()).authorize(body.reference, requestId)
    } catch (error) {
      store.reopen(requestId) // no grant was created: the holder may answer again
      await save()
      throw error
    }
    store.authorized(requestId, ticket.shareReference)
    await save()

    return Response.json(
      {
        grant: ticket.grant,
        recipient: {
          recipientId: bundle.recipientId,
          recipientKeyId: ticket.recipientKeyId,
          publicKey,
        },
      },
      { headers: noStore },
    )
  } catch (error) {
    return vaultErrorResponse(error)
  }
}
