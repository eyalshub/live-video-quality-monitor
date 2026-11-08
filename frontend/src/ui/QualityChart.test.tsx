// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Sample } from '../metrics/verdict'
import { QualityChart } from './QualityChart'

const THRESHOLDS = { fps_min: 15, brightness_min: 60, brightness_max: 200, motion_max: 20 }

afterEach(cleanup)

function sample(t: number, overrides: Partial<Sample> = {}): Sample {
  return {
    t,
    fps: 30,
    brightness: 130,
    motion: 2,
    face: true,
    verdict: 'good',
    reason: null,
    ...overrides,
  }
}

function textY(container: HTMLElement, text: string): number {
  const node = [...container.querySelectorAll('text')].find((n) => n.textContent === text)
  if (!node) throw new Error(`no <text> "${text}"`)
  return Number(node.getAttribute('y'))
}

describe('QualityChart', () => {
  it('keeps every panel title clear of the threshold labels', () => {
    // Thresholds right at the top of their panels are the worst case.
    const tight = { fps_min: 60, brightness_min: 250, brightness_max: 255, motion_max: 254 }
    const { container } = render(
      <QualityChart samples={[sample(0)]} thresholds={tight} fromT={0} toT={29} />,
    )
    const pairs: [string, string[]][] = [
      ['FPS', ['min 60']],
      ['Brightness', ['max 255', 'min 250']],
      ['Motion', ['max 254']],
    ]
    for (const [title, labels] of pairs) {
      const titleY = textY(container, title)
      const labelYs = labels.map((label) => textY(container, label))
      for (const y of labelYs) expect(y - titleY).toBeGreaterThanOrEqual(11)
      if (labelYs.length === 2) {
        expect(Math.abs((labelYs[0] ?? 0) - (labelYs[1] ?? 0))).toBeGreaterThanOrEqual(11)
      }
    }
  })

  it('draws a whole long session with readable ticks', () => {
    const samples = Array.from({ length: 600 }, (_, t) => sample(t))
    const { container } = render(
      <QualityChart samples={samples} thresholds={THRESHOLDS} fromT={0} toT={599} />,
    )
    expect(container.querySelectorAll('.strip--ok')).toHaveLength(1200) // face + verdict
    const ticks = [...container.querySelectorAll('text')].map((n) => n.textContent)
    expect(ticks).toContain('0 s')
    expect(ticks).toContain('4:00') // 10 min span -> a tick every 2 min
  })

  it('breaks the line at a missing second and at null motion', () => {
    const samples = [sample(0), sample(1), sample(3), sample(4, { motion: null }), sample(5)]
    const { container } = render(
      <QualityChart samples={samples} thresholds={THRESHOLDS} fromT={0} toT={29} />,
    )
    // FPS: [0,1] and [3,4,5]. Motion: [0,1], [3] (dot), [5] (dot).
    expect(container.querySelectorAll('polyline.line--fps')).toHaveLength(2)
    expect(container.querySelectorAll('polyline.line--motion')).toHaveLength(1)
    expect(container.querySelectorAll('circle.line--motion')).toHaveLength(2)
  })

  it('colors the strips by face and verdict', () => {
    const samples = [sample(0), sample(1, { face: false, verdict: 'poor', reason: 'no_face' })]
    const { container } = render(
      <QualityChart samples={samples} thresholds={THRESHOLDS} fromT={0} toT={29} />,
    )
    expect(container.querySelectorAll('.strip--ok')).toHaveLength(2)
    expect(container.querySelectorAll('.strip--bad')).toHaveLength(2)
  })
})
