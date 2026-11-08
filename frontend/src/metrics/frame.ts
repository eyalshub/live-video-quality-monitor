/**
 * Per-frame measurements on raw RGBA pixels. Pure functions: no DOM, no state.
 */

/**
 * Luma of every pixel (ITU-R BT.601): 0.299 R + 0.587 G + 0.114 B, range 0..255.
 * Writes the per-pixel luma into `out` (reused between frames) and returns the mean.
 */
export function computeLuma(rgba: Uint8ClampedArray, out: Float32Array): number {
  const pixels = out.length
  if (pixels === 0 || rgba.length !== pixels * 4) {
    throw new Error(`computeLuma: expected ${String(pixels * 4)} bytes, got ${String(rgba.length)}`)
  }
  let sum = 0
  for (let i = 0, j = 0; i < pixels; i++, j += 4) {
    const luma = 0.299 * (rgba[j] ?? 0) + 0.587 * (rgba[j + 1] ?? 0) + 0.114 * (rgba[j + 2] ?? 0)
    out[i] = luma
    sum += luma
  }
  return sum / pixels
}

/** Motion: mean absolute luma difference between two frames of the same size, range 0..255. */
export function meanAbsDifference(current: Float32Array, previous: Float32Array): number {
  const pixels = current.length
  if (pixels === 0 || previous.length !== pixels) {
    throw new Error('meanAbsDifference: frames must be non-empty and the same size')
  }
  let sum = 0
  for (let i = 0; i < pixels; i++) {
    sum += Math.abs((current[i] ?? 0) - (previous[i] ?? 0))
  }
  return sum / pixels
}

/** Round to 1 decimal. Values are rounded before the verdict is computed (ADR-003). */
export function round1(value: number): number {
  return Math.round(value * 10) / 10
}
