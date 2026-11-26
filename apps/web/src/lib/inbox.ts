import { randomBytes } from 'node:crypto'

import { RequestError } from './requests.ts'
import { getJson, type Kv, setJson } from './state/kv.ts'

/*
 * Attestations an organisation sends a holder, waiting until the holder's vault picks them up.
 * Each entry is a packed item the organisation's browser encrypted for one of the holder's
 * registered public keys: the server stores ciphertext only. The holder's browser decrypts it,
 * checks it is addressed to its wallet and recorded on chain, keeps it in the vault, and deletes
 * the entry.
 */
export interface InboxEntry {
  id: string
  /** The packed encrypted item, base64. */
  item: string
  receivedAt: string
}

export const MAX_INBOX_ENTRIES = 50
export const MAX_INBOX_ITEM_BYTES = 64 * 1024
const INBOX_TTL_MS = 90 * 24 * 3600 * 1000

export class Inbox {
  readonly #kv: Kv

  constructor(kv: Kv) {
    this.#kv = kv
  }

  async list(holderId: string): Promise<InboxEntry[]> {
    return (await getJson<InboxEntry[]>(this.#kv, `inbox:${holderId}`)) ?? []
  }

  async deliver(holderId: string, items: string[], now = Date.now()): Promise<void> {
    if (items.length === 0 || items.length > 4) {
      throw new RequestError(400, 'The request was malformed.')
    }
    for (const item of items) {
      if (
        !/^[A-Za-z0-9+/]+={0,2}$/.test(item) ||
        Buffer.byteLength(item, 'base64') > MAX_INBOX_ITEM_BYTES
      ) {
        throw new RequestError(400, 'The request was malformed.')
      }
    }
    const entries = await this.list(holderId)
    if (entries.length + items.length > MAX_INBOX_ENTRIES) {
      throw new RequestError(409, 'This holder has too many attestations waiting.')
    }
    const receivedAt = new Date(now).toISOString()
    const added = items.map((item) => ({ id: randomBytes(16).toString('hex'), item, receivedAt }))
    await setJson(this.#kv, `inbox:${holderId}`, [...entries, ...added], { ttlMs: INBOX_TTL_MS })
  }

  async remove(holderId: string, id: string): Promise<void> {
    const entries = await this.list(holderId)
    const kept = entries.filter((e) => e.id !== id)
    if (kept.length === entries.length) return
    if (kept.length === 0) await this.#kv.del(`inbox:${holderId}`)
    else await setJson(this.#kv, `inbox:${holderId}`, kept, { ttlMs: INBOX_TTL_MS })
  }
}
