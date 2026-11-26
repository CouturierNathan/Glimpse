'use client'

import type { RegistryIndex } from '@glimpse/verifier'
import { useState } from 'react'
import type { Hex } from 'viem'

import { type Status } from '@/lib/status.ts'

import { describeWalletError } from '@/lib/wallet.ts'

import { ConfirmButton, ErrorNotice } from './Form.tsx'
import { useI18n } from './I18nProvider.tsx'
import { StatusBadge } from './StatusBadge.tsx'

/** What the index says, for listing only: a requester's verdict always comes from verify(). */
function listedStatus(revokedAt: bigint, expiresAt: bigint): Status {
  if (revokedAt !== 0n) return 'revoked'
  return BigInt(Math.floor(Date.now() / 1000)) >= expiresAt ? 'expired' : 'authentic'
}

/** The attestations one issuer anchored, newest last, each revocable once. */
export function IssuedList({
  issuerId,
  index,
  onRevoke,
}: {
  issuerId: Hex
  index: RegistryIndex
  onRevoke: (attestationId: Hex) => Promise<unknown>
}) {
  const { t, date: format } = useI18n()
  const date = (seconds: bigint) => format(Number(seconds) * 1000, { dateStyle: 'medium' })
  const [busy, setBusy] = useState<Hex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const issued = [...index.attestations].filter(([, a]) => a.issuerId === issuerId)

  if (issued.length === 0) {
    return (
      <div className="card empty-inline">
        <p className="hint">{t('issue.list.empty')}</p>
      </div>
    )
  }

  return (
    <div className="vault card">
      <ul className="items">
        {issued.map(([id, a]) => {
          const status = listedStatus(a.revokedAt, a.expiresAt)
          return (
            <li className="item" key={id}>
              <span className="mark attested" aria-hidden="true" />
              <div className="item-name">
                <strong>
                  <code>{id.slice(2, 10)}</code>
                </strong>
                <span className="item-meta">
                  <StatusBadge status={status} />
                  {t('issue.list.dates', { from: date(a.issuedAt), to: date(a.expiresAt) })}
                </span>
              </div>
              <div className="item-actions">
                {status !== 'revoked' && (
                  <ConfirmButton
                    label={busy === id ? t('issue.confirmWallet') : t('issue.list.revoke')}
                    disabled={busy !== null}
                    title={t('issue.list.revokeTitle')}
                    text={t('issue.list.revokeText')}
                    confirmLabel={t('issue.list.revoke')}
                    onConfirm={async () => {
                      setBusy(id)
                      setError(null)
                      try {
                        await onRevoke(id)
                      } catch (e) {
                        setError(describeWalletError(e))
                      } finally {
                        setBusy(null)
                      }
                    }}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <ErrorNotice message={error} />
      <p className="hint">{t('issue.list.hint')}</p>
    </div>
  )
}
