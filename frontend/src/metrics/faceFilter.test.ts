import { describe, expect, it } from 'vitest'

import {
  type FaceCandidate,
  type FaceFilterConfig,
  filterFrame,
  iou,
  plausibleGeometry,
  sizeOk,
  TemporalFilter,
} from './faceFilter'

const box = { x: 100, y: 100, width: 200, height: 200 }
// Upright face in a 200 px box: eyes 80 px apart (0.4 of the width), nose below, mouth lower.
const upright = [
  { x: 160, y: 160 },
  { x: 240, y: 160 },
  { x: 200, y: 200 },
  { x: 200, y: 240 },
]

const candidate = (overrides: Partial<FaceCandidate> = {}): FaceCandidate => ({
  score: 0.9,
  box,
  keypoints: upright,
  ...overrides,
})

const limits = { eyeDistMin: 0.2, eyeDistMax: 0.7 }

describe('plausibleGeometry', () => {
  it('accepts an upright face', () => {
    expect(plausibleGeometry(candidate(), limits)).toBe(true)
  })

  it('accepts a rolled head and swapped eye labels', () => {
    // Rotate 90°: eyes stacked vertically, nose and mouth to one side.
    const rolled = [
      { x: 160, y: 160 },
      { x: 160, y: 240 },
      { x: 120, y: 200 },
      { x: 80, y: 200 },
    ]
    expect(plausibleGeometry(candidate({ keypoints: rolled }), limits)).toBe(true)
    const swapped = [upright[1], upright[0], upright[2], upright[3]] as typeof upright
    expect(plausibleGeometry(candidate({ keypoints: swapped }), limits)).toBe(true)
  })

  it('rejects a mouth closer to the eyes than the nose, or on the other side', () => {
    const mouthAboveNose = [upright[0], upright[1], { x: 200, y: 240 }, { x: 200, y: 200 }]
    expect(
      plausibleGeometry(candidate({ keypoints: mouthAboveNose as typeof upright }), limits),
    ).toBe(false)
    const opposite = [upright[0], upright[1], { x: 200, y: 200 }, { x: 200, y: 120 }]
    expect(plausibleGeometry(candidate({ keypoints: opposite as typeof upright }), limits)).toBe(
      false,
    )
  })

  it('rejects eyes too close or too far for the box, and missing keypoints', () => {
    expect(plausibleGeometry(candidate(), { eyeDistMin: 0.5, eyeDistMax: 0.7 })).toBe(false)
    expect(plausibleGeometry(candidate(), { eyeDistMin: 0.1, eyeDistMax: 0.3 })).toBe(false)
    expect(plausibleGeometry(candidate({ keypoints: upright.slice(0, 3) }), limits)).toBe(false)
  })
})

describe('sizeOk', () => {
  it('checks the box width as a percent of the frame, bounds included', () => {
    expect(sizeOk(box, 640, { min: 5, max: 95 })).toBe(true) // 31 %
    expect(sizeOk(box, 4000, { min: 5, max: 95 })).toBe(true) // exactly 5 %
    expect(sizeOk(box, 5000, { min: 5, max: 95 })).toBe(false) // 4 %
    expect(sizeOk(box, 0, { min: 5, max: 95 })).toBe(false)
  })
})

describe('iou', () => {
  it('is 1 for the same box, 0 apart, and 1/3 for a half shift', () => {
    expect(iou(box, box)).toBe(1)
    expect(iou(box, { ...box, x: 400 })).toBe(0)
    expect(iou(box, { ...box, x: 200 })).toBeCloseTo(1 / 3)
  })
})

describe('TemporalFilter', () => {
  it('confirms a box only after it held still for `frames` detector runs', () => {
    const filter = new TemporalFilter(3, 0.3)
    expect(filter.update([box])).toEqual([])
    expect(filter.update([box])).toEqual([])
    expect(filter.update([box])).toEqual([box])
  })

  it('rejects a box that jumps (a waving hand) and a gap', () => {
    const filter = new TemporalFilter(3, 0.3)
    filter.update([box])
    filter.update([{ ...box, x: 400 }])
    expect(filter.update([box])).toEqual([])
    filter.update([])
    expect(filter.update([box])).toEqual([])
  })

  it('with one frame confirms immediately', () => {
    expect(new TemporalFilter(1, 0.3).update([box])).toEqual([box])
  })
})

describe('filterFrame', () => {
  const config: FaceFilterConfig = { minScore: 0.5, geometry: null, sizePct: null, temporal: null }

  it('keeps candidates at or above the score threshold', () => {
    const low = candidate({ score: 0.49 })
    const edge = candidate({ score: 0.5 })
    expect(filterFrame([low, edge], 640, config, null)).toEqual([edge])
  })

  it('applies geometry and size when enabled', () => {
    const hand = candidate({
      keypoints: [upright[0], upright[1], upright[3], upright[2]] as typeof upright,
    })
    const withGeometry = { ...config, geometry: limits }
    expect(filterFrame([hand], 640, withGeometry, null)).toEqual([])
    expect(
      filterFrame([candidate()], 640, { ...config, sizePct: { min: 40, max: 95 } }, null),
    ).toEqual([])
  })
})
