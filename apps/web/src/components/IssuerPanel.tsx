'use client'

import type { AttestationRecord } from '@glimpse/shared'
import { indexRegistries, randomBytes, type RegistryIndex } from '@glimpse/verifier'
import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  type Address,
  createPublicClient,
  type Hash,
  type Hex,
  http,
  isAddress,
  isAddressEqual,
} from 'viem'
import {
  signTypedData,
  simulateContract,
  waitForTransactionReceipt,
  writeContract,
} from 'wagmi/actions'

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
import { describeWalletError, walletAccount, WalletError, walletMessages } from '@/lib/wallet.ts'

import { LockIcon } from './Icons.tsx'
import { ErrorNotice, FieldError, Notice, useFieldErrors } from './Form.tsx'
import { useI18n } from './I18nProvider.tsx'
import { useIdentity } from './IdentityProvider.tsx'
import { IssuedList } from './IssuedList.tsx'
import { useSession } from './SessionProvider.tsx'

const DEFAULT_VALID_DAYS = 365
const client = createPublicClient({ chain: appChain, transport: http() })
const indexClient = createPublicClient({ chain: appChain, transport: http(indexRpc) })
const explorer = appChain.blockExplorers.default.url

type Busy = 'register' | 'issue' | null
type Issued = { record: AttestationRecord; tx: Hash }

/** Waits for a sent transaction to be mined, and refuses one that reverted. */
async function confirmed(hash: Hash): Promise<Hash> {
  const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: appChain.id })
  if (receipt.status !== 'success') throw new WalletError(walletMessages.txFailed)
  return hash
}

/*
 * Each transaction is simulated from the account first: a revert (organisation id taken, wrong
 * signer…) comes back decoded and nothing is sent. Only then does the wallet ask to send it.
 */
async function register(account: Address, name: string): Promise<Hash> {
  const { request } = await simulateContract(wagmiConfig, {
    account,
    chainId: appChain.id,
    address: issuerRegistry,
    abi: issuerRegistryAbi,
    functionName: 'register',
    args: [randomBytes(16), account, issuerMetadataURI(name)],
  })
  return confirmed(await writeContract(wagmiConfig, request))
}

async function anchor(
  account: Address,
  args: readonly [Hex, Hex, Hex, bigint, bigint, Hex],
): Promise<Hash> {
  const { request } = await simulateContract(wagmiConfig, {
    account,
    chainId: appChain.id,
    address: attestationRegistry,
    abi: attestationRegistryAbi,
    functionName: 'anchor',
    args,
  })
  return confirmed(await writeContract(wagmiConfig, request))
}

