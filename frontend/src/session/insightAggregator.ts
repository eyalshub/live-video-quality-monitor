/**
 * Per-second aggregation of the extra insights (ADR-013). Deliberately separate from
 * SecondAggregator: insights can never leak into a Sample, the verdict or the outbox.
 */
import { round1 } from '../metrics/frame'
import type { Framing, InsightSample } from '../metrics/insights'

export interface InsightFrame {
  timeMs: number
  sharpness: number
  crushedPct: number
  blownPct: number
  /** null = detector ran and found no face; undefined = detector did not run on this frame. */
  framing: Framing | null | undefined
}

interface Bucket {
  t: number
  frames: number
  sharpness: number
  crushed: number
  blown: number
  faceFrames: number
  widthPct: number
  offsetPct: number
  cutOffFrames: number
}

export class InsightAggregator {
  private bucket: Bucket | null = null
  private readonly startMs: number

  constructor(startMs: number) {
    this.startMs = startMs
  }

  private secondOf(timeMs: number): number {
    return Math.floor((timeMs - this.startMs) / 1000)
  }

  addFrame(frame: InsightFrame): InsightSample[] {
    if (frame.timeMs < this.startMs) return []
    const t = this.secondOf(frame.timeMs)
    const done = this.bucket && t > this.bucket.t ? this.close() : []
    if (this.bucket && t < this.bucket.t) return done
    this.bucket ??= {
      t,
      frames: 0,
      sharpness: 0,
      crushed: 0,
      blown: 0,
      faceFrames: 0,
      widthPct: 0,
      offsetPct: 0,
      cutOffFrames: 0,
    }
    const b = this.bucket
    b.frames += 1
    b.sharpness += frame.sharpness
    b.crushed += frame.crushedPct
    b.blown += frame.blownPct
    if (frame.framing) {
      b.faceFrames += 1
      b.widthPct += frame.framing.widthPct
      b.offsetPct += frame.framing.offsetPct
      if (frame.framing.cutOff) b.cutOffFrames += 1
    }
    return done
  }

  flushCompleted(nowMs: number): InsightSample[] {
    return this.bucket && this.secondOf(nowMs) > this.bucket.t ? this.close() : []
  }

  discardPartial(): void {
    this.bucket = null
  }

  private close(): InsightSample[] {
    const b = this.bucket
    this.bucket = null
    if (!b || b.frames === 0) return []
    return [
      {
        t: b.t,
        sharpness: round1(b.sharpness / b.frames),
        crushedPct: round1(b.crushed / b.frames),
        blownPct: round1(b.blown / b.frames),
        framing:
          b.faceFrames === 0
            ? null
            : {
                widthPct: round1(b.widthPct / b.faceFrames),
                offsetPct: round1(b.offsetPct / b.faceFrames),
                // Cut off for most of the face frames of the second.
                cutOff: b.cutOffFrames * 2 >= b.faceFrames,
              },
      },
    ]
  }
}
