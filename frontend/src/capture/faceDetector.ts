/**
 * Face presence with MediaPipe Tasks Vision Face Detector (BlazeFace short range).
 * Detection only, no liveness or anti-spoofing (iron rule 5). The wasm runtime and the model are
 * served by this app (public/mediapipe, public/models), not by a third-party CDN.
 */
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'

const WASM_BASE = `${import.meta.env.BASE_URL}mediapipe/wasm`
const MODEL_URL = `${import.meta.env.BASE_URL}models/blaze_face_short_range.tflite`

export interface FaceDetectorHandle {
  /** True if at least one face is in the current video frame. */
  detect(video: HTMLVideoElement, timestampMs: number): boolean
  readonly delegate: 'GPU' | 'CPU'
  close(): void
}

export async function loadFaceDetector(): Promise<FaceDetectorHandle> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  const create = (delegate: 'GPU' | 'CPU') =>
    FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
    })

  let delegate: 'GPU' | 'CPU' = 'GPU'
  let detector: FaceDetector
  try {
    detector = await create('GPU')
  } catch {
    delegate = 'CPU'
    detector = await create('CPU')
  }

  let lastTimestamp = -Infinity
  return {
    delegate,
    detect(video, timestampMs) {
      // VIDEO mode requires strictly increasing timestamps.
      const timestamp = Math.max(Math.round(timestampMs), Math.floor(lastTimestamp) + 1)
      lastTimestamp = timestamp
      return detector.detectForVideo(video, timestamp).detections.length > 0
    },
    close() {
      detector.close()
    },
  }
}
