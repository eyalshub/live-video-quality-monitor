/**
 * The verdict rule (docs/data-model.md), identical to backend/app/services/verdict.py.
 * Both are tested against shared/verdict-cases.json.
 *
 * Each metric is checked on its own (`checkMetrics`, used by the metric cards). The verdict is the
 * first failing check in priority order, so there is one source of threshold logic.
 */
import type { components } from '../api/schema'

export type Thresholds = components['schemas']['Thresholds']
export type Sample = components['schemas']['SampleIn']
export type Verdict = Sample['verdict']
export type Reason = NonNullable<Sample['reason']>

export interface Metrics {
  fps: number
  brightness: number
  /** null = not measurable (ADR-009): hold_still is skipped. */
  motion: number | null
  face: boolean
}

export interface Judgement {
  verdict: Verdict
  reason: Reason | null
}

/** Independent status of every metric. `no_data` = motion not measurable this second. */
export interface MetricChecks {
  face: 'ok' | 'no_face'
  brightness: 'ok' | 'too_dark' | 'too_bright'
  motion: 'ok' | 'hold_still' | 'no_data'
  fps: 'ok' | 'low_fps'
}

/** Boundaries are OK: brightness == min, motion == max and fps == min all pass. */
export function checkMetrics(metrics: Metrics, thresholds: Thresholds): MetricChecks {
  return {
    face: metrics.face ? 'ok' : 'no_face',
    brightness:
      metrics.brightness < thresholds.brightness_min
        ? 'too_dark'
        : metrics.brightness > thresholds.brightness_max
          ? 'too_bright'
          : 'ok',
    motion:
      metrics.motion === null
        ? 'no_data'
        : metrics.motion > thresholds.motion_max
          ? 'hold_still'
          : 'ok',
    fps: metrics.fps < thresholds.fps_min ? 'low_fps' : 'ok',
  }
}

/** Every failing reason, in priority order: no_face → too_dark/too_bright → hold_still → low_fps. */
export function failingReasons(metrics: Metrics, thresholds: Thresholds): Reason[] {
  const checks = checkMetrics(metrics, thresholds)
  const reasons: Reason[] = []
  if (checks.face !== 'ok') reasons.push(checks.face)
  if (checks.brightness !== 'ok') reasons.push(checks.brightness)
  if (checks.motion === 'hold_still') reasons.push(checks.motion)
  if (checks.fps !== 'ok') reasons.push(checks.fps)
  return reasons
}

/** The first failing rule is the reason. */
export function evaluateVerdict(metrics: Metrics, thresholds: Thresholds): Judgement {
  const [first] = failingReasons(metrics, thresholds)
  return first === undefined
    ? { verdict: 'good', reason: null }
    : { verdict: 'poor', reason: first }
}

export const REASON_LABELS: Record<Reason, string> = {
  no_face: 'No face',
  too_dark: 'Too dark',
  too_bright: 'Too bright',
  hold_still: 'Hold still',
  low_fps: 'Low FPS',
}
