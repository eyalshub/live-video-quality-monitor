/**
 * Thin fetch wrapper for the backend. Types come from the generated OpenAPI schema (ADR-008).
 */
import type { AppConfig } from '../config'
import type { components } from './schema'

type Schemas = components['schemas']
export type HealthResponse = Schemas['HealthResponse']
export type SessionCreated = Schemas['SessionCreated']
export type SampleIn = Schemas['SampleIn']
export type IngestResult = Schemas['IngestResult']
export type StopResponse = Schemas['StopResponse']
export type SessionOut = Schemas['SessionOut']
export type SessionDetail = Schemas['SessionDetail']
export type ErrorBody = Schemas['ErrorBody']

export type HealthResult =
  | { kind: 'reachable'; health: HealthResponse }
  | { kind: 'unreachable'; reason: 'timeout' | 'network' | 'bad_response'; detail: string }

type ApiConfig = Pick<AppConfig, 'apiBaseUrl' | 'apiTimeoutMs'>

/** The backend answered with an error status (body in the uniform error format if available). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  /** 5xx (incl. a waking Render instance) and 408/429 are worth retrying; other 4xx are not. */
  get retryable(): boolean {
    return this.status >= 500 || this.status === 408 || this.status === 429
  }
}

/** The request never got an HTTP answer (offline, DNS, CORS, timeout). Always retryable. */
export class NetworkError extends Error {
  readonly timedOut: boolean

  constructor(message: string, timedOut: boolean) {
    super(message)
    this.name = 'NetworkError'
    this.timedOut = timedOut
  }
}

function isErrorEnvelope(value: unknown): value is { error: ErrorBody } {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  const error = value.error
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error
}

async function requestJson<T>(
  config: ApiConfig,
  path: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const timeout = AbortSignal.timeout(config.apiTimeoutMs)
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  let response: Response
  try {
    response = await fetchImpl(`${config.apiBaseUrl}${path}`, {
      ...init,
      signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    })
  } catch (error) {
    if (init.signal?.aborted) throw error
    if (timeout.aborted) {
      throw new NetworkError(
        `No answer within ${String(Math.round(config.apiTimeoutMs / 1000))} s`,
        true,
      )
    }
    throw new NetworkError(error instanceof Error ? error.message : String(error), false)
  }
  const body: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    if (isErrorEnvelope(body))
      throw new ApiError(response.status, body.error.code, body.error.message)
    throw new ApiError(response.status, 'http_error', `HTTP ${String(response.status)}`)
  }
  return body as T
}

export function createSession(
  config: ApiConfig,
  fetchImpl?: typeof fetch,
): Promise<SessionCreated> {
  return requestJson<SessionCreated>(config, '/sessions', { method: 'POST' }, fetchImpl)
}

export function postSamples(
  config: ApiConfig,
  sessionId: string,
  samples: SampleIn[],
  fetchImpl?: typeof fetch,
): Promise<IngestResult> {
  return requestJson<IngestResult>(
    config,
    `/sessions/${sessionId}/samples`,
    { method: 'POST', body: JSON.stringify({ samples }) },
    fetchImpl,
  )
}

export function stopSession(
  config: ApiConfig,
  sessionId: string,
  samples: SampleIn[],
  fetchImpl?: typeof fetch,
): Promise<StopResponse> {
  return requestJson<StopResponse>(
    config,
    `/sessions/${sessionId}/stop`,
    { method: 'POST', body: JSON.stringify({ samples }) },
    fetchImpl,
  )
}

export function listSessions(
  config: ApiConfig,
  signal?: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<SessionOut[]> {
  return requestJson<SessionOut[]>(config, '/sessions', { method: 'GET', signal }, fetchImpl)
}

export function getSession(
  config: ApiConfig,
  sessionId: string,
  signal?: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<SessionDetail> {
  return requestJson<SessionDetail>(
    config,
    `/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'GET', signal },
    fetchImpl,
  )
}

/**
 * Fire-and-forget send while the page is being closed (pagehide). `keepalive` lets the request
 * outlive the page; nothing can be done with the answer.
 */
export function sendSamplesKeepalive(
  config: Pick<AppConfig, 'apiBaseUrl'>,
  sessionId: string,
  samples: SampleIn[],
): void {
  void fetch(`${config.apiBaseUrl}/sessions/${sessionId}/samples`, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ samples }),
  }).catch(() => undefined)
}

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
