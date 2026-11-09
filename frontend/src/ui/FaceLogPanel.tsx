import { useState } from 'react'

import { downloadFaceLog, FACE_SCENARIOS, type FaceScenario } from '../session/faceLog'
import type { MonitorController, Phase } from '../session/monitor'

/** Debug panel (`?debug` in the URL, ADR-015): label the next session, then download its face log. */
export function FaceLogPanel({
  controller,
  phase,
}: {
  controller: MonitorController
  phase: Phase
}) {
  const [scenario, setScenario] = useState<FaceScenario | ''>('')
  const idle = phase === 'ready' || phase === 'stopped'
  const log = phase === 'stopped' ? controller.getFaceLog() : null

  return (
    <div className="hint">
      <label>
        Face log scenario{' '}
        <select
          value={scenario}
          disabled={!idle}
          onChange={(e) => {
            const value = e.target.value as FaceScenario | ''
            setScenario(value)
            controller.setFaceLogScenario(value === '' ? null : value)
          }}
        >
          <option value="">off</option>
          {Object.keys(FACE_SCENARIOS).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>{' '}
      {log && (
        <button
          type="button"
          onClick={() => {
            downloadFaceLog(log)
          }}
        >
          Download face log ({String(log.frames.length)} frames)
        </button>
      )}
    </div>
  )
}
