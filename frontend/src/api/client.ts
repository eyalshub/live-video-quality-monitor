/**
 * Thin fetch wrapper for the backend. Types come from the generated OpenAPI schema (ADR-008).
 */
import type { AppConfig } from '../config'
import type { components } from './schema'

export type HealthResponse = components['schemas']['HealthResponse']

export type HealthResult =
  | { kind: 'reachable'; health: HealthResponse }
  | { kind: 'unreachable'; reason: 'timeout' | 'network' | 'bad_response'; detail: string }

type ApiConfig = Pick<AppConfig, 'apiBaseUrl' | 'apiTimeoutMs'>

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) return false
  const { status, db } = value as Record<string, unknown>
  return (status === 'ok' || status === 'degraded') && (db === 'ok' || db === 'error')
}

/**
 * GET /health. 200 and 503 both carry a HealthResponse (503 = backend up, database down).
 * `signal` lets the caller cancel (e.g. on unmount); the timeout comes from configuration.
 */
export async function fetchHealth(
  config: ApiConfig,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<HealthResult> {
  const timeout = AbortSignal.timeout(config.apiTimeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const url = `${config.apiBaseUrl}/health`

  let response: Response
  try {
    response = await fetchImpl(url, { signal: combined, headers: { Accept: 'application/json' } })
  } catch (error) {
    if (signal?.aborted) throw error // cancelled by the caller: not a backend problem
    if (timeout.aborted) {
      return {
        kind: 'unreachable',
        reason: 'timeout',
        detail: `No answer within ${String(Math.round(config.apiTimeoutMs / 1000))} s`,
      }
    }
    return { kind: 'unreachable', reason: 'network', detail: String(error) }
  }

  const body: unknown = await response.json().catch(() => undefined)
  if ((response.status === 200 || response.status === 503) && isHealthResponse(body)) {
    return { kind: 'reachable', health: body }
  }
  return {
    kind: 'unreachable',
    reason: 'bad_response',
    detail: `Unexpected response: HTTP ${String(response.status)}`,
  }
}
