import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  type EIP1193Provider,
  getAddress,
  isAddressEqual,
} from 'viem'
import { ProviderNotFoundError } from 'wagmi'
import { connect, getConnection, switchChain } from 'wagmi/actions'

import { appChain } from './chains.ts'
import { walletMessages } from './wallet-messages.ts'
import { wagmiConfig } from './wagmi.ts'

/*
 * Every wallet operation goes through `walletAccount()` first.
 *
 * The cause of "The requested method and/or account has not been authorized by the user" (EIP-1193
 * error 4100): the app read the account from wagmi's cached connection and sent the signature or
 * transaction for it. That cache outlives what the wallet allows — after a reload, a locked wallet,
 * or a switch to an account this site was never connected to — and the wallet then refuses the
 * `from` address. The chain switch was also attempted and its failure ignored. Here the wallet
 * itself is asked which account this site may use (`eth_requestAccounts`, which prompts when
 * needed), that account must be the signed-in one, and the chain must really be Base Sepolia
 * before anything is signed or sent.
 */

export { walletMessages }

/** A wallet failure the user can act on; its message is one of the `wallet.*` messages. */
export class WalletError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WalletError'
  }
}

async function provider(): Promise<EIP1193Provider> {
  const connection = getConnection(wagmiConfig)
  const connector = connection.connector ?? wagmiConfig.connectors[0]
  if (!connector) throw new WalletError(walletMessages.none)
  if (connection.status !== 'connected') {
    try {
      await connect(wagmiConfig, { connector, chainId: appChain.id })
    } catch (error) {
      if (!(error instanceof BaseError && error.name === 'ConnectorAlreadyConnectedError')) {
        throw error
      }
    }
  }
  const injected = (await connector.getProvider().catch(() => undefined)) as
    EIP1193Provider | undefined
  if (!injected) throw new WalletError(walletMessages.none)
  return injected
}

/**
 * The account the wallet authorises for this site, checked against the signed-in one, on the app
 * chain. Throws a WalletError otherwise.
 */
export async function walletAccount(expected?: string | null): Promise<Address> {
  const wallet = await provider()
  const accounts = await wallet.request({ method: 'eth_requestAccounts' })
  const first = accounts[0]
  if (!first) throw new WalletError(walletMessages.locked)
  const account = getAddress(first)
  if (expected && !isAddressEqual(account, expected as Address)) {
    throw new WalletError(walletMessages.otherAccount)
  }
  const chainId = Number(await wallet.request({ method: 'eth_chainId' }))
  if (chainId !== appChain.id) {
    try {
      // wagmi adds Base Sepolia to the wallet first when the wallet does not know it (4902).
      await switchChain(wagmiConfig, { chainId: appChain.id })
    } catch (error) {
      if (codeOf(error) === 4001) throw new WalletError(walletMessages.wrongChain)
      throw error
    }
    const now = Number(await wallet.request({ method: 'eth_chainId' }))
    if (now !== appChain.id) throw new WalletError(walletMessages.wrongChain)
  }
  return account
}

function codeOf(error: unknown): number | undefined {
  let code: number | undefined
  if (error instanceof BaseError) {
    error.walk((e) => {
      const c = (e as { code?: unknown }).code
      if (code === undefined && typeof c === 'number') code = c
      return false
    })
  }
  const direct = (error as { code?: unknown } | null)?.code
  return code ?? (typeof direct === 'number' ? direct : undefined)
}

const revertMessages: Record<string, string> = {
  IssuerExists: walletMessages.issuerExists,
  NotIssuerSigner: walletMessages.notSigner,
  NotIssuer: walletMessages.notIssuer,
  NotIssuerAdmin: walletMessages.notIssuer,
  AlreadyAnchored: walletMessages.alreadyAnchored,
  AlreadyRevoked: walletMessages.alreadyRevoked,
  InvalidValidity: walletMessages.invalidValidity,
  UnknownIssuer: walletMessages.unknownIssuer,
  ECDSAInvalidSignature: walletMessages.badSignature,
  ECDSAInvalidSignatureLength: walletMessages.badSignature,
  ECDSAInvalidSignatureS: walletMessages.badSignature,
}

/** A wallet, chain or contract error in words the user can act on, never the raw RPC text. */
export function describeWalletError(error: unknown): string {
  if (error instanceof WalletError) return error.message
  if (error instanceof ProviderNotFoundError) return walletMessages.none
  if (error instanceof BaseError) {
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
      return (name && revertMessages[name]) ?? walletMessages.txFailed
    }
    const names = new Set<string>()
    error.walk((e) => {
      names.add((e as Error).name)
      return false
    })
    if (names.has('InsufficientFundsError')) return walletMessages.funds
    if (names.has('ChainMismatchError') || names.has('SwitchChainError')) {
      return walletMessages.wrongChain
    }
    if (names.has('HttpRequestError') || names.has('TimeoutError')) return walletMessages.network
    if (/insufficient funds/i.test(error.message)) return walletMessages.funds
  }
  switch (codeOf(error)) {
    case 4001:
      return walletMessages.cancelled
    case 4100:
      return walletMessages.unauthorized
    case 4902:
      return walletMessages.wrongChain
    case -32002:
      return walletMessages.pending
  }
  return walletMessages.generic
}
