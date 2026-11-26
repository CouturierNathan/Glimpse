import { constants } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { assertHolderId, assertReference, StorageError } from './storage.ts'
import type { StorageBackend } from './storage.ts'

/**
 * Why a test that needs the file storage backend cannot run here, or false when it can. The
 * backend is POSIX object storage: it opens with `O_NOFOLLOW`, publishes with a hard link and
 * requires directories only its own user can read. Windows has none of them, so the backend
 * refuses to start rather than silently dropping those protections. Skipping says so instead of
 * reporting a storage failure the platform can never satisfy.
 */
export function posixStorageSkip(): string | false {
  if (process.platform === 'win32' || typeof constants.O_NOFOLLOW !== 'number') {
    return 'file storage needs POSIX: O_NOFOLLOW, hard links and private directory modes'
  }
  return false
}

const PDF_TOOLS = ['pdfinfo', 'pdftotext', 'pdftoppm', 'tesseract']
let missingPdfTools: string[] | undefined

/**
 * Why a test that reads a real PDF or runs OCR cannot run here, or false when it can. CI installs
 * poppler and tesseract; a workstation often has neither, and the extractor then rejects every
 * document for want of a binary rather than for anything the test is about.
 */
export function pdfToolsSkip(): string | false {
  missingPdfTools ??= PDF_TOOLS.filter(
    (tool) => spawnSync(tool, ['-v'], { stdio: 'ignore', shell: false }).error !== undefined,
  )
  if (missingPdfTools.length === 0) return false
  return `needs ${missingPdfTools.join(', ')}: install poppler-utils and tesseract-ocr`
}

/** Test-only adapter; never use as the local demo's durable backend. */
export function createMemoryStorageBackendForTests(): StorageBackend {
  const objects = new Map<string, Uint8Array>()
  function key(holderId: string, ref: string): string {
    assertHolderId(holderId)
    assertReference(ref)
    return `${holderId}:${ref}`
  }
  return {
    create(holderId, ref, bytes) {
      const id = key(holderId, ref)
      if (objects.has(id)) return Promise.resolve(false)
      objects.set(id, bytes.slice())
      return Promise.resolve(true)
    },
    read(holderId, ref, maxBytes) {
      const bytes = objects.get(key(holderId, ref))
      if (bytes && bytes.length > maxBytes) return Promise.reject(new StorageError('CORRUPT'))
      return Promise.resolve(bytes?.slice() ?? null)
    },
    remove(holderId, ref) {
      return Promise.resolve(objects.delete(key(holderId, ref)))
    },
  }
}
