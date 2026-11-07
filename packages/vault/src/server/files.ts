import { constants } from 'node:fs'
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertHolderId, assertReference, StorageError } from './storage.ts'
import type { StorageBackend } from './storage.ts'

export const DEFAULT_STORAGE_DIRECTORY = fileURLToPath(
  new URL('../../.vault-data/', import.meta.url),
)
function code(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined
}
async function checkDirectory(path: string): Promise<void> {
  const info = await lstat(path)
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (info.mode & 0o077) !== 0 ||
    (await realpath(path)) !== path
  ) {
    throw new StorageError('UNAVAILABLE')
  }
}
async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}
/** Local POSIX object storage. Directory must be dedicated and writable only by this service. */
export async function createFileStorageBackend(
  options: { directory?: string } = {},
): Promise<StorageBackend> {
  const root = resolve(options.directory ?? DEFAULT_STORAGE_DIRECTORY)
  // Do not silently weaken symlink protection on an unsupported filesystem/platform.
  if (typeof constants.O_NOFOLLOW !== 'number' || typeof constants.O_NONBLOCK !== 'number') {
    throw new StorageError('UNAVAILABLE')
  }
  try {
    await mkdir(root, { recursive: true, mode: 0o700 })
    await checkDirectory(root)
  } catch {
    throw new StorageError('UNAVAILABLE')
  }
  async function directory(holderId: string, create: boolean): Promise<string | null> {
    assertHolderId(holderId)
    await checkDirectory(root)
    const dir = join(root, holderId)
    try {
      if (create) {
        await mkdir(dir, { mode: 0o700 }).catch((error) => {
          if (code(error) !== 'EEXIST') throw error
        })
        await syncDirectory(root)
      }
      await checkDirectory(dir)
      return dir
    } catch (error) {
      if (!create && code(error) === 'ENOENT') return null
      throw new StorageError('UNAVAILABLE')
    }
  }
  return {
    async create(holderId, ref, bytes) {
      assertReference(ref)
      const dir = await directory(holderId, true)
      if (dir === null) throw new StorageError('UNAVAILABLE')
      const target = join(dir, `${ref}.json`)
      const temp = join(dir, `.pending-${randomBytes(16).toString('hex')}`)
      let published = false
      try {
        const handle = await open(
          temp,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        )
        try {
          await handle.writeFile(bytes)
          await handle.sync()
        } finally {
          await handle.close()
        }
        try {
          await link(temp, target)
        } catch (error) {
          if (code(error) === 'EEXIST') return false
          throw error
        }
        published = true
        await unlink(temp)
        await syncDirectory(dir)
        return true
      } catch {
        if (published) await unlink(target).catch(() => undefined)
        throw new StorageError('UNAVAILABLE')
      } finally {
        await unlink(temp).catch(() => undefined)
      }
    },
    async read(holderId, ref, maxBytes) {
      assertReference(ref)
      const dir = await directory(holderId, false)
      if (dir === null) return null
      try {
        const handle = await open(
          join(dir, `${ref}.json`),
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        )
        try {
          const info = await handle.stat()
          if (!info.isFile() || info.nlink !== 1) throw new StorageError('CORRUPT')
          if (info.size > maxBytes) throw new StorageError('CORRUPT')
          // Read at most max+1 even if the file grows after stat; never readFile unbounded.
          const bytes = new Uint8Array(maxBytes + 1)
          let used = 0
          while (used < bytes.length) {
            const { bytesRead } = await handle.read(bytes, used, bytes.length - used, used)
            if (bytesRead === 0) break
            used += bytesRead
          }
          if (used > maxBytes) throw new StorageError('CORRUPT')
          return bytes.slice(0, used)
        } finally {
          await handle.close()
        }
      } catch (error) {
        if (code(error) === 'ENOENT') return null
        if (error instanceof StorageError) throw error
        if (code(error) === 'ELOOP') throw new StorageError('CORRUPT')
        throw new StorageError('UNAVAILABLE')
      }
    },
    async remove(holderId, ref) {
      assertReference(ref)
      const dir = await directory(holderId, false)
      if (dir === null) return false
      try {
        const target = join(dir, `${ref}.json`)
        const info = await lstat(target)
        if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
          throw new StorageError('CORRUPT')
        }
        await unlink(target)
        await syncDirectory(dir)
        return true
      } catch (error) {
        if (code(error) === 'ENOENT') return false
        if (error instanceof StorageError) throw error
        throw new StorageError('UNAVAILABLE')
      }
    },
  }
}
