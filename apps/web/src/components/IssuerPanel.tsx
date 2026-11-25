'use client'

import type { AttestationRecord } from '@glimpse/shared'
import { indexRegistries, randomBytes, type RegistryIndex } from '@glimpse/verifier'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { createPublicClient, type Hash, type Hex, http, isAddressEqual } from 'viem'
import { signTypedData, switchChain, waitForTransactionReceipt, writeContract } from 'wagmi/actions'

import {
  appChain,
  attestationRegistry,
  INDEX_STEP,
  indexRpc,
  issuerRegistry,
  registriesDeployedAt,
} from '@/lib/chains.ts'
import {
  attestationRegistryAbi,
  draftAttestation,
  issuerMetadataURI,
  issuerName,
  issuerRegistryAbi,
  MAX_VALID_DAYS,
  parseAttestedValue,
} from '@/lib/issuer.ts'
import { importAttributes } from '@/lib/vault/attributes.ts'
import { wagmiConfig } from '@/lib/wagmi.ts'

import { IssuedList } from './IssuedList.tsx'
import { connectedAddress, describeWalletError, useSession } from './SessionProvider.tsx'

const DEFAULT_VALID_DAYS = 365
const client = createPublicClient({ chain: appChain, transport: http() })
const indexClient = createPublicClient({ chain: appChain, transport: http(indexRpc) })
const explorer = appChain.blockExplorers.default.url

type Busy = 'register' | 'issue' | null
type Issued = { record: AttestationRecord; tx: Hash }

/** The wallet in the session, checked again right before it signs or sends anything. */
async function sessionAccount(session: string | null) {
  const account = await connectedAddress()
  if (!session || !isAddressEqual(account, session as Hex)) {
    throw new Error('Your wallet is on another account than the one you signed in with.')
  }
  await switchChain(wagmiConfig, { chainId: appChain.id }).catch(() => undefined)
  return account
}

/** Waits for a sent transaction to be mined, and refuses one that reverted. */
async function send(sent: Promise<Hash>): Promise<Hash> {
  const hash = await sent
  const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: appChain.id })
  if (receipt.status !== 'success') throw new Error('The transaction failed on chain.')
  return hash
}

