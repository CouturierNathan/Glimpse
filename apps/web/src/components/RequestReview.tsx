'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import { formatClaimValue, shortAddress } from '@/lib/format.ts'
import { holderStatus } from '@/lib/status.ts'
import { attributeName } from '@/lib/vault/attributes.ts'

import { StatusBadge } from './StatusBadge.tsx'
import { useVault } from './VaultProvider.tsx'

interface RequestView {
  requestId: string
  requester: string
  attribute: string
  purpose: string
  expiresAt: string
  role: 'requester' | 'holder' | 'visitor'
  state: 'pending' | 'refused' | 'allowed' | 'shared' | 'withdrawn' | 'expired' | 'answered'
}

const closedCopy: Record<string, string> = {
  refused: 'You refused this request.',
  withdrawn: 'You withdrew your consent. The requester can no longer download the item.',
  expired: 'This request has expired. Ask the requester for a new link.',
  answered: 'Someone already answered this request.',
}

export function RequestReview({ requestId }: { requestId: string }) {
  const { items, request, open, share, refuse, withdraw } = useVault()
  const [view, setView] = useState<RequestView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const [preview, setPreview] = useState<Record<string, string>>({})
  const started = useRef(new Set<string>())

  const load = useCallback(async () => {
    try {
      const res = await request(`/api/requests/${requestId}`)
      setView((await res.json()) as RequestView)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This request could not be loaded.')
    }
  }, [request, requestId])

  useEffect(() => {
    void load()
  }, [load])

  const matching = view ? items.filter((item) => item.attribute === view.attribute) : []

  // Show the holder what they would share, decrypted in this browser only.
  useEffect(() => {
    for (const item of matching) {
      if (started.current.has(item.reference)) continue
      started.current.add(item.reference)
      open(item)
        .then((claim) =>
          setPreview((p) => ({ ...p, [item.reference]: formatClaimValue(claim.value) })),
        )
        .catch(() => setPreview((p) => ({ ...p, [item.reference]: 'Cannot be opened' })))
    }
  }, [matching, open])

  async function act(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work, try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!view) {
    return error ? (
      <p role="alert" className="error">
        {error}
      </p>
    ) : (
      <p className="hint">Loading the request…</p>
    )
  }

  const name = attributeName(view.attribute)
  const item = matching.find((i) => i.reference === chosen)

  return (
    <div className="panel request-review">
      <dl className="request-facts">
        <div>
          <dt>Requester</dt>
          <dd>
            <span className="address" title={view.requester}>
              {shortAddress(view.requester)}
            </span>
            {view.role === 'requester' && <span className="hint"> (you)</span>}
          </dd>
        </div>
        <div>
          <dt>Asks for</dt>
          <dd>
            <strong>{name}</strong>, and nothing else
          </dd>
        </div>
        <div>
          <dt>Because</dt>
          <dd className="purpose">{view.purpose}</dd>
        </div>
        <div>
          <dt>Answer before</dt>
          <dd>{new Date(view.expiresAt).toLocaleString()}</dd>
        </div>
      </dl>

      {view.state === 'pending' && (
        <>
          {matching.length === 0 ? (
            <div className="empty-inline">
              <p>
                Your vault has no {name.toLowerCase()} in this browser. Import a document that
                contains it, then come back to this link.
              </p>
              <Link href="/import" className="button quiet">
                Import a document
              </Link>
            </div>
          ) : (
            <fieldset className="field choices">
              <legend>Which one to share</legend>
              {matching.map((i) => (
                <label key={i.reference} className="check choice">
                  <input
                    type="radio"
                    name="item"
                    value={i.reference}
                    checked={chosen === i.reference}
                    onChange={() => setChosen(i.reference)}
                  />
                  <span>{preview[i.reference] ?? 'Decrypting…'}</span>
                  <StatusBadge status={holderStatus(i.sourceClass)} />
                </label>
              ))}
            </fieldset>
          )}
          <p className="hint">
            Sharing re-encrypts this one value for the requester&apos;s key, in your browser. The
            requester then checks it on its own and sees its status.
          </p>
          <div className="actions">
            <button
              type="button"
              className="button"
              disabled={busy || !item}
              onClick={() => item && act(() => share(view.requestId, item))}
            >
              {busy ? 'Sharing…' : `Share ${name.toLowerCase()}`}
            </button>
            <button
              type="button"
              className="button quiet"
              disabled={busy}
              onClick={() => act(() => refuse(view.requestId))}
            >
              Refuse
            </button>
          </div>
        </>
      )}

      {(view.state === 'shared' || view.state === 'allowed') && (
        <div className="outcome">
          <h2>
            {view.state === 'shared'
              ? `You shared your ${name.toLowerCase()}`
              : 'Your consent is recorded, but nothing was sent yet'}
          </h2>
          <p className="hint">
            You can withdraw until the requester downloads it. Withdrawing cannot erase a copy they
            already received.
          </p>
          <div className="actions">
            <button
              type="button"
              className="button quiet"
              disabled={busy}
              onClick={() => act(() => withdraw(view.requestId))}
            >
              Withdraw consent
            </button>
          </div>
        </div>
      )}

      {closedCopy[view.state] && <p className="outcome">{closedCopy[view.state]}</p>}

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  )
}
