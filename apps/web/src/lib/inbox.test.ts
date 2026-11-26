import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Inbox, MAX_INBOX_ENTRIES } from './inbox.ts'
import { memoryKv } from './state/kv.ts'

const holder = 'a'.repeat(32)
const other = 'b'.repeat(32)
const sealed = Buffer.from('ciphertext').toString('base64')

test('an attestation sent to a holder waits in their inbox only, until they take it', async () => {
  const kv = memoryKv()
  const inbox = new Inbox(kv)
  await inbox.deliver(holder, [sealed, sealed])
  assert.equal((await inbox.list(holder)).length, 2)
  assert.deepEqual(await inbox.list(other), [])
  // Another instance reading the same store sees the same inbox.
  const [first] = await new Inbox(kv).list(holder)
  await inbox.remove(holder, first?.id ?? '')
  assert.equal((await inbox.list(holder)).length, 1)
  await inbox.remove(other, (await inbox.list(holder))[0]?.id ?? '')
  assert.equal((await inbox.list(holder)).length, 1, "a holder cannot remove another's entry")
})

test('the inbox takes ciphertext only, of bounded size and number', async () => {
  const inbox = new Inbox(memoryKv())
  await assert.rejects(inbox.deliver(holder, []), { status: 400 })
  await assert.rejects(inbox.deliver(holder, ['not base64!']), { status: 400 })
  await assert.rejects(inbox.deliver(holder, [Buffer.alloc(70_000).toString('base64')]), {
    status: 400,
  })
  await assert.rejects(inbox.deliver(holder, Array(5).fill(sealed)), { status: 400 })
  for (let i = 0; i < MAX_INBOX_ENTRIES / 2; i++) await inbox.deliver(holder, [sealed, sealed])
  await assert.rejects(inbox.deliver(holder, [sealed]), { status: 409 })
})
