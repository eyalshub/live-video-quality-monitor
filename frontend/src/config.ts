/**
 * Frontend configuration, read from VITE_* environment variables (see frontend/.env.example).
 * Every variable is required: no defaults in code (iron rule 3). Problems are collected and
 * reported together so a misconfigured deploy fails loudly with one clear message.
 */

export interface AppConfig {
  /** Backend base URL without a trailing slash. */
  apiBaseUrl: string
  /** How often the sample outbox is flushed to the backend. */
  sampleBatchIntervalMs: number
  /** Frame size used for brightness / motion analysis. */
  analysisWidth: number
  analysisHeight: number
  /** Per-request timeout; must cover a free backend's cold start. */
  apiTimeoutMs: number
}

export type RawEnv = Readonly<Record<string, unknown>>

export class ConfigError extends Error {
  readonly problems: readonly string[]

  constructor(problems: readonly string[]) {
    super(
      'Invalid frontend configuration (see frontend/.env.example):\n' +
        problems.map((problem) => `- ${problem}`).join('\n'),
    )
    this.name = 'ConfigError'
    this.problems = problems
  }
}

export function parseConfig(env: RawEnv): AppConfig {
  const problems: string[] = []

  const readString = (name: string): string | undefined => {
    const value = env[name]
    if (typeof value !== 'string' || value.trim() === '') {
      problems.push(`${name} is missing`)
      return undefined
    }
    return value.trim()
  }

  const readUrl = (name: string): string => {
    const value = readString(name)
    if (value === undefined) return ''
    let url: URL
    try {
      url = new URL(value)
    } catch {
      problems.push(`${name} must be an absolute http(s) URL (got "${value}")`)
      return ''
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      problems.push(`${name} must use http or https (got "${url.protocol}")`)
      return ''
    }
    return value.replace(/\/+$/, '')
  }

  const readInt = (name: string, min: number, max: number): number => {
    const value = readString(name)
    if (value === undefined) return Number.NaN
    if (!/^\d+$/.test(value)) {
      problems.push(`${name} must be a whole number (got "${value}")`)
      return Number.NaN
    }
    const parsed = Number(value)
    if (parsed < min || parsed > max) {
      problems.push(`${name} must be between ${String(min)} and ${String(max)} (got ${value})`)
    }
    return parsed
  }

  const config: AppConfig = {
    apiBaseUrl: readUrl('VITE_API_BASE_URL'),
    sampleBatchIntervalMs: readInt('VITE_SAMPLE_BATCH_INTERVAL_MS', 200, 60_000),
    analysisWidth: readInt('VITE_ANALYSIS_WIDTH', 16, 1920),
    analysisHeight: readInt('VITE_ANALYSIS_HEIGHT', 16, 1080),
    apiTimeoutMs: readInt('VITE_API_TIMEOUT_MS', 1_000, 300_000),
  }

  if (problems.length > 0) throw new ConfigError(problems)
  return config
}

let cached: AppConfig | undefined

/** The validated configuration of this build. Throws ConfigError if it is invalid. */
export function getConfig(): AppConfig {
  cached ??= parseConfig(import.meta.env)
  return cached
}
