import { describe, expect, it } from 'vitest'

import { ConfigError, parseConfig } from './config'

const VALID = {
  VITE_API_BASE_URL: 'http://localhost:8000',
  VITE_SAMPLE_BATCH_INTERVAL_MS: '1500',
  VITE_ANALYSIS_WIDTH: '160',
  VITE_ANALYSIS_HEIGHT: '120',
  VITE_API_TIMEOUT_MS: '70000',
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
    })
  })

  it('strips trailing slashes from the API base URL', () => {
    const config = parseConfig({ ...VALID, VITE_API_BASE_URL: 'https://api.example.com/' })
    expect(config.apiBaseUrl).toBe('https://api.example.com')
  })

  it('reports every missing variable at once', () => {
    const problems = problemsFor({})
    expect(problems).toHaveLength(Object.keys(VALID).length)
    for (const name of Object.keys(VALID)) {
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
  ])('rejects %s=%s', (name, value) => {
    const problems = problemsFor({ ...VALID, [name]: value })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(name)
  })

  it('puts every problem into the error message', () => {
    expect(() => parseConfig({})).toThrow(/VITE_API_BASE_URL is missing[\s\S]*VITE_API_TIMEOUT_MS/)
  })
})
