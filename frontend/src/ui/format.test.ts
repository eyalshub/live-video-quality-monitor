import { describe, expect, it } from 'vitest'

import { formatDateTime } from './format'

describe('formatDateTime', () => {
  it('formats in English with a 24-hour clock', () => {
    expect(formatDateTime('2026-11-08T14:59:00Z', 'UTC')).toBe('8 Nov 2026, 14:59')
  })

  it("uses the viewer's time zone, not UTC", () => {
    expect(formatDateTime('2026-11-08T14:59:00Z', 'Asia/Jerusalem')).toBe('8 Nov 2026, 16:59')
    expect(formatDateTime('2026-11-08T14:59:00Z', 'America/New_York')).toBe('8 Nov 2026, 09:59')
  })

  it('crosses midnight correctly', () => {
    expect(formatDateTime('2026-11-08T23:30:00Z', 'Asia/Tokyo')).toBe('9 Nov 2026, 08:30')
  })
})
