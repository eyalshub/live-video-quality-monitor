/**
 * Orchestrates one monitoring session in the browser:
 * camera → frame loop → per-frame metrics + face → per-second sample → UI + outbox → backend.
 * React subscribes through `subscribe` / `getSnapshot` (useSyncExternalStore).
 */
import {
  ApiError,
  createSession,
  NetworkError,
  postSamples,
  sendSamplesKeepalive,
  stopSession,
  type StopResponse,
} from '../api/client'
import { describeCameraError, openCamera, stopStream } from '../capture/camera'
import { type FaceDetectorHandle, loadFaceDetector } from '../capture/faceDetector'
import { type FaceCandidate, filterFrame, TemporalFilter } from '../metrics/faceFilter'
import { FrameAnalyzer } from '../capture/frameAnalyzer'
import { startFrameLoop } from '../capture/frameLoop'
import type { AppConfig } from '../config'
import type { Sample, Thresholds } from '../metrics/verdict'
import { type Framing, type InsightSample, largestBox, measureFraming } from '../metrics/insights'
import { SecondAggregator } from './aggregator'
import { InsightAggregator } from './insightAggregator'
import { type FaceLog, type FaceScenario, newFaceLog } from './faceLog'
import { Outbox, type SendOutcome } from './outbox'

export type FaceFrameListener = (
  t: number,
  candidates: FaceCandidate[],
  width: number,
  height: number,
) => void

export type Phase = 'ready' | 'starting' | 'running' | 'stopping' | 'stopped'
export type DetectorStatus = 'loading' | 'ready' | 'failed'
export type Summary = StopResponse['session']['summary']

export interface MonitorState {
  phase: Phase
  detectorStatus: DetectorStatus
  /** Something went wrong and the user should know (camera, backend, detector). */
  error: string | null
  /** Progress / informational text. */
  notice: string | null
  sessionId: string | null
  thresholds: Thresholds | null
  /** Every sample of the current session, in order. */
  samples: Sample[]
  /** Samples not yet confirmed by the backend. */
  pending: number
  /** Samples the backend refused (4xx); they are not resent. */
  rejected: number
  /** True while no frame has been processed for more than a second (camera stalled, tab hidden). */
  noFrames: boolean
  /** Final summary from the backend after Stop. */
  summary: Summary | null
  /** Stop request failed; samples are kept and Stop can be retried. */
  stopFailed: boolean
  /** Latest second of extra insights (ADR-013). Display only: never sent anywhere. */
  insight: InsightSample | null
}

const INITIAL_STATE: MonitorState = {
  phase: 'ready',
  detectorStatus: 'loading',
  error: null,
  notice: null,
  sessionId: null,
  thresholds: null,
  samples: [],
  pending: 0,
  rejected: 0,
  noFrames: false,
  summary: null,
  stopFailed: false,
  insight: null,
}

function describeApiError(error: unknown, action: string): string {
  if (error instanceof NetworkError) {
    return error.timedOut
      ? `Could not ${action}: the backend did not answer in time. It may be waking up; try again.`
      : `Could not ${action}: the backend is unreachable. Check your connection and try again.`
  }
  if (error instanceof ApiError) return `Could not ${action}: ${error.message} (${error.code}).`
  return `Could not ${action}.`
}

export class MonitorController {
  private state: MonitorState = INITIAL_STATE
  private readonly listeners = new Set<() => void>()
  private readonly config: AppConfig

  private detector: FaceDetectorHandle | null = null
  private detectorLoad: Promise<void> | null = null

