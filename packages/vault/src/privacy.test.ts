import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createPrivateExtractionService,
  selectedExcerpts,
  syntheticDemoModel,
  createOllamaModel,
} from '@glimpse/vault/server'
import type {
  ExtractionConsent,
  ExtractionDocument,
  AttributeSpec,
  ExtractionModel,
} from '@glimpse/vault/server'
import { pdfToolsSkip } from '@glimpse/vault/server/testing'
const document: ExtractionDocument = {
  documentId: 'a'.repeat(32),
  documentVersion: 1,
  kind: 'synthetic',
  pages: [
    {
      page: 1,
      text: 'Unrelated Name: SYNTHETIC PERSON\nStudent: true; period 2026-01-01 to 2026-12-31',
    },
  ],
}
const specs: AttributeSpec[] = [{ attribute: 'student_status', label: 'Student', type: 'boolean' }]
const holderId = 'b'.repeat(32)
const consent = (): ExtractionConsent => ({
  holderId,
  documentId: document.documentId,
  documentVersion: 1,
  purpose: 'extract-attributes',
  policyVersion: '1',
  attributes: ['student_status'],
  granted: true,
  expiresAt: Date.now() + 60_000,
})
const auth = () =>
  Promise.resolve({ holderId, encryptionKeyIds: ['c'.repeat(32)], expiresAt: Date.now() + 60_000 })
test('only approved minimal excerpts enter provider; model outputs purged after success', async () => {
  const raw = await syntheticDemoModel().complete(
    '',
    JSON.stringify(selectedExcerpts(document, specs)),
  )
  let sent = ''
  const service = createPrivateExtractionService({
    authenticate: auth,
    readConsent: () => Promise.resolve(consent()),
    attributes: specs,
    model: {
      name: 'ollama-local:test',
      complete(_system, data) {
        sent = data
        return Promise.resolve(raw)
      },
    },
  })
  const claims = await service.extract(document, ['student_status'])
  assert.equal(claims[0]?.value.value, true)
  assert.equal(sent.includes('SYNTHETIC PERSON'), false)
  assert.equal(sent.includes(document.documentId), false)
  assert.deepEqual(raw, [])
  assert.ok(document.pages[0]?.text.includes('SYNTHETIC PERSON')) // caller retains ownership of original
})
test('missing, withdrawn, expired, wrong-holder/document/policy or unapproved consent prevents inference', async () => {
  let calls = 0
  const model: ExtractionModel = {
    name: 'ollama-local:test',
    complete: () => {
      calls++
      return Promise.resolve([])
    },
  }
  for (const c of [
    null,
    { ...consent(), granted: false },
    { ...consent(), expiresAt: 0 },
    { ...consent(), holderId: 'd'.repeat(32) },
    { ...consent(), documentVersion: 2 },
    { ...consent(), policyVersion: 'other' },
    { ...consent(), attributes: [] },
  ]) {
    const service = createPrivateExtractionService({
      authenticate: auth,
      readConsent: () => Promise.resolve(c as ExtractionConsent | null),
      attributes: specs,
      model,
    })
    await assert.rejects(service.extract(document, ['student_status']))
  }
  assert.equal(calls, 0)
})
test('secrets and identity documents never enter model prompts', async () => {
  let calls = 0
  const model: ExtractionModel = {
    name: 'ollama-local:test',
    complete: () => {
      calls++
      return Promise.resolve([])
    },
  }
  const service = createPrivateExtractionService({
    authenticate: auth,
    readConsent: () => Promise.resolve(consent()),
    attributes: specs,
    model,
  })
  for (const sensitive of [
    'private_key: do-not-send',
    'Passport: XX000000',
    'api_key: sk-synthetic-test-secret-value',
    `Secret: ${'f'.repeat(64)}`,
    'IBAN: FR7630006000011234567890189',
  ]) {
    await assert.rejects(
      service.extract(
        { ...document, pages: [{ page: 1, text: document.pages[0]?.text + '\n' + sensitive }] },
        ['student_status'],
      ),
    )
  }
  assert.equal(calls, 0)
  assert.throws(() => createOllamaModel('model:cloud'))
})
test('model outputs purged after invalid output and consent withdrawal during inference', async () => {
  for (const invalid of [true, false]) {
    const raw = (await syntheticDemoModel().complete(
      '',
      JSON.stringify(selectedExcerpts(document, specs)),
    )) as Record<string, unknown>[]
    if (invalid && raw[0]) raw[0].quote = 'hallucinated'
    let granted = true
    const service = createPrivateExtractionService({
      authenticate: auth,
      readConsent: () => Promise.resolve({ ...consent(), granted }),
      attributes: specs,
      model: {
        name: 'ollama-local:test',
        complete() {
          if (!invalid) granted = false
          return Promise.resolve(raw)
        },
      },
    })
    await assert.rejects(service.extract(document, ['student_status']))
    assert.deepEqual(raw, [])
  }
})
test(
  'privacy PDF jobs purge files on success and provider failure',
  { skip: pdfToolsSkip() },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), 'glimpse-private-job-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const pdf = await readFile(new URL('../fixtures/education-synthetic.pdf', import.meta.url))
    const { pages: _pages, ...metadata } = document
    for (const failure of [false, true]) {
      const service = createPrivateExtractionService({
        authenticate: auth,
        readConsent: () => Promise.resolve(consent()),
        attributes: specs,
        temporaryRoot: root,
        model: failure
          ? {
              name: 'ollama-local:test',
              complete: () => Promise.reject(new Error('private provider content')),
            }
          : syntheticDemoModel(),
      })
      if (failure) {
        await assert.rejects(
          service.extractPdf(pdf, metadata, ['student_status']),
          (error) => error instanceof Error && !error.message.includes('private provider content'),
        )
      } else assert.equal((await service.extractPdf(pdf, metadata, ['student_status'])).length, 1)
      assert.deepEqual(await readdir(root), [])
    }
  },
)
