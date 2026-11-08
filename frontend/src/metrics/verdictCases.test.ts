/**
 * The shared verdict case table (shared/verdict-cases.json) is read by both test suites.
 * Phase 2 adds the TypeScript verdict function and runs it over every case here.
 */
import { describe, expect, it } from 'vitest'

import table from '../../../shared/verdict-cases.json'

const REASONS = ['no_face', 'too_dark', 'too_bright', 'hold_still', 'low_fps'] as const

describe('shared verdict case table', () => {
  it('is readable from the frontend and well-formed', () => {
    expect(table.cases.length).toBeGreaterThan(0)
    for (const testCase of table.cases) {
      const { input, thresholds, expected } = testCase
      expect(typeof input.fps).toBe('number')
      expect(typeof input.brightness).toBe('number')
      expect(input.motion === null || typeof input.motion === 'number').toBe(true)
      expect(typeof input.face).toBe('boolean')
      expect(Object.keys(thresholds).sort()).toEqual(
        ['brightness_max', 'brightness_min', 'fps_min', 'motion_max'].sort(),
      )
      if (expected.verdict === 'good') expect(expected.reason).toBeNull()
      else expect(REASONS).toContain(expected.reason)
    }
  })

  it('covers every reason and motion = null', () => {
    const reasons = new Set(table.cases.map((testCase) => testCase.expected.reason))
    for (const reason of REASONS) expect(reasons).toContain(reason)
    expect(table.cases.some((testCase) => testCase.input.motion === null)).toBe(true)
  })
})
