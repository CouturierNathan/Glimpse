import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { getDocumentProxy } from 'unpdf'

import { ExtractionError } from './extraction.ts'
import type { TextPage } from './extraction.ts'

const execute = promisify(execFile)
const MAX_PAGES = 12
const MAX_PAGE_CHARS = 40_000

interface TextItem {
  str?: string
  hasEOL?: boolean
  transform?: number[]
}

/** A page's text, one line per line of the document, as `pdftotext -layout` gave it. */
function pageText(items: readonly TextItem[]): string {
  let text = ''
  let lastY: number | undefined
  for (const item of items) {
    if (typeof item.str !== 'string') continue
    const y = item.transform?.[5]
    // A new baseline without an explicit end of line still starts a new line.
    if (lastY !== undefined && y !== undefined && Math.abs(y - lastY) > 1 && !text.endsWith('\n')) {
      text += '\n'
    }
    text += item.str
    if (item.hasEOL) text += '\n'
    lastY = y
  }
  return text.trim()
}

/**
 * OCR of one page whose PDF holds no text (a scan), with poppler's rasteriser and tesseract where
 * they are installed. A host without them (a serverless function) refuses scanned documents.
 */
async function ocrPage(pdf: Uint8Array, page: number, root: string): Promise<string> {
  const dir = await mkdtemp(join(root, 'glimpse-extraction-'))
  try {
    const path = join(dir, 'source.pdf')
    await writeFile(path, pdf, { mode: 0o600 })
    const image = join(dir, `page-${page}`)
    await execute(
      'pdftoppm',
      [
        '-f',
        String(page),
        '-l',
        String(page),
        '-scale-to',
        '2000',
        '-singlefile',
        '-png',
        path,
        image,
      ],
      { timeout: 15_000, maxBuffer: 64 * 1024 },
    )
    return (
      await execute('tesseract', [`${image}.png`, 'stdout', '-l', 'eng'], {
        timeout: 20_000,
        maxBuffer: 64 * 1024,
      })
    ).stdout.trim()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Reads a PDF's text in this process with pdf.js (through unpdf, built for serverless hosts), so
 * it runs wherever Node runs, Vercel included: no binary, no temporary file. Only a scanned page
 * goes to OCR, through a private temporary job removed on success and on error.
 */
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
  let pages: TextPage[]
  try {
    // pdf.js takes ownership of the buffer it is given (it detaches it): hand it a copy. Not
    // `pdf.slice()`, which on a Node Buffer is a view of the same memory, not a copy.
    const document = await getDocumentProxy(new Uint8Array(pdf), {
      useSystemFonts: false,
      // Text extraction needs no font files; pdf.js would warn on stderr for each standard font.
      verbosity: 0,
    })
    try {
      const count = document.numPages
      if (!Number.isSafeInteger(count) || count < 1 || count > MAX_PAGES) {
        throw new ExtractionError()
      }
      pages = []
      for (let index = 1; index <= count; index++) {
        const content = await (await document.getPage(index)).getTextContent()
        let text = pageText(content.items as TextItem[])
        if (!text && options.ocr !== false) {
          text = await ocrPage(pdf, index, options.temporaryRoot ?? tmpdir())
        }
        if (!text || text.length > MAX_PAGE_CHARS) throw new ExtractionError()
        pages.push({ page: index, text })
      }
    } finally {
      await document.cleanup()
    }
  } catch {
    throw new ExtractionError()
  }
  try {
    return await run(pages)
  } catch {
    throw new ExtractionError()
  }
}
