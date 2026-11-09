/**
 * Offline face-detector evaluation (ADR-015). Reads face logs downloaded from the app (`?debug`),
 * replays them through the same filters the app uses and prints Markdown tables.
 *
 *   npm run face:eval -- <log.json | folder> ... [--target-fp 0.05] [--target-miss 0.02]
 *     [--eye-dist 0.2,0.7] [--size 5,95] [--temporal 3,0.3]
 *
 * The filter values are analysis inputs to compare, not app settings: an app setting only changes
 * through VITE_* config and a new ADR, with this report as the evidence.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import {
  chooseThreshold,
  type EvalLog,
  evaluate,
  frameScores,
  type Rates,
  ratio,
  rocAuc,
} from '../src/metrics/faceEval.ts'
import { type FaceFilterConfig, FILTER_PRESETS, filterVariants } from '../src/metrics/faceFilter.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'target-fp': { type: 'string', default: '0.05' },
    'target-miss': { type: 'string', default: '0.02' },
    'eye-dist': {
      type: 'string',
      default: `${String(FILTER_PRESETS.geometry.eyeDistMin)},${String(FILTER_PRESETS.geometry.eyeDistMax)}`,
    },
    size: {
      type: 'string',
      default: `${String(FILTER_PRESETS.sizePct.min)},${String(FILTER_PRESETS.sizePct.max)}`,
    },
    temporal: {
      type: 'string',
      default: `${String(FILTER_PRESETS.temporal.frames)},${String(FILTER_PRESETS.temporal.iouMin)}`,
    },
  },
})

const pair = (raw: string): [number, number] => {
  const [a, b] = raw.split(',').map(Number)
  if (a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b)) {
    throw new Error(`expected two comma-separated numbers, got "${raw}"`)
  }
  return [a, b]
}

const files = positionals.flatMap((p) =>
  statSync(p).isDirectory()
    ? readdirSync(p)
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(p, f))
    : [p],
)
if (files.length === 0) {
  console.error('usage: npm run face:eval -- <log.json | folder> ...')
  process.exit(1)
}
const logs = files.map((f) => JSON.parse(readFileSync(f, 'utf8')) as EvalLog)

const pct = (n: number, d: number) => {
  const r = ratio(n, d)
  return r === null ? '-' : `${(r * 100).toFixed(1)} % (${String(n)}/${String(d)})`
}
const missCell = (r: Rates) => pct(r.missed, r.faceSeconds)
const fpCell = (r: Rates) => pct(r.falseAlarms, r.noFaceSeconds)
const scoreOnly = (minScore: number): FaceFilterConfig => ({
  minScore,
  geometry: null,
  sizePct: null,
  temporal: null,
})

const out: string[] = ['## Data', '', '| Scenario | Face? | Logs | Frames |', '|---|---|---|---|']
for (const scenario of [...new Set(logs.map((l) => l.scenario))]) {
  const of = logs.filter((l) => l.scenario === scenario)
  const frames = of.reduce((n, l) => n + l.frames.length, 0)
  out.push(`| ${scenario} | ${String(of[0]?.face)} | ${String(of.length)} | ${String(frames)} |`)
}

const auc = rocAuc(frameScores(logs, true), frameScores(logs, false))
out.push(
  '',
  `Frame-level ROC AUC (best score per frame): **${auc === null ? '-' : auc.toFixed(3)}**`,
)

out.push('', '## Threshold sweep (score only)', '')
out.push('| Threshold | Missed seconds | False-alarm seconds |', '|---|---|---|')
const rows = []
for (let i = 2; i <= 19; i++) {
  const threshold = i / 20 // 0.10 … 0.95
  const rates = evaluate(logs, scoreOnly(threshold))
  rows.push({ threshold, rates })
  out.push(`| ${threshold.toFixed(2)} | ${missCell(rates)} | ${fpCell(rates)} |`)
}

const targetFp = Number(values['target-fp'])
const targetMiss = Number(values['target-miss'])
const chosen = chooseThreshold(rows, targetFp, targetMiss)
out.push(
  '',
  `Targets: false alarms ≤ ${String(targetFp * 100)} %, misses ≤ ${String(targetMiss * 100)} % (seconds).`,
)
out.push(
  chosen
    ? `Lowest threshold meeting the false-alarm target: **${chosen.threshold.toFixed(2)}**` +
        (chosen.meetsMissTarget ? ' (miss target met).' : ' (**miss target NOT met**).')
    : 'No threshold meets the false-alarm target with the score alone; see the filters below.',
)

// Compare the filters at the recorded (current) threshold and at the chosen one: a filter may let
// a lower threshold keep dark faces while still rejecting the hand.
const current = (logs[0] as { minConfidence?: number }).minConfidence ?? 0.5
const thresholds = [...new Set([current, chosen?.threshold ?? current])]
const [eyeDistMin, eyeDistMax] = pair(values['eye-dist'])
const [sizeMin, sizeMax] = pair(values.size)
const [frames, iouMin] = pair(values.temporal)
const geometry = { eyeDistMin, eyeDistMax }
const sizePct = { min: sizeMin, max: sizeMax }
const temporal = { frames, iouMin }
const scenarios = [...new Set(logs.map((l) => l.scenario))]

for (const minScore of thresholds) {
  const variants = filterVariants(minScore, { geometry, sizePct, temporal })
  const label = minScore === current ? 'current' : 'chosen'
  out.push('', `## Filters at threshold ${minScore.toFixed(2)} (${label})`, '')
  out.push(`| Variant | Missed seconds | False-alarm seconds | ${scenarios.join(' | ')} |`)
  out.push(`|---|---|---|${scenarios.map(() => '---').join('|')}|`)
  for (const [name, config] of variants) {
    const r = evaluate(logs, config)
    const perScenario = scenarios.map((s) => {
      const v = r.byScenario.get(s)
      return v ? pct(v.wrong, v.seconds) : '-'
    })
    out.push(`| ${name} | ${missCell(r)} | ${fpCell(r)} | ${perScenario.join(' | ')} |`)
  }
}
out.push(
  '',
  'Per-scenario cells are wrong seconds: missed faces for face scenarios, false alarms otherwise.',
  'Seconds within one log are correlated: treat the rates as descriptive, and prefer more logs per',
  'scenario over longer ones.',
)

console.log(out.join('\n'))
