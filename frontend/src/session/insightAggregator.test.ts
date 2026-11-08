import { describe, expect, it } from 'vitest'

import { type InsightFrame, InsightAggregator } from './insightAggregator'

const START = 1_000

function frame(timeMs: number, overrides: Partial<InsightFrame> = {}): InsightFrame {
  return {
    timeMs,
    sharpness: 100,
    crushedPct: 1,
    blownPct: 2,
    framing: { widthPct: 30, offsetPct: 5, cutOff: false },
    ...overrides,
  }
}

describe('InsightAggregator', () => {
  it('averages a second and emits it when the next second starts', () => {
    const agg = new InsightAggregator(START)
    agg.addFrame(frame(START, { sharpness: 100, crushedPct: 0 }))
    agg.addFrame(frame(START + 500, { sharpness: 50, crushedPct: 3 }))
    const [second] = agg.addFrame(frame(START + 1000))
    expect(second).toEqual({
      t: 0,
      sharpness: 75,
      crushedPct: 1.5,
      blownPct: 2,
      framing: { widthPct: 30, offsetPct: 5, cutOff: false },
    })
  })

  it('framing averages only frames where a face was found', () => {
    const agg = new InsightAggregator(START)
    agg.addFrame(frame(START, { framing: { widthPct: 20, offsetPct: 10, cutOff: false } }))
    agg.addFrame(frame(START + 100, { framing: undefined })) // detector skipped
    agg.addFrame(frame(START + 200, { framing: null })) // no face
    agg.addFrame(frame(START + 300, { framing: { widthPct: 30, offsetPct: 20, cutOff: true } }))
    const [second] = agg.flushCompleted(START + 1000)
    expect(second?.framing).toEqual({ widthPct: 25, offsetPct: 15, cutOff: true })
  })

  it('no face in the whole second -> framing null, never a fake value', () => {
    const agg = new InsightAggregator(START)
    agg.addFrame(frame(START, { framing: null }))
    expect(agg.flushCompleted(START + 1000)[0]?.framing).toBeNull()
  })

  it('discards the partial last second', () => {
    const agg = new InsightAggregator(START)
    agg.addFrame(frame(START))
    agg.discardPartial()
    expect(agg.flushCompleted(START + 5000)).toEqual([])
  })
})
