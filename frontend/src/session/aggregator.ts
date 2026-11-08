/**
 * Turns per-frame measurements into one sample per whole second (pure, clock passed in).
 *
 * - t = whole seconds since the session started.
 * - fps = number of frames processed in that second (never the camera's advertised rate).
 * - brightness / motion = mean over the frames of that second; motion ignores frames without a
 *   previous frame, and is null if no frame in the second has one (ADR-009).
 * - face = true if any checked frame in that second had a face.
 * - Values are rounded to 1 decimal, then judged (ADR-003).
 * - A second with no frames produces no sample. The partial last second at Stop is discarded.
 */
import { round1 } from '../metrics/frame'
import { evaluateVerdict, type Sample, type Thresholds } from '../metrics/verdict'

export interface FrameMeasurement {
  /** performance.now()-based time of the frame, ms. */
  timeMs: number
  brightness: number
  motion: number | null
  /** null = the face detector did not run on this frame. */
  face: boolean | null
}

interface Bucket {
  t: number
  frames: number
  brightnessSum: number
  motionSum: number
  motionFrames: number
  faceChecks: number
  faceSeen: boolean
}

export class SecondAggregator {
  private bucket: Bucket | null = null
  /** Seconds that ended without a usable sample (e.g. the face detector never ran). */
  skippedSeconds = 0

  private readonly startMs: number
  private readonly thresholds: Thresholds

  constructor(startMs: number, thresholds: Thresholds) {
    this.startMs = startMs
    this.thresholds = thresholds
  }

  secondOf(timeMs: number): number {
    return Math.floor((timeMs - this.startMs) / 1000)
  }

  /** Frames already counted in the second that `timeMs` belongs to. */
  framesInSecondOf(timeMs: number): number {
    const t = this.secondOf(timeMs)
    return this.bucket?.t === t ? this.bucket.frames : 0
  }

  /** Add a frame; returns the sample of the previous second if this frame starts a new one. */
  addFrame(frame: FrameMeasurement): Sample[] {
    if (frame.timeMs < this.startMs) return []
    const t = this.secondOf(frame.timeMs)
    const completed: Sample[] = []
    if (this.bucket && t > this.bucket.t) {
      completed.push(...this.close())
    }
    if (this.bucket && t < this.bucket.t) return completed // out-of-order frame: ignore
    this.bucket ??= {
      t,
      frames: 0,
      brightnessSum: 0,
      motionSum: 0,
      motionFrames: 0,
      faceChecks: 0,
      faceSeen: false,
    }
    const bucket = this.bucket
    bucket.frames += 1
    bucket.brightnessSum += frame.brightness
    if (frame.motion !== null) {
      bucket.motionSum += frame.motion
      bucket.motionFrames += 1
    }
    if (frame.face !== null) {
      bucket.faceChecks += 1
      bucket.faceSeen ||= frame.face
    }
    return completed
  }

  /** Close the current second if `nowMs` is past its end (frames may have stopped arriving). */
  flushCompleted(nowMs: number): Sample[] {
    if (this.bucket && this.secondOf(nowMs) > this.bucket.t) return this.close()
    return []
  }

  /** Drop the unfinished current second (Stop): a partial second would under-report FPS. */
  discardPartial(): void {
    this.bucket = null
  }

  private close(): Sample[] {
    const bucket = this.bucket
    this.bucket = null
    if (!bucket || bucket.frames === 0) return []
    if (bucket.faceChecks === 0) {
      // No face result for this second: we cannot claim face or no face. Never invent one.
      this.skippedSeconds += 1
      return []
    }
    const fps = round1(bucket.frames)
    const brightness = round1(bucket.brightnessSum / bucket.frames)
    const motion = bucket.motionFrames > 0 ? round1(bucket.motionSum / bucket.motionFrames) : null
    const face = bucket.faceSeen
    const { verdict, reason } = evaluateVerdict({ fps, brightness, motion, face }, this.thresholds)
    return [{ t: bucket.t, fps, brightness, motion, face, verdict, reason }]
  }
}
