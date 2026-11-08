/**
 * Minimal client-side routing on the History API (three routes do not justify a dependency).
 * Deep links work on Vercel thanks to the SPA rewrite in vercel.json.
 */
import { useSyncExternalStore } from 'react'

export type Route =
  { name: 'live' } | { name: 'history' } | { name: 'session'; id: string } | { name: 'not_found' }

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return { name: 'live' }
  if (path === '/history') return { name: 'history' }
  const match = /^\/history\/([^/]+)$/.exec(path)
  if (match?.[1]) return { name: 'session', id: decodeURIComponent(match[1]) }
  return { name: 'not_found' }
}

const NAVIGATE_EVENT = 'popstate'

export function navigate(path: string): void {
  if (path === window.location.pathname) return
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent(NAVIGATE_EVENT))
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(NAVIGATE_EVENT, listener)
  return () => {
    window.removeEventListener(NAVIGATE_EVENT, listener)
  }
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}
