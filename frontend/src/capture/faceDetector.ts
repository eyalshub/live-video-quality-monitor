/**
 * Face presence with MediaPipe Tasks Vision Face Detector (BlazeFace short range).
 * Detection only, no liveness or anti-spoofing (iron rule 5). The wasm runtime and the model are
 * served by this app (public/mediapipe, public/models), not by a third-party CDN.
 */
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'

import { type FaceCandidate, filterFrame } from '../metrics/faceFilter'
import { type Box, largestBox } from '../metrics/insights'
import { FACE_DEBUG } from '../session/faceLog'

const WASM_BASE = `${import.meta.env.BASE_URL}mediapipe/wasm`
const MODEL_URL = `${import.meta.env.BASE_URL}models/blaze_face_short_range.tflite`
/**
 * In `?debug` only, the model reports candidates down to this score so their scores can be measured
 * (ADR-015). Normal runs keep the model at VITE_FACE_MIN_CONFIDENCE, so debugging never changes
 * what users get. The decision threshold is VITE_FACE_MIN_CONFIDENCE either way (`filterFrame`).
 */
const CANDIDATE_FLOOR = 0.1

export interface FaceResult {
  /** At least one face is in the frame (this is what the verdict uses). */
  present: boolean
  /** Largest face, in video pixels; only for the informational framing insight (ADR-013). */
  box: Box | null
  /** Every candidate the model returned, before our threshold; only for the face log (ADR-015).
   * Below VITE_FACE_MIN_CONFIDENCE only in `?debug`. */
  candidates: FaceCandidate[]
}

export interface FaceDetectorHandle {
  detect(video: HTMLVideoElement, timestampMs: number): FaceResult
  readonly delegate: 'GPU' | 'CPU'
  close(): void
}

export async function loadFaceDetector(minConfidence: number): Promise<FaceDetectorHandle> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  const create = (delegate: 'GPU' | 'CPU') =>
    FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      minDetectionConfidence: FACE_DEBUG ? Math.min(CANDIDATE_FLOOR, minConfidence) : minConfidence,
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
      const { detections } = detector.detectForVideo(video, timestamp)
      const candidates: FaceCandidate[] = []
      for (const detection of detections) {
        const b = detection.boundingBox
        if (!b) continue
        candidates.push({
          score: detection.categories[0]?.score ?? 0,
          box: { x: b.originX, y: b.originY, width: b.width, height: b.height },
          // Keypoints come normalized to 0..1; convert to video pixels like the box.
          keypoints: detection.keypoints.map((k) => ({
            x: k.x * video.videoWidth,
            y: k.y * video.videoHeight,
          })),
        })
      }
      const config = { minScore: minConfidence, geometry: null, sizePct: null, temporal: null }
      const faces = filterFrame(candidates, video.videoWidth, config, null)
      return { present: faces.length > 0, box: largestBox(faces.map((f) => f.box)), candidates }
    },
    close() {
      detector.close()
    },
  }
}
