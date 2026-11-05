import { generateSiweNonce } from 'viem/siwe'

/**
 * Remembers issued SIWE nonces until they are used once or expire, so a captured signature
 * cannot be replayed.
 *
 * In memory: good for one server process. Several instances would need a shared store.
 */
export class NonceStore {
  readonly #expiries = new Map<string, number>()
  readonly #ttlMs: number

  constructor(ttlMs: number) {
    this.#ttlMs = ttlMs
  }

  issue(now = Date.now()): string {
    this.#prune(now)
    const nonce = generateSiweNonce()
    this.#expiries.set(nonce, now + this.#ttlMs)
    return nonce
  }

  /** True the first time a live nonce is presented, false ever after. */
  consume(nonce: string, now = Date.now()): boolean {
    const expiresAt = this.#expiries.get(nonce)
    this.#expiries.delete(nonce)
    return expiresAt !== undefined && expiresAt > now
  }

  #prune(now: number) {
    for (const [nonce, expiresAt] of this.#expiries) {
      if (expiresAt <= now) this.#expiries.delete(nonce)
    }
  }
}
