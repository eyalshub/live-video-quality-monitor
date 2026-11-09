/**
 * Offline evaluation of the face filters on labelled face logs (ADR-015). Pure; used by
 * scripts/face-eval.ts. The ".ts" import lets Node run this file directly.
 */
import {
  type FaceCandidate,
  type FaceFilterConfig,
  filterFrame,
  TemporalFilter,
} from './faceFilter.ts'

/** The fields of a face log (session/faceLog.ts) the evaluation needs. */
export interface EvalLog {
  scenario: string
  face: boolean
  frameWidth: number
  frames: { t: number; candidates: FaceCandidate[] }[]
}

/**
 * Per full second: was a face reported in at least one frame (the task's rule)?
 * The last second of a log is partial and dropped, like the app does at Stop.
 */
export function secondsPresent(log: EvalLog, config: FaceFilterConfig): boolean[] {
  const temporal = config.temporal
    ? new TemporalFilter(config.temporal.frames, config.temporal.iouMin)
    : null
  const bySecond = new Map<number, boolean>()
  for (const frame of log.frames) {
    const second = Math.floor(frame.t / 1000)
    const present = filterFrame(frame.candidates, log.frameWidth, config, temporal).length > 0
    bySecond.set(second, (bySecond.get(second) ?? false) || present)
  }
  const last = Math.max(...bySecond.keys())
  return [...bySecond].filter(([s]) => s !== last).map(([, present]) => present)
}

export interface Rates {
  /** Seconds with a real face where none was reported / all such seconds. */
  missed: number
  faceSeconds: number
  /** Seconds without a face where one was reported / all such seconds. */
  falseAlarms: number
  noFaceSeconds: number
  /** Per scenario: wrong seconds (missed or false alarm) / seconds. */
  byScenario: Map<string, { wrong: number; seconds: number }>
}

export function evaluate(logs: readonly EvalLog[], config: FaceFilterConfig): Rates {
  const rates: Rates = {
    missed: 0,
    faceSeconds: 0,
    falseAlarms: 0,
    noFaceSeconds: 0,
    byScenario: new Map(),
  }
  for (const log of logs) {
    const seconds = secondsPresent(log, config)
    const wrong = seconds.filter((present) => present !== log.face).length
    if (log.face) {
      rates.missed += wrong
      rates.faceSeconds += seconds.length
    } else {
      rates.falseAlarms += wrong
      rates.noFaceSeconds += seconds.length
    }
    const s = rates.byScenario.get(log.scenario) ?? { wrong: 0, seconds: 0 }
    rates.byScenario.set(log.scenario, {
      wrong: s.wrong + wrong,
      seconds: s.seconds + seconds.length,
    })
  }
  return rates
}

export const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d)

/** Highest candidate score of each frame; a frame without a candidate scores 0 (below the floor). */
export function frameScores(logs: readonly EvalLog[], face: boolean): number[] {
  return logs
    .filter((l) => l.face === face)
    .flatMap((l) => l.frames.map((f) => Math.max(0, ...f.candidates.map((c) => c.score))))
}

/** ROC AUC = P(face frame scores higher than a no-face frame), ties count half (Mann–Whitney). */
export function rocAuc(positive: readonly number[], negative: readonly number[]): number | null {
  if (positive.length === 0 || negative.length === 0) return null
  const all = [
    ...positive.map((v) => ({ v, pos: true })),
    ...negative.map((v) => ({ v, pos: false })),
  ]
  all.sort((a, b) => a.v - b.v)
  let rankSumPos = 0
  for (let i = 0; i < all.length;) {
    let j = i
    while (j < all.length && all[j]?.v === all[i]?.v) j++
    const avgRank = (i + 1 + j) / 2 // ranks i+1..j share their average
    for (let k = i; k < j; k++) if (all[k]?.pos) rankSumPos += avgRank
    i = j
  }
  const n1 = positive.length
  return (rankSumPos - (n1 * (n1 + 1)) / 2) / (n1 * negative.length)
}

/**
 * The lowest threshold whose false-alarm rate meets the target (lowest = fewest missed faces), and
 * whether its miss rate meets the miss target too. Null when no threshold meets the false-alarm target.
 */
export function chooseThreshold(
  rows: readonly { threshold: number; rates: Rates }[],
  targetFalseAlarm: number,
  targetMiss: number,
): { threshold: number; meetsMissTarget: boolean } | null {
  const ok = rows
    .filter((r) => (ratio(r.rates.falseAlarms, r.rates.noFaceSeconds) ?? 0) <= targetFalseAlarm)
    .sort((a, b) => a.threshold - b.threshold)[0]
  if (!ok) return null
  return {
    threshold: ok.threshold,
    meetsMissTarget: (ratio(ok.rates.missed, ok.rates.faceSeconds) ?? 0) <= targetMiss,
  }
}
