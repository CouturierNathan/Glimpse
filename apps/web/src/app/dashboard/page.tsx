import { T } from '@/components/I18nProvider.tsx'
import { PageHead } from '@/components/PageHead.tsx'
import { StatusLegend } from '@/components/StatusBadge.tsx'
import { VaultList } from '@/components/VaultList.tsx'
import { titled } from '@/lib/i18n/server.ts'
import { storageDurable } from '@/lib/vault/server.ts'

export const generateMetadata = titled('title.vault')

const sources = [
  { mark: 'mark', title: 'source.A', text: 'source.A.text' },
  { mark: 'mark signed', title: 'source.B', text: 'source.B.text' },
  { mark: 'mark attested', title: 'source.C.title', text: 'source.C.text' },
] as const

export default async function DashboardPage() {
  const durable = await storageDurable()

  return (
    <section>
      <PageHead title="title.vault" who="who.holder" lede="vault.lede" />

      {!durable && (
        <aside className="notice" role="note">
          <svg viewBox="0 0 20 20" aria-hidden="true" className="notice-icon">
            <circle cx="10" cy="10" r="8" />
            <path d="M10 9v5M10 6.2v.1" />
          </svg>
          <p>
            <strong>
              <T k="vault.storage.title" />
            </strong>{' '}
            <T k="vault.storage.text" />
          </p>
        </aside>
      )}

      <VaultList />

      <div className="reference">
        <div>
          <h2 className="section-title">
            <T k="vault.statusTitle" />
          </h2>
          <StatusLegend />
        </div>
        <div>
          <h2 className="section-title">
            <T k="vault.sourcesTitle" />
          </h2>
          <ul className="sources">
            {sources.map((source) => (
              <li key={source.title}>
                <span className={source.mark} aria-hidden="true" />
                <div>
                  <h3>
                    <T k={source.title} />
                  </h3>
                  <p>
                    <T k={source.text} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
