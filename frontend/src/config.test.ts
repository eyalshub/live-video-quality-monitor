import { describe, expect, it } from 'vitest'

import { ConfigError, parseConfig } from './config'

const VALID = {
  VITE_API_BASE_URL: 'http://localhost:8000',
  VITE_SAMPLE_BATCH_INTERVAL_MS: '1500',
  VITE_ANALYSIS_WIDTH: '160',
  VITE_ANALYSIS_HEIGHT: '120',
  VITE_API_TIMEOUT_MS: '70000',
  VITE_FACE_DETECT_EVERY_N_FRAMES: '1',
  VITE_FACE_MIN_CONFIDENCE: '0.5',
  VITE_FACE_STABLE_FRAMES: '5',
  VITE_FACE_STABLE_IOU: '0.3',
  VITE_SHARPNESS_MIN: '50',
  VITE_CLIP_PCT_MAX: '5',
  VITE_FACE_MIN_WIDTH_PCT: '20',
  VITE_FACE_MAX_OFFSET_PCT: '20',
}

function problemsFor(env: Record<string, unknown>): readonly string[] {
  try {
    parseConfig(env)
  } catch (error) {
    if (error instanceof ConfigError) return error.problems
    throw error
  }
  throw new Error('expected parseConfig to throw')
}

describe('parseConfig', () => {
  it('parses a valid environment', () => {
    expect(parseConfig(VALID)).toEqual({
      apiBaseUrl: 'http://localhost:8000',
      sampleBatchIntervalMs: 1500,
      analysisWidth: 160,
      analysisHeight: 120,
      apiTimeoutMs: 70000,
      faceDetectEveryNFrames: 1,
      faceMinConfidence: 0.5,
      faceStableFrames: 5,
      faceStableIou: 0.3,
      insights: { sharpnessMin: 50, clipPctMax: 5, faceMinWidthPct: 20, faceMaxOffsetPct: 20 },
    })
  })

  it('turns the extra insights off when none of their variables is set', () => {
    const env: Record<string, string> = { ...VALID }
    delete env.VITE_SHARPNESS_MIN
    delete env.VITE_CLIP_PCT_MAX
    delete env.VITE_FACE_MIN_WIDTH_PCT
    delete env.VITE_FACE_MAX_OFFSET_PCT
    expect(parseConfig(env).insights).toBeNull()
  })

  it('rejects a partial extra-insight configuration', () => {
    const env: Record<string, string> = { ...VALID }
    delete env.VITE_CLIP_PCT_MAX
    expect(problemsFor(env)).toEqual([
      'Set all extra-insight variables or none; missing: VITE_CLIP_PCT_MAX',
    ])
  })

  it('strips trailing slashes from the API base URL', () => {
    const config = parseConfig({ ...VALID, VITE_API_BASE_URL: 'https://api.example.com/' })
    expect(config.apiBaseUrl).toBe('https://api.example.com')
  })

  it('reports every missing required variable at once', () => {
    const problems = problemsFor({})
    const optional = [
      'VITE_SHARPNESS_MIN',
      'VITE_CLIP_PCT_MAX',
      'VITE_FACE_MIN_WIDTH_PCT',
      'VITE_FACE_MAX_OFFSET_PCT',
    ]
    const required = Object.keys(VALID).filter((name) => !optional.includes(name))
    expect(problems).toHaveLength(required.length)
    for (const name of required) {
      expect(problems).toContain(`${name} is missing`)
    }
  })

  it('treats blank values as missing', () => {
    expect(problemsFor({ ...VALID, VITE_API_BASE_URL: '   ' })).toEqual([
      'VITE_API_BASE_URL is missing',
    ])
  })

  it.each([
    ['VITE_API_BASE_URL', 'localhost:8000'],
    ['VITE_API_BASE_URL', 'ftp://example.com'],
    ['VITE_SAMPLE_BATCH_INTERVAL_MS', '1.5'],
    ['VITE_SAMPLE_BATCH_INTERVAL_MS', 'soon'],
    ['VITE_SAMPLE_BATCH_INTERVAL_MS', '50'],
    ['VITE_ANALYSIS_WIDTH', '0'],
    ['VITE_ANALYSIS_HEIGHT', '-120'],
    ['VITE_API_TIMEOUT_MS', '999999999'],
    ['VITE_FACE_DETECT_EVERY_N_FRAMES', '0'],
    ['VITE_FACE_MIN_CONFIDENCE', '0'],
    ['VITE_FACE_MIN_CONFIDENCE', '1'],
    ['VITE_FACE_MIN_CONFIDENCE', '1.5'],
    ['VITE_FACE_MIN_CONFIDENCE', '-0.2'],
    ['VITE_FACE_MIN_CONFIDENCE', 'high'],
    ['VITE_CLIP_PCT_MAX', '101'],
    ['VITE_FACE_MAX_OFFSET_PCT', '51'],
  ])('rejects %s=%s', (name, value) => {
    const problems = problemsFor({ ...VALID, [name]: value })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(name)
  })

  it('puts every problem into the error message', () => {
    expect(() => parseConfig({})).toThrow(/VITE_API_BASE_URL is missing[\s\S]*VITE_API_TIMEOUT_MS/)
  })
})
