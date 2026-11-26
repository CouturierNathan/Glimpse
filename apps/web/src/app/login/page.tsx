import { SignInPanel } from '@/components/SignInPanel.tsx'
import { T } from '@/components/I18nProvider.tsx'
import { titled } from '@/lib/i18n/server.ts'
import { safeNextPath } from '@/lib/nav.ts'

export const generateMetadata = titled('title.signIn')

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams

  return (
    <section className="signin">
      <div>
        <h1>
          <T k="signIn.title" />
        </h1>
        <p className="lede">
          <T k="signIn.lede" />
        </p>
      </div>
      <SignInPanel next={safeNextPath(next)} />
    </section>
  )
}
