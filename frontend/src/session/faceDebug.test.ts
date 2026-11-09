import { describe, expect, it } from 'vitest'

import { type FaceCandidate, FILTER_PRESETS } from '../metrics/faceFilter'
import { FaceDebugState } from './faceDebug'

const box = { x: 100, y: 100, width: 200, height: 200 }
const facePoints = [
  { x: 160, y: 160 },
  { x: 240, y: 160 },
  { x: 200, y: 200 },
  { x: 200, y: 240 },
]
// Same points with nose and mouth swapped: the mouth is closer to the eyes than the nose.
const handPoints = [facePoints[0], facePoints[1], facePoints[3], facePoints[2]] as typeof facePoints

const cand = (score: number, keypoints = facePoints): FaceCandidate => ({ score, box, keypoints })

describe('FaceDebugState', () => {
  it('flags each filter per candidate', () => {
    const state = new FaceDebugState(0.5, FILTER_PRESETS)
    const [view] = state.frame(0, [cand(0.8, handPoints)], 640).candidates
    expect(view).toMatchObject({
      score: true,
      geometry: false,
      size: true,
      temporal: false,
      all: false,
    })
    expect(view?.details?.eyeRatio).toBeCloseTo(0.4)
  })

  it('reports each completed second per variant (any frame counts)', () => {
    const state = new FaceDebugState(0.5, FILTER_PRESETS)
    for (let t = 0; t < 1000; t += 100) state.frame(t, [cand(0.8, handPoints)], 640)
    const { completed } = state.frame(1000, [], 640)
    expect(completed?.second).toBe(0)
    expect(Object.fromEntries(completed?.results ?? [])).toEqual({
      'score only': true,
      '+ geometry': false,
      '+ size': true,
      '+ temporal': true, // the box held still for 3 frames
      'all filters': false,
    })
  })

  it('a still, well-formed face passes every variant once the temporal window is full', () => {
    const state = new FaceDebugState(0.5, FILTER_PRESETS)
    state.frame(0, [cand(0.9)], 640)
    state.frame(33, [cand(0.9)], 640)
    const [view] = state.frame(66, [cand(0.9)], 640).candidates
    expect(view).toMatchObject({
      score: true,
      geometry: true,
      size: true,
      temporal: true,
      all: true,
    })
  })
})
