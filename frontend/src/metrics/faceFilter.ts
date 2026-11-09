/**
 * Face candidate filters (ADR-015). Pure and self-contained (no imports), so the offline evaluation
 * (scripts/face-eval.ts, run by Node) executes exactly the code the app runs. Coordinates are video
 * pixels.
 */

export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** One detection as the model returned it, before our filters. */
export interface FaceCandidate {
  score: number
  box: FaceBox
  /** BlazeFace order: right eye, left eye, nose tip, mouth, right ear, left ear. */
  keypoints: Point[]
}

export interface FaceFilterConfig {
  minScore: number
  /** Distance between the eyes as a fraction of the box width; null = geometry check off. */
  geometry: { eyeDistMin: number; eyeDistMax: number } | null
  /** Box width as % of the frame width; null = size check off. */
  sizePct: { min: number; max: number } | null
  /** A box counts only if it overlaps a box in each of the previous `frames - 1` frames. */
  temporal: { frames: number; iouMin: number } | null
}

/** The numbers the geometry check uses; shown by the debug overlay. Null without 4 usable points. */
export interface GeometryDetails {
  /** Eye distance / box width. */
  eyeRatio: number
  /** Signed distances of the nose and the mouth from the eye line, in pixels. */
  noseD: number
  mouthD: number
}

export function geometryDetails(candidate: FaceCandidate): GeometryDetails | null {
  const [rightEye, leftEye, nose, mouth] = candidate.keypoints
  if (!rightEye || !leftEye || !nose || !mouth || candidate.box.width <= 0) return null
  const ex = leftEye.x - rightEye.x
  const ey = leftEye.y - rightEye.y
  const eyeDist = Math.hypot(ex, ey)
  if (eyeDist === 0) return null
  // Signed distance from the eye line, along its normal.
  const midX = (rightEye.x + leftEye.x) / 2
  const midY = (rightEye.y + leftEye.y) / 2
  const toLine = (p: Point) => ((p.x - midX) * -ey + (p.y - midY) * ex) / eyeDist
  return { eyeRatio: eyeDist / candidate.box.width, noseD: toLine(nose), mouthD: toLine(mouth) }
}

/**
 * Face layout, tolerant to head roll and to which side the model calls "right": the nose and the
 * mouth lie on the same side of the eye line, the mouth further from it than the nose, and the
 * eye spacing fits the box. A hand rarely puts its four points in that order.
 */
export function plausibleGeometry(
  candidate: FaceCandidate,
  limits: { eyeDistMin: number; eyeDistMax: number },
): boolean {
  const d = geometryDetails(candidate)
  if (!d || d.eyeRatio < limits.eyeDistMin || d.eyeRatio > limits.eyeDistMax) return false
  return d.noseD * d.mouthD > 0 && Math.abs(d.mouthD) > Math.abs(d.noseD)
}

export function sizeOk(box: FaceBox, frameWidth: number, limits: { min: number; max: number }) {
  if (frameWidth <= 0) return false
  const pct = (box.width / frameWidth) * 100
  return pct >= limits.min && pct <= limits.max
}

export function iou(a: FaceBox, b: FaceBox): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  const inter = w * h
  return inter / (a.width * a.height + b.width * b.height - inter)
}

/** Stateful: keeps the boxes of the last `frames - 1` detector runs. One instance per session. */
export class TemporalFilter {
  private readonly frames: number
  private readonly iouMin: number
  private history: FaceBox[][] = []

  constructor(frames: number, iouMin: number) {
    this.frames = frames
    this.iouMin = iouMin
  }

  /** Boxes of this frame that overlap some box in every one of the previous `frames - 1` frames. */
  update(boxes: FaceBox[]): FaceBox[] {
    const full = this.history.length >= this.frames - 1
    const confirmed = full
      ? boxes.filter((b) =>
          this.history.every((prev) => prev.some((p) => iou(b, p) >= this.iouMin)),
        )
      : []
    if (this.frames > 1) {
      this.history.push(boxes)
      if (this.history.length > this.frames - 1) this.history.shift()
    }
    return confirmed
  }
}

/** Candidates of one frame that pass every enabled filter. */
export function filterFrame(
  candidates: readonly FaceCandidate[],
  frameWidth: number,
  config: FaceFilterConfig,
  temporal: TemporalFilter | null,
): FaceCandidate[] {
  const { geometry, sizePct } = config
  const passed = candidates.filter(
    (c) =>
      c.score >= config.minScore &&
      (!geometry || plausibleGeometry(c, geometry)) &&
      (!sizePct || sizeOk(c.box, frameWidth, sizePct)),
  )
  if (!temporal) return passed
  const kept = new Set(temporal.update(passed.map((c) => c.box)))
  return passed.filter((c) => kept.has(c.box))
}

/**
 * Analysis presets (ADR-015): the defaults of `npm run face:eval` and of the `?debug` overlay, so both
 * show the same thing. Not app settings: a filter goes live only via VITE_* config and a new ADR.
 */
export const FILTER_PRESETS = {
  geometry: { eyeDistMin: 0.2, eyeDistMax: 0.7 },
  sizePct: { min: 5, max: 95 },
  temporal: { frames: 3, iouMin: 0.3 },
}

export type FilterPresets = Pick<FaceFilterConfig, 'geometry' | 'sizePct' | 'temporal'>

/** The variants every comparison shows, in order: each filter alone, then all together. */
export function filterVariants(minScore: number, p: FilterPresets): [string, FaceFilterConfig][] {
  const scoreOnly = { minScore, geometry: null, sizePct: null, temporal: null }
  return [
    ['score only', scoreOnly],
    ['+ geometry', { ...scoreOnly, geometry: p.geometry }],
    ['+ size', { ...scoreOnly, sizePct: p.sizePct }],
    ['+ temporal', { ...scoreOnly, temporal: p.temporal }],
    ['all filters', { minScore, ...p }],
  ]
}
