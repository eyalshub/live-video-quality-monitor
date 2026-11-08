import type { AppConfig } from '../config'
import { HealthStatus } from './HealthStatus'
import { LiveMonitor } from './LiveMonitor'

export function App({ config }: { config: AppConfig }) {
  return (
    <main className="app">
      <header className="app__header">
        <h1>Live Video Quality Monitor</h1>
        <HealthStatus config={config} />
      </header>
      <LiveMonitor config={config} />
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
