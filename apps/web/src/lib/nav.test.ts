import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isActive } from './nav.ts'

test('isActive matches the exact route', () => {
  assert.equal(isActive('/import', '/import'), true)
})

test('isActive matches sub-pages of the route', () => {
  assert.equal(isActive('/import/review', '/import'), true)
})

test('isActive ignores routes that only share a prefix', () => {
  assert.equal(isActive('/imports', '/import'), false)
  assert.equal(isActive('/', '/import'), false)
})
