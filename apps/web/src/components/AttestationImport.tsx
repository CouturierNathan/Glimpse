'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Address } from 'viem'

import { appChain, attestationRegistry } from '@/lib/chains.ts'
import { readAttestationFile } from '@/lib/issuer.ts'

import { FilePicker } from './FilePicker.tsx'
import { useI18n } from './I18nProvider.tsx'
import { useIdentity } from './IdentityProvider.tsx'
import { useSession } from './SessionProvider.tsx'
import { useVault } from './VaultProvider.tsx'

/** Adds an organisation's attestation file to the vault, encrypted in this browser. */
export function AttestationImport() {
  const { address } = useSession()
  const { status: identity } = useIdentity()
  const { storeAttestation } = useVault()
  const { t, error: te } = useI18n()
  const [state, setState] = useState<
    { name: 'idle' | 'busy' | 'done' } | { name: 'error'; message: string }
  >({ name: 'idle' })

  async function onFile(file: File) {
    if (!address) return
    setState({ name: 'busy' })
    try {
      const record = readAttestationFile(await file.text(), {
        holder: address as Address,
        chainId: appChain.id,
        attestationRegistry,
      })
      await storeAttestation(record)
      setState({ name: 'done' })
    } catch (error) {
      const known =
        error instanceof Error && (error.name === 'IssuerInputError' || error.name === 'VaultError')
      setState({ name: 'error', message: known ? error.message : t('attestation.error') })
    }
  }

  if (identity !== 'verified') {
    return (
      <div className="card attach">
        <h2 className="card-title">{t('attestation.title')}</h2>
        <p className="locked">
          <LockIcon />
          {identity === 'loading' ? t('identity.checking') : t('attestation.locked')}
        </p>
        {identity === 'unverified' && (
          <Link href="/import" className="button quiet small">
            {t('identity.required.cta')}
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="card attach">
      <FilePicker
        name="attestation"
        accept="application/json,.json"
        label={t('attestation.title')}
        buttonLabel={t('attestation.button')}
        disabled={state.name === 'busy'}
        hint={
          state.name === 'busy'
            ? t('attestation.busy')
            : state.name === 'done'
              ? t('attestation.done')
              : t('attestation.hint')
        }
        onPick={(file) => void onFile(file)}
      />
      {state.name === 'error' && (
        <p role="alert" className="error">
          {te(state.message)}
        </p>
      )}
    </div>
  )
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="lock-icon">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  )
}