async function revoke(account: Address, attestationId: Hex): Promise<Hash> {
  const { request } = await simulateContract(wagmiConfig, {
    account,
    chainId: appChain.id,
    address: attestationRegistry,
    abi: attestationRegistryAbi,
    functionName: 'revoke',
    args: [attestationId],
  })
  return confirmed(await writeContract(wagmiConfig, request))
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Issuing is open to a wallet whose identity is verified, like importing. */
export function IssuerPanel() {
  const { status } = useIdentity()
  const { t } = useI18n()

  if (status !== 'verified') {
    return (
      <div className="card locked-card">
        <p className="locked">
          <LockIcon />
          {status === 'loading' ? t('identity.checking') : t('issue.locked.text')}
        </p>
        {status === 'unverified' && (
          <Link href="/import" className="button quiet small">
            {t('identity.required.cta')}
          </Link>
        )}
      </div>
    )
  }
  return <Issuer />
}

function Issuer() {
  const { address } = useSession()
  const { t, attr } = useI18n()
  const fields = useFieldErrors()
  const [index, setIndex] = useState<RegistryIndex | null>(null)
  const [indexError, setIndexError] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [attribute, setAttribute] = useState(importAttributes[0]?.attribute ?? '')
  const indexRef = useRef<RegistryIndex | null>(null)

  /** Reads new registry events; returns the index so a caller can wait for its own change. */
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
        indexRef.current ?? undefined,
      )
      indexRef.current = next
      setIndex({ ...next })
      return next
    } catch {
      setIndexError(true)
      return null
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const mineOf = (from: RegistryIndex | null) =>
    address
      ? [...(from?.issuers ?? [])].filter(([, entry]) =>
          isAddressEqual(entry.admin, address as Hex),
        )
      : []
  const [issuerId, issuer] = mineOf(index)[0] ?? []

  /** The indexing RPC can lag the chain by a few blocks: wait until it shows the change. */
  async function refreshUntil(done: (next: RegistryIndex) => boolean) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const next = await refresh()
      if (next && done(next)) return
      await pause(2500)
    }
  }

  async function run(kind: Exclude<Busy, null>, action: () => Promise<void>) {
    setBusy(kind)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(describeWalletError(e))
    } finally {
      setBusy(null)
    }
  }

  function onRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const name = String(new FormData(form).get('orgName')).trim()
    const ok = fields.report(
      {
        orgName: !name
          ? t('form.required')
          : name.length > 80
            ? t('form.tooLong', { max: 80 })
            : undefined,
      },
      form,
    )
    if (!ok) return
    void run('register', async () => {
      const account = await walletAccount(address)
      await register(account, name)
      await refreshUntil((next) => mineOf(next).length > 0)
    })
  }

  function onIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!issuerId || !issuer) return
    const form = event.currentTarget
    const data = new FormData(form)
    const holder = String(data.get('holder')).trim()
    const validDays = Number(data.get('validDays'))
    const type = importAttributes.find((a) => a.attribute === attribute)?.type ?? 'string'
    let value
    let valueError: string | undefined
    try {
      value = parseAttestedValue(type, String(data.get('value') ?? ''))
    } catch {
      valueError =
        type === 'number' ? t('form.number') : type === 'date' ? t('form.date') : t('form.required')
    }
    const ok = fields.report(
      {
        holder: !holder ? t('form.required') : !isAddress(holder) ? t('form.address') : undefined,
        value: valueError,
        validDays:
          Number.isInteger(validDays) && validDays >= 1 && validDays <= MAX_VALID_DAYS
            ? undefined
            : t('form.range', { min: 1, max: MAX_VALID_DAYS }),
      },
      form,
    )
    if (!ok || !value) return
    void run('issue', async () => {
      const account = await walletAccount(address)
      if (!isAddressEqual(account, issuer.signer)) throw new WalletError(walletMessages.signerOnly)
      const draft = draftAttestation({
        issuerId,
        holder,
        attribute,
        value,
        issuedAt: Number((await client.getBlock()).timestamp),
        validDays,
        chainId: appChain.id,
        attestationRegistry,
      })
      const signature = await signTypedData(wagmiConfig, {
        account,
        domain: draft.domain,
        types: draft.types,
        primaryType: 'Attestation',
        message: draft.message,
      })
      const { attestationId, issuerId: id, commitment, issuedAt, expiresAt } = draft.message
      const tx = await anchor(account, [
        attestationId,
        id,
        commitment,
        issuedAt,
        expiresAt,
        signature,
      ])
      setIssued({ record: draft.record(signature), tx })
      await refreshUntil((next) => next.attestations.has(attestationId))
    })
  }

  if (index === null) {
    return (
      <div className="card" aria-live="polite">
        {indexError ? (
          <ErrorNotice
            message={t('issue.readFailed')}
            action={
              <button type="button" className="button quiet small" onClick={() => void refresh()}>
                {t('common.tryAgain')}
              </button>
            }
          />
        ) : (
          <p className="hint loading-line">
            <span className="spinner" aria-hidden="true" />
            {t('issue.reading')}
          </p>
        )}
      </div>
    )
  }

  if (!issuerId || !issuer) {
    return (
      <form className="card form" onSubmit={onRegister} noValidate>
        <h3>{t('issue.register.title')}</h3>
        <p className="hint">{t('issue.register.hint')}</p>
        <div className="field">
          <label htmlFor="orgName">{t('issue.register.name')}</label>
          <input
            id="orgName"
            name="orgName"
            maxLength={80}
            placeholder={t('issue.register.placeholder')}
            {...fields.control('orgName')}
          />
          <FieldError name="orgName" message={fields.errors.orgName} />
        </div>
        <p className="hint">{t('issue.gasHint')}</p>
        <div className="actions">
          <button type="submit" className="button" disabled={busy !== null}>
            {busy === 'register' && <span className="spinner" aria-hidden="true" />}
            {busy === 'register' ? t('issue.confirmWallet') : t('issue.register.submit')}
          </button>
        </div>
        <ErrorNotice message={error} />
      </form>
    )
  }

  const type = importAttributes.find((a) => a.attribute === attribute)?.type
  const file =
    issued && `data:application/json,${encodeURIComponent(JSON.stringify(issued.record, null, 2))}`

  return (
    <>
      <p className="issuer-as">
        {t('issue.as')} <strong>{issuerName(issuer.metadataURI)}</strong>
      </p>
      {issued ? (
        <div className="card result">
          <Notice tone="success" title={t('issue.done.title')}>
            {t('issue.done.hint')}
          </Notice>
          <div className="actions">
            <a
              className="button"
              href={file ?? undefined}
              download={`attestation-${issued.record.attestationId}.json`}
            >
              {t('issue.done.download')}
            </a>
            <a
              className="button quiet"
              href={`${explorer}/tx/${issued.tx}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('issue.done.tx')}
            </a>
            <button type="button" className="button quiet" onClick={() => setIssued(null)}>
              {t('issue.done.another')}
            </button>
          </div>
        </div>
      ) : (
        <form className="card form" onSubmit={onIssue} noValidate>
          <h3>{t('issue.form.title')}</h3>
          <div className="field">
            <label htmlFor="holder">{t('issue.form.holder')}</label>
            <input
              id="holder"
              name="holder"
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              {...fields.control('holder')}
            />
            <FieldError name="holder" message={fields.errors.holder} />
          </div>
          <div className="field">
            <label htmlFor="attribute">{t('issue.form.attribute')}</label>
            <select
              id="attribute"
              name="attribute"
              value={attribute}
              onChange={(e) => {
                setAttribute(e.target.value)
                fields.clear('value')
              }}
            >
              {importAttributes.map((a) => (
                <option key={a.attribute} value={a.attribute}>
                  {attr(a.attribute)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="value">{t('issue.form.value')}</label>
            {type === 'boolean' ? (
              <select id="value" name="value" defaultValue="true">
                <option value="true">{t('common.yes')}</option>
                <option value="false">{t('common.no')}</option>
              </select>
            ) : (
              <input
                id="value"
                name="value"
                key={attribute}
                type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
                step="any"
                {...fields.control('value')}
              />
            )}
            <FieldError name="value" message={fields.errors.value} />
          </div>
          <div className="field">
            <label htmlFor="validDays">{t('issue.form.validDays')}</label>
            <input
              id="validDays"
              name="validDays"
              type="number"
              min={1}
              max={MAX_VALID_DAYS}
              defaultValue={DEFAULT_VALID_DAYS}
              {...fields.control('validDays')}
            />
            <FieldError name="validDays" message={fields.errors.validDays} />
          </div>
          <div className="actions">
            <button type="submit" className="button" disabled={busy !== null}>
              {busy === 'issue' && <span className="spinner" aria-hidden="true" />}
              {busy === 'issue' ? t('issue.form.busy') : t('issue.form.submit')}
            </button>
          </div>
          <ErrorNotice message={error} />
        </form>
      )}
      <h2 className="section-title">{t('issue.list.title')}</h2>
      <IssuedList
        issuerId={issuerId}
        index={index}
        onRevoke={async (attestationId) => {
          const account = await walletAccount(address)
          await revoke(account, attestationId)
          await refreshUntil((next) => next.attestations.get(attestationId)?.revokedAt !== 0n)
        }}
      />
    </>
  )
}