  // Per-session resources
  private video: HTMLVideoElement | null = null
  private stream: MediaStream | null = null
  private analyzer: FrameAnalyzer | null = null
  private aggregator: SecondAggregator | null = null
  private insights: InsightAggregator | null = null
  private outbox: Outbox | null = null
  private stopLoop: (() => void) | null = null
  private batchTimer: ReturnType<typeof setInterval> | null = null
  private secondTimer: ReturnType<typeof setTimeout> | null = null
  private startMs = 0
  private lastFrameAt = 0
  private finalChunks: Sample[][] = []
  /** Debug only (ADR-015): when a scenario is chosen, the next session logs every detection. */
  private faceLogScenario: FaceScenario | null = null
  private faceLog: FaceLog | null = null
  private faceFrameListener: FaceFrameListener | null = null
  /** Per session: a face must hold still for `faceStableFrames` detector runs (ADR-017). */
  private faceStable: TemporalFilter | null = null

  constructor(config: AppConfig) {
    this.config = config
  }

  // --- store interface -------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): MonitorState => this.state

  private set(patch: Partial<MonitorState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  // --- lifecycle -------------------------------------------------------------------------

  /** Load the face model once. Start stays disabled until it is ready (or shows why not). */
  activate(): void {
    window.addEventListener('pagehide', this.onPageHide)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.detectorLoad ??= loadFaceDetector(this.config.faceMinConfidence).then(
      (detector) => {
        this.detector = detector
        this.set({ detectorStatus: 'ready' })
      },
      (error: unknown) => {
        console.error('Face detector failed to load', error)
        this.set({
          detectorStatus: 'failed',
          error:
            'The face detection model could not be loaded, so quality cannot be measured honestly. Reload the page to try again.',
        })
      },
    )
  }

  deactivate(): void {
    window.removeEventListener('pagehide', this.onPageHide)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    if (this.state.phase === 'running') {
      // Leaving the live screen (e.g. to History) ends the session like Stop: camera released,
      // outbox sent inside POST /stop.
      void this.stop()
    } else {
      this.teardownCapture()
    }
  }

  // --- start -----------------------------------------------------------------------------

  async start(video: HTMLVideoElement): Promise<void> {
    const { phase, detectorStatus } = this.state
    if ((phase !== 'ready' && phase !== 'stopped') || detectorStatus !== 'ready') return

    this.set({
      ...INITIAL_STATE,
      detectorStatus,
      phase: 'starting',
      notice: 'Opening the camera…',
    })

    // ADR-006: camera first, so a denied permission never creates an empty session.
    let stream: MediaStream
    try {
      stream = await openCamera()
    } catch (error) {
      this.set({ phase: 'ready', notice: null, error: describeCameraError(error).message })
      return
    }
    this.stream = stream
    this.video = video
    video.srcObject = stream
    try {
      await video.play()
    } catch {
      // Autoplay of a muted inline video is allowed; frames will arrive anyway.
    }
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', this.onTrackEnded)
    }

    this.set({ notice: 'Creating the session… (a sleeping backend can take up to a minute)' })
    let created
    try {
      created = await createSession(this.config)
    } catch (error) {
      this.teardownCapture()
      this.set({ phase: 'ready', notice: null, error: describeApiError(error, 'start a session') })
      return
    }
    if (this.stream !== stream) {
      // Left the live screen while the session was being created: end it now, so it is not left
      // open. It has no samples, like a Start + Stop within the first second.
      stopSession(this.config, created.id, []).catch((error: unknown) => {
        console.warn('Could not end the session created while leaving', error)
      })
      return
    }

    this.analyzer = new FrameAnalyzer(this.config.analysisWidth, this.config.analysisHeight)
    this.startMs = performance.now() // t = 0
    this.faceStable = new TemporalFilter(this.config.faceStableFrames, this.config.faceStableIou)
    this.faceLog = this.faceLogScenario
      ? newFaceLog(
          this.faceLogScenario,
          video.videoWidth,
          video.videoHeight,
          this.config.faceMinConfidence,
        )
      : null
    this.aggregator = new SecondAggregator(this.startMs, created.thresholds)
    this.insights = new InsightAggregator(this.startMs)
    this.outbox = new Outbox(created.max_samples_per_batch)
    this.lastFrameAt = performance.now()
    this.stopLoop = startFrameLoop(video, this.onFrame)
    this.batchTimer = setInterval(() => void this.flushOutbox(), this.config.sampleBatchIntervalMs)
    this.scheduleSecondBoundary()

    this.set({
      phase: 'running',
      notice: null,
      sessionId: created.id,
      thresholds: created.thresholds,
    })
  }

