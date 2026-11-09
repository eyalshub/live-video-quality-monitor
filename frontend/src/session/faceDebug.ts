/**
 * Live view of the face filters for the `?debug` overlay (ADR-015). Runs every filter variant on each
 * frame with the same code as `npm run face:eval`, and reports each completed second per variant
 * under the task's rule (a second has a face if any of its frames has one). Display only.
 */
import {
  type FaceCandidate,
  type FaceFilterConfig,
  type FilterPresets,
  filterFrame,
  filterVariants,
  type GeometryDetails,
  geometryDetails,
  plausibleGeometry,
  sizeOk,
  TemporalFilter,
} from '../metrics/faceFilter'

export interface CandidateView {
  candidate: FaceCandidate
  details: GeometryDetails | null
  score: boolean
  geometry: boolean
  size: boolean
  /** Confirmed by the temporal filter (on the score-only boxes). */
  temporal: boolean
  /** Passes every filter together. */
  all: boolean
}

export interface SecondView {
  second: number
  /** Per variant, in `filterVariants` order: was a face reported in this second? */
  results: [string, boolean][]
}

interface Variant {
  name: string
  config: FaceFilterConfig
  temporal: TemporalFilter | null
}

export class FaceDebugState {
  private readonly presets: FilterPresets
  private readonly minScore: number
  private readonly variants: Variant[]
  private second: number | null = null
  private seen: boolean[]

  constructor(minScore: number, presets: FilterPresets) {
    this.minScore = minScore
    this.presets = presets
    this.variants = filterVariants(minScore, presets).map(([name, config]) => ({
      name,
      config,
      temporal: config.temporal
        ? new TemporalFilter(config.temporal.frames, config.temporal.iouMin)
        : null,
    }))
    this.seen = this.variants.map(() => false)
  }

  /** One detector frame. Returns the per-candidate view and, when a second just ended, its result. */
  frame(
    t: number,
    candidates: FaceCandidate[],
    width: number,
  ): { candidates: CandidateView[]; completed: SecondView | null } {
    const second = Math.floor(t / 1000)
    let completed: SecondView | null = null
    if (this.second !== null && second !== this.second) {
      completed = {
        second: this.second,
        results: this.variants.map((v, i) => [v.name, this.seen[i] ?? false]),
      }
      this.seen = this.variants.map(() => false)
    }
    this.second = second

    const passedBy = this.variants.map((v, i) => {
      const passed = filterFrame(candidates, width, v.config, v.temporal)
      if (passed.length > 0) this.seen[i] = true
      return new Set(passed)
    })
    const byName = (name: string) => passedBy[this.variants.findIndex((v) => v.name === name)]
    const { geometry, sizePct } = this.presets
    return {
      completed,
      candidates: candidates.map((c) => ({
        candidate: c,
        details: geometryDetails(c),
        score: c.score >= this.minScore,
        geometry: geometry ? plausibleGeometry(c, geometry) : true,
        size: sizePct ? sizeOk(c.box, width, sizePct) : true,
        temporal: byName('+ temporal')?.has(c) ?? false,
        all: byName('all filters')?.has(c) ?? false,
      })),
    }
  }
}
