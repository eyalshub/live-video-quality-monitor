import { describe, expect, it } from 'vitest'

import { formatSeconds, spreadLabels, tickStep } from './chartLayout'

describe('spreadLabels', () => {
  it('leaves labels that are far apart untouched', () => {
    expect(spreadLabels([10, 50], 12, 0, 100)).toEqual([10, 50])
  })

  it('pushes close labels apart by at least minGap, keeping order', () => {
    const [a, b] = spreadLabels([20, 24], 12, 0, 100)
    expect(a).toBe(20)
    expect(b).toBe(32)
  })

  it('keeps the input order of the result', () => {
    const [low, high] = spreadLabels([60, 55], 12, 0, 100)
    expect(high).toBe(55)
    expect(low).toBe(67)
  })

  it('stays inside the range by shifting the stack up', () => {
    const ys = spreadLabels([95, 96, 97], 10, 0, 100)
    expect(Math.max(...ys)).toBeLessThanOrEqual(100)
    const sorted = [...ys].sort((x, y) => x - y)
    expect((sorted[1] ?? 0) - (sorted[0] ?? 0)).toBeGreaterThanOrEqual(10)
    expect((sorted[2] ?? 0) - (sorted[1] ?? 0)).toBeGreaterThanOrEqual(10)
  })

  it('clamps labels outside the range', () => {
    expect(spreadLabels([-5, 200], 10, 0, 100)).toEqual([0, 100])
  })
})

describe('tickStep', () => {
  it.each([
    [29, 5],
    [60, 10],
    [300, 60],
    [1800, 300],
    [7200, 900],
  ])('span %d s -> step %d s', (span, step) => {
    expect(tickStep(span)).toBe(step)
  })
})

describe('formatSeconds', () => {
  it.each([
    [0, '0 s'],
    [45, '45 s'],
    [75, '1:15'],
    [600, '10:00'],
    [3725, '1:02:05'],
  ])('%d -> %s', (seconds, text) => {
    expect(formatSeconds(seconds)).toBe(text)
  })
})
