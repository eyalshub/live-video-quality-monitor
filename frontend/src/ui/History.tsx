import { ApiError, getSession, listSessions, NetworkError, type SessionOut } from '../api/client'
import type { AppConfig } from '../config'
import { formatSeconds } from './chartLayout'
import { QualityChart } from './QualityChart'
import { Link } from './Link'
import { navigate } from './router'
import { type ApiState, useApi } from './useApi'

/** The chart always shows at least this many seconds so short sessions do not look stretched. */
const MIN_CHART_SECONDS = 30

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' })

function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

function orDash(value: number | null, suffix = ''): string {
  return value === null ? '—' : `${value.toFixed(1)}${suffix}`
}

function sessionStatus(session: SessionOut): string {
  return session.ended_at ? 'Ended' : 'In progress / ended without Stop'
}

function errorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return error.timedOut
      ? 'The backend did not answer in time. A sleeping free backend can take up to a minute to wake up; try again.'
      : 'The backend is unreachable. Check your connection and try again.'
  }
  if (error instanceof ApiError) return `${error.message} (${error.code})`
  return 'Something went wrong while loading.'
}

function Loading({ what }: { what: string }) {
  return (
    <div className="panel" aria-live="polite">
      <p>Loading {what}…</p>
      <p className="hint">A sleeping free-tier backend can take up to a minute to wake up.</p>
    </div>
  )
}

function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="panel panel--bad" role="alert">
      <p>{errorMessage(error)}</p>
      <button type="button" onClick={retry}>
        Retry
      </button>
    </div>
  )
}

export function HistoryList({ config }: { config: AppConfig }) {
  const [state, retry] = useApi('sessions', (signal) => listSessions(config, signal))

  return (
    <section className="history">
      <h2>History</h2>
      {state.status === 'loading' && <Loading what="sessions" />}
      {state.status === 'error' && <LoadError error={state.error} retry={retry} />}
      {state.status === 'success' &&
        (state.data.length === 0 ? (
          <p className="panel">No sessions yet</p>
        ) : (
          <table className="sessions">
            <thead>
              <tr>
                <th scope="col">Date and time</th>
                <th scope="col">Duration</th>
                <th scope="col">Avg FPS</th>
                <th scope="col">% Good</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((session) => {
                const href = `/history/${session.id}`
                return (
                  <tr
                    key={session.id}
                    className="sessions__row"
                    onClick={() => {
                      navigate(href)
                    }}
                  >
                    <td>
                      <Link to={href}>{formatDateTime(session.started_at)}</Link>
                    </td>
                    <td>
                      {session.summary.duration_s === null
                        ? '—'
                        : formatSeconds(session.summary.duration_s)}
                    </td>
                    <td>{orDash(session.summary.avg_fps)}</td>
                    <td>{orDash(session.summary.good_pct, ' %')}</td>
                    <td className={session.ended_at ? undefined : 'muted'}>
                      {sessionStatus(session)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ))}
    </section>
  )
}

function isNotFound(state: ApiState<unknown>): boolean {
  return (
    state.status === 'error' &&
    state.error instanceof ApiError &&
    (state.error.status === 404 || state.error.status === 422)
  )
}

export function SessionDetails({ config, id }: { config: AppConfig; id: string }) {
  const [state, retry] = useApi(`session:${id}`, (signal) => getSession(config, id, signal))

  const back = (
    <button
      type="button"
      onClick={() => {
        navigate('/history')
      }}
    >
      ← Back
    </button>
  )

  if (state.status === 'loading') {
    return (
      <section className="history">
        {back}
        <Loading what="the session" />
      </section>
    )
  }
  if (isNotFound(state)) {
    return (
      <section className="history">
        {back}
        <p className="panel panel--bad">Session not found.</p>
      </section>
    )
  }
  if (state.status === 'error') {
    return (
      <section className="history">
        {back}
        <LoadError error={state.error} retry={retry} />
      </section>
    )
  }

  const session = state.data
  const { summary } = session
  const lastT = summary.duration_s ?? 0
  return (
    <section className="history">
      {back}
      <h2>Session of {formatDateTime(session.started_at)}</h2>
      <p className="hint">{sessionStatus(session)}</p>
      <dl className="summary-grid" aria-label="Summary">
        <div>
          <dt>Duration</dt>
          <dd>{summary.duration_s === null ? '—' : formatSeconds(summary.duration_s)}</dd>
        </div>
        <div>
          <dt>Average FPS</dt>
          <dd>{orDash(summary.avg_fps)}</dd>
        </div>
        <div>
          <dt>Face</dt>
          <dd>{orDash(summary.face_pct, ' %')}</dd>
        </div>
        <div>
          <dt>Good</dt>
          <dd>{orDash(summary.good_pct, ' %')}</dd>
        </div>
      </dl>
      {summary.sample_count === 0 ? (
        <p className="panel">No data recorded for this session.</p>
      ) : (
        <QualityChart
          samples={session.samples}
          thresholds={session.thresholds}
          fromT={0}
          toT={Math.max(MIN_CHART_SECONDS - 1, lastT)}
        />
      )}
    </section>
  )
}
