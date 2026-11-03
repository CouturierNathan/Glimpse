import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { createClient, custom } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { createSiweMessage, type SiweMessage } from 'viem/siwe'

import { parseSignInBody, type SiweExpectation, verifySignIn } from './siwe.ts'

// No network in tests: EOA signatures must be checked without an RPC call.
const offline = createClient({
  chain: sepolia,
  transport: custom({
    request: () => Promise.reject(new Error('no network in tests')),
  }),
})

const account = privateKeyToAccount(generatePrivateKey())
const issuedAt = new Date('2026-11-03T12:00:00Z')
const now = new Date('2026-11-03T12:01:00Z')
const expected: SiweExpectation = {
  domain: 'localhost:3000',
  origin: 'http://localhost:3000',
  nonce: 'abcdef1234567890',
  chainId: sepolia.id,
}

async function signIn(overrides: Partial<SiweMessage> = {}, signer = account) {
  const message = createSiweMessage({
    address: account.address,
    chainId: expected.chainId,
    domain: expected.domain,
    nonce: expected.nonce,
    uri: expected.origin,
    version: '1',
    issuedAt,
    expirationTime: new Date(issuedAt.getTime() + 5 * 60_000),
    ...overrides,
  })
  return { message, signature: await signer.signMessage({ message }) }
}

describe('verifySignIn', () => {
  test('accept a message signed by its address', async () => {
    assert.equal(await verifySignIn(offline, await signIn(), expected, now), account.address)
  })

  test('reject a signature from another account', async () => {
    const other = privateKeyToAccount(generatePrivateKey())
    assert.equal(await verifySignIn(offline, await signIn({}, other), expected, now), null)
  })

  test('reject a message edited after signing', async () => {
    const { message, signature } = await signIn()
    const edited = message.replace('localhost:3000 wants', 'localhost:3000  wants')
    assert.equal(await verifySignIn(offline, { message: edited, signature }, expected, now), null)
  })

  const mismatches: [string, Partial<SiweMessage>][] = [
    ['another domain', { domain: 'evil.example' }],
    ['another origin', { uri: 'https://evil.example/login' }],
    ['another nonce', { nonce: 'zzzzzzzz12345678' }],
    ['another chain', { chainId: 1 }],
    ['no expiration', { expirationTime: undefined }],
    ['a lifetime over 10 minutes', { expirationTime: new Date(issuedAt.getTime() + 11 * 60_000) }],
    ['an issue date in the future', { issuedAt: new Date(now.getTime() + 2 * 60_000) }],
  ]
  for (const [name, overrides] of mismatches) {
    test(`reject ${name}`, async () => {
      assert.equal(await verifySignIn(offline, await signIn(overrides), expected, now), null)
    })
  }

  test('reject an expired message', async () => {
    const late = new Date(issuedAt.getTime() + 6 * 60_000)
    assert.equal(await verifySignIn(offline, await signIn(), expected, late), null)
  })
})

describe('parseSignInBody', () => {
  test('accept a message and a hex signature', () => {
    assert.deepEqual(parseSignInBody({ message: 'm', signature: '0x12' }), {
      message: 'm',
      signature: '0x12',
    })
  })

  test('reject anything else', () => {
    for (const body of [null, 'x', {}, { message: 'm' }, { message: 'm', signature: 'zz' }]) {
      assert.equal(parseSignInBody(body), null)
    }
    assert.equal(parseSignInBody({ message: 'm'.repeat(5000), signature: '0x12' }), null)
  })
})
