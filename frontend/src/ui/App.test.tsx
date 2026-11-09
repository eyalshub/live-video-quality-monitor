// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppConfig } from '../config'
import { App } from './App'

// The real detector needs WebGL/wasm; navigation tests only need it to stay "loading".
vi.mock('../capture/faceDetector', () => ({
  loadFaceDetector: () => new Promise(() => undefined),
}))

const CONFIG: AppConfig = {
  apiBaseUrl: 'http://api.test',
  sampleBatchIntervalMs: 1500,
  analysisWidth: 160,
  analysisHeight: 120,
  apiTimeoutMs: 1000,
  faceDetectEveryNFrames: 1,
  faceMinConfidence: 0.5,
  faceStableFrames: 5,
  faceStableIou: 0.3,
  insights: { sharpnessMin: 50, clipPctMax: 5, faceMinWidthPct: 20, faceMaxOffsetPct: 20 },
}

beforeEach(() => {
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.endsWith('/health')) {
      return Promise.resolve(new Response(JSON.stringify({ status: 'ok', db: 'ok' })))
    }
    if (url.endsWith('/sessions')) return Promise.resolve(new Response('[]'))
    const notFound = { error: { code: 'not_found', message: 'Session not found', details: null } }
    return Promise.resolve(new Response(JSON.stringify(notFound), { status: 404 }))
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('App navigation', () => {
  it('opens the live screen at /', () => {
    window.history.pushState(null, '', '/')
    render(<App config={CONFIG} />)
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Live' }).getAttribute('aria-current')).toBe('page')
  })

  it('switches between Live and History without a page load', async () => {
    window.history.pushState(null, '', '/')
    render(<App config={CONFIG} />)
    fireEvent.click(screen.getByRole('link', { name: 'History' }))
    expect(window.location.pathname).toBe('/history')
    expect(await screen.findByText('No sessions yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()

    fireEvent.click(screen.getByRole('link', { name: 'Live' }))
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  })

  it('opens a details deep link directly', async () => {
    window.history.pushState(null, '', '/history/abc')
    render(<App config={CONFIG} />)
    expect(await screen.findByText('Session not found.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '← Back' })).toBeTruthy()
  })

  it('follows the browser Back button', async () => {
    window.history.pushState(null, '', '/history')
    render(<App config={CONFIG} />)
    expect(await screen.findByText('No sessions yet')).toBeTruthy()
    act(() => {
      window.history.pushState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  })

  it('shows a not-found page for unknown paths', () => {
    window.history.pushState(null, '', '/nope')
    render(<App config={CONFIG} />)
    expect(screen.getByText(/Page not found/)).toBeTruthy()
  })
})
