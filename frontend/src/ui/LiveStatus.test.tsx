// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Sample } from '../metrics/verdict'
import { MetricCards, VerdictBanner } from './LiveStatus'

const THRESHOLDS = { fps_min: 15, brightness_min: 60, brightness_max: 200, motion_max: 20 }

afterEach(cleanup)

function sample(overrides: Partial<Sample>): Sample {
  return {
    t: 0,
    fps: 30,
    brightness: 130,
    motion: 2,
    face: true,
    verdict: 'good',
    reason: null,
    ...overrides,
  }
}

describe('camera covered: several rules fail at once', () => {
  const covered = sample({
    fps: 10,
    brightness: 42,
    motion: 35,
    face: false,
    verdict: 'poor',
    reason: 'no_face',
  })

  it('verdict shows the first reason and lists the others', () => {
    render(<VerdictBanner sample={covered} thresholds={THRESHOLDS} />)
    expect(screen.getByText('Poor: no face')).toBeTruthy()
    expect(screen.getByText('Also failing: too dark, hold still, low fps')).toBeTruthy()
  })

  it('every card shows its own status with value and limit', () => {
    render(<MetricCards sample={covered} thresholds={THRESHOLDS} />)
    const card = (name: string) => screen.getByRole('listitem', { name })
    expect(card('Brightness').textContent).toContain('42.0 — Too dark (min 60)')
    expect(card('FPS').textContent).toContain('10 — Low FPS (min 15)')
    expect(card('Motion').textContent).toContain('35.0 — Hold still (max 20)')
    expect(within(card('Face')).getByText(/No face/)).toBeTruthy()
    for (const name of ['Brightness', 'FPS', 'Motion', 'Face']) {
      expect(card(name).className).toContain('metric--bad')
    }
  })
})

describe('MetricCards', () => {
  it('shows OK with the limits when everything passes', () => {
    render(<MetricCards sample={sample({})} thresholds={THRESHOLDS} />)
    expect(screen.getByRole('listitem', { name: 'Brightness' }).textContent).toContain(
      '130.0 — OK (60–200)',
    )
    expect(screen.getByRole('listitem', { name: 'Face' }).textContent).toContain('Face detected')
    expect(screen.getByRole('listitem', { name: 'FPS' }).className).toContain('metric--ok')
  })

  it('shows too bright', () => {
    render(<MetricCards sample={sample({ brightness: 230.5 })} thresholds={THRESHOLDS} />)
    expect(screen.getByRole('listitem', { name: 'Brightness' }).textContent).toContain(
      '230.5 — Too bright (max 200)',
    )
  })

  it('shows "no data" for null motion, neither green nor red', () => {
    render(<MetricCards sample={sample({ motion: null })} thresholds={THRESHOLDS} />)
    const motion = screen.getByRole('listitem', { name: 'Motion' })
    expect(motion.textContent).toContain('no data')
    expect(motion.className).toContain('metric--none')
  })

  it('waits for the first second', () => {
    render(<MetricCards sample={undefined} thresholds={THRESHOLDS} />)
    expect(screen.getByText(/Waiting for the first full second/)).toBeTruthy()
  })
})

describe('VerdictBanner', () => {
  it('shows Good without an "also failing" line', () => {
    render(<VerdictBanner sample={sample({})} thresholds={THRESHOLDS} />)
    expect(screen.getByText('Good')).toBeTruthy()
    expect(screen.queryByText(/Also failing/)).toBeNull()
  })

  it('shows only the reason when one rule fails', () => {
    render(
      <VerdictBanner
        sample={sample({ brightness: 30, verdict: 'poor', reason: 'too_dark' })}
        thresholds={THRESHOLDS}
      />,
    )
    expect(screen.getByText('Poor: too dark')).toBeTruthy()
    expect(screen.queryByText(/Also failing/)).toBeNull()
  })
})
