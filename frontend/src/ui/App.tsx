import type { AppConfig } from '../config'
import { HealthStatus } from './HealthStatus'

export function App({ config }: { config: AppConfig }) {
  return (
    <main className="app">
      <h1>Live Video Quality Monitor</h1>
      <HealthStatus config={config} />
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
