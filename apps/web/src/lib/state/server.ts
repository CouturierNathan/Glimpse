import { createHmac } from 'node:crypto'
import { join } from 'node:path'

import { getSessionSecret } from '@/lib/auth/session.ts'

import { fileKv, type Kv, memoryKv, redisKv } from './kv.ts'

/** Where the server keeps its state, in order of preference. */
export type StateMode = 'shared' | 'file' | 'memory'

/** Redis over HTTP: Vercel KV / Upstash Redis set these when the store is linked to the project. */
export function redisConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url, token } : null
}

const shared = globalThis as { glimpseStateKv?: Kv }

/**
 * The state store: Redis when configured (every instance sees the same state), else a private
 * directory next to the vault's files when they are written to disk, else this process's memory.
 */
export function stateKv(fileMode: () => boolean, directory: () => string): Kv {
  if (shared.glimpseStateKv) return shared.glimpseStateKv
  const redis = redisConfig()
  shared.glimpseStateKv = redis
    ? redisKv(redis.url, redis.token)
    : fileMode()
      ? fileKv(join(directory(), 'state'))
      : memoryKv()
  return shared.glimpseStateKv
}

/** Replaces the store, for tests. */
export function setStateKv(kv: Kv): void {
  shared.glimpseStateKv = kv
}

/**
 * A key derived from SESSION_SECRET for one purpose: stable across restarts and instances, so a
 * holder id or a name fingerprint means the same thing everywhere, and useless without the secret.
 */
export function derivedKey(purpose: string): Buffer {
  return createHmac('sha256', getSessionSecret()).update(`glimpse:${purpose}`).digest()
}
