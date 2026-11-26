'use client'

import type { IdentityValidationReport } from '@glimpse/shared'
import { type FormEvent, useState } from 'react'
import { signMessage } from 'wagmi/actions'

import { BINDING_WARNING } from '@/lib/identity/warning.ts'
import { wagmiConfig } from '@/lib/wagmi.ts'

import { FilePicker } from './FilePicker.tsx'
import { connectedAddress, describeWalletError } from './SessionProvider.tsx'
import { useVault } from './VaultProvider.tsx'

type Step =
  | { name: 'idle' }
  | { name: 'checking' }
  | { name: 'report'; report: IdentityValidationReport; binding: string | null }
  | { name: 'signing'; report: IdentityValidationReport; binding: string }
  | { name: 'bound'; report: IdentityValidationReport; address: string }

const checkNames: Record<keyof IdentityValidationReport['checks'], string> = {
  format: 'PDF signature found',
  integrity: 'Document unchanged since signing',
  signature: 'Signature matches the signer certificate',
  chain: 'Signer certified by a trusted authority',
  validity: 'Certificates valid today',
}
const outcomeText = { pass: 'Passed', fail: 'Failed', unknown: 'Not checked' } as const

function Report({ report }: { report: IdentityValidationReport }) {
  const passed = report.indication === 'TOTAL_PASSED'
  return (
    <>
      <h2>{passed ? 'The signature is valid' : 'The signature could not be validated'}</h2>
      <dl className="request-facts">
        {Object.entries(checkNames).map(([check, label]) => (
          <div key={check}>
            <dt>{label}</dt>
            <dd>{outcomeText[report.checks[check as keyof typeof checkNames]]}</dd>
          </div>
        ))}
        {report.signer && (
          <div>
            <dt>Signed by</dt>
            <dd>{report.signer.subject}</dd>
          </div>
        )}
        {report.signingTime && (
          <div>
            <dt>Signed on</dt>
            <dd>{new Date(report.signingTime).toLocaleString()}</dd>
          </div>
        )}
      </dl>
      {!passed && (
        <p className="hint">
          Result: {report.indication}
          {report.subIndication ? ` (${report.subIndication})` : ''}.
        </p>
      )}
    </>
  )
}

/**
 * Identity step of the import flow: checks a France Identité PDF's signature on the server, shows
 * the report, then has the wallet sign an explicit binding to it.
 */
export function IdentityPanel() {
  const { request } = useVault()
  const [step, setStep] = useState<Step>({ name: 'idle' })
  const [error, setError] = useState<string | null>(null)

  async function onCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const chosen = new FormData(event.currentTarget).get('file')
    if (!(chosen instanceof File) || chosen.size === 0) {
      setError('Choose a proof first.')
      return
    }
    const form = new FormData()
    form.set('file', chosen)
    setError(null)
    setStep({ name: 'checking' })
    try {
      const res = await request('/api/identity/verify', { method: 'POST', body: form })
      const body = (await res.json()) as {
        report: IdentityValidationReport
        binding: string | null
      }
      setStep({ name: 'report', ...body })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The check failed, try again.')
      setStep({ name: 'idle' })
    }
  }

  async function onBind(report: IdentityValidationReport, binding: string) {
    setError(null)
    setStep({ name: 'signing', report, binding })
    try {
      await connectedAddress()
      const signature = await signMessage(wagmiConfig, { message: binding })
      const res = await request('/api/identity/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report.reportId, signature }),
      })
      const { address } = (await res.json()) as { address: string }
      setStep({ name: 'bound', report, address })
    } catch (err) {
      setError(describeWalletError(err))
      setStep({ name: 'report', report, binding })
    }
  }

  if (step.name === 'idle' || step.name === 'checking') {
    return (
      <form className="panel form" onSubmit={onCheck}>
        <div className="samples">
          <h3>Two proofs to try</h3>
          <ul>
            <li>
              <a href="/demo/FAKE-identity-proof.pdf" download>
                Valid proof — passes
              </a>
            </li>
            <li>
              <a href="/demo/FAKE-identity-proof-wrong-signer.pdf" download>
                Forged proof — fails the chain
              </a>
            </li>
          </ul>
          <p className="hint">
            Both are test files signed by a FAKE test authority, not real documents. The second one
            is signed by a look-alike signer no trusted authority certifies: the report shows it.
          </p>
        </div>
        <FilePicker
          name="file"
          accept=".pdf,application/pdf"
          label="France Identité proof"
          buttonLabel="Choose a proof"
          hint="The signed PDF from the France Identité app. Glimpse checks its signature on the server and does not store it or send it to the extractor."
        />
        <button type="submit" className="button" disabled={step.name === 'checking'}>
          {step.name === 'checking' ? 'Checking the signature…' : 'Check the signature'}
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
    )
  }

  return (
    <div className="panel import-result" role="status">
      <Report report={step.report} />
      {step.name === 'bound' ? (
        <p>
          Bound to your wallet <span className="address">{step.address}</span>.
        </p>
      ) : (
        step.binding && (
          <>
            <p className="hint">
              <strong>Before you sign:</strong> {BINDING_WARNING}
            </p>
            <div className="actions">
              <button
                type="button"
                className="button"
                disabled={step.name === 'signing'}
                onClick={() => step.binding && onBind(step.report, step.binding)}
              >
                {step.name === 'signing' ? 'Waiting for your wallet…' : 'Sign the binding'}
              </button>
            </div>
          </>
        )
      )}
      {step.name !== 'signing' && (
        <div className="actions">
          <button type="button" className="button quiet" onClick={() => setStep({ name: 'idle' })}>
            Check another document
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  )
}
