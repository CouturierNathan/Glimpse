'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

/** Takes a request link, or just its id, and opens it. */
export function OpenRequest() {
  const router = useRouter()
  const [error, setError] = useState(false)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = String(new FormData(event.currentTarget).get('link') ?? '')
    const id = /([0-9a-f]{32})\/?\s*$/.exec(text.trim())?.[1]
    if (!id) {
      setError(true)
      return
    }
    router.push(`/consent/${id}`)
  }

  return (
    <form className="open-request" onSubmit={onSubmit}>
      <label htmlFor="link">Request link</label>
      <div className="link-row">
        <input
          id="link"
          name="link"
          className="link"
          placeholder="https://…/consent/…"
          aria-invalid={error}
          onChange={() => setError(false)}
          required
        />
        <button type="submit" className="button">
          Open
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          This is not a Glimpse request link. Ask the requester to send it again.
        </p>
      )}
    </form>
  )
}
