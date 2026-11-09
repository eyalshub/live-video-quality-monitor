/**
 * Labelled face-detector log for the offline evaluation (ADR-015). Only numbers (scores, boxes,
 * keypoints) are kept, in this browser, and only saved when the user downloads the file. Never sent.
 */
import type { FaceCandidate } from '../metrics/faceFilter'

/** `?debug` in the URL turns on the face log, its overlay and the low candidate floor. */
export const FACE_DEBUG = new URLSearchParams(window.location.search).has('debug')

/** Scenario → is there really a face in the frame? */
export const FACE_SCENARIOS = {
  face_frontal: true,
  face_turned: true,
  face_dark: true,
  face_far: true,
  hand: false,
  object: false,
  empty: false,
} as const

export type FaceScenario = keyof typeof FACE_SCENARIOS

export interface FaceLogFrame {
  /** ms since the session started (t = 0, same clock as the samples). */
  t: number
  candidates: FaceCandidate[]
}

export interface FaceLog {
  scenario: FaceScenario
  face: boolean
  recordedAt: string
  frameWidth: number
  frameHeight: number
  /** VITE_FACE_MIN_CONFIDENCE at recording time, for reference. */
  minConfidence: number
  frames: FaceLogFrame[]
}

export function newFaceLog(
  scenario: FaceScenario,
  frameWidth: number,
  frameHeight: number,
  minConfidence: number,
): FaceLog {
  return {
    scenario,
    face: FACE_SCENARIOS[scenario],
    recordedAt: new Date().toISOString(),
    frameWidth,
    frameHeight,
    minConfidence,
    frames: [],
  }
}

export function downloadFaceLog(log: FaceLog): void {
  const blob = new Blob([JSON.stringify(log)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `face-log-${log.scenario}-${log.recordedAt.replace(/[:.]/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}
