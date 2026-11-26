import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { deflateSync } from 'node:zlib'

import {
  fingerprintName,
  nameTokens,
  namesMatch,
  pdfTextLines,
  readHolderName,
} from './holder-name.ts'

const fixtures = new URL('../../../../../tests/fixtures/documents/', import.meta.url)
const fixture = (file: string) => new Uint8Array(readFileSync(new URL(file, fixtures)))
const key = new Uint8Array(32).fill(7)

test('the FAKE proofs state the name of the person they were made for', () => {
  assert.deepEqual(readHolderName(pdfTextLines(fixture('FAKE-identity-proof.pdf'))), {
    surname: ['SYNTHETIQUE'],
    givenNames: ['CAMILLE'],
  })
  assert.deepEqual(readHolderName(pdfTextLines(fixture('FAKE-identity-proof-other-person.pdf'))), {
    surname: ['EXEMPLE'],
    givenNames: ['JORDAN'],
  })
})

test('compressed streams and French labels are read too', () => {
  const content =
    'BT /F1 12 Tf 50 700 Td (Nom : Dupont-Lef\\350vre) Tj 0 -14 Td (Pr\\351noms : \\311lodie Anne) Tj ET'
  const stream = deflateSync(Buffer.from(content, 'latin1'))
  const pdf = Buffer.concat([
    Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`),
    stream,
    Buffer.from('\nendstream\nendobj\n%%EOF\n'),
  ])
  assert.deepEqual(readHolderName(pdfTextLines(pdf)), {
    surname: ['DUPONT', 'LEFEVRE'],
    givenNames: ['ELODIE', 'ANNE'],
  })
})

test('a proof without both a surname and a given name gives no name', () => {
  assert.equal(readHolderName(['Surname: SYNTHETIQUE']), null)
  assert.equal(readHolderName(['Holder: CAMILLE SYNTHETIQUE']), null)
  assert.equal(readHolderName(pdfTextLines(new TextEncoder().encode('%PDF-1.7\n%%EOF'))), null)
})

test('a document name matches the verified holder whatever the case, accents and order', () => {
  const verified = fingerprintName(
    { surname: ['SYNTHETIQUE'], givenNames: ['CAMILLE', 'MARIE'] },
    key,
  )
  for (const name of ['CAMILLE SYNTHETIQUE', 'Synthétique Camille', 'Camille Marie Synthetique']) {
    assert.ok(namesMatch(verified, name, key), name)
  }
})

test('another person, a partial name or an extra word does not match', () => {
  const verified = fingerprintName({ surname: ['SYNTHETIQUE'], givenNames: ['CAMILLE'] }, key)
  for (const name of [
    'JORDAN EXEMPLE',
    'CAMILLE',
    'SYNTHETIQUE',
    'CAMILLE SYNTHETIQUE JR',
    '',
    '—',
  ]) {
    assert.equal(namesMatch(verified, name, key), false, name)
  }
  // Fingerprints under another key never line up.
  assert.equal(namesMatch(verified, 'CAMILLE SYNTHETIQUE', new Uint8Array(32)), false)
})

test('the server keeps fingerprints, not the name', () => {
  const kept = fingerprintName({ surname: nameTokens('Synthétique'), givenNames: ['CAMILLE'] }, key)
  assert.doesNotMatch(JSON.stringify(kept), /SYNTH|CAMILLE/i)
})
