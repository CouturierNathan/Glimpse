import { T } from '@/components/I18nProvider.tsx'
import { OpenRequest } from '@/components/OpenRequest.tsx'
import { PageHead } from '@/components/PageHead.tsx'
import { RequestHistory } from '@/components/RequestHistory.tsx'
import { StatusLegend } from '@/components/StatusBadge.tsx'
import { titled } from '@/lib/i18n/server.ts'

export const generateMetadata = titled('title.requests')

export default function ConsentPage() {
  return (
    <section>
      <PageHead title="title.requests" who="who.holder" lede="requests.lede" />

      <div className="card open-card">
        <h2 className="card-title">
          <T k="requests.open.title" />
        </h2>
        <p className="hint">
          <T k="requests.open.text" />
        </p>
        <OpenRequest />
      </div>

      <h2 className="section-title">
        <T k="history.title" />
      </h2>
      <p className="hint section-hint">
        <T k="history.text" />
      </p>
      <RequestHistory />

      <h2 className="section-title">
        <T k="requests.legend.title" />
      </h2>
      <p className="hint section-hint">
        <T k="requests.legend.text" />
      </p>
      <StatusLegend />
    </section>
  )
}