export function IssuerPanel() {
  const { address } = useSession()
  const [index, setIndex] = useState<RegistryIndex | null>(null)
  const [indexError, setIndexError] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [attribute, setAttribute] = useState(importAttributes[0]?.attribute ?? '')

  const refresh = useCallback(async () => {
    try {
      setIndexError(false)
      const next = await indexRegistries(
        {
          client: indexClient,
          issuerRegistry,
          attestationRegistry,
          fromBlock: registriesDeployedAt,
          step: INDEX_STEP,
        },
        index ?? undefined,
      )
      setIndex({ ...next })
    } catch {
      setIndexError(true)
    }
  }, [index])

  useEffect(() => {
    if (index === null && !indexError) void refresh()
  }, [index, indexError, refresh])

  const mine = address
    ? [...(index?.issuers ?? [])].filter(([, entry]) => isAddressEqual(entry.admin, address as Hex))
    : []
  const [issuerId, issuer] = mine[0] ?? []

  async function run(kind: Exclude<Busy, null>, action: () => Promise<void>) {
    setBusy(kind)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(
        e instanceof Error && e.name === 'IssuerInputError' ? e.message : describeWalletError(e),
      )
    } finally {
      setBusy(null)
    }
  }

  function onRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('name'))
    void run('register', async () => {
      const uri = issuerMetadataURI(name)
      const account = await sessionAccount(address)
      await send(
        writeContract(wagmiConfig, {
          address: issuerRegistry,
          abi: issuerRegistryAbi,
          functionName: 'register',
          args: [randomBytes(16), account, uri],
          chainId: appChain.id,
        }),
      )
      await refresh()
    })
  }

  function onIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!issuerId || !issuer) return
    const form = new FormData(event.currentTarget)
    const type = importAttributes.find((a) => a.attribute === attribute)?.type ?? 'string'
    void run('issue', async () => {
      const draft = draftAttestation({
        issuerId,
        holder: String(form.get('holder')).trim(),
        attribute,
        value: parseAttestedValue(type, String(form.get('value'))),
        issuedAt: Number((await client.getBlock()).timestamp),
        validDays: Number(form.get('validDays')),
        chainId: appChain.id,
        attestationRegistry,
      })
      const account = await sessionAccount(address)
      if (!isAddressEqual(account, issuer.signer)) {
        throw new Error("Sign with the organisation's signer wallet.")
      }
      const signature = await signTypedData(wagmiConfig, {
        account,
        domain: draft.domain,
        types: draft.types,
        primaryType: 'Attestation',
        message: draft.message,
      })
      const { attestationId, issuerId: id, commitment, issuedAt, expiresAt } = draft.message
      const tx = await send(
        writeContract(wagmiConfig, {
          address: attestationRegistry,
          abi: attestationRegistryAbi,
          functionName: 'anchor',
          args: [attestationId, id, commitment, issuedAt, expiresAt, signature],
          chainId: appChain.id,
        }),
      )
      setIssued({ record: draft.record(signature), tx })
      await refresh()
    })
  }

  if (index === null) {
    return (
      <div className="panel" aria-live="polite">
        {indexError ? (
          <>
            <p role="alert" className="error">
              The registries could not be read from the chain.
            </p>
            <button type="button" className="button quiet" onClick={() => void refresh()}>
              Try again
            </button>
          </>
        ) : (
          <p className="hint">Reading the registries from the chain…</p>
        )}
      </div>
    )
  }

  const alert = error && (
    <p role="alert" className="error">
      {error}
    </p>
  )

  if (!issuerId || !issuer) {
    return (
      <form className="panel form" onSubmit={onRegister}>
        <h2>Register your organisation</h2>
        <p className="hint">
          Registration is open and public. Your wallet becomes the organisation&apos;s admin and
          signer. Requesters decide for themselves which organisations they trust.
        </p>
        <div className="field">
          <label htmlFor="name">Organisation name</label>
          <input id="name" name="name" required maxLength={80} placeholder="Epitech Paris" />
        </div>
        <button type="submit" className="button" disabled={busy !== null}>
          {busy === 'register' ? 'Confirm in your wallet…' : 'Register on chain'}
        </button>
        {alert}
      </form>
    )
  }

  const type = importAttributes.find((a) => a.attribute === attribute)?.type
  const file =
    issued && `data:application/json,${encodeURIComponent(JSON.stringify(issued.record, null, 2))}`

  return (
    <>
      <p className="hint">
        Issuing as <strong>{issuerName(issuer.metadataURI)}</strong>
      </p>
      {issued ? (
        <div className="panel request-status">
          <h2>Attestation anchored</h2>
          <p className="hint">
            Send this file to the holder. It holds the value and its salt: only they should get it.
            The chain only keeps a salted commitment.
          </p>
          <div className="actions">
            <a
              className="button"
              href={file ?? undefined}
              download={`attestation-${issued.record.attestationId}.json`}
            >
              Download the attestation
            </a>
            <a
              className="button quiet"
              href={`${explorer}/tx/${issued.tx}`}
              target="_blank"
              rel="noreferrer"
            >
              See the transaction
            </a>
            <button type="button" className="button quiet" onClick={() => setIssued(null)}>
              Issue another
            </button>
          </div>
        </div>
      ) : (
        <form className="panel form" onSubmit={onIssue}>
          <h2>Issue an attestation</h2>
          <div className="field">
            <label htmlFor="holder">Holder&apos;s wallet address</label>
            <input
              id="holder"
              name="holder"
              required
              pattern="0x[0-9a-fA-F]{40}"
              placeholder="0x…"
            />
          </div>
          <div className="field">
            <label htmlFor="attribute">Attribute</label>
            <select
              id="attribute"
              name="attribute"
              value={attribute}
              onChange={(e) => setAttribute(e.target.value)}
            >
              {importAttributes.map((a) => (
                <option key={a.attribute} value={a.attribute}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="value">Value</label>
            {type === 'boolean' ? (
              <select id="value" name="value" defaultValue="true">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input
                id="value"
                name="value"
                required
                type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
                step="any"
              />
            )}
          </div>
          <div className="field">
            <label htmlFor="validDays">Valid for (days)</label>
            <input
              id="validDays"
              name="validDays"
              type="number"
              required
              min={1}
              max={MAX_VALID_DAYS}
              defaultValue={DEFAULT_VALID_DAYS}
            />
          </div>
          <button type="submit" className="button" disabled={busy !== null}>
            {busy === 'issue' ? 'Sign, then confirm in your wallet…' : 'Sign and anchor'}
          </button>
          {alert}
        </form>
      )}
      <h2 className="section-title">Issued by your organisation</h2>
      <IssuedList
        issuerId={issuerId}
        index={index}
        onRevoke={(attestationId) =>
          sessionAccount(address)
            .then(() =>
              send(
                writeContract(wagmiConfig, {
                  address: attestationRegistry,
                  abi: attestationRegistryAbi,
                  functionName: 'revoke',
                  args: [attestationId],
                  chainId: appChain.id,
                }),
              ),
            )
            .then(refresh)
        }
      />
    </>
  )
}
