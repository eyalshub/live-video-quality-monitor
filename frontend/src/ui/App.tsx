import type { AppConfig } from '../config'
import { HealthStatus } from './HealthStatus'
import { HistoryList, SessionDetails } from './History'
import { LiveMonitor } from './LiveMonitor'
import { Link } from './Link'
import { parseRoute, usePathname } from './router'

export function App({ config }: { config: AppConfig }) {
  const route = parseRoute(usePathname())

  return (
    <main className="app">
      <header className="app__header">
        <h1>Live Video Quality Monitor</h1>
        <HealthStatus config={config} />
      </header>
      <nav className="nav" aria-label="Main">
        <Link to="/" ariaCurrent={route.name === 'live'}>
          Live
        </Link>
        <Link to="/history" ariaCurrent={route.name === 'history' || route.name === 'session'}>
          History
        </Link>
      </nav>

      {route.name === 'live' && <LiveMonitor config={config} />}
      {route.name === 'history' && <HistoryList config={config} />}
      {route.name === 'session' && <SessionDetails key={route.id} config={config} id={route.id} />}
      {route.name === 'not_found' && (
        <p className="panel">
          Page not found. <Link to="/">Go to the live screen</Link>
        </p>
      )}

      <p className="footnote">
        Video is analyzed only in this browser. Only per-second numbers are sent to the server.
      </p>
    </main>
  )
}

/** Shown instead of the app when the build's configuration is invalid. */
export function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <main className="app">
      <h1>Live Video Quality Monitor</h1>
      <section className="health health--bad" role="alert">
        <p>
          <strong>The app is not configured correctly.</strong>
        </p>
        <pre>{message}</pre>
      </section>
    </main>
  )
}
