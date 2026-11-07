import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fixtures, type IdentityValidationReport } from '@glimpse/shared'
import { verifyMessage } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import { RequestError } from '../requests.ts'

import { bindingMessage, IdentityReportStore, reportDigest } from './binding.ts'
import { BINDING_WARNING } from './warning.ts'

// Hardhat's first two well-known test accounts: public, never funded on a real chain.
const holder = privateKeyToAccount(
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
)
const other = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
)
const passed = fixtures.valid.IdentityValidationReport as IdentityValidationReport
const failed: IdentityValidationReport = {
  ...passed,
  reportId: 'd'.repeat(32),
  indication: 'INDETERMINATE',
  subIndication: 'NO_CERTIFICATE_CHAIN_FOUND',
  checks: { ...passed.checks, chain: 'fail' },
}
const wallet = { address: holder.address, chainId: 84532 }

test('the binding message names the wallet, the report and the warning', () => {
  const message = bindingMessage(passed, wallet)
  for (const part of [holder.address, passed.reportId, reportDigest(passed), BINDING_WARNING]) {
    assert.ok(message.includes(part))
  }
  assert.match(BINDING_WARNING, /does not prove/)
  assert.notEqual(
    reportDigest({ ...passed, validatedAt: '2026-11-07T09:00:01.000Z' }),
    reportDigest(passed),
  )
  assert.throws(() => bindingMessage(failed, wallet), RequestError)
})

test('only the bound wallet signature verifies against the rebuilt message', async () => {
  const message = bindingMessage(passed, wallet)
  const signature = await holder.signMessage({ message })
  assert.ok(await verifyMessage({ address: holder.address, message, signature }))
  assert.equal(await verifyMessage({ address: other.address, message, signature }), false)
  const forOther = bindingMessage(passed, { ...wallet, address: other.address })
  assert.equal(
    await verifyMessage({ address: holder.address, message: forOther, signature }),
    false,
  )
})

test('a report is bound once, by its holder, only if it passed', () => {
  const store = new IdentityReportStore()
  const signature = `0x${'1'.repeat(130)}` as const
  store.add('e'.repeat(32), passed)
  store.add('e'.repeat(32), failed)
  assert.equal(store.get('f'.repeat(32), passed.reportId), null)
  assert.throws(() => store.bind('f'.repeat(32), passed.reportId, holder.address, signature))
  assert.throws(() => store.bind('e'.repeat(32), failed.reportId, holder.address, signature))
  store.bind('e'.repeat(32), passed.reportId, holder.address, signature)
  assert.deepEqual(store.get('e'.repeat(32), passed.reportId)?.binding, {
    address: holder.address,
    signature,
  })
  assert.throws(() => store.bind('e'.repeat(32), passed.reportId, holder.address, signature))
})
