import { NextResponse } from 'next/server'

import { identityReports } from '@/lib/identity/server.ts'
import { noStore, readLimitedBody, vaultErrorResponse } from '@/lib/vault/http.ts'
import { requireHolder, vaultServer, vaultStorage } from '@/lib/vault/server.ts'

/**
 * Stores one encrypted item, exactly as the browser packed it: the bytes stay identical so the
 * browser can check them against the fingerprint it kept. Only a holder whose identity is verified
 * adds to the vault, whether an imported document or an organisation's attestation.
 */
export async function POST(request: Request) {
  const { holder, failure } = await requireHolder()
  if (failure) return failure
  try {
    await identityReports.requireVerified(holder.holderId)
    const { DEFAULT_MAX_OBJECT_BYTES } = await vaultServer()
    const bytes = await readLimitedBody(request, DEFAULT_MAX_OBJECT_BYTES)
    const reference = await (await vaultStorage()).putBytes(bytes)
    return NextResponse.json({ reference }, { status: 201, headers: noStore })
  } catch (error) {
    return vaultErrorResponse(error)
  }
}
