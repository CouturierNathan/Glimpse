'use client'

import Link from 'next/link'
import { useState } from 'react'

import { formatClaimValue } from '@/lib/format.ts'
import { holderStatus } from '@/lib/status.ts'

import { ConfirmButton, ErrorNotice, Notice } from './Form.tsx'
import { useI18n } from './I18nProvider.tsx'
import { StatusBadge } from './StatusBadge.tsx'
import { useVault, type VaultItem } from './VaultProvider.tsx'

const markClass = { A: 'mark', B: 'mark signed', C: 'mark attested' } as const
const sourceKey = { A: 'source.A', B: 'source.B', C: 'source.C' } as const

function Row({ item }: { item: VaultItem }) {
  const { open, remove } = useVault()
  const { t, attr, locale } = useI18n()
  const [value, setValue] = useState<Parameters<typeof formatClaimValue>[0] | null>(null)
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
        <strong>{attr(item.attribute)}</strong>
        <span className="item-meta">
          <StatusBadge status={holderStatus(item.sourceClass, item.verdict)} />
          <span className="source-badge" data-source={item.sourceClass}>
            {t(sourceKey[item.sourceClass])}
          </span>
        </span>
      </div>
      <div className="item-value" aria-live="polite">
        {value ? (
          formatClaimValue(value, locale)
        ) : (
          <span className="redacted" role="img" aria-label={t('vault.encrypted')} />
        )}
      </div>
      <div className="item-actions">
        {value === null ? (
          <button
            type="button"
            className="button quiet small"
            disabled={state === 'busy'}
            onClick={() => act(async () => setValue((await open(item)).value))}
          >
            {state === 'busy' ? t('vault.decrypting') : t('vault.show')}
          </button>
        ) : (
          <button type="button" className="button quiet small" onClick={() => setValue(null)}>
            {t('vault.hide')}
          </button>
        )}
        <ConfirmButton
          label={t('vault.delete')}
          disabled={state === 'busy'}
          title={t('vault.deleteTitle')}
          text={t('vault.deleteText', { name: attr(item.attribute) })}
          confirmLabel={t('vault.delete')}
          onConfirm={() => void act(() => remove(item))}
        />
      </div>
      {state === 'error' && (
        <div className="item-error">
          <ErrorNotice message={t('vault.itemError')} />
        </div>
      )}
    </li>
  )
}

export function VaultList() {
  const { items, ready, arrived } = useVault()
  const { t } = useI18n()
  const notice =
    arrived > 0 ? (
      <Notice tone="success">
        {arrived === 1 ? t('vault.arrived') : t('vault.arrivedMany', { count: arrived })}
      </Notice>
    ) : null

  if (!ready) {
    return (
      <div className="card" aria-busy="true">
        <p className="hint loading-line">
          <span className="spinner" aria-hidden="true" />
          {t('vault.loading')}
        </p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="empty card">
        <svg viewBox="0 0 48 48" aria-hidden="true" className="empty-icon">
          <rect x="8" y="12" width="32" height="26" rx="4" />
          <circle cx="24" cy="25" r="5" />
          <path d="M24 30v3" />
        </svg>
        <h2>{t('vault.empty.title')}</h2>
        <p>{t('vault.empty.text')}</p>
        <Link href="/import" className="button">
          {t('vault.empty.cta')}
        </Link>
      </div>
    )
  }

  return (
    <>
      {notice}
      <div className="vault card">
        <div className="vault-head">
          <p className="vault-count">
            {items.length === 1 ? t('vault.countOne') : t('vault.count', { count: items.length })}
          </p>
          <Link href="/import" className="button quiet small">
            {t('vault.add')}
          </Link>
        </div>
        <ul className="items">
          {items.map((item) => (
            <Row key={item.reference} item={item} />
          ))}
        </ul>
        <p className="hint">
          {t('vault.shareHint')} <Link href="/consent">{t('vault.shareLink')}</Link>
        </p>
        <p className="hint">{t('vault.keyHint')}</p>
      </div>
    </>
  )
}
