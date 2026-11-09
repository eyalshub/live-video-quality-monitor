import { describe, expect, it } from 'vitest'

import {
  chooseThreshold,
  type EvalLog,
  evaluate,
  frameScores,
  rocAuc,
  secondsPresent,
} from './faceEval'
import type { FaceCandidate, FaceFilterConfig } from './faceFilter'

const face = (score: number): FaceCandidate => ({
  score,
  box: { x: 0, y: 0, width: 100, height: 100 },
  keypoints: [],
})

/** One frame every 100 ms; `scoreAt(i)` is the frame's only candidate score, or null for none. */
const log = (
  scenario: string,
  isFace: boolean,
  n: number,
  scoreAt: (i: number) => number | null,
): EvalLog => ({
  scenario,
  face: isFace,
  frameWidth: 640,
  frames: Array.from({ length: n }, (_, i) => {
    const s = scoreAt(i)
    return { t: i * 100, candidates: s === null ? [] : [face(s)] }
  }),
})

const scoreOnly = (minScore: number): FaceFilterConfig => ({
  minScore,
  geometry: null,
  sizePct: null,
  temporal: null,
})

describe('secondsPresent', () => {
  it('reports a second when any frame passes, and drops the partial last second', () => {
    // 25 frames = seconds 0, 1 full and second 2 partial. One 0.9 frame in second 1 only.
    const l = log('hand', false, 25, (i) => (i === 13 ? 0.9 : 0.2))
    expect(secondsPresent(l, scoreOnly(0.5))).toEqual([false, true])
    expect(secondsPresent(l, scoreOnly(0.95))).toEqual([false, false])
  })
})

describe('evaluate', () => {
  it('counts missed faces and false alarms per second and per scenario', () => {
    const logs = [
      log('face_frontal', true, 31, (i) => (i < 10 ? null : 0.8)), // second 0 missed, 1 and 2 seen
      log('hand', false, 31, (i) => (i === 5 ? 0.7 : null)), // one false-alarm second of 3
    ]
    const r = evaluate(logs, scoreOnly(0.5))
    expect([r.missed, r.faceSeconds, r.falseAlarms, r.noFaceSeconds]).toEqual([1, 3, 1, 3])
    expect(r.byScenario.get('hand')).toEqual({ wrong: 1, seconds: 3 })
  })
})

describe('rocAuc', () => {
  it('is 1 for perfect separation, 0.5 for identical scores, null without both classes', () => {
    expect(rocAuc([0.8, 0.9], [0.1, 0.2])).toBe(1)
    expect(rocAuc([0.5, 0.5], [0.5, 0.5])).toBe(0.5)
    expect(rocAuc([0.9, 0.3], [0.5])).toBe(0.5)
    expect(rocAuc([], [0.1])).toBeNull()
  })

  it('scores a frame by its best candidate, 0 when it has none', () => {
    expect(frameScores([log('empty', false, 2, (i) => (i === 0 ? 0.4 : null))], false)).toEqual([
      0.4, 0,
    ])
  })
})

describe('chooseThreshold', () => {
  it('takes the lowest threshold meeting the false-alarm target and reports the miss target', () => {
    const logs = [
      log('face_frontal', true, 41, () => 0.8),
      log('hand', false, 41, (i) => (i % 10 === 0 ? 0.6 : null)), // a 0.6 frame every second
    ]
    const rows = [0.5, 0.7, 0.9].map((threshold) => ({
      threshold,
      rates: evaluate(logs, scoreOnly(threshold)),
    }))
    expect(chooseThreshold(rows, 0.05, 0.02)).toEqual({ threshold: 0.7, meetsMissTarget: true })
    // At 0.9 the face is missed too, but 0.7 already meets the target, so 0.9 is never chosen.
    expect(chooseThreshold(rows.slice(0, 1), 0.05, 0.02)).toBeNull()
  })
})
