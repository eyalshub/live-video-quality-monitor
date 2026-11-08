// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { InsightSample } from '../metrics/insights'
import { InsightsPanel } from './InsightsPanel'

const LIMITS = { sharpnessMin: 50, clipPctMax: 5, faceMinWidthPct: 20, faceMaxOffsetPct: 20 }

afterEach(cleanup)

const item = (name: string) => screen.getByRole('listitem', { name })

describe('InsightsPanel', () => {
  it('shows raw values and OK when everything is fine', () => {
    const insight: InsightSample = {
      t: 3,
      sharpness: 140.2,
      crushedPct: 0.4,
      blownPct: 1.1,
      framing: { widthPct: 27.5, offsetPct: 3.2, cutOff: false },
    }
    render(<InsightsPanel insight={insight} limits={LIMITS} />)
    expect(item('Sharpness').textContent).toBe('Sharpness140.2 (min 50)OK')
    expect(item('Exposure clipping').textContent).toContain('shadows 0.4 % · highlights 1.1 %')
    expect(item('Face framing').textContent).toContain('width 27.5 % (min 20) · offset 3.2 %')
    expect(item('Face framing').className).toContain('insight--ok')
  })

  it('shows every warning', () => {
    const insight: InsightSample = {
      t: 3,
      sharpness: 12,
      crushedPct: 0,
      blownPct: 22,
      framing: { widthPct: 11, offsetPct: 30, cutOff: true },
    }
    render(<InsightsPanel insight={insight} limits={LIMITS} />)
    expect(item('Sharpness').textContent).toContain('Blurry')
    expect(item('Exposure clipping').textContent).toContain('Blown highlights')
    expect(item('Exposure clipping').textContent).not.toContain('Crushed shadows')
    expect(item('Face framing').textContent).toContain(
      'Move closer · Center your face · Face cut off',
    )
    expect(item('Sharpness').className).toContain('insight--bad')
  })

  it('no face: framing shows "—", never a fake value', () => {
    const insight: InsightSample = {
      t: 0,
      sharpness: 80,
      crushedPct: 0,
      blownPct: 0,
      framing: null,
    }
    render(<InsightsPanel insight={insight} limits={LIMITS} />)
    expect(item('Face framing').textContent).toBe('Face framingNo face—')
    expect(item('Face framing').className).toContain('insight--none')
  })

  it('says it is informational only', () => {
    render(<InsightsPanel insight={null} limits={LIMITS} />)
    expect(screen.getByText(/not part of the verdict and not saved/)).toBeTruthy()
  })
})
