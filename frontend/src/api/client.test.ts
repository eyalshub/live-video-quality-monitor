import { describe, expect, it } from 'vitest'

import {
  ApiError,
  createSession,
  fetchHealth,
  NetworkError,
  postSamples,
  stopSession,
} from './client'

const CONFIG = { apiBaseUrl: 'http://api.test', apiTimeoutMs: 1000 }

function respond(status: number, body: unknown): typeof fetch {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }))
}

describe('fetchHealth', () => {
  it('reports a healthy backend', async () => {
    const result = await fetchHealth(CONFIG, undefined, respond(200, { status: 'ok', db: 'ok' }))
    expect(result).toEqual({ kind: 'reachable', health: { status: 'ok', db: 'ok' } })
  })

  it('treats 503 with a health body as "backend up, database down"', async () => {
    const body = { status: 'degraded', db: 'error' }
    const result = await fetchHealth(CONFIG, undefined, respond(503, body))
    expect(result).toEqual({ kind: 'reachable', health: body })
  })

  it('reports a network failure as unreachable', async () => {
    const failing: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'))
    const result = await fetchHealth(CONFIG, undefined, failing)
    expect(result).toMatchObject({ kind: 'unreachable', reason: 'network' })
  })

  it('reports an unexpected body as a bad response', async () => {
    const result = await fetchHealth(CONFIG, undefined, respond(200, { hello: 'world' }))
    expect(result).toMatchObject({ kind: 'unreachable', reason: 'bad_response' })
  })

  it('times out using the configured timeout', async () => {
    const hanging: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    const result = await fetchHealth({ ...CONFIG, apiTimeoutMs: 20 }, undefined, hanging)
    expect(result).toMatchObject({ kind: 'unreachable', reason: 'timeout' })
  })
})

describe('session API calls', () => {
  const sample = {
    t: 0,
    fps: 30,
    brightness: 130,
    motion: 2,
    face: true,
    verdict: 'good' as const,
    reason: null,
  }

  it('posts samples as JSON to the session URL', async () => {
    let seen: { url: string; body: unknown } | undefined
    const fake: typeof fetch = (url, init) => {
      seen = {
        url: typeof url === 'string' ? url : 'unexpected',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      }
      return Promise.resolve(
        new Response(JSON.stringify({ inserted: 1, duplicates: 0, ignored_after_stop: 0 })),
      )
    }
    const result = await postSamples(CONFIG, 'abc', [sample], fake)
    expect(result.inserted).toBe(1)
    expect(seen).toEqual({
      url: 'http://api.test/sessions/abc/samples',
      body: { samples: [sample] },
    })
  })

  it('turns an error body into an ApiError with its code', async () => {
    const body = { error: { code: 'inconsistent_verdict', message: 'bad', details: [] } }
    const error: unknown = await postSamples(CONFIG, 'abc', [sample], respond(422, body)).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('inconsistent_verdict')
    expect((error as ApiError).retryable).toBe(false)
  })

  it('marks 5xx as retryable', async () => {
    const error: unknown = await createSession(CONFIG, respond(502, 'Bad gateway')).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).retryable).toBe(true)
  })

  it('turns a failed fetch into a NetworkError', async () => {
    const failing: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'))
    const error: unknown = await stopSession(CONFIG, 'abc', [], failing).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NetworkError)
    expect((error as NetworkError).timedOut).toBe(false)
  })
})
