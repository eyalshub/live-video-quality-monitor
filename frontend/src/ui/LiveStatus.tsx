/**
 * The per-second verdict and one card per metric. Each card is judged on its own with the same
 * checks the verdict uses (checkMetrics), so covering the camera still shows "Too dark" even
 * though the verdict reason is "no face".
 */
import {
  checkMetrics,
  failingReasons,
  REASON_LABELS,
  type Sample,
  type Thresholds,
} from '../metrics/verdict'

function fixed1(value: number): string {
  return value.toFixed(1)
}

export function VerdictBanner({
  sample,
  thresholds,
}: {
  sample: Sample | undefined
  thresholds: Thresholds
}) {
  if (!sample) {
    return <div className="verdict verdict--none">Measuring the first second…</div>
  }
  if (sample.verdict === 'good') {
    return <div className="verdict verdict--good">Good</div>
  }
  const reason = sample.reason ? REASON_LABELS[sample.reason].toLowerCase() : 'unknown'
  const others = failingReasons(sample, thresholds).filter((r) => r !== sample.reason)
  return (
    <div>
      <div className="verdict verdict--poor">Poor: {reason}</div>
      {others.length > 0 && (
        <p className="verdict__also">
          Also failing: {others.map((r) => REASON_LABELS[r].toLowerCase()).join(', ')}
        </p>
      )}
    </div>
  )
}

interface Card {
  title: string
  value: string
  status: string
  ok: boolean | null // null = no data
}

function cardsFor(sample: Sample, thresholds: Thresholds): Card[] {
  const checks = checkMetrics(sample, thresholds)
  const { fps_min, brightness_min, brightness_max, motion_max } = thresholds
  return [
    {
      title: 'FPS',
      value: sample.fps.toFixed(0),
      status:
        checks.fps === 'ok' ? `OK (min ${String(fps_min)})` : `Low FPS (min ${String(fps_min)})`,
      ok: checks.fps === 'ok',
    },
    {
      title: 'Brightness',
      value: fixed1(sample.brightness),
      status:
        checks.brightness === 'too_dark'
          ? `Too dark (min ${String(brightness_min)})`
          : checks.brightness === 'too_bright'
            ? `Too bright (max ${String(brightness_max)})`
            : `OK (${String(brightness_min)}–${String(brightness_max)})`,
      ok: checks.brightness === 'ok',
    },
    {
      title: 'Motion',
      value: sample.motion === null ? '—' : fixed1(sample.motion),
      status:
        checks.motion === 'no_data'
          ? 'no data'
          : checks.motion === 'hold_still'
            ? `Hold still (max ${String(motion_max)})`
            : `OK (max ${String(motion_max)})`,
      ok: checks.motion === 'no_data' ? null : checks.motion === 'ok',
    },
    {
      title: 'Face',
      value: sample.face ? 'Yes' : 'No',
      status: sample.face ? 'Face detected' : 'No face',
      ok: checks.face === 'ok',
    },
  ]
}

export function MetricCards({
  sample,
  thresholds,
}: {
  sample: Sample | undefined
  thresholds: Thresholds
}) {
  if (!sample) {
    return <p className="hint">Waiting for the first full second of video…</p>
  }
  return (
    <ul className="metrics" aria-label="Metrics">
      {cardsFor(sample, thresholds).map((card) => (
        <li
          key={card.title}
          className={
            card.ok === null
              ? 'metric metric--none'
              : card.ok
                ? 'metric metric--ok'
                : 'metric metric--bad'
          }
          aria-label={card.title}
        >
          <span className="metric__title">{card.title}</span>
          <span className="metric__line">
            <span className="metric__value">{card.value}</span> — {card.status}
          </span>
        </li>
      ))}
    </ul>
  )
}
