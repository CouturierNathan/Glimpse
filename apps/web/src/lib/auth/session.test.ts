import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { createSessionToken, getSessionSecret, readSessionToken, type Session } from './session.ts'

const secret = 'test-secret-that-is-at-least-32-bytes-long'
const now = 1_800_000_000_000
const session: Session = {
  schemaVersion: '1.0.0',
  address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  chainId: 11155111,
  issuedAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 60_000).toISOString(),
}

describe('session tokens', () => {
  test('round-trip a valid session', () => {
    const token = createSessionToken(session, secret)
    assert.deepEqual(readSessionToken(token, secret, now), session)
  })

  test('reject a token signed with another secret', () => {
    const token = createSessionToken(session, `${secret}-other`)
    assert.equal(readSessionToken(token, secret, now), null)
  })

  test('reject a tampered payload', () => {
    const [, mac] = createSessionToken(session, secret).split('.')
    const forged = Buffer.from(
      JSON.stringify({ ...session, address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' }),
    ).toString('base64url')
    assert.equal(readSessionToken(`${forged}.${mac}`, secret, now), null)
  })

  test('reject an expired session', () => {
    const token = createSessionToken(session, secret)
    assert.equal(readSessionToken(token, secret, Date.parse(session.expiresAt)), null)
  })

  test('reject malformed tokens', () => {
    for (const token of [undefined, '', 'abc', 'a.b.c', '.', 'not-base64.!!!']) {
      assert.equal(readSessionToken(token, secret, now), null)
    }
  })

  test('reject a well-signed payload that is not an AuthSession', () => {
    for (const data of [
      { address: 'nope' },
      { ...session, schemaVersion: undefined },
      { ...session, expiresAt: Date.parse(session.expiresAt) },
    ]) {
      const token = createSessionToken(data as unknown as Session, secret)
      assert.equal(readSessionToken(token, secret, now), null)
    }
  })
})

describe('getSessionSecret', () => {
  test('refuse a missing or short secret', () => {
    const saved = process.env.SESSION_SECRET
    try {
      delete process.env.SESSION_SECRET
      assert.throws(getSessionSecret)
      process.env.SESSION_SECRET = 'short'
      assert.throws(getSessionSecret)
      process.env.SESSION_SECRET = secret
      assert.equal(getSessionSecret(), secret)
    } finally {
      process.env.SESSION_SECRET = saved
    }
  })
})
