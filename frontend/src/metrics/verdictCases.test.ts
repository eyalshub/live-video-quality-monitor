/**
 * The shared verdict case table (shared/verdict-cases.json) is the single source of truth for
 * both the Python and the TypeScript verdict rule.
 */
import { describe, expect, it } from 'vitest'

import table from '../../../shared/verdict-cases.json'
import { evaluateVerdict } from './verdict'

const REASONS = ['no_face', 'too_dark', 'too_bright', 'hold_still', 'low_fps'] as const

describe('shared verdict case table', () => {
  it('is well-formed', () => {
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

describe('evaluateVerdict', () => {
  it.each(table.cases.map((testCase) => [testCase.name, testCase] as const))(
    '%s',
    (_name, testCase) => {
      expect(evaluateVerdict(testCase.input, testCase.thresholds)).toEqual(testCase.expected)
    },
  )
})
