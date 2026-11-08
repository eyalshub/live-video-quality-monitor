/**
 * "Extra insights" (ADR-013): sharpness, exposure clipping and face framing. Informational only:
 * they never change the verdict and are not sent to the backend. Raw values are shown so the
 * limits can be calibrated.
 */
import {
  INSIGHT_LABELS,
  type InsightLimits,
  type InsightSample,
  insightStatus,
} from '../metrics/insights'

function row(title: string, value: string, warnings: string[] | null) {
  const state = warnings === null ? 'none' : warnings.length ? 'bad' : 'ok'
  return (
    <li key={title} className={`insight insight--${state}`} aria-label={title}>
      <span className="insight__title">{title}</span>
      <span className="insight__value">{value}</span>
      <span className="insight__status">
        {warnings === null ? '—' : warnings.length ? warnings.join(' · ') : 'OK'}
      </span>
    </li>
  )
}

export function InsightsPanel({
  insight,
  limits,
}: {
  insight: InsightSample | null
  limits: InsightLimits
}) {
  return (
    <section className="insights" aria-label="Extra insights">
      <h3>Extra insights</h3>
      {insight === null ? (
        <p className="hint">Waiting for the first full second…</p>
      ) : (
        <ul>
          {(() => {
            const status = insightStatus(insight, limits)
            const framing = insight.framing
            return [
              row(
                'Sharpness',
                `${insight.sharpness.toFixed(1)} (min ${String(limits.sharpnessMin)})`,
                status.sharpness === 'ok' ? [] : [INSIGHT_LABELS.blurry],
              ),
              row(
                'Exposure clipping',
                `shadows ${insight.crushedPct.toFixed(1)} % · highlights ${insight.blownPct.toFixed(1)} % (max ${String(limits.clipPctMax)} %)`,
                status.clipping.map((w) => INSIGHT_LABELS[w]),
              ),
              row(
                'Face framing',
                framing
                  ? `width ${framing.widthPct.toFixed(1)} % (min ${String(limits.faceMinWidthPct)}) · offset ${framing.offsetPct.toFixed(1)} % (max ${String(limits.faceMaxOffsetPct)})`
                  : 'No face',
                status.framing === 'no_face' ? null : status.framing.map((w) => INSIGHT_LABELS[w]),
              ),
            ]
          })()}
        </ul>
      )}
      <p className="hint">Informational only: not part of the verdict and not saved.</p>
    </section>
  )
}
