/**
 * Per-second chart: FPS, brightness and motion as lines (one panel each, with the threshold
 * lines), face and verdict as colored strips. Missing seconds and null motion are gaps, never 0.
 * Used for the live 30 s window; works for a whole session too (History, P5).
 */
import type { Sample, Thresholds } from '../metrics/verdict'

const WIDTH = 640
const PANEL_HEIGHT = 70
const STRIP_HEIGHT = 14
const GAP = 10
const LEFT = 64
const RIGHT = 8

interface Props {
  samples: Sample[]
  thresholds: Thresholds
  /** Visible range of t (inclusive). */
  fromT: number
  toT: number
}

interface PanelSpec {
  label: string
  value: (sample: Sample) => number | null
  max: number
  lines: { value: number; label: string }[]
  className: string
}

export function LiveChart({ samples, thresholds, fromT, toT }: Props) {
  const seconds = Math.max(1, toT - fromT + 1)
  const plotWidth = WIDTH - LEFT - RIGHT
  /** One cell per second; lines pass through cell centers so they line up with the strips. */
  const cellWidth = plotWidth / seconds
  const cellLeft = (t: number) => LEFT + (t - fromT) * cellWidth
  const x = (t: number) => cellLeft(t) + cellWidth / 2
  const visible = samples.filter((s) => s.t >= fromT && s.t <= toT)
  const byT = new Map(visible.map((s) => [s.t, s]))

  const maxOf = (pick: (s: Sample) => number | null, floor: number) =>
    Math.max(floor, ...visible.map((s) => pick(s) ?? 0)) * 1.1

  const panels: PanelSpec[] = [
    {
      label: 'FPS',
      value: (s) => s.fps,
      max: maxOf((s) => s.fps, thresholds.fps_min * 2),
      lines: [{ value: thresholds.fps_min, label: `min ${String(thresholds.fps_min)}` }],
      className: 'line--fps',
    },
    {
      label: 'Brightness',
      value: (s) => s.brightness,
      max: 255,
      lines: [
        { value: thresholds.brightness_min, label: `min ${String(thresholds.brightness_min)}` },
        { value: thresholds.brightness_max, label: `max ${String(thresholds.brightness_max)}` },
      ],
      className: 'line--brightness',
    },
    {
      label: 'Motion',
      value: (s) => s.motion,
      max: maxOf((s) => s.motion, thresholds.motion_max * 2),
      lines: [{ value: thresholds.motion_max, label: `max ${String(thresholds.motion_max)}` }],
      className: 'line--motion',
    },
  ]

  /** Polyline segments, broken at missing seconds and null values. */
  const segments = (spec: PanelSpec, top: number): string[] => {
    const y = (v: number) => top + PANEL_HEIGHT - (Math.min(v, spec.max) / spec.max) * PANEL_HEIGHT
    const result: string[] = []
    let current: string[] = []
    for (let t = fromT; t <= toT; t++) {
      const sample = byT.get(t)
      const value = sample ? spec.value(sample) : null
      if (value === null) {
        if (current.length) result.push(current.join(' '))
        current = []
      } else {
        current.push(`${x(t).toFixed(1)},${y(value).toFixed(1)}`)
      }
    }
    if (current.length) result.push(current.join(' '))
    return result
  }

  const stripsTop = panels.length * (PANEL_HEIGHT + GAP)
  const strip = (row: number, label: string, ok: (s: Sample) => boolean) => {
    const top = stripsTop + row * (STRIP_HEIGHT + 4)
    return (
      <g key={label}>
        <text x={LEFT - 6} y={top + STRIP_HEIGHT - 3} className="chart__label" textAnchor="end">
          {label}
        </text>
        <rect x={LEFT} y={top} width={plotWidth} height={STRIP_HEIGHT} className="strip--empty" />
        {visible.map((s) => (
          <rect
            key={s.t}
            x={cellLeft(s.t)}
            y={top}
            width={Math.max(1, cellWidth - 1)}
            height={STRIP_HEIGHT}
            className={ok(s) ? 'strip--ok' : 'strip--bad'}
          >
            <title>{`t=${String(s.t)}s`}</title>
          </rect>
        ))}
      </g>
    )
  }

  const height = stripsTop + 2 * (STRIP_HEIGHT + 4) + 18
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${String(WIDTH)} ${String(height)}`}
      role="img"
      aria-label="Per-second quality chart"
    >
      {panels.map((spec, i) => {
        const top = i * (PANEL_HEIGHT + GAP)
        const y = (v: number) => top + PANEL_HEIGHT - (v / spec.max) * PANEL_HEIGHT
        return (
          <g key={spec.label}>
            <rect
              x={LEFT}
              y={top}
              width={plotWidth}
              height={PANEL_HEIGHT}
              className="chart__panel"
            />
            <text x={LEFT - 6} y={top + 14} className="chart__label" textAnchor="end">
              {spec.label}
            </text>
            {spec.lines.map((line) => (
              <g key={line.label}>
                <line
                  x1={LEFT}
                  x2={WIDTH - RIGHT}
                  y1={y(line.value)}
                  y2={y(line.value)}
                  className="chart__threshold"
                />
                <text x={LEFT - 6} y={y(line.value) + 4} className="chart__tick" textAnchor="end">
                  {line.label}
                </text>
              </g>
            ))}
            {segments(spec, top).map((points) => (
              <polyline key={points} points={points} className={`chart__line ${spec.className}`} />
            ))}
          </g>
        )
      })}
      {strip(0, 'Face', (s) => s.face)}
      {strip(1, 'Verdict', (s) => s.verdict === 'good')}
      <text x={LEFT} y={height - 4} className="chart__tick">
        {`${String(fromT)} s`}
      </text>
      <text x={WIDTH - RIGHT} y={height - 4} className="chart__tick" textAnchor="end">
        {`${String(toT)} s`}
      </text>
    </svg>
  )
}
