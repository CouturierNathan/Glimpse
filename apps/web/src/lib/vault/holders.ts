import { randomBytes } from 'node:crypto'

const OPAQUE_ID = /^[0-9a-f]{32}$/
/** Each page load registers a fresh encryption key; older ones stay to open older items. */
export const MAX_KEYS_PER_HOLDER = 64

export interface HolderIdentity {
  holderId: string
  encryptionKeyIds: string[]
}

interface Holder {
  holderId: string
  /** recipientKeyId -> SPKI public key, base64url. */
  keys: Map<string, string>
}

export class HolderKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HolderKeyError'
  }
}

/**
 * Maps a signed-in wallet to an opaque vault holder and its encryption keys. The holder id is
 * random: it is neither the address nor a hash of it, so stored objects never point to a wallet.
 * In memory for now, so a server restart forgets every holder.
 */
export class HolderRegistry {
  readonly #holders = new Map<string, Holder>()

  #walletKey(address: string, chainId: number): string {
    return `${chainId}:${address.toLowerCase()}`
  }

  /** The wallet's holder id, created on first use. */
  ensure(address: string, chainId: number): string {
    const key = this.#walletKey(address, chainId)
    let holder = this.#holders.get(key)
    if (!holder) {
      holder = { holderId: randomBytes(16).toString('hex'), keys: new Map() }
      this.#holders.set(key, holder)
    }
    return holder.holderId
  }

  /** The wallet's holder, or null until it has registered at least one key. */
  find(address: string, chainId: number): HolderIdentity | null {
    const holder = this.#holders.get(this.#walletKey(address, chainId))
    if (!holder || holder.keys.size === 0) return null
    return { holderId: holder.holderId, encryptionKeyIds: [...holder.keys.keys()] }
  }

  /** A registered public key, so a holder can wrap an item key for this recipient. */
  publicKey(holderId: string, keyId: string): string | null {
    for (const holder of this.#holders.values()) {
      if (holder.holderId === holderId) return holder.keys.get(keyId) ?? null
    }
    return null
  }

  registerKey(address: string, chainId: number, keyId: string, publicKey: string): void {
    if (!OPAQUE_ID.test(keyId)) throw new HolderKeyError('Invalid key id')
    const holder = this.#holders.get(this.#walletKey(address, chainId))
    if (!holder) throw new HolderKeyError('Unknown holder')
    const known = holder.keys.get(keyId)
    if (known !== undefined) {
      // Re-sending the same key is harmless; rebinding an id to another key is not.
      if (known !== publicKey) throw new HolderKeyError('Key id already bound to another key')
      return
    }
    if (holder.keys.size >= MAX_KEYS_PER_HOLDER) throw new HolderKeyError('Too many keys')
    holder.keys.set(keyId, publicKey)
  }
}
