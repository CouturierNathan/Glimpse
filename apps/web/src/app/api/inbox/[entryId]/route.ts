import { noStore } from '@/lib/vault/http.ts'
import { inbox, requireHolder } from '@/lib/vault/server.ts'

/** For the holder: removes an entry once its vault kept or rejected it. */
export async function DELETE(_request: Request, { params }: RouteContext<'/api/inbox/[entryId]'>) {
  const { holder, failure } = await requireHolder()
  if (failure) return failure
  await inbox.remove(holder.holderId, (await params).entryId)
  return new Response(null, { status: 204, headers: noStore })
}