  // --- face log (debug, ADR-015) --------------------------------------------------------

  setFaceLogScenario(scenario: FaceScenario | null): void {
    this.faceLogScenario = scenario
  }

  /** Debug overlay: called on every frame the detector ran on. Not React state (30 per second). */
  setFaceFrameListener(listener: FaceFrameListener | null): void {
    this.faceFrameListener = listener
  }

  /** The log of the latest session, if one was recorded. */
  getFaceLog(): FaceLog | null {
    return this.faceLog
  }

  // --- per frame -------------------------------------------------------------------------

  private onFrame = (nowMs: number): void => {
    const { analyzer, aggregator, detector, video } = this
    if (!analyzer || !aggregator || !detector || !video) return

    let metrics
    try {
      metrics = analyzer.analyze(video)
    } catch (error) {
      console.warn('Frame skipped: could not read pixels', error)
      return // not processed → not counted in FPS
    }

    // Face: every Nth frame of the second, and always its first frame (ADR-011).
    let face: boolean | null = null
    let framing: Framing | null | undefined // undefined = detector did not run on this frame
    if (aggregator.framesInSecondOf(nowMs) % this.config.faceDetectEveryNFrames === 0) {
      try {
        const result = detector.detect(video, nowMs)
        // Score threshold + stability, the same filter code the offline evaluation ran (ADR-017).
        const faces = filterFrame(
          result.candidates,
          video.videoWidth,
          {
            minScore: this.config.faceMinConfidence,
            geometry: null,
            sizePct: null,
            temporal: null,
          },
          this.faceStable,
        )
        face = faces.length > 0
        const box = largestBox(faces.map((f) => f.box))
        const t = nowMs - this.startMs
        this.faceLog?.frames.push({ t, candidates: result.candidates })
        this.faceFrameListener?.(t, result.candidates, video.videoWidth, video.videoHeight)
        framing = box ? measureFraming(box, video.videoWidth, video.videoHeight) : null
      } catch (error) {
        console.warn('Face detection failed on a frame', error)
      }
    }

    this.lastFrameAt = nowMs
    const { brightness, motion, sharpness, crushedPct, blownPct } = metrics
    for (const sample of aggregator.addFrame({ timeMs: nowMs, brightness, motion, face })) {
      this.emit(sample)
    }
    // Insights are aggregated separately and only displayed (ADR-013).
    const latestInsight = this.insights
      ?.addFrame({ timeMs: nowMs, sharpness, crushedPct, blownPct, framing })
      .at(-1)
    if (latestInsight) this.set({ insight: latestInsight })
    if (this.state.noFrames) this.set({ noFrames: false })
  }

  /** Close each second on time even if frames stop arriving, and notice when they do. */
  private scheduleSecondBoundary(): void {
    const aggregator = this.aggregator
    if (!aggregator) return
    const now = performance.now()
    const nextBoundary = this.startMs + (aggregator.secondOf(now) + 1) * 1000 - now
    this.secondTimer = setTimeout(
      () => {
        const at = performance.now()
        for (const sample of aggregator.flushCompleted(at)) this.emit(sample)
        const latestInsight = this.insights?.flushCompleted(at).at(-1)
        if (latestInsight) this.set({ insight: latestInsight })
        const stalled = at - this.lastFrameAt > 1000
        if (stalled !== this.state.noFrames) this.set({ noFrames: stalled })
        this.scheduleSecondBoundary()
      },
      Math.max(0, nextBoundary) + 1,
    )
  }

