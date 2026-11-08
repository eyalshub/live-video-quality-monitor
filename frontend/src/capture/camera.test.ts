import { describe, expect, it } from 'vitest'

import { describeCameraError } from './camera'

function domError(name: string): DOMException {
  return new DOMException('boom', name)
}

describe('describeCameraError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'not_found'],
    ['OverconstrainedError', 'not_found'],
    ['NotReadableError', 'in_use'],
    ['AbortError', 'in_use'],
  ])('maps %s to %s', (name, kind) => {
    expect(describeCameraError(domError(name)).kind).toBe(kind)
  })

  it('explains how to recover from a denied permission', () => {
    expect(describeCameraError(domError('NotAllowedError')).message).toMatch(/Allow the camera/)
  })

  it('handles the missing mediaDevices API (insecure page)', () => {
    const error = new Error('no api')
    error.name = 'InsecureContextError'
    expect(describeCameraError(error).kind).toBe('insecure')
  })

  it('never throws on unknown values', () => {
    expect(describeCameraError('weird').kind).toBe('unknown')
    expect(describeCameraError(undefined).message).toMatch(/could not be opened/)
  })
})
