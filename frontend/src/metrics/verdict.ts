/**
 * The verdict rule (docs/data-model.md), identical to backend/app/services/verdict.py.
 * Both are tested against shared/verdict-cases.json.
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

/** First failing rule wins: no_face → too_dark → too_bright → hold_still → low_fps. */
export function evaluateVerdict(metrics: Metrics, thresholds: Thresholds): Judgement {
  if (!metrics.face) return { verdict: 'poor', reason: 'no_face' }
  if (metrics.brightness < thresholds.brightness_min) return { verdict: 'poor', reason: 'too_dark' }
  if (metrics.brightness > thresholds.brightness_max) {
    return { verdict: 'poor', reason: 'too_bright' }
  }
  if (metrics.motion !== null && metrics.motion > thresholds.motion_max) {
    return { verdict: 'poor', reason: 'hold_still' }
  }
  if (metrics.fps < thresholds.fps_min) return { verdict: 'poor', reason: 'low_fps' }
  return { verdict: 'good', reason: null }
}

export const REASON_LABELS: Record<Reason, string> = {
  no_face: 'No face',
  too_dark: 'Too dark',
  too_bright: 'Too bright',
  hold_still: 'Hold still',
  low_fps: 'Low FPS',
}
