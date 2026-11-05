import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isActive, safeNextPath } from './nav.ts'

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

test('safeNextPath keeps app routes', () => {
  assert.equal(safeNextPath('/import'), '/import')
})

test('safeNextPath falls back to the vault for anything else', () => {
  for (const next of [undefined, '', '/', 'https://evil.example', '//evil.example', ['/import']]) {
    assert.equal(safeNextPath(next), '/dashboard')
  }
})
