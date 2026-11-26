import { createHash, randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'

/*
 * The server's own state (registered keys, identity checks, consents, requests) as small JSON
 * values under string keys, each with an optional lifetime. Three stores share one interface:
 *
 * - memory: this process only, for tests and a platform with no writable disk;
 * - file: a private directory, so a restart of a single server forgets nothing;
 * - Redis over HTTP (Upstash, Vercel KV): shared by every instance of a hosted deployment.
 *
 * None of them ever holds a key that opens a vault, a document, or a value a holder imported.
 */
export interface Kv {
  get(key: string): Promise<string | null>
  /** Returns false when `onlyIfAbsent` is set and the key exists: nothing is overwritten then. */
  set(
    key: string,
    value: string,
    options?: { ttlMs?: number; onlyIfAbsent?: boolean },
  ): Promise<boolean>
  del(key: string): Promise<boolean>
}

export class KvFullError extends Error {
  constructor() {
    super('State store full')
    this.name = 'KvFullError'
  }
}

/** In this process. Expired entries are dropped as they are met and when the store fills up. */
export function memoryKv(maxEntries = 100_000, now = () => Date.now()): Kv {
  const entries = new Map<string, { value: string; expiresAt: number }>()
  const live = (key: string) => {
    const entry = entries.get(key)
    if (entry && entry.expiresAt <= now()) {
      entries.delete(key)
      return undefined
    }
    return entry
  }
  return {
    get: (key) => Promise.resolve(live(key)?.value ?? null),
    set(key, value, options = {}) {
      if (options.onlyIfAbsent && live(key)) return Promise.resolve(false)
      if (!entries.has(key) && entries.size >= maxEntries) {
        for (const k of entries.keys()) live(k)
        if (entries.size >= maxEntries) return Promise.reject(new KvFullError())
      }
      entries.set(key, { value, expiresAt: options.ttlMs ? now() + options.ttlMs : Infinity })
      return Promise.resolve(true)
    },
    del: (key) => Promise.resolve(entries.delete(key)),
  }
}

/**
 * One file per key in a private directory, named by the key's SHA-256 so no key text reaches the
 * filesystem. Writes go to a temporary file renamed into place; a create-if-absent uses an
 * exclusive open, so two requests cannot both win.
 */
export function fileKv(directory: string, now = () => Date.now()): Kv {
  const ready = mkdir(directory, { recursive: true, mode: 0o700 })
  const path = (key: string) => join(directory, createHash('sha256').update(key).digest('hex'))

  async function read(key: string): Promise<string | null> {
    await ready
    let raw: string
    try {
      raw = await readFile(path(key), 'utf8')
    } catch {
      return null
    }
    try {
      const entry = JSON.parse(raw) as { value: string; expiresAt: number | null }
      if (entry.expiresAt !== null && entry.expiresAt <= now()) {
        await rm(path(key), { force: true })
        return null
      }
      return entry.value
    } catch {
      return null
    }
  }

  return {
    get: read,
    async set(key, value, options = {}) {
      await ready
      const body = JSON.stringify({
        value,
        expiresAt: options.ttlMs ? now() + options.ttlMs : null,
      })
      if (options.onlyIfAbsent) {
        if ((await read(key)) !== null) return false
        try {
          const handle = await open(path(key), 'wx', 0o600)
          await handle.writeFile(body)
          await handle.close()
          return true
        } catch {
          return false
        }
      }
      const temporary = `${path(key)}.${randomBytes(6).toString('hex')}.tmp`
      const handle = await open(temporary, 'wx', 0o600)
      await handle.writeFile(body)
      await handle.close()
      await rename(temporary, path(key))
      return true
    },
    async del(key) {
      await ready
      const existed = (await read(key)) !== null
      await rm(path(key), { force: true })
      return existed
    },
  }
}

/** Redis through its REST API, as Upstash and Vercel KV expose it. */
export function redisKv(url: string, token: string, fetcher: typeof fetch = fetch): Kv {
  async function command(args: (string | number)[]): Promise<unknown> {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
    })
    const body = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null
    if (!res.ok || !body || body.error) throw new Error('State store unavailable')
    return body.result
  }
  return {
    async get(key) {
      const result = await command(['GET', key])
      return typeof result === 'string' ? result : null
    },
    async set(key, value, options = {}) {
      const args: (string | number)[] = ['SET', key, value]
      if (options.ttlMs) args.push('PX', Math.max(1, Math.ceil(options.ttlMs)))
      if (options.onlyIfAbsent) args.push('NX')
      return (await command(args)) === 'OK'
    },
    async del(key) {
      return Number(await command(['DEL', key])) > 0
    },
  }
}

/** A JSON value under a key, or null when absent or unreadable. */
export async function getJson<T>(kv: Kv, key: string): Promise<T | null> {
  const raw = await kv.get(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function setJson(
  kv: Kv,
  key: string,
  value: unknown,
  options?: { ttlMs?: number; onlyIfAbsent?: boolean },
): Promise<boolean> {
  return kv.set(key, JSON.stringify(value), options)
}
