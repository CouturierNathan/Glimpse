import type { StorageErrorCode } from '@glimpse/vault/server'

/** Responses carry a holder's ciphertext or extracted values: never cache them. */
export const noStore = { 'Cache-Control': 'no-store' } as const

const statusByCode: Record<StorageErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  TOO_LARGE: 413,
  CORRUPT: 502,
  UNAVAILABLE: 503,
}

const messageByCode: Record<StorageErrorCode, string> = {
  UNAUTHENTICATED: 'Sign in again to reach your vault.',
  FORBIDDEN: 'This item is not yours, or your consent has expired.',
  INVALID_INPUT: 'The request was malformed.',
  TOO_LARGE: 'The upload is too large.',
  CORRUPT: 'The stored item is damaged.',
  UNAVAILABLE: 'Vault storage is unavailable, try again.',
}

/**
 * `code` lets the browser tell a signed-out user (sign in again) from a signed-in one whose
 * vault key the server does not know yet (register it and retry).
 */
export type ErrorCode = 'SIGNED_OUT' | 'VAULT_LOCKED' | 'IDENTITY_REQUIRED' | 'NAME_MISMATCH'

const errorCodes: readonly string[] = [
  'SIGNED_OUT',
  'VAULT_LOCKED',
  'IDENTITY_REQUIRED',
  'NAME_MISMATCH',
] satisfies ErrorCode[]

export function errorResponse(status: number, error: string, code?: ErrorCode): Response {
  return Response.json(code ? { error, code } : { error }, { status, headers: noStore })
}

export const signedOut = () =>
  errorResponse(401, 'Your session has ended. Sign in again.', 'SIGNED_OUT')
export const vaultLocked = () =>
  errorResponse(409, 'This browser has no vault key registered yet.', 'VAULT_LOCKED')

function isStorageError(error: unknown): error is { code: StorageErrorCode } {
  return (
    error instanceof Error &&
    error.name === 'StorageError' &&
    Object.hasOwn(statusByCode, (error as { code?: unknown }).code as string)
  )
}

/**
 * Maps vault errors to stable HTTP answers; never leaks paths, payloads or keys. Errors are
 * recognised by name: the vault module is loaded at run time, so its classes are not ours.
 */
export function vaultErrorResponse(error: unknown): Response {
  if (isStorageError(error)) {
    return errorResponse(statusByCode[error.code], messageByCode[error.code])
  }
  if (error instanceof Error && error.name === 'ExtractionError') {
    return errorResponse(
      422,
      'Some of the information you ticked is not in this document. Untick it and try again.',
    )
  }
  if (error instanceof BodyTooLargeError) return errorResponse(413, messageByCode.TOO_LARGE)
  // Our own request-flow errors carry a status and a message written for the user.
  if (error instanceof Error && error.name === 'RequestError' && 'status' in error) {
    const code = (error as { code?: unknown }).code
    return errorResponse(
      Number(error.status),
      error.message,
      typeof code === 'string' && errorCodes.includes(code) ? (code as ErrorCode) : undefined,
    )
  }
  return errorResponse(500, 'Something went wrong on the server.')
}

export class BodyTooLargeError extends Error {
  constructor() {
    super('Request body too large')
    this.name = 'BodyTooLargeError'
  }
}

/** Reads the body while counting bytes, so an oversized upload stops before it is buffered. */
export async function readLimitedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError()
  if (!request.body) return new Uint8Array()

  const chunks: Uint8Array[] = []
  let size = 0
  const reader = request.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new BodyTooLargeError()
    }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}
