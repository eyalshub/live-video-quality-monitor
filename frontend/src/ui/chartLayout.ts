/** Pure layout helpers for QualityChart (testable without a DOM). */

/**
 * Move label positions apart so no two are closer than `minGap`, keeping them inside
 * [min, max] and in their original order. Input/output are y coordinates (same order as input).
 */
export function spreadLabels(ys: number[], minGap: number, min: number, max: number): number[] {
  const order = ys
    .map((y, i) => ({ y: Math.min(max, Math.max(min, y)), i }))
    .sort((a, b) => a.y - b.y)
  for (let k = 1; k < order.length; k++) {
    const prev = order[k - 1]
    const cur = order[k]
    if (prev && cur && cur.y - prev.y < minGap) cur.y = prev.y + minGap
  }
  // If pushed past the bottom, shift the stack back up.
  const last = order.at(-1)
  if (last && last.y > max) {
    let overflow = last.y - max
    for (let k = order.length - 1; k >= 0 && overflow > 0; k--) {
      const cur = order[k]
      if (!cur) continue
      cur.y -= overflow
      const prev = order[k - 1]
      overflow = prev ? Math.max(0, prev.y + minGap - cur.y) : 0
    }
  }
  const out = new Array<number>(ys.length)
  for (const { y, i } of order) out[i] = y
  return out
}

const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]

/** Smallest "nice" tick step (seconds) that gives at most `maxTicks` intervals. */
export function tickStep(spanSeconds: number, maxTicks = 8): number {
  for (const step of STEPS) if (spanSeconds / step <= maxTicks) return step
  return Math.ceil(spanSeconds / maxTicks / 3600) * 3600
}

/** 45 → "45 s", 75 → "1:15", 3725 → "1:02:05". */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${String(seconds)} s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${String(h)}:${pad(m)}:${pad(s)}` : `${String(m)}:${pad(s)}`
}
