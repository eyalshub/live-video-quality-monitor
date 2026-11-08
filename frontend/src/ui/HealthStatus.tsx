import { useEffect, useState } from 'react'

import { fetchHealth, type HealthResult } from '../api/client'
import type { AppConfig } from '../config'

type State = { phase: 'checking' } | { phase: 'done'; result: HealthResult }

/** Shows whether the browser can reach the backend and the backend can reach the database. */
export function HealthStatus({ config }: { config: AppConfig }) {
  const [state, setState] = useState<State>({ phase: 'checking' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(config, controller.signal).then(
      (result) => {
        setState({ phase: 'done', result })
      },
      () => {
        // Aborted on unmount / retry: nothing to show.
      },
    )
    return () => {
      controller.abort()
    }
  }, [config, attempt])

  const retry = () => {
    setState({ phase: 'checking' })
    setAttempt((n) => n + 1)
  }

  if (state.phase === 'checking') {
    return (
      <section className="health" aria-live="polite">
        <p>Checking backend at {config.apiBaseUrl}…</p>
        <p className="hint">A sleeping free-tier backend can take up to a minute to wake up.</p>
      </section>
    )
  }

  const { result } = state
  if (result.kind === 'unreachable') {
    return (
      <section className="health health--bad" role="alert">
        <p>
          <strong>Backend unreachable</strong> at {config.apiBaseUrl}
        </p>
        <p className="hint">
          {result.reason === 'timeout'
            ? `${result.detail}. It may still be waking up — try again.`
            : result.detail}
        </p>
        <button type="button" onClick={retry}>
          Retry
        </button>
      </section>
    )
  }

  const { status, db } = result.health
  const healthy = status === 'ok' && db === 'ok'
  return (
    <section className={healthy ? 'health health--ok' : 'health health--bad'} aria-live="polite">
      <p>
        backend: <strong>ok</strong>, db: <strong>{db}</strong>
      </p>
      {!healthy && <p className="hint">The backend is up but cannot reach its database.</p>}
      <button type="button" onClick={retry}>
        Check again
      </button>
    </section>
  )
}
