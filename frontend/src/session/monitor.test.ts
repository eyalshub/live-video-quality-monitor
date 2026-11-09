// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import type { AppConfig } from '../config'

// Mocks: the camera, the detector and the API are the edges; the controller logic runs for real.
let resolveCreate: (value: unknown) => void = () => undefined
const stopSession = vi.fn(() => Promise.resolve({}))
vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createSession: () =>
    new Promise((resolve) => {
      resolveCreate = resolve
    }),
  stopSession: (...args: unknown[]) => stopSession(...(args as [])),
}))
vi.mock('../capture/camera', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openCamera: () => Promise.resolve({ getVideoTracks: () => [] }),
  stopStream: () => undefined,
}))
vi.mock('../capture/faceDetector', () => ({
  loadFaceDetector: () => Promise.resolve({ delegate: 'CPU', detect: vi.fn(), close: vi.fn() }),
}))

const { MonitorController } = await import('./monitor')

const CONFIG: AppConfig = {
  apiBaseUrl: 'http://api.test',
  sampleBatchIntervalMs: 1500,
  analysisWidth: 160,
  analysisHeight: 120,
  apiTimeoutMs: 1000,
  faceDetectEveryNFrames: 1,
  faceMinConfidence: 0.5,
  faceStableFrames: 5,
  faceStableIou: 0.3,
  insights: null,
}

describe('MonitorController', () => {
  it('ends a session that was created after the user left the live screen', async () => {
    const controller = new MonitorController(CONFIG)
    controller.activate()
    await vi.waitFor(() => {
      expect(controller.getSnapshot().detectorStatus).toBe('ready')
    })

    const video = { play: () => Promise.resolve(), srcObject: null } as unknown as HTMLVideoElement
    const starting = controller.start(video)
    await vi.waitFor(() => {
      expect(controller.getSnapshot().notice).toMatch(/Creating the session/)
    })

    controller.deactivate() // e.g. to History, while POST /sessions is still in flight
    resolveCreate({ id: 'abc', thresholds: {}, max_samples_per_batch: 10 })
    await starting

    expect(stopSession).toHaveBeenCalledWith(CONFIG, 'abc', [])
  })
})
