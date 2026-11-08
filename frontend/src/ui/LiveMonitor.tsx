import { useRef } from 'react'

import type { AppConfig } from '../config'
import { REASON_LABELS, type Sample } from '../metrics/verdict'
import { LiveChart } from './LiveChart'
import { useMonitor } from './useMonitor'

/** The live chart shows the last 30 seconds (task requirement). */
const LIVE_WINDOW_SECONDS = 30

function formatNumber(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

function VerdictBanner({ sample }: { sample: Sample | undefined }) {
  if (!sample) {
    return <div className="verdict verdict--none">Measuring the first second…</div>
  }
  if (sample.verdict === 'good') {
    return <div className="verdict verdict--good">Good</div>
  }
  const reason = sample.reason ? REASON_LABELS[sample.reason].toLowerCase() : 'unknown'
  return <div className="verdict verdict--poor">Poor: {reason}</div>
}

function Metrics({ sample }: { sample: Sample | undefined }) {
  return (
    <dl className="metrics">
      <div>
        <dt>FPS</dt>
        <dd>{sample ? sample.fps.toFixed(0) : '—'}</dd>
      </div>
      <div>
        <dt>Brightness</dt>
        <dd>{formatNumber(sample?.brightness ?? null)}</dd>
      </div>
      <div>
        <dt>Motion</dt>
        <dd title={sample?.motion === null ? 'Not measurable this second' : undefined}>
          {formatNumber(sample?.motion ?? null)}
        </dd>
      </div>
      <div>
        <dt>Face</dt>
        <dd className={sample && !sample.face ? 'bad' : undefined}>
          {sample ? (sample.face ? 'Yes' : 'No face') : '—'}
        </dd>
      </div>
    </dl>
  )
}

export function LiveMonitor({ config }: { config: AppConfig }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, controller] = useMonitor(config)
  const { phase, detectorStatus, samples, thresholds } = state

  const latest = samples.at(-1)
  const lastT = latest?.t ?? 0
  const toT = Math.max(LIVE_WINDOW_SECONDS - 1, lastT)
  const fromT = toT - (LIVE_WINDOW_SECONDS - 1)
  const isLive = phase === 'running'
  const canStart = (phase === 'ready' || phase === 'stopped') && detectorStatus === 'ready'

  const onStart = () => {
    if (videoRef.current) void controller.start(videoRef.current)
  }

  return (
    <section className="monitor">
      <div className="monitor__top">
        <div className="monitor__video">
          <video ref={videoRef} muted playsInline className={isLive ? '' : 'video--idle'} />
          {!isLive && <p className="video__placeholder">Camera off</p>}
        </div>

        <div className="monitor__side">
          <div className="controls">
            <button type="button" onClick={onStart} disabled={!canStart}>
              Start
            </button>
            <button
              type="button"
              onClick={() => void controller.stop()}
              disabled={phase !== 'running'}
            >
              Stop
            </button>
          </div>

          {detectorStatus === 'loading' && <p className="hint">Loading the face detector…</p>}
          {state.notice && <p className="notice">{state.notice}</p>}
          {state.error && (
            <p className="error" role="alert">
              {state.error}
            </p>
          )}
          {state.stopFailed && (
            <button type="button" onClick={() => void controller.sendStop()}>
              Retry ending the session
            </button>
          )}

          {(isLive || phase === 'stopping' || phase === 'stopped') && (
            <>
              {isLive && <VerdictBanner sample={latest} />}
              {isLive && state.noFrames && (
                <p className="error">No frames received (camera stalled or tab hidden).</p>
              )}
              <Metrics sample={latest} />
              <p className="hint">
                {state.pending > 0
                  ? `${String(state.pending)} sample(s) pending`
                  : 'All samples saved'}
                {state.rejected > 0 ? ` · ${String(state.rejected)} rejected by the server` : ''}
              </p>
            </>
          )}

          {phase === 'stopped' && state.summary && (
            <div className="summary">
              <h2>Session summary</h2>
              {state.summary.sample_count === 0 ? (
                <p>No data recorded for this session.</p>
              ) : (
                <ul>
                  <li>Duration: {String(state.summary.duration_s)} s</li>
                  <li>Average FPS: {formatNumber(state.summary.avg_fps)}</li>
                  <li>Face: {formatNumber(state.summary.face_pct)} %</li>
                  <li>Good: {formatNumber(state.summary.good_pct)} %</li>
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {thresholds && samples.length > 0 && (
        <LiveChart samples={samples} thresholds={thresholds} fromT={fromT} toT={toT} />
      )}
    </section>
  )
}
