// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { navigate, parseRoute } from './router'

describe('parseRoute', () => {
  it.each([
    ['/', { name: 'live' }],
    ['', { name: 'live' }],
    ['/history', { name: 'history' }],
    ['/history/', { name: 'history' }],
    ['/history/3f1c', { name: 'session', id: '3f1c' }],
    ['/history/a%20b', { name: 'session', id: 'a b' }],
    ['/history/a/b', { name: 'not_found' }],
    ['/nope', { name: 'not_found' }],
  ])('%s', (path, route) => {
    expect(parseRoute(path)).toEqual(route)
  })
})

describe('navigate', () => {
  it('pushes the URL and notifies listeners', () => {
    let notified = 0
    const listener = () => {
      notified += 1
    }
    window.addEventListener('popstate', listener)
    navigate('/history')
    navigate('/history') // same path: no-op
    window.removeEventListener('popstate', listener)
    expect(window.location.pathname).toBe('/history')
    expect(notified).toBe(1)
  })
})
