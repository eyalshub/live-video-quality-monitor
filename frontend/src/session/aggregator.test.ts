import { describe, expect, it } from 'vitest'

import { type FrameMeasurement, SecondAggregator } from './aggregator'

const THRESHOLDS = { fps_min: 15, brightness_min: 60, brightness_max: 200, motion_max: 20 }
const START = 10_000

function frame(timeMs: number, overrides: Partial<FrameMeasurement> = {}): FrameMeasurement {
  return { timeMs, brightness: 130, motion: 2, face: true, ...overrides }
}

/** n frames spread evenly over second t. */
function framesInSecond(t: number, n: number, overrides: Partial<FrameMeasurement> = {}) {
  return Array.from({ length: n }, (_, i) =>
    frame(START + t * 1000 + Math.floor((i * 1000) / n), overrides),
  )
}

function feed(aggregator: SecondAggregator, frames: FrameMeasurement[]) {
  return frames.flatMap((f) => aggregator.addFrame(f))
}

describe('SecondAggregator', () => {
  it('emits a sample only when the next second starts', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    expect(feed(aggregator, framesInSecond(0, 30))).toEqual([])
    const [sample] = aggregator.addFrame(frame(START + 1000))
    expect(sample).toEqual({
      t: 0,
      fps: 30,
      brightness: 130,
      motion: 2,
      face: true,
      verdict: 'good',
      reason: null,
    })
  })

  it('counts processed frames as fps', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    feed(aggregator, framesInSecond(0, 12))
    const [sample] = aggregator.flushCompleted(START + 1000)
    expect(sample?.fps).toBe(12)
    expect(sample?.reason).toBe('low_fps')
  })

  it('averages brightness and motion, rounded to 1 decimal', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    feed(aggregator, [
      frame(START + 0, { brightness: 100, motion: 1 }),
      frame(START + 300, { brightness: 100.25, motion: 2 }),
      frame(START + 600, { brightness: 100.5, motion: 4 }),
    ])
    const [sample] = aggregator.flushCompleted(START + 1000)
    expect(sample?.brightness).toBe(100.3)
    expect(sample?.motion).toBe(2.3)
  })

  it('judges the rounded values (ADR-003): 59.96 rounds to 60.0, which is OK', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    feed(aggregator, framesInSecond(0, 20, { brightness: 59.96 }))
    const [sample] = aggregator.flushCompleted(START + 1000)
    expect(sample?.brightness).toBe(60)
    expect(sample?.verdict).toBe('good')
  })

  it('excludes frames without a previous frame from motion', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    feed(aggregator, [frame(START, { motion: null }), frame(START + 500, { motion: 10 })])
    expect(aggregator.flushCompleted(START + 1000)[0]?.motion).toBe(10)
  })

  it('reports motion null when no frame had a previous frame (ADR-009)', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    aggregator.addFrame(frame(START, { motion: null }))
    const [sample] = aggregator.flushCompleted(START + 1000)
    expect(sample?.motion).toBeNull()
    expect(sample?.reason).toBe('low_fps') // 1 frame; hold_still skipped
  })

  it('face is true if any checked frame had a face', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    feed(aggregator, [
      ...framesInSecond(0, 19, { face: false }),
      frame(START + 990, { face: true }),
    ])
    expect(aggregator.flushCompleted(START + 1000)[0]?.face).toBe(true)
  })

  it('no face in any checked frame gives no_face', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    feed(aggregator, framesInSecond(0, 20, { face: false }))
    expect(aggregator.flushCompleted(START + 1000)[0]?.reason).toBe('no_face')
  })

  it('frames the detector skipped do not count as no face', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    feed(aggregator, [
      frame(START, { face: true }),
      ...framesInSecond(0, 20, { face: null }).slice(1),
    ])
    expect(aggregator.flushCompleted(START + 1000)[0]?.face).toBe(true)
  })

  it('skips a second where the face detector never ran, instead of inventing a value', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    feed(aggregator, framesInSecond(0, 20, { face: null }))
    expect(aggregator.flushCompleted(START + 1000)).toEqual([])
    expect(aggregator.skippedSeconds).toBe(1)
  })

  it('produces no sample for seconds without frames (gap in the timeline)', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    const emitted = feed(aggregator, [
      ...framesInSecond(0, 20),
      ...framesInSecond(3, 20),
      frame(START + 4000),
    ])
    expect(emitted.map((s) => s.t)).toEqual([0, 3])
  })

  it('flushCompleted does nothing while the second is still running', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    feed(aggregator, framesInSecond(0, 20))
    expect(aggregator.flushCompleted(START + 999)).toEqual([])
    expect(aggregator.flushCompleted(START + 1000)).toHaveLength(1)
    expect(aggregator.flushCompleted(START + 5000)).toEqual([])
  })

  it('discards the partial last second at Stop', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    feed(aggregator, framesInSecond(0, 30))
    aggregator.addFrame(frame(START + 1100))
    aggregator.discardPartial()
    expect(aggregator.flushCompleted(START + 9000)).toEqual([])
  })

  it('tracks frames in the current second (for every-Nth-frame face detection)', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    expect(aggregator.framesInSecondOf(START)).toBe(0)
    feed(aggregator, framesInSecond(0, 5))
    expect(aggregator.framesInSecondOf(START + 900)).toBe(5)
    expect(aggregator.framesInSecondOf(START + 1000)).toBe(0)
  })

  it('ignores frames from before the session started', () => {
    const aggregator = new SecondAggregator(START, THRESHOLDS)
    aggregator.addFrame(frame(START - 10))
    expect(aggregator.framesInSecondOf(START)).toBe(0)
  })
})
