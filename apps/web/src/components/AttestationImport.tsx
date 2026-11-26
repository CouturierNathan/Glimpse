'use client'

import { useState } from 'react'
import type { Address } from 'viem'

import { appChain, attestationRegistry } from '@/lib/chains.ts'
import { readAttestationFile } from '@/lib/issuer.ts'

import { FilePicker } from './FilePicker.tsx'
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
    <div className="form">
      <FilePicker
        name="attestation"
        accept="application/json,.json"
        label="Add an attestation from an organisation"
        buttonLabel="Choose an attestation file"
        disabled={state.name === 'busy'}
        hint={
          state.name === 'busy'
            ? 'Encrypting in this browser…'
            : state.name === 'done'
              ? 'Added to your vault. It appears in the list above.'
              : 'The .json file an organisation sent you. It is encrypted here before it is stored.'
        }
        onPick={(file) => void onFile(file)}
      />
      {state.name === 'error' && (
        <p role="alert" className="error">
          {state.message}
        </p>
      )}
    </div>
  )
}
