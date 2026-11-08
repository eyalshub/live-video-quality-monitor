// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionDetail, SessionOut } from '../api/client'
import type { AppConfig } from '../config'
import { HistoryList, SessionDetails } from './History'

const CONFIG: AppConfig = {
  apiBaseUrl: 'http://api.test',
  sampleBatchIntervalMs: 1500,
  analysisWidth: 160,
  analysisHeight: 120,
  apiTimeoutMs: 1000,
  faceDetectEveryNFrames: 1,
  insights: { sharpnessMin: 50, clipPctMax: 5, faceMinWidthPct: 20, faceMaxOffsetPct: 20 },
}
const THRESHOLDS = { fps_min: 15, brightness_min: 60, brightness_max: 200, motion_max: 20 }
const EMPTY_SUMMARY = {
  duration_s: null,
  avg_fps: null,
  face_pct: null,
  good_pct: null,
  sample_count: 0,
}

function session(overrides: Partial<SessionOut> = {}): SessionOut {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    started_at: '2026-11-08T12:00:00Z',
    ended_at: '2026-11-08T12:00:43Z',
    thresholds: THRESHOLDS,
    summary: { duration_s: 42, avg_fps: 28.74, face_pct: 93, good_pct: 81, sample_count: 40 },
    ...overrides,
  }
}

/** Route fetch calls by URL; anything unexpected fails the test. */
function serve(routes: Record<string, () => Response | Promise<Response>>) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const handler = routes[url.replace(CONFIG.apiBaseUrl, '')]
    if (!handler) return Promise.reject(new Error(`unexpected fetch ${url}`))
    return Promise.resolve(handler())
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status })

beforeEach(() => {
  window.history.pushState(null, '', '/history')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('HistoryList', () => {
  it('shows a loading message with the cold-start hint first', () => {
    serve({ '/sessions': () => new Promise<Response>(() => undefined) })
    render(<HistoryList config={CONFIG} />)
    expect(screen.getByText('Loading sessions…')).toBeTruthy()
    expect(screen.getByText(/can take up to a minute/)).toBeTruthy()
  })

  it('shows "No sessions yet" when the list is empty', async () => {
    serve({ '/sessions': json([]) })
    render(<HistoryList config={CONFIG} />)
    expect(await screen.findByText('No sessions yet')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('lists sessions newest first with duration, avg FPS, % Good and status', async () => {
    const newer = session({
      id: '22222222-2222-2222-2222-222222222222',
      started_at: '2026-11-08T13:00:00Z',
      ended_at: null,
      summary: EMPTY_SUMMARY,
    })
    serve({ '/sessions': json([newer, session()]) })
    render(<HistoryList config={CONFIG} />)

    const rows = (await screen.findAllByRole('row')).slice(1) // skip header
    expect(rows).toHaveLength(2)
    const [first, second] = rows.map((row) => within(row).getAllByRole('cell'))
    expect(first?.map((c) => c.textContent).slice(1)).toEqual([
      '—',
      '—',
      '—',
      'In progress / ended without Stop',
    ])
    expect(second?.map((c) => c.textContent).slice(1)).toEqual(['42 s', '28.7', '81.0 %', 'Ended'])
  })

  it('opens the details when a row is clicked', async () => {
    serve({ '/sessions': json([session()]) })
    render(<HistoryList config={CONFIG} />)
    const link = await screen.findByRole('link')
    expect(link.getAttribute('href')).toBe('/history/11111111-1111-1111-1111-111111111111')
    fireEvent.click(link)
    expect(window.location.pathname).toBe('/history/11111111-1111-1111-1111-111111111111')
  })

  it('shows an error with Retry, and Retry loads again', async () => {
    let calls = 0
    serve({
      '/sessions': () => {
        calls += 1
        return calls === 1 ? new Response('down', { status: 502 }) : new Response('[]')
      },
    })
    render(<HistoryList config={CONFIG} />)
    expect((await screen.findByRole('alert')).textContent).toContain('HTTP 502')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('No sessions yet')).toBeTruthy()
  })

  it('explains an unreachable backend', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    render(<HistoryList config={CONFIG} />)
    expect((await screen.findByRole('alert')).textContent).toContain('unreachable')
  })
})

describe('SessionDetails', () => {
  const id = '11111111-1111-1111-1111-111111111111'

  it('shows the summary and the full-session chart', async () => {
    const detail: SessionDetail = {
      ...session(),
      summary: { duration_s: 1, avg_fps: 29.6, face_pct: 50, good_pct: 50, sample_count: 2 },
      samples: [
        { t: 0, fps: 29.6, brightness: 130, motion: 2, face: true, verdict: 'good', reason: null },
        {
          t: 1,
          fps: 29.6,
          brightness: 130,
          motion: null,
          face: false,
          verdict: 'poor',
          reason: 'no_face',
        },
      ],
    }
    serve({ [`/sessions/${id}`]: json(detail) })
    render(<SessionDetails config={CONFIG} id={id} />)

    const grid = await screen.findByLabelText('Summary')
    expect(grid.textContent).toContain('Duration1 s')
    expect(grid.textContent).toContain('Average FPS29.6')
    expect(grid.textContent).toContain('Face50.0 %')
    expect(grid.textContent).toContain('Good50.0 %')
    expect(screen.getByRole('img', { name: 'Per-second quality chart' })).toBeTruthy()
  })

  it('says so when the session has no data', async () => {
    serve({ [`/sessions/${id}`]: json({ ...session({ summary: EMPTY_SUMMARY }), samples: [] }) })
    render(<SessionDetails config={CONFIG} id={id} />)
    expect(await screen.findByText('No data recorded for this session.')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows "Session not found" for an unknown id', async () => {
    const body = { error: { code: 'not_found', message: 'Session not found', details: null } }
    serve({ [`/sessions/${id}`]: json(body, 404) })
    render(<SessionDetails config={CONFIG} id={id} />)
    expect(await screen.findByText('Session not found.')).toBeTruthy()
  })

  it('Back returns to the list', async () => {
    window.history.pushState(null, '', `/history/${id}`)
    serve({ [`/sessions/${id}`]: json({ ...session(), samples: [] }) })
    render(<SessionDetails config={CONFIG} id={id} />)
    fireEvent.click(await screen.findByRole('button', { name: '← Back' }))
    expect(window.location.pathname).toBe('/history')
  })
})
