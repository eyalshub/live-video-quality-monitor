/**
 * Extra image-quality insights ("beyond the spec", ADR-013). Informational only: they never
 * affect the verdict, the reason, the sample, the API or the database. Pure functions.
 * Image quality only: no emotion, age, gender, identity, gaze or attention.
 */

/** Luma at or below this counts as a crushed black. */
export const CRUSHED_LUMA_MAX = 5
/** Luma at or above this counts as a blown highlight. */
export const BLOWN_LUMA_MIN = 250
/** A face box this close (px) to the frame edge counts as touching it. */
const EDGE_TOLERANCE_PX = 1

/**
 * Sharpness: variance of the 4-neighbour Laplacian over the interior pixels of a luma frame.
 * Edges give large Laplacian values; blur flattens them, so the variance drops.
 */
export function laplacianVariance(luma: Float32Array, width: number, height: number): number {
  if (width < 3 || height < 3 || luma.length !== width * height) {
    throw new Error('laplacianVariance: frame must be at least 3x3 and match width*height')
  }
  let sum = 0
  let sumSquares = 0
  let count = 0
  for (let y = 1; y < height - 1; y++) {
    const row = y * width
    for (let x = 1; x < width - 1; x++) {
      const i = row + x
      const laplacian =
        4 * (luma[i] ?? 0) -
        (luma[i - 1] ?? 0) -
        (luma[i + 1] ?? 0) -
        (luma[i - width] ?? 0) -
        (luma[i + width] ?? 0)
      sum += laplacian
      sumSquares += laplacian * laplacian
      count += 1
    }
  }
  const mean = sum / count
  return Math.max(0, sumSquares / count - mean * mean)
}

export interface Clipping {
  /** % of pixels with luma <= CRUSHED_LUMA_MAX. */
  crushedPct: number
  /** % of pixels with luma >= BLOWN_LUMA_MIN. */
  blownPct: number
}

/** Exposure clipping: catches what a mean can hide (a bright window behind a dark face). */
export function clippingPct(luma: Float32Array): Clipping {
  if (luma.length === 0) throw new Error('clippingPct: empty frame')
  let crushed = 0
  let blown = 0
  for (const value of luma) {
    if (value <= CRUSHED_LUMA_MAX) crushed += 1
    else if (value >= BLOWN_LUMA_MIN) blown += 1
  }
  return { crushedPct: (crushed / luma.length) * 100, blownPct: (blown / luma.length) * 100 }
}

/** A face bounding box in pixels of the video frame. */
export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Framing {
  /** Face width as % of the frame width. */
  widthPct: number
  /** Distance of the face center from the frame center, % of the frame size (worst axis). */
  offsetPct: number
  /** The box touches a frame edge: part of the face is outside the picture. */
  cutOff: boolean
}

export function largestBox(boxes: readonly Box[]): Box | null {
  let best: Box | null = null
  for (const box of boxes) {
    if (!best || box.width * box.height > best.width * best.height) best = box
  }
  return best
}

export function measureFraming(box: Box, frameWidth: number, frameHeight: number): Framing {
  if (frameWidth <= 0 || frameHeight <= 0) throw new Error('measureFraming: empty frame')
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const offsetX = (Math.abs(centerX - frameWidth / 2) / frameWidth) * 100
  const offsetY = (Math.abs(centerY - frameHeight / 2) / frameHeight) * 100
  const cutOff =
    box.x <= EDGE_TOLERANCE_PX ||
    box.y <= EDGE_TOLERANCE_PX ||
    box.x + box.width >= frameWidth - EDGE_TOLERANCE_PX ||
    box.y + box.height >= frameHeight - EDGE_TOLERANCE_PX
  return {
    widthPct: (box.width / frameWidth) * 100,
    offsetPct: Math.max(offsetX, offsetY),
    cutOff,
  }
}

/** One second of insights (means over the frames of that second, 1 decimal). */
export interface InsightSample {
  t: number
  sharpness: number
  crushedPct: number
  blownPct: number
  /** null = no face in that second: no framing value, never a fake one. */
  framing: Framing | null
}

export interface InsightLimits {
  sharpnessMin: number
  clipPctMax: number
  faceMinWidthPct: number
  faceMaxOffsetPct: number
}

export type FramingWarning = 'move_closer' | 'center_face' | 'face_cut_off'

export interface InsightStatus {
  sharpness: 'ok' | 'blurry'
  clipping: ('crushed_shadows' | 'blown_highlights')[]
  /** 'no_face' when there is nothing to frame. */
  framing: 'no_face' | FramingWarning[]
}

export function insightStatus(sample: InsightSample, limits: InsightLimits): InsightStatus {
  const clipping: InsightStatus['clipping'] = []
  if (sample.crushedPct > limits.clipPctMax) clipping.push('crushed_shadows')
  if (sample.blownPct > limits.clipPctMax) clipping.push('blown_highlights')

  let framing: InsightStatus['framing'] = 'no_face'
  if (sample.framing) {
    framing = []
    if (sample.framing.widthPct < limits.faceMinWidthPct) framing.push('move_closer')
    if (sample.framing.offsetPct > limits.faceMaxOffsetPct) framing.push('center_face')
    if (sample.framing.cutOff) framing.push('face_cut_off')
  }
  return {
    sharpness: sample.sharpness < limits.sharpnessMin ? 'blurry' : 'ok',
    clipping,
    framing,
  }
}

export const INSIGHT_LABELS = {
  blurry: 'Blurry',
  crushed_shadows: 'Crushed shadows',
  blown_highlights: 'Blown highlights',
  move_closer: 'Move closer',
  center_face: 'Center your face',
  face_cut_off: 'Face cut off',
} as const
