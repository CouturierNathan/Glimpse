/*
 * Asks every demo document for every attribute the app knows, the way the import screen now does
 * with everything ticked. A document answers for what it holds and stays silent on the rest: the
 * run must succeed, return only what was found, and invent nothing. Run with the web tests.
 */
import { readFile } from 'node:fs/promises'

import { extractClaims, syntheticDemoModel } from '@glimpse/vault/server'
import type { AttributeSpec, ExtractionDocument } from '@glimpse/vault/server'

import { IMPORT_DOCUMENT_KIND, importAttributes } from '../src/lib/vault/attributes.ts'

const documents = [
  'demo-student-certificate.txt',
  'demo-employment-certificate.txt',
  'demo-complete-record.txt',
]
const specs: AttributeSpec[] = importAttributes.map(({ attribute, label, type }) => ({
  attribute,
  label,
  type,
}))

let failures = 0

for (const file of documents) {
  const text = await readFile(
    new URL(`../../../tests/fixtures/documents/${file}`, import.meta.url),
    'utf8',
  )
  const document: ExtractionDocument = {
    documentId: 'a'.repeat(32),
    documentVersion: 1,
    kind: IMPORT_DOCUMENT_KIND,
    pages: [{ page: 1, text }],
  }
  const present = importAttributes.filter((a) => new RegExp(`^${a.label}\\s*:`, 'im').test(text))

  try {
    // The same option the extraction service passes for a holder's import.
    const claims = await extractClaims(document, specs, syntheticDemoModel(), {
      skipMissing: true,
    })
    const read = new Set(claims.map((c) => c.attribute))
    const expected = new Set(present.map((a) => a.attribute))
    const invented = [...read].filter((a) => !expected.has(a))
    const lost = [...expected].filter((a) => !read.has(a))

    if (invented.length > 0 || lost.length > 0) {
      failures++
      process.stdout.write(
        `${file}: invented ${invented.join(', ') || 'none'}; missed ${lost.join(', ') || 'none'}\n`,
      )
    } else {
      process.stdout.write(
        `${file}: asked ${specs.length}, read ${claims.length}, left out ${specs.length - claims.length}\n`,
      )
    }
  } catch (error) {
    failures++
    process.stdout.write(
      `${file}: REFUSED (${error instanceof Error ? error.message : String(error)})\n`,
    )
  }
}

if (failures > 0) {
  process.stdout.write(`\n${failures} document(s) did not import cleanly.\n`)
  process.exitCode = 1
}
