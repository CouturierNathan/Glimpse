'use client'

/**
 * The requests this browser was asked, in IndexedDB.
 *
 * The server routes a request and keeps its decisions, but it never knows which browser is the
 * holder: there is no account to hang a history on. So the holder's own record of what they were
 * asked, and what they agreed to, lives here, next to the vault keys. It holds no value and no
 * ciphertext — only what was asked, by whom and when — and clearing site data clears it.
 */
export interface SeenRequest {
  requestId: string
  requesterName: string
  purpose: string
  createdAt: string
  expiresAt: string
  /** When the holder answered, absent while the request is still open to them. */
  answeredAt?: string
  /** What was asked, and what the holder agreed to share of it. */
  items: { requestId: string; attribute: string; shared: boolean }[]
}

const DB = 'glimpse-holder'
const STORE = 'seen'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: 'requestId' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'))
  })
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB failed'))
    })
  } finally {
    db.close()
  }
}

/** Records a request the holder opened, or updates it with what they answered. */
export async function rememberRequest(entry: SeenRequest): Promise<void> {
  const previous = await seenRequest(entry.requestId).catch(() => undefined)
  await run('readwrite', (s) => s.put({ ...previous, ...entry }))
}

export const seenRequest = (requestId: string) =>
  run<SeenRequest | undefined>(
    'readonly',
    (s) => s.get(requestId) as IDBRequest<SeenRequest | undefined>,
  )

export async function seenRequests(): Promise<SeenRequest[]> {
  const all = await run<SeenRequest[]>('readonly', (s) => s.getAll() as IDBRequest<SeenRequest[]>)
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
