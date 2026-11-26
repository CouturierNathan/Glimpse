import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { importAttributes } from '../vault/attributes.ts'

import { errorTranslations, messages } from './messages.ts'
import { pickLocale, translate, translateError } from './translate.ts'

const src = fileURLToPath(new URL('../../', import.meta.url))

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

test('French and English have the same messages, none empty, with the same placeholders', () => {
  assert.deepEqual(Object.keys(messages.fr).sort(), Object.keys(messages.en).sort())
  for (const [key, english] of Object.entries(messages.en)) {
    const french = messages.fr[key as keyof typeof messages.fr]
    assert.ok(english.trim() && french.trim(), key)
    assert.deepEqual(placeholders(french), placeholders(english), key)
  }
})

test('every attribute has a name in both languages', () => {
  for (const { attribute } of importAttributes) {
    assert.ok(Object.hasOwn(messages.en, `attr.${attribute}`), attribute)
  }
})

test('every message a route or a library sends back has a French translation', () => {
  const thrown =
    /(?:RequestError\(\s*\d+,\s*|IssuerInputError\(\s*|HolderKeyError\(\s*|errorResponse\(\s*\d+,\s*|\{\s*error:\s*)(['"])((?:(?!\1).)+)\1/g
  const found = new Set<string>()
  for (const file of sources(src)) {
    for (const match of readFileSync(file, 'utf8').matchAll(thrown)) found.add(match[2] ?? '')
  }
  assert.ok(found.size > 20)
  for (const message of found) {
    assert.ok(Object.hasOwn(errorTranslations, message), `no French for: ${message}`)
  }
  assert.equal(translateError('en', 'This request has expired.'), 'This request has expired.')
  assert.equal(translateError('fr', 'This request has expired.'), 'Cette demande a expiré.')
})

test('no component writes visible text inline', () => {
  const jsxText = />\s*([A-Za-zÀ-ÿ][^<>{}]*[a-zà-ÿ.!?…][^<>{}]*)</g
  for (const file of sources(src).filter((f) => f.endsWith('.tsx'))) {
    const code = readFileSync(file, 'utf8')
    for (const match of code.matchAll(jsxText)) {
      const text = (match[1] ?? '').trim()
      // Type parameters (`Promise<X>`) and the brand name are not prose.
      if (
        /^(Glimpse|[A-Z]\w*(\[\])?)$/.test(text) ||
        /=>|[()'"=;]|&&|\|\||\b(case|return)\b/.test(text)
      ) {
        continue
      }
      assert.fail(`${file.slice(src.length)}: "${text}"`)
    }
  }
})

test('the language comes from the saved choice, then the browser, then French', () => {
  assert.equal(pickLocale('en', 'fr-FR'), 'en')
  assert.equal(pickLocale(undefined, 'en-US,en;q=0.9'), 'en')
  assert.equal(pickLocale('de', 'de-DE'), 'fr')
  assert.equal(
    translate('fr', 'import.tooMany', { max: 16 }),
    'Choisissez au plus 16 informations par document.',
  )
})

// A field named like a form property (`attributes`, `action`…) replaces that property in the DOM:
// React then reports a hydration mismatch and form handling breaks.
test('no form field shadows a property of its form', () => {
  const reserved = [
    'attributes',
    'action',
    'method',
    'elements',
    'length',
    'submit',
    'reset',
    'id',
    'name',
    'target',
  ]
  for (const file of sources(src).filter((f) => f.endsWith('.tsx'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/\bname="([a-zA-Z]+)"/g)) {
      assert.ok(!reserved.includes(match[1] ?? ''), `${file.slice(src.length)}: name="${match[1]}"`)
    }
  }
})
