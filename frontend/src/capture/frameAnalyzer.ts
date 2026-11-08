/**
 * Browser glue around the pure metric functions: downscale the frame on a private canvas, read
 * its pixels and measure. The canvas is never shown, encoded or uploaded.
 */
import { computeLuma, meanAbsDifference } from '../metrics/frame'

export interface FrameMetrics {
  brightness: number
  /** null for the first frame and the first frame after a reset (no valid previous frame). */
  motion: number | null
}

export class FrameAnalyzer {
  private readonly width: number
  private readonly height: number
  private readonly context: CanvasRenderingContext2D
  private current: Float32Array
  private previous: Float32Array
  private hasPrevious = false

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('2D canvas is not available in this browser')
    this.context = context
    this.current = new Float32Array(width * height)
    this.previous = new Float32Array(width * height)
  }

  analyze(source: CanvasImageSource): FrameMetrics {
    this.context.drawImage(source, 0, 0, this.width, this.height)
    const { data } = this.context.getImageData(0, 0, this.width, this.height)
    const brightness = computeLuma(data, this.current)
    const motion = this.hasPrevious ? meanAbsDifference(this.current, this.previous) : null
    ;[this.current, this.previous] = [this.previous, this.current]
    this.hasPrevious = true
    return { brightness, motion }
  }

  /** Forget the previous frame (e.g. after the tab was hidden): its difference would be fake. */
  resetMotionReference(): void {
    this.hasPrevious = false
  }
}