  private emit(sample: Sample): void {
    this.outbox?.add(sample)
    this.set({
      samples: [...this.state.samples, sample],
      pending: this.outbox?.pendingCount ?? 0,
    })
  }

  // --- sending ---------------------------------------------------------------------------

  private sendBatch = async (samples: Sample[]): Promise<SendOutcome> => {
    const sessionId = this.state.sessionId
    if (!sessionId) return 'retry'
    try {
      await postSamples(this.config, sessionId, samples)
      return 'ok'
    } catch (error) {
      if (error instanceof ApiError && !error.retryable) {
        console.error('Backend rejected samples', error)
        return 'reject'
      }
      return 'retry'
    }
  }

  private async flushOutbox(): Promise<void> {
    const outbox = this.outbox
    if (!outbox) return
    const outcome = await outbox.flush(this.sendBatch)
    if (outbox !== this.outbox) return
    this.set({
      pending: outbox.pendingCount,
      rejected: outbox.rejected,
      notice:
        outcome === 'retry'
          ? 'Connection problem: samples are kept and will be sent again.'
          : outcome === 'ok'
            ? null
            : this.state.notice,
    })
  }

  // --- stop ------------------------------------------------------------------------------

  async stop(reason?: string): Promise<void> {
    if (this.state.phase !== 'running') return
    this.set({ phase: 'stopping', notice: 'Ending the session…', error: reason ?? null })
    this.aggregator?.discardPartial() // partial last second would under-report FPS
    this.insights?.discardPartial()
    this.finalChunks = this.outbox?.drainAll() ?? []
    this.teardownCapture()
    await this.sendStop()
  }

  /** ADR-004: the whole outbox (incl. in-flight samples) goes with Stop. Retried on failure. */
  async sendStop(): Promise<void> {
    const sessionId = this.state.sessionId
    if (!sessionId) return
    this.set({ phase: 'stopping', stopFailed: false })
    const chunks = this.finalChunks
    try {
      for (const chunk of chunks.slice(0, -1)) {
        await postSamples(this.config, sessionId, chunk)
      }
      const response = await stopSession(this.config, sessionId, chunks.at(-1) ?? [])
      this.finalChunks = []
      this.set({
        phase: 'stopped',
        pending: 0,
        notice: null,
        summary: response.session.summary,
      })
    } catch (error) {
      this.set({
        stopFailed: true,
        pending: chunks.reduce((sum, chunk) => sum + chunk.length, 0),
        notice: null,
        error: describeApiError(error, 'end the session'),
      })
    }
  }

  // --- page / camera events --------------------------------------------------------------

  private onTrackEnded = (): void => {
    void this.stop('The camera was disconnected.')
  }

  private onVisibilityChange = (): void => {
    // Frames stop while hidden; the first frame back must not be compared to a stale one.
    this.analyzer?.resetMotionReference()
  }

  /** Tab closing without Stop: send what we have with keepalive. The session ends at its last
   * stored sample. */
  private onPageHide = (): void => {
    const sessionId = this.state.sessionId
    if (this.state.phase !== 'running' || !sessionId || !this.outbox) return
    for (const chunk of this.outbox.snapshotChunks()) {
      sendSamplesKeepalive(this.config, sessionId, chunk)
    }
  }

  private teardownCapture(): void {
    this.stopLoop?.()
    this.stopLoop = null
    if (this.batchTimer !== null) clearInterval(this.batchTimer)
    if (this.secondTimer !== null) clearTimeout(this.secondTimer)
    this.batchTimer = null
    this.secondTimer = null
    for (const track of this.stream?.getVideoTracks() ?? []) {
      track.removeEventListener('ended', this.onTrackEnded)
    }
    stopStream(this.stream) // releases the camera
    this.stream = null
    if (this.video) this.video.srcObject = null
    this.video = null
    this.analyzer = null
  }
}
