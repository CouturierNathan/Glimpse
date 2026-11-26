import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { generateOpaqueId } from '@glimpse/vault'
import { requestDomain, requestMessage, requestTypes } from '@glimpse/verifier'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { requesterProofMessage, verifyRequesterProof } from './request-proof.ts'
import {
  bundleView,
  claimBundle,
  RequestError,
  RequestRepository,
  validateBundle,
} from './requests.ts'
import { memoryKv } from './state/kv.ts'

const CHAIN = 84532
const NOW = Date.parse('2026-11-07T12:00:00.000Z')
const signer = privateKeyToAccount(generatePrivateKey())
const holderId = 'd'.repeat(32)

async function bundleInput(attributes = ['full_name', 'exam_score'], key = signer) {
  const base = {
    schemaVersion: '1.0.0' as const,
    requester: key.address,
    purpose: 'Admission',
    recipientId: 'a'.repeat(32),
    recipientKeyId: 'b'.repeat(32),
    createdAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 24 * 3600_000).toISOString(),
  }
  const requests = []
  for (const attribute of attributes) {
    const body = { ...base, requestId: generateOpaqueId(), attribute }
    const signature = await key.signTypedData({
      domain: requestDomain(CHAIN),
      types: requestTypes,
      primaryType: 'VerificationRequest',
      message: requestMessage(body),
    })
    requests.push({ ...body, proof: { type: 'EIP712' as const, chainId: CHAIN, signature } })
  }
  return { bundleId: generateOpaqueId(), requesterName: 'Epitech', publicKey: 'k', requests }
}

const context = {
  chainId: CHAIN,
  attributes: new Set(['full_name', 'exam_score', 'school']),
  isEncryptionKey: () => Promise.resolve(true),
  now: NOW,
}

async function stored(attributes?: string[]) {
  const { bundle, requests } = await validateBundle(await bundleInput(attributes), context)
  const kv = memoryKv()
  const repo = new RequestRepository(kv)
  await repo.create(bundle, requests, NOW)
  const opened = await repo.open(bundle.bundleId)
  if (!opened) throw new Error('not stored')
  return { bundle: opened.bundle, store: opened.store, save: opened.save, repo, kv, requests }
}

test('a request for several pieces is stored as one link, each piece signed by the same key', async () => {
  const { bundle, requests } = await stored(['full_name', 'exam_score', 'school'])
  assert.equal(bundle.requestIds.length, 3)
  assert.ok(requests.every((r) => r.requester === signer.address))
})

test('a bundle mixing requesters, purposes or repeating a piece is refused', async () => {
  const input = await bundleInput()
  const other = await bundleInput(['school'], privateKeyToAccount(generatePrivateKey()))
  const cases = [
    { ...input, requests: [...input.requests, ...other.requests] },
    { ...input, requests: [input.requests[0], input.requests[0]] },
    { ...input, requesterName: '' },
    { ...input, requests: [] },
  ]
  for (const body of cases) {
    await assert.rejects(validateBundle(body, context), RequestError)
  }
})

test('a visitor with the link sees what is asked, never how it was answered', async () => {
  const { bundle, store } = await stored()
  const open = bundleView(bundle, store, 'visitor', NOW)
  assert.equal(open.status, 'open')
  assert.deepEqual(
    open.items.map((i) => i.state),
    ['pending', 'pending'],
  )

  const [first = '', second = ''] = bundle.requestIds
  bundle.holderId = holderId
  store.decide(first, holderId, { outcome: 'deny' }, NOW)
  store.decide(second, holderId, { outcome: 'allow', itemId: 'e'.repeat(32), itemVersion: 1 }, NOW)
  const visitor = bundleView(bundle, store, 'visitor', NOW)
  assert.equal(visitor.status, 'answered')
  assert.deepEqual(
    visitor.items.map((i) => i.state),
    ['answered', 'answered'],
  )
  assert.deepEqual(
    bundleView(bundle, store, 'requester', NOW).items.map((i) => i.state),
    ['refused', 'allowed'],
  )
  for (const key of ['holderId', 'publicKey', 'requester', 'recipientKeyId']) {
    assert.equal(key in visitor, false, key)
  }
})

test('only the first holder to answer can answer a request', async () => {
  const { bundle } = await stored()
  claimBundle(bundle, holderId)
  claimBundle(bundle, holderId)
  assert.throws(() => claimBundle(bundle, 'f'.repeat(32)), { status: 409 })
})

test('the same request cannot be stored twice', async () => {
  const { bundle, repo, requests } = await stored()
  await assert.rejects(repo.create(bundle, requests, NOW), { status: 409 })
})

test('an answer saved on one instance is what another instance reads, piece by piece', async () => {
  const { bundle, store, save, kv } = await stored()
  const [first = ''] = bundle.requestIds
  claimBundle(bundle, holderId)
  store.decide(first, holderId, { outcome: 'deny' }, NOW)
  await save()
  const elsewhere = await new RequestRepository(kv).openPiece(first)
  assert.equal(elsewhere?.bundle.holderId, holderId)
  assert.equal(elsewhere?.store.get(first, NOW)?.state, 'refused')
  assert.equal(await new RequestRepository(kv).openPiece('f'.repeat(32)), null)
})

test('only a fresh signature by the request key proves the requester', async () => {
  const id = generateOpaqueId()
  const at = new Date(NOW).toISOString()
  const signature = await signer.signMessage({ message: requesterProofMessage(id, at) })
  assert.equal(await verifyRequesterProof(`${at}.${signature}`, id, signer.address, NOW), true)
  // Another request, another key, a stale time, or nothing at all.
  assert.equal(
    await verifyRequesterProof(`${at}.${signature}`, generateOpaqueId(), signer.address, NOW),
    false,
  )
  const stranger = privateKeyToAccount(generatePrivateKey())
  assert.equal(await verifyRequesterProof(`${at}.${signature}`, id, stranger.address, NOW), false)
  assert.equal(
    await verifyRequesterProof(`${at}.${signature}`, id, signer.address, NOW + 10 * 60_000),
    false,
  )
  assert.equal(await verifyRequesterProof(null, id, signer.address, NOW), false)
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
