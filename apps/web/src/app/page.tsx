import { HomeCta } from '@/components/HomeCta.tsx'
import { T } from '@/components/I18nProvider.tsx'
import { StatusBadge } from '@/components/StatusBadge.tsx'
import type { MessageKey } from '@/lib/i18n/messages.ts'

/** Every line of the attestation stays masked except the one the requester asked for. */
const hiddenRows: { label: MessageKey; width: string }[] = [
  { label: 'home.doc.fullName', width: '72%' },
  { label: 'home.doc.birth', width: '44%' },
  { label: 'home.doc.address', width: '88%' },
]

const steps = [
  { title: 'home.step1.title', text: 'home.step1.text' },
  { title: 'home.step2.title', text: 'home.step2.text' },
  { title: 'home.step3.title', text: 'home.step3.text' },
] as const satisfies { title: MessageKey; text: MessageKey }[]

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div>
          <h1>
            <T k="home.title" />
          </h1>
          <p className="lede">
            <T k="home.lede" />
          </p>
          <HomeCta />
        </div>

        <figure className="doc" aria-labelledby="doc-title">
          <div className="doc-head">
            <h2 id="doc-title">
              <T k="home.doc.title" />
            </h2>
            <span>
              <T k="home.doc.shared" />
            </span>
          </div>
          <dl>
            {hiddenRows.map((row) => (
              <div className="doc-row" key={row.label}>
                <dt>
                  <T k={row.label} />
                </dt>
                <dd>
                  <span className="redacted" style={{ width: row.width }} />
                  <span className="sr-only">
                    <T k="home.doc.hidden" />
                  </span>
                </dd>
              </div>
            ))}
            <div className="doc-row revealed">
              <dt>
                <T k="home.doc.over18" />
              </dt>
              <dd>
                <T k="common.yes" />
              </dd>
            </div>
          </dl>
          <figcaption className="doc-foot">
            <StatusBadge status="authentic" />
            <T k="home.doc.foot" />
          </figcaption>
        </figure>
      </section>

      <ol className="steps">
        {steps.map((step) => (
          <li key={step.title}>
            <h2>
              <T k={step.title} />
            </h2>
            <p>
              <T k={step.text} />
            </p>
          </li>
        ))}
      </ol>
    </>
  )
}
