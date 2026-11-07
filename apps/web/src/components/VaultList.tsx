'use client'

import Link from 'next/link'
import { useState } from 'react'

import { formatClaimValue } from '@/lib/format.ts'
import { holderStatus } from '@/lib/status.ts'
import { attributeName } from '@/lib/vault/attributes.ts'

import { StatusBadge } from './StatusBadge.tsx'
import { useVault, type VaultItem } from './VaultProvider.tsx'

const markClass = { A: 'mark', B: 'mark signed', C: 'mark attested' } as const
const sourceName = { A: 'Imported', B: 'Signature verified', C: 'Attested' } as const

function Row({ item }: { item: VaultItem }) {
  const { open, remove } = useVault()
  const [value, setValue] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')

  async function act(action: () => Promise<void>) {
    setState('busy')
    try {
      await action()
      setState('idle')
    } catch {
      setState('error')
    }
  }

  return (
    <li className="item">
      <span className={markClass[item.sourceClass]} aria-hidden="true" />
      <div className="item-name">
        <strong>{attributeName(item.attribute)}</strong>
        <span className="item-meta">
          <StatusBadge status={holderStatus(item.sourceClass)} />
          {sourceName[item.sourceClass]}
        </span>
      </div>
      <div className="item-value" aria-live="polite">
        {value ?? <span className="redacted" aria-label="Encrypted" />}
      </div>
      <div className="item-actions">
        {value === null ? (
          <button
            type="button"
            className="button quiet"
            disabled={state === 'busy'}
            onClick={() => act(async () => setValue(formatClaimValue((await open(item)).value)))}
          >
            {state === 'busy' ? 'Decrypting…' : 'Show'}
          </button>
        ) : (
          <button type="button" className="button quiet" onClick={() => setValue(null)}>
            Hide
          </button>
        )}
        <button
          type="button"
          className="button quiet"
          disabled={state === 'busy'}
          onClick={() => act(() => remove(item))}
        >
          Delete
        </button>
      </div>
      {state === 'error' && (
        <p role="alert" className="error item-error">
          This item could not be opened or deleted. Its content may have been changed on the server.
        </p>
      )}
    </li>
  )
}

export function VaultList() {
  const { items } = useVault()

  if (items.length === 0) {
    return (
      <div className="empty">
        <h2>Your vault is empty</h2>
        <p>Import a document to add your first attributes.</p>
        <Link href="/import" className="button">
          Import a document
        </Link>
      </div>
    )
  }

  return (
    <div className="vault">
      <ul className="items">
        {items.map((item) => (
          <Row key={item.reference} item={item} />
        ))}
      </ul>
      <p className="hint">
        Your encryption key lives in this tab only. Reloading the page locks these items for good.
      </p>
    </div>
  )
}
