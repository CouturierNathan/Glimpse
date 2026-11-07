'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { shortAddress } from '@/lib/format.ts'

import { useSession } from './SessionProvider.tsx'

export function AccountButton() {
  const { status, address, signOut } = useSession()
  const router = useRouter()

  if (status === 'loading') return <span className="account" aria-busy="true" />
  if (status !== 'signed-in' || !address) {
    return (
      <Link href="/login" className="button account">
        Sign in
      </Link>
    )
  }

  return (
    <span className="account">
      <span className="address" title={address}>
        {shortAddress(address)}
      </span>
      <button
        type="button"
        className="button quiet"
        onClick={async () => {
          await signOut()
          router.push('/')
        }}
      >
        Sign out
      </button>
    </span>
  )
}
