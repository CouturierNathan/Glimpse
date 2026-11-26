/*
 * Reads every demo document in tests/fixtures/documents/ with the real extractor and the real attribute list,
 * so a label that no longer matches, or a line the extractor refuses, is caught here rather than
 * in front of an audience. Run: npm run check:demo -w apps/web
 */
import { readFile } from 'node:fs/promises'

import { extractClaims, syntheticDemoModel } from '@glimpse/vault/server'
import type { AttributeSpec, ExtractionDocument } from '@glimpse/vault/server'

import { importAttributes, MAX_ATTRIBUTES_PER_IMPORT } from '../src/lib/vault/attributes.ts'

const documents = [
  { file: 'demo-complete-record.txt', kind: 'synthetic' },
  { file: 'demo-student-certificate.txt', kind: 'education' },
  { file: 'demo-employment-certificate.txt', kind: 'employment' },
  { file: 'demo-other-person-certificate.txt', kind: 'synthetic' },
] as const

let failures = 0

for (const { file, kind } of documents) {
  const text = await readFile(
    new URL(`../../../tests/fixtures/documents/${file}`, import.meta.url),
    'utf8',
  )
  // Only the attributes this document actually carries, capped like the import screen caps them.
  const present = importAttributes.filter((a) => new RegExp(`^${a.label}\\s*:`, 'im').test(text))
  const specs: AttributeSpec[] = present
    .slice(0, MAX_ATTRIBUTES_PER_IMPORT)
    .map(({ attribute, label, type }) => ({ attribute, label, type }))

  const document: ExtractionDocument = {
    documentId: 'a'.repeat(32),
    documentVersion: 1,
    kind,
    pages: [{ page: 1, text }],
  }

  try {
    const claims = await extractClaims(document, specs, syntheticDemoModel())
    const values = claims.map((c) => `${c.attribute}=${JSON.stringify(c.value.value)}`).join(', ')
    process.stdout.write(`${file}: ${claims.length}/${specs.length} read — ${values}\n`)
    if (claims.length !== specs.length) failures++
  } catch (error) {
    failures++
    process.stdout.write(
      `${file}: REFUSED (${error instanceof Error ? error.message : String(error)})\n`,
    )
  }
}

if (failures > 0) {
  process.stdout.write(`\n${failures} demo document(s) did not extract cleanly.\n`)
  process.exitCode = 1
}
