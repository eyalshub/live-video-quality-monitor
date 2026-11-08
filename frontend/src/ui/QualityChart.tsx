/**
 * Per-second quality chart: FPS, brightness and motion as lines (one panel each, with the threshold
 * lines), face and verdict as colored strips. Missing seconds and null motion are gaps, never 0.
 * Used for the live 30 s window and for a whole session in History (any length).
 *
 * Layout: panel titles sit above each panel; threshold labels sit in the left gutter and are
 * spread apart so they never overlap each other or a title. The SVG scales as a whole, so the
 * layout is the same at every width.
 */
import type { Sample, Thresholds } from '../metrics/verdict'
import { formatSeconds, spreadLabels, tickStep } from './chartLayout'

const WIDTH = 640
const LEFT = 58
const RIGHT = 8
const TITLE_HEIGHT = 16
const PANEL_HEIGHT = 64
const PANEL_GAP = 8
const STRIP_HEIGHT = 12
const STRIP_GAP = 4
const LABEL_GAP = 11
const AXIS_HEIGHT = 16

interface Props {
  samples: Sample[]
  thresholds: Thresholds
  /** Visible range of t (inclusive). */
  fromT: number
  toT: number
}

interface PanelSpec {
  title: string
  value: (sample: Sample) => number | null
  max: number
  limits: { value: number; label: string }[]
  className: string
}

export function QualityChart({ samples, thresholds, fromT, toT }: Props) {
  const seconds = Math.max(1, toT - fromT + 1)
  const plotWidth = WIDTH - LEFT - RIGHT
  /** One cell per second; lines pass through cell centers so they line up with the strips. */
  const cellWidth = plotWidth / seconds
  const cellLeft = (t: number) => LEFT + (t - fromT) * cellWidth
  const x = (t: number) => cellLeft(t) + cellWidth / 2
  const visible = samples.filter((s) => s.t >= fromT && s.t <= toT)
  const byT = new Map(visible.map((s) => [s.t, s]))

  const scaleMax = (pick: (s: Sample) => number | null, floor: number) =>
    Math.max(floor, ...visible.map((s) => pick(s) ?? 0)) * 1.1

  const panels: PanelSpec[] = [
    {
      title: 'FPS',
      value: (s) => s.fps,
      max: scaleMax((s) => s.fps, thresholds.fps_min * 2),
      limits: [{ value: thresholds.fps_min, label: `min ${String(thresholds.fps_min)}` }],
      className: 'line--fps',
    },
    {
      title: 'Brightness',
      value: (s) => s.brightness,
      max: 255,
      limits: [
        { value: thresholds.brightness_max, label: `max ${String(thresholds.brightness_max)}` },
        { value: thresholds.brightness_min, label: `min ${String(thresholds.brightness_min)}` },
      ],
      className: 'line--brightness',
    },
    {
      title: 'Motion',
      value: (s) => s.motion,
      max: scaleMax((s) => s.motion, thresholds.motion_max * 2),
      limits: [{ value: thresholds.motion_max, label: `max ${String(thresholds.motion_max)}` }],
      className: 'line--motion',
    },
  ]

  const panelTop = (i: number) => i * (TITLE_HEIGHT + PANEL_HEIGHT + PANEL_GAP) + TITLE_HEIGHT
  const stripsTop = panelTop(panels.length) - TITLE_HEIGHT + 2
  const axisTop = stripsTop + 2 * (STRIP_HEIGHT + STRIP_GAP)
  const height = axisTop + AXIS_HEIGHT

  const step = tickStep(seconds - 1)
  const ticks: number[] = []
  for (let t = Math.ceil(fromT / step) * step; t <= toT; t += step) ticks.push(t)

  const renderPanel = (spec: PanelSpec, i: number) => {
    const top = panelTop(i)
    const y = (v: number) => top + PANEL_HEIGHT - (Math.min(v, spec.max) / spec.max) * PANEL_HEIGHT
    const limitYs = spec.limits.map((limit) => y(limit.value))
    const labelYs = spreadLabels(
      limitYs.map((ly) => ly + 4),
      LABEL_GAP,
      top + 9,
      top + PANEL_HEIGHT + 2,
    )

    const segments: string[] = []
    let current: string[] = []
    for (let t = fromT; t <= toT; t++) {
      const sample = byT.get(t)
      const value = sample ? spec.value(sample) : null
      if (value === null) {
        if (current.length) segments.push(current.join(' '))
        current = []
      } else {
        current.push(`${x(t).toFixed(1)},${y(value).toFixed(1)}`)
      }
    }
    if (current.length) segments.push(current.join(' '))

    return (
      <g key={spec.title}>
        <text x={LEFT} y={top - 4} className="chart__title">
          {spec.title}
        </text>
        <rect x={LEFT} y={top} width={plotWidth} height={PANEL_HEIGHT} className="chart__panel" />
        {spec.limits.map((limit, k) => (
          <g key={limit.label}>
            <line
              x1={LEFT}
              x2={WIDTH - RIGHT}
              y1={limitYs[k]}
              y2={limitYs[k]}
              className="chart__threshold"
            />
            <text x={LEFT - 5} y={labelYs[k]} className="chart__tick" textAnchor="end">
              {limit.label}
            </text>
          </g>
        ))}
        {segments.map((points) =>
          points.includes(' ') ? (
            <polyline key={points} points={points} className={`chart__line ${spec.className}`} />
          ) : (
            // A single isolated second: draw a dot so it is visible.
            <circle
              key={points}
              cx={Number(points.split(',')[0])}
              cy={Number(points.split(',')[1])}
              r={2}
              className={`chart__dot ${spec.className}`}
            />
          ),
        )}
      </g>
    )
  }

  const renderStrip = (row: number, label: string, ok: (s: Sample) => boolean) => {
    const top = stripsTop + row * (STRIP_HEIGHT + STRIP_GAP)
    const width = cellWidth > 3 ? cellWidth - 1 : Math.max(cellWidth, 0.5)
    return (
      <g key={label}>
        <text x={LEFT - 5} y={top + STRIP_HEIGHT - 2} className="chart__tick" textAnchor="end">
          {label}
        </text>
        <rect x={LEFT} y={top} width={plotWidth} height={STRIP_HEIGHT} className="strip--empty" />
        {visible.map((s) => (
          <rect
            key={s.t}
            x={cellLeft(s.t)}
            y={top}
            width={width}
            height={STRIP_HEIGHT}
            className={ok(s) ? 'strip--ok' : 'strip--bad'}
          >
            <title>{`${formatSeconds(s.t)}: ${ok(s) ? 'OK' : 'not OK'}`}</title>
          </rect>
        ))}
      </g>
    )
  }

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${String(WIDTH)} ${String(height)}`}
      role="img"
      aria-label="Per-second quality chart"
    >
      {panels.map(renderPanel)}
      {renderStrip(0, 'Face', (s) => s.face)}
      {renderStrip(1, 'Verdict', (s) => s.verdict === 'good')}
      {ticks.map((t) => (
        <text
          key={t}
          x={x(t)}
          y={axisTop + 11}
          className="chart__tick"
          textAnchor={t === ticks[0] && x(t) - LEFT < 15 ? 'start' : 'middle'}
        >
          {formatSeconds(t)}
        </text>
      ))}
    </svg>
  )
}
