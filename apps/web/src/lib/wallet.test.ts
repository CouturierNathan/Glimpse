import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  InsufficientFundsError,
  ProviderRpcError,
  SwitchChainError,
  UnauthorizedProviderError,
  UserRejectedRequestError,
} from 'viem'

import { issuerRegistryAbi } from './issuer.ts'
import { describeWalletError, WalletError, walletMessages } from './wallet.ts'

const rpc = (code: number, message: string) =>
  new ProviderRpcError(new Error(message), { code, shortMessage: message })

test('the authorisation error users hit (4100) reads as an action to take, not raw RPC text', () => {
  const raw = new UnauthorizedProviderError(
    new Error('The requested method and/or account has not been authorized by the user.'),
  )
  assert.equal(describeWalletError(raw), walletMessages.unauthorized)
  assert.equal(describeWalletError(rpc(4100, 'unauthorized')), walletMessages.unauthorized)
})

test('refusals, network switches and missing funds each get their own message', () => {
  assert.equal(
    describeWalletError(new UserRejectedRequestError(new Error('no'))),
    walletMessages.cancelled,
  )
  assert.equal(
    describeWalletError(new SwitchChainError(new Error('no'))),
    walletMessages.wrongChain,
  )
  assert.equal(describeWalletError(rpc(4902, 'unknown chain')), walletMessages.wrongChain)
  assert.equal(describeWalletError(rpc(-32002, 'pending')), walletMessages.pending)
  assert.equal(describeWalletError(new InsufficientFundsError()), walletMessages.funds)
  assert.equal(
    describeWalletError(new WalletError(walletMessages.otherAccount)),
    walletMessages.otherAccount,
  )
})

test('a contract revert is named from the registry error, never shown as hex', () => {
  const data = encodeErrorResult({
    abi: issuerRegistryAbi,
    errorName: 'IssuerExists',
    args: ['0x0123456789abcdef0123456789abcdef'],
  })
  const reverted = new ContractFunctionRevertedError({
    abi: issuerRegistryAbi,
    data,
    functionName: 'register',
  })
  const error = new ContractFunctionExecutionError(reverted, {
    abi: issuerRegistryAbi,
    functionName: 'register',
    args: ['0x0123456789abcdef0123456789abcdef', '0x0000000000000000000000000000000000000001', ''],
  })
  assert.equal(describeWalletError(error), walletMessages.issuerExists)
})

test('anything else is a generic, translated message', () => {
  assert.equal(
    describeWalletError(new Error('0xdeadbeef: execution reverted')),
    walletMessages.generic,
  )
  assert.equal(describeWalletError('weird'), walletMessages.generic)
})

test('every wallet message has a French translation', async () => {
  const { errorTranslations } = await import('./i18n/messages.ts')
  for (const message of Object.values(walletMessages)) {
    assert.ok(Object.hasOwn(errorTranslations, message), message)
  }
})
