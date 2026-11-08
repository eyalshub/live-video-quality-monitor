import { describe, expect, it } from 'vitest'

import { computeLuma, meanAbsDifference, round1 } from './frame'

function rgbaOf(...pixels: [number, number, number][]): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flatMap(([r, g, b]) => [r, g, b, 255]))
}

describe('computeLuma', () => {
  it('uses the BT.601 weights', () => {
    const out = new Float32Array(3)
    computeLuma(rgbaOf([255, 0, 0], [0, 255, 0], [0, 0, 255]), out)
    expect(out[0]).toBeCloseTo(76.245, 3)
    expect(out[1]).toBeCloseTo(149.685, 3)
    expect(out[2]).toBeCloseTo(29.07, 3)
  })

  it('returns the mean over all pixels', () => {
    const out = new Float32Array(2)
    expect(computeLuma(rgbaOf([0, 0, 0], [255, 255, 255]), out)).toBeCloseTo(127.5, 3)
  })

  it('covers the full 0..255 range', () => {
    expect(computeLuma(rgbaOf([0, 0, 0]), new Float32Array(1))).toBe(0)
    expect(computeLuma(rgbaOf([255, 255, 255]), new Float32Array(1))).toBeCloseTo(255, 3)
  })

  it('ignores the alpha channel', () => {
    const transparent = new Uint8ClampedArray([100, 100, 100, 0])
    expect(computeLuma(transparent, new Float32Array(1))).toBeCloseTo(100, 3)
  })

  it('rejects a buffer of the wrong size', () => {
    expect(() => computeLuma(new Uint8ClampedArray(7), new Float32Array(2))).toThrow()
    expect(() => computeLuma(new Uint8ClampedArray(0), new Float32Array(0))).toThrow()
  })
})

describe('meanAbsDifference', () => {
  it('is 0 for identical frames', () => {
    const frame = new Float32Array([10, 20, 30])
    expect(meanAbsDifference(frame, frame.slice())).toBe(0)
  })

  it('averages absolute differences in both directions', () => {
    const current = new Float32Array([10, 50, 0, 255])
    const previous = new Float32Array([20, 40, 0, 0])
    expect(meanAbsDifference(current, previous)).toBeCloseTo((10 + 10 + 0 + 255) / 4, 5)
  })

  it('reaches 255 for black to white', () => {
    expect(meanAbsDifference(new Float32Array([255, 255]), new Float32Array([0, 0]))).toBe(255)
  })

  it('rejects frames of different sizes', () => {
    expect(() => meanAbsDifference(new Float32Array(2), new Float32Array(3))).toThrow()
  })
})

describe('round1', () => {
  it.each([
    [14.96, 15],
    [14.94, 14.9],
    [132.44, 132.4],
    [0, 0],
    [255, 255],
  ])('rounds %d to %d', (input, expected) => {
    expect(round1(input)).toBe(expected)
  })
})
