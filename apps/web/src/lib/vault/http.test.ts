import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ExtractionError, StorageError } from '@glimpse/vault/server'

import { BodyTooLargeError, readLimitedBody, vaultErrorResponse } from './http.ts'

function streamed(chunks: number[]): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of chunks) controller.enqueue(new Uint8Array(size).fill(7))
      controller.close()
    },
  })
  return new Request('http://localhost/', { method: 'POST', body, duplex: 'half' } as RequestInit)
}

test('readLimitedBody returns the whole body when it fits', async () => {
  const body = await readLimitedBody(streamed([3, 4]), 7)
  assert.deepEqual(body, new Uint8Array(7).fill(7))
})

test('readLimitedBody stops a streamed body as soon as it goes over the limit', async () => {
  await assert.rejects(readLimitedBody(streamed([4, 4, 4]), 7), BodyTooLargeError)
})

test('readLimitedBody trusts a declared length only to refuse early', async () => {
  const request = new Request('http://localhost/', {
    method: 'POST',
    body: 'abc',
    headers: { 'Content-Length': '999' },
  })
  await assert.rejects(readLimitedBody(request, 10), BodyTooLargeError)
})

test('vaultErrorResponse maps storage codes to HTTP statuses', () => {
  const cases = [
    ['UNAUTHENTICATED', 401],
    ['FORBIDDEN', 403],
    ['INVALID_INPUT', 400],
    ['TOO_LARGE', 413],
    ['CORRUPT', 502],
    ['UNAVAILABLE', 503],
  ] as const
  for (const [code, status] of cases) {
    assert.equal(vaultErrorResponse(new StorageError(code)).status, status, code)
  }
  assert.equal(vaultErrorResponse(new ExtractionError()).status, 422)
  assert.equal(vaultErrorResponse(new BodyTooLargeError()).status, 413)
})

test('vaultErrorResponse never echoes an unexpected error', async () => {
  const res = vaultErrorResponse(new Error('/srv/vault/secret-path leaked'))
  assert.equal(res.status, 500)
  assert.ok(!(await res.text()).includes('secret-path'))
  assert.equal(res.headers.get('cache-control'), 'no-store')
})
