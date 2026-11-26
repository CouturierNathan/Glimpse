import { spawnSync } from 'node:child_process'
import { fileStorageSupported } from './files.ts'
import { createMemoryStorageBackend } from './memory.ts'
import type { StorageBackend } from './storage.ts'

/**
 * Why a test that needs the file storage backend cannot run here, or false when it can. The
 * backend is POSIX object storage: it opens with `O_NOFOLLOW`, publishes with a hard link and
 * requires directories only its own user can read. Windows has none of them, so the backend
 * refuses to start rather than silently dropping those protections. Skipping says so instead of
 * reporting a storage failure the platform can never satisfy.
 */
export function posixStorageSkip(): string | false {
  if (process.platform === 'win32' || !fileStorageSupported()) {
    return 'file storage needs POSIX: O_NOFOLLOW, hard links and private directory modes'
  }
  return false
}

const OCR_TOOLS = ['pdftoppm', 'tesseract']
let missingOcrTools: string[] | undefined

/**
 * Why a test that runs OCR on a scanned PDF cannot run here, or false when it can. Reading a PDF's
 * text needs nothing installed (pdf.js runs in Node); only a scan needs poppler's rasteriser and
 * tesseract, which CI installs and a workstation often lacks.
 */
export function ocrToolsSkip(): string | false {
  missingOcrTools ??= OCR_TOOLS.filter(
    (tool) => spawnSync(tool, ['-v'], { stdio: 'ignore', shell: false }).error !== undefined,
  )
  if (missingOcrTools.length === 0) return false
  return `needs ${missingOcrTools.join(', ')}: install poppler-utils and tesseract-ocr`
}

/** The in-process adapter, under the name the tests already use. */
export function createMemoryStorageBackendForTests(): StorageBackend {
  return createMemoryStorageBackend()
}
