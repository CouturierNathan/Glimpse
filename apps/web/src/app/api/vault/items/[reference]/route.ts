import { errorResponse, noStore, vaultErrorResponse } from '@/lib/vault/http.ts'
import { requireHolder, vaultStorage } from '@/lib/vault/server.ts'

type Context = RouteContext<'/api/vault/items/[reference]'>

/** The encrypted bytes of one of the holder's items. Only the browser can decrypt them. */
export async function GET(_request: Request, { params }: Context) {
  const { failure } = await requireHolder()
  if (failure) return failure
  const { reference } = await params
  try {
    const bytes = await (await vaultStorage()).getBytes(reference)
    if (!bytes) return errorResponse(404, 'This item is not in your vault.')
    return new Response(Uint8Array.from(bytes), {
      headers: { ...noStore, 'Content-Type': 'application/octet-stream' },
    })
  } catch (error) {
    return vaultErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { failure } = await requireHolder()
  if (failure) return failure
  const { reference } = await params
  try {
    const deleted = await (await vaultStorage()).delete(reference)
    if (!deleted) return errorResponse(404, 'This item is not in your vault.')
    return new Response(null, { status: 204, headers: noStore })
  } catch (error) {
    return vaultErrorResponse(error)
  }
}
