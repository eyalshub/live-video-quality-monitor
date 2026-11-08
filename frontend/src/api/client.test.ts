import { describe, expect, it } from 'vitest'

import { fetchHealth } from './client'

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
