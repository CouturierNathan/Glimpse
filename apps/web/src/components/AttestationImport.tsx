'use client'

import { type ChangeEvent, useState } from 'react'
import type { Address } from 'viem'

import { appChain, attestationRegistry } from '@/lib/chains.ts'
import { readAttestationFile } from '@/lib/issuer.ts'

import { useSession } from './SessionProvider.tsx'
import { useVault } from './VaultProvider.tsx'

/** Adds an organisation's attestation file to the vault, encrypted in this browser. */
export function AttestationImport() {
  const { address } = useSession()
  const { storeAttestation } = useVault()
  const [state, setState] = useState<
    { name: 'idle' | 'busy' | 'done' } | { name: 'error'; message: string }
  >({
    name: 'idle',
  })

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !address) return
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
      setState({
        name: 'error',
        message:
          error instanceof Error && error.name === 'IssuerInputError'
            ? error.message
            : 'The attestation could not be stored. Try again.',
      })
    }
  }

  return (
    <div className="field">
      <label htmlFor="attestation">Add an attestation from an organisation</label>
      <input
        id="attestation"
        type="file"
        accept="application/json,.json"
        disabled={state.name === 'busy'}
        onChange={(event) => void onFile(event)}
      />
      <span className="hint" aria-live="polite">
        {state.name === 'busy'
          ? 'Encrypting in this browser…'
          : state.name === 'done'
            ? 'Added to your vault.'
            : 'The file an organisation sent you. It is encrypted here before it is stored.'}
      </span>
      {state.name === 'error' && (
        <p role="alert" className="error">
          {state.message}
        </p>
      )}
    </div>
  )
}
