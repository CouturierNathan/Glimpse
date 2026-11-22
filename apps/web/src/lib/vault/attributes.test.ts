import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fixtures } from '@glimpse/shared'

import { readUploadRequest, uploadMediaType } from './attributes.ts'

test('an upload request names only attributes this app extracts', () => {
  const upload = fixtures.valid.DocumentUploadRequest
  assert.deepEqual(readUploadRequest(upload), upload)
  assert.equal(readUploadRequest({ ...upload, attributes: ['birth_date'] }), null)
  assert.equal(readUploadRequest({ ...upload, kind: 'identity' }), null)
  assert.equal(readUploadRequest(null), null)
})

test('a file is read as a PDF by its type or its extension, as text otherwise', () => {
  assert.equal(uploadMediaType({ type: 'application/pdf', name: 'a' }), 'application/pdf')
  assert.equal(uploadMediaType({ type: '', name: 'A.PDF' }), 'application/pdf')
  assert.equal(uploadMediaType({ type: 'text/plain', name: 'a.txt' }), 'text/plain')
})
