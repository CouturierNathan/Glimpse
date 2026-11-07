import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ExtractionError } from './extraction.ts'
import type { TextPage } from './extraction.ts'
const execute = promisify(execFile)
/** Private temporary job; source PDF/OCR files are removed on success AND error. */
export async function withPdfPages<T>(
  pdf: Uint8Array,
  run: (pages: TextPage[]) => Promise<T>,
  options: { ocr?: boolean; temporaryRoot?: string } = {},
): Promise<T> {
  if (
    pdf.byteLength > 5 * 1024 * 1024 ||
    pdf.byteLength < 5 ||
    new TextDecoder().decode(pdf.slice(0, 5)) !== '%PDF-'
  ) {
    throw new ExtractionError()
  }
  const dir = await mkdtemp(join(options.temporaryRoot ?? tmpdir(), 'glimpse-extraction-'))
  try {
    const path = join(dir, 'source.pdf')
    await writeFile(path, pdf, { mode: 0o600 })
    const info = await execute('pdfinfo', [path], { timeout: 10_000, maxBuffer: 64 * 1024 })
    const count = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1])
    if (!Number.isSafeInteger(count) || count < 1 || count > 12) throw new ExtractionError()
    const result = await execute('pdftotext', ['-layout', path, '-'], {
      timeout: 10_000,
      maxBuffer: 512 * 1024,
    })
    const texts = result.stdout.split('\f')
    const pages: TextPage[] = []
    for (let index = 0; index < count; index++) {
      let text = texts[index]?.trim() ?? ''
      if (!text && options.ocr !== false) {
        const image = join(dir, `page-${index + 1}`)
        await execute(
          'pdftoppm',
          [
            '-f',
            String(index + 1),
            '-l',
            String(index + 1),
            '-scale-to',
            '2000',
            '-singlefile',
            '-png',
            path,
            image,
          ],
          { timeout: 15_000, maxBuffer: 64 * 1024 },
        )
        text = (
          await execute('tesseract', [`${image}.png`, 'stdout', '-l', 'eng'], {
            timeout: 20_000,
            maxBuffer: 64 * 1024,
          })
        ).stdout.trim()
      }
      if (!text || text.length > 40_000) throw new ExtractionError()
      pages.push({ page: index + 1, text })
    }
    return await run(pages)
  } catch {
    throw new ExtractionError()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
