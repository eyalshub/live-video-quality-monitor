import { describe, expect, it } from 'vitest'

import { checkMetrics, evaluateVerdict, failingReasons } from './verdict'

const THRESHOLDS = { fps_min: 15, brightness_min: 60, brightness_max: 200, motion_max: 20 }

describe('per-metric checks', () => {
  it('a sample failing several rules: verdict shows the first, checks show all', () => {
    const covered = { fps: 10, brightness: 42, motion: 35, face: false }
    expect(evaluateVerdict(covered, THRESHOLDS)).toEqual({ verdict: 'poor', reason: 'no_face' })
    expect(checkMetrics(covered, THRESHOLDS)).toEqual({
      face: 'no_face',
      brightness: 'too_dark',
      motion: 'hold_still',
      fps: 'low_fps',
    })
    expect(failingReasons(covered, THRESHOLDS)).toEqual([
      'no_face',
      'too_dark',
      'hold_still',
      'low_fps',
    ])
  })

  it('all OK', () => {
    const fine = { fps: 30, brightness: 130, motion: 2, face: true }
    expect(checkMetrics(fine, THRESHOLDS)).toEqual({
      face: 'ok',
      brightness: 'ok',
      motion: 'ok',
      fps: 'ok',
    })
    expect(failingReasons(fine, THRESHOLDS)).toEqual([])
  })

  it('too bright is reported on the brightness card', () => {
    expect(
      checkMetrics({ fps: 30, brightness: 230, motion: 2, face: true }, THRESHOLDS).brightness,
    ).toBe('too_bright')
  })

  it('null motion is "no data", not a failure', () => {
    const metrics = { fps: 30, brightness: 130, motion: null, face: true }
    expect(checkMetrics(metrics, THRESHOLDS).motion).toBe('no_data')
    expect(failingReasons(metrics, THRESHOLDS)).toEqual([])
  })

  it('boundaries pass', () => {
    const edge = { fps: 15, brightness: 60, motion: 20, face: true }
    expect(failingReasons(edge, THRESHOLDS)).toEqual([])
    expect(failingReasons({ ...edge, brightness: 200 }, THRESHOLDS)).toEqual([])
  })
})
