import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { fixtures, type VerificationRequest } from '@glimpse/shared'

import type { Session } from './auth/session.ts'
import { isRequester, requestView, type StoredRequest } from './requests.ts'

const request = fixtures.valid.VerificationRequest as VerificationRequest
const holderId = 'd'.repeat(32)

const session = (address: string): Session => ({
  schemaVersion: '1.0.0',
  address: address as Session['address'],
  chainId: request.proof.chainId,
  issuedAt: '2026-11-07T12:00:00.000Z',
  expiresAt: '2026-11-08T12:00:00.000Z',
})
const requester = session(request.requester)
const stranger = session('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')

function stored(state: StoredRequest['state']): StoredRequest {
  return {
    request,
    state,
    decision:
      state === 'pending' ? undefined : ({ holderId } as unknown as StoredRequest['decision']),
  }
}

test('only the wallet that signed a request is its requester, whatever the address case', () => {
  const lower = session(request.requester.toLowerCase())

  assert.equal(isRequester(stored('shared'), requester), true)
  assert.equal(isRequester(stored('shared'), lower), true)
  assert.equal(isRequester(stored('shared'), stranger), false)
})

test('a visitor with the link never learns how an answered request ended', () => {
  for (const state of ['refused', 'allowed', 'shared', 'withdrawn'] as const) {
    const view = requestView(stored(state), stranger, 'e'.repeat(32))

    assert.equal(view.role, 'visitor')
    assert.equal(view.state, 'answered')
  }
})

test('the requester and the answering holder see where the request stands', () => {
  assert.deepEqual(
    [requestView(stored('shared'), requester, 'e'.repeat(32))].map((v) => [v.role, v.state]),
    [['requester', 'shared']],
  )
  assert.deepEqual(
    [requestView(stored('refused'), stranger, holderId)].map((v) => [v.role, v.state]),
    [['holder', 'refused']],
  )
})

test('a request view carries no decision, grant, share reference or key pins', () => {
  const view = requestView(
    { ...stored('shared'), shareReference: 'f'.repeat(32), expected: {} as never },
    requester,
    holderId,
  )

  for (const key of ['decision', 'shareReference', 'expected', 'proof', 'recipientKeyId']) {
    assert.equal(key in view, false, key)
  }
})

// A server-side log line is where a claim, a key envelope or a session would leak first.
test('no server code writes to the console', () => {
  const roots = [
    'src/app/api',
    'src/lib',
    '../../packages/vault/src',
    '../../packages/verifier/src',
  ]
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        if (/\bconsole\.\w+\(/.test(readFileSync(path, 'utf8'))) offenders.push(path)
      }
    }
  }
  for (const root of roots) walk(root)

  assert.deepEqual(offenders, [])
})
