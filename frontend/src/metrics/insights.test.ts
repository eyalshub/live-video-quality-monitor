import { describe, expect, it } from 'vitest'

import {
  clippingPct,
  type InsightSample,
  insightStatus,
  laplacianVariance,
  largestBox,
  measureFraming,
} from './insights'

const W = 40
const H = 30

function frame(fill: (x: number, y: number) => number, width = W, height = H): Float32Array {
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[y * width + x] = fill(x, y)
  return out
}

/** 3x3 box blur (edges clamped), applied `passes` times. */
function blur(src: Float32Array, passes: number, width = W, height = H): Float32Array {
  let current = src
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(current.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const cx = Math.min(width - 1, Math.max(0, x + dx))
            const cy = Math.min(height - 1, Math.max(0, y + dy))
            sum += current[cy * width + cx] ?? 0
          }
        }
        next[y * width + x] = sum / 9
      }
    }
    current = next
  }
  return current
}

const checkerboard = frame((x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 200 : 50))

describe('laplacianVariance (sharpness)', () => {
  it('is 0 for a flat frame', () => {
    expect(
      laplacianVariance(
        frame(() => 128),
        W,
        H,
      ),
    ).toBe(0)
  })

  it('is 0 for a smooth linear gradient (no edges)', () => {
    expect(
      laplacianVariance(
        frame((x) => x * 4),
        W,
        H,
      ),
    ).toBeCloseTo(0, 6)
  })

  it('drops as the same picture gets blurrier', () => {
    const sharp = laplacianVariance(checkerboard, W, H)
    const soft = laplacianVariance(blur(checkerboard, 1), W, H)
    const blurry = laplacianVariance(blur(checkerboard, 4), W, H)
    expect(sharp).toBeGreaterThan(soft)
    expect(soft).toBeGreaterThan(blurry)
    expect(sharp / blurry).toBeGreaterThan(10)
  })

  it('rejects frames that are too small or the wrong size', () => {
    expect(() => laplacianVariance(new Float32Array(4), 2, 2)).toThrow()
    expect(() => laplacianVariance(new Float32Array(10), 4, 4)).toThrow()
  })
})

describe('clippingPct (exposure clipping)', () => {
  it('is 0 for a normally exposed frame', () => {
    expect(clippingPct(frame(() => 128))).toEqual({ crushedPct: 0, blownPct: 0 })
  })

  it('counts crushed blacks (<= 5) and blown highlights (>= 250) separately', () => {
    const luma = new Float32Array([0, 5, 6, 128, 249, 250, 255, 100, 100, 100])
    expect(clippingPct(luma)).toEqual({ crushedPct: 20, blownPct: 20 })
  })

  it('catches a bright window that the average hides', () => {
    // Left quarter blown out (window), rest a dark-ish face/room: mean looks fine.
    const backlit = frame((x) => (x < W / 4 ? 255 : 90))
    const mean = backlit.reduce((a, b) => a + b, 0) / backlit.length
    expect(mean).toBeGreaterThan(80)
    expect(mean).toBeLessThan(200)
    expect(clippingPct(backlit).blownPct).toBeCloseTo(25, 5)
  })
})

describe('face framing', () => {
  const FRAME_W = 640
  const FRAME_H = 480

  it('a centered face of a good size has no problems', () => {
    const f = measureFraming({ x: 240, y: 160, width: 160, height: 160 }, FRAME_W, FRAME_H)
    expect(f.widthPct).toBe(25)
    expect(f.offsetPct).toBe(0)
    expect(f.cutOff).toBe(false)
  })

  it('a small face is a small width %', () => {
    expect(
      measureFraming({ x: 300, y: 220, width: 64, height: 64 }, FRAME_W, FRAME_H).widthPct,
    ).toBe(10)
  })

  it('measures the offset from the center on the worst axis', () => {
    // center x = 480 → 160 px right of 320 → 25 % of the width
    const f = measureFraming({ x: 430, y: 190, width: 100, height: 100 }, FRAME_W, FRAME_H)
    expect(f.offsetPct).toBe(25)
  })

  it.each([
    { x: 0, y: 100, width: 150, height: 150 },
    { x: 100, y: 0, width: 150, height: 150 },
    { x: 500, y: 100, width: 140, height: 150 },
    { x: 100, y: 340, width: 150, height: 140 },
  ])('a box touching an edge is cut off: %o', (box) => {
    expect(measureFraming(box, FRAME_W, FRAME_H).cutOff).toBe(true)
  })

  it('largestBox picks the biggest face', () => {
    const small = { x: 0, y: 0, width: 10, height: 10 }
    const big = { x: 0, y: 0, width: 30, height: 20 }
    expect(largestBox([small, big])).toBe(big)
    expect(largestBox([])).toBeNull()
  })
})

describe('insightStatus', () => {
  const LIMITS = { sharpnessMin: 50, clipPctMax: 5, faceMinWidthPct: 20, faceMaxOffsetPct: 20 }
  const good: InsightSample = {
    t: 0,
    sharpness: 120,
    crushedPct: 0.5,
    blownPct: 1,
    framing: { widthPct: 28, offsetPct: 4, cutOff: false },
  }

  it('all fine', () => {
    expect(insightStatus(good, LIMITS)).toEqual({ sharpness: 'ok', clipping: [], framing: [] })
  })

  it('reports every problem', () => {
    const bad: InsightSample = {
      t: 0,
      sharpness: 12,
      crushedPct: 9,
      blownPct: 30,
      framing: { widthPct: 10, offsetPct: 35, cutOff: true },
    }
    expect(insightStatus(bad, LIMITS)).toEqual({
      sharpness: 'blurry',
      clipping: ['crushed_shadows', 'blown_highlights'],
      framing: ['move_closer', 'center_face', 'face_cut_off'],
    })
  })

  it('no face means no framing value, not a fake one', () => {
    expect(insightStatus({ ...good, framing: null }, LIMITS).framing).toBe('no_face')
  })

  it('limits themselves are OK', () => {
    const edge: InsightSample = {
      t: 0,
      sharpness: 50,
      crushedPct: 5,
      blownPct: 5,
      framing: { widthPct: 20, offsetPct: 20, cutOff: false },
    }
    expect(insightStatus(edge, LIMITS)).toEqual({ sharpness: 'ok', clipping: [], framing: [] })
  })
})
