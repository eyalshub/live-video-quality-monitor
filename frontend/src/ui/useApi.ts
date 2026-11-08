import { useCallback, useEffect, useState } from 'react'

export type ApiState<T> =
  { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'success'; data: T }

const LOADING = { status: 'loading' } as const

/** Load data once per `key`; `retry` loads again. Cancelled on unmount / key change. */
export function useApi<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): [ApiState<T>, () => void] {
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${key}#${String(attempt)}`
  // The result remembers which request it belongs to; anything older reads as "loading".
  const [result, setResult] = useState<{ key: string; state: ApiState<T> } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, state: { status: 'success', data } })
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, state: { status: 'error', error } })
        }
      },
    )
    return () => {
      controller.abort()
    }
    // `load` is recreated on every render; `requestKey` identifies what is being loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const retry = useCallback(() => {
    setAttempt((n) => n + 1)
  }, [])
  return [result?.key === requestKey ? result.state : LOADING, retry]
}
