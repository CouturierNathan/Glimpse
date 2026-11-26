import { createHmac } from 'node:crypto'

import { getJson, type Kv, setJson } from '../state/kv.ts'

const OPAQUE_ID = /^[0-9a-f]{32}$/
/** Each browser registers one key and keeps it; a few more cover other browsers and resets. */
export const MAX_KEYS_PER_HOLDER = 64

export interface HolderIdentity {
  holderId: string
  encryptionKeyIds: string[]
}

export class HolderKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HolderKeyError'
  }
}

/**
 * Maps a signed-in wallet to an opaque vault holder and its encryption keys. The holder id is a
 * keyed hash of the wallet with a server secret: the same on every instance and after a restart,
 * so the vault reopens, yet without the secret it does not point back to a wallet. The public keys
 * live in the state store, never a private key.
 */
export class HolderRegistry {
  readonly #kv: Kv
  readonly #secret: () => Buffer

  constructor(kv: Kv, secret: () => Buffer) {
    this.#kv = kv
    this.#secret = secret
  }

  /** The wallet's holder id. */
  ensure(address: string, chainId: number): string {
    return createHmac('sha256', this.#secret())
      .update(`holder:${chainId}:${address.toLowerCase()}`)
      .digest('hex')
      .slice(0, 32)
  }

  async #keys(holderId: string): Promise<Record<string, string>> {
    return (await getJson<Record<string, string>>(this.#kv, `holder-keys:${holderId}`)) ?? {}
  }

  /** The wallet's holder, or null until it has registered at least one key. */
  async find(address: string, chainId: number): Promise<HolderIdentity | null> {
    const holderId = this.ensure(address, chainId)
    const keys = Object.keys(await this.#keys(holderId))
    return keys.length === 0 ? null : { holderId, encryptionKeyIds: keys }
  }

  /** The wallet's holder and its most recently registered public keys, to encrypt for it. */
  async publicKeysOf(
    address: string,
    chainId: number,
    limit = 4,
  ): Promise<{ holderId: string; keys: { recipientKeyId: string; publicKey: string }[] }> {
    const holderId = this.ensure(address, chainId)
    const keys = Object.entries(await this.#keys(holderId))
      .slice(-limit)
      .map(([recipientKeyId, publicKey]) => ({ recipientKeyId, publicKey }))
    return { holderId, keys }
  }

  /** A registered public key, so a holder can wrap an item key for this recipient. */
  async publicKey(holderId: string, keyId: string): Promise<string | null> {
    return (await this.#keys(holderId))[keyId] ?? null
  }

  async registerKey(address: string, chainId: number, keyId: string, publicKey: string) {
    if (!OPAQUE_ID.test(keyId)) throw new HolderKeyError('Invalid key id')
    const holderId = this.ensure(address, chainId)
    const keys = await this.#keys(holderId)
    const known = keys[keyId]
    if (known !== undefined) {
      // Re-sending the same key is harmless; rebinding an id to another key is not.
      if (known !== publicKey) throw new HolderKeyError('Key id already bound to another key')
      return
    }
    if (Object.keys(keys).length >= MAX_KEYS_PER_HOLDER) throw new HolderKeyError('Too many keys')
    await setJson(this.#kv, `holder-keys:${holderId}`, { ...keys, [keyId]: publicKey })
  }
}
