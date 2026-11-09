import { useEffect, useRef } from 'react'

import { FILTER_PRESETS } from '../metrics/faceFilter'
import { type CandidateView, FaceDebugState, type SecondView } from '../session/faceDebug'
import type { MonitorController } from '../session/monitor'

const KEYPOINT_LABELS = ['eye R', 'eye L', 'nose', 'mouth', 'ear R', 'ear L']
const OK = '#22c55e'
const BAD = '#ef4444'

const mark = (ok: boolean) => (ok ? '✓' : '✗')

/**
 * `?debug` overlay (ADR-015): every face candidate with its score, keypoints, eye line and the result
 * of each filter, plus the last seconds per filter variant. Display only; draws on a canvas that sits
 * on the (mirrored) video, so React does not re-render per frame.
 */
export function FaceDebugOverlay({
  controller,
  minScore,
}: {
  controller: MonitorController
  minScore: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const state = new FaceDebugState(minScore, FILTER_PRESETS)
    const lastSeconds: SecondView[] = []
    controller.setFaceFrameListener((t, candidates, width, height) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const view = state.frame(t, candidates, width)
      if (view.completed) {
        lastSeconds.unshift(view.completed)
        lastSeconds.length = Math.min(lastSeconds.length, 3)
      }
      draw(ctx, width, height, view.candidates, lastSeconds)
    })
    return () => {
      controller.setFaceFrameListener(null)
    }
  }, [controller, minScore])

  return <canvas ref={canvasRef} className="face-debug" aria-hidden="true" />
}

/** Text is drawn flipped back, because the canvas is mirrored like the video. */
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(-1, 1)
  const w = ctx.measureText(value).width
  const h = parseInt(ctx.font, 10)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
  ctx.fillRect(-2, -h, w + 4, h * 1.3)
  ctx.fillStyle = color
  ctx.fillText(value, 0, 0)
  ctx.restore()
}

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  candidates: CandidateView[],
  lastSeconds: SecondView[],
) {
  ctx.clearRect(0, 0, width, height)
  const fontPx = Math.max(10, Math.round(width / 45))
  ctx.font = `${String(fontPx)}px ui-monospace, monospace`
  ctx.lineWidth = Math.max(2, width / 320)

  for (const c of candidates) {
    const { box, keypoints, score } = c.candidate
    const color = c.all ? OK : BAD
    ctx.strokeStyle = color
    ctx.strokeRect(box.x, box.y, box.width, box.height)

    const [eyeR, eyeL] = keypoints
    if (eyeR && eyeL) {
      // The eye line, extended: nose and mouth must both be on one side of it.
      const dx = eyeL.x - eyeR.x
      const dy = eyeL.y - eyeR.y
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)'
      ctx.beginPath()
      ctx.moveTo(eyeR.x - dx, eyeR.y - dy)
      ctx.lineTo(eyeL.x + dx, eyeL.y + dy)
      ctx.stroke()
    }
    keypoints.forEach((p, i) => {
      ctx.fillStyle = i < 4 ? '#facc15' : '#a3a3a3'
      ctx.beginPath()
      ctx.arc(p.x, p.y, ctx.lineWidth * 1.8, 0, Math.PI * 2)
      ctx.fill()
      if (i < 4) text(ctx, KEYPOINT_LABELS[i] ?? '', p.x - 6, p.y - 4, '#facc15')
    })

    // Labels anchored at the box's left edge on screen (= its right edge in the mirrored canvas).
    const left = box.x + box.width
    const flags = `score ${mark(c.score)} geo ${mark(c.geometry)} size ${mark(c.size)} time ${mark(c.temporal)}`
    text(ctx, `${score.toFixed(2)}  ${flags}`, left, box.y - fontPx * 0.4, color)
    if (c.details) {
      const d = c.details
      text(
        ctx,
        `eyes/box ${d.eyeRatio.toFixed(2)}  nose ${d.noseD.toFixed(0)}px  mouth ${d.mouthD.toFixed(0)}px`,
        left,
        box.y + box.height + fontPx * 1.2,
        '#e5e5e5',
      )
    }
  }

  // Bottom-left on screen: the last seconds per variant (newest first).
  const lines = lastSeconds.map(
    (s) =>
      `t=${String(s.second)}s  ` +
      s.results
        .map(([name, face]) => `${name.replace('+ ', '+')}:${face ? 'FACE' : '-'}`)
        .join('  '),
  )
  if (candidates.length === 0) lines.unshift('no candidates in this frame')
  lines.forEach((line, i) => {
    text(ctx, line, width - 6, height - 6 - (lines.length - 1 - i) * fontPx * 1.4, '#ffffff')
  })
}
