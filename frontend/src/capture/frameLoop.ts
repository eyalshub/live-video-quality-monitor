/**
 * Calls `onFrame(nowMs)` once per new video frame. Uses requestVideoFrameCallback (fires exactly
 * once per presented camera frame); falls back to requestAnimationFrame, skipping animation frames
 * that show no new video frame so FPS stays honest. Returns a function that stops the loop.
 */
export function startFrameLoop(
  video: HTMLVideoElement,
  onFrame: (nowMs: number) => void,
): () => void {
  let stopped = false

  // Checked on the prototype: TypeScript's DOM types assume every browser has it.
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    let handle = 0
    const step = (now: DOMHighResTimeStamp) => {
      if (stopped) return
      onFrame(now)
      handle = video.requestVideoFrameCallback(step)
    }
    handle = video.requestVideoFrameCallback(step)
    return () => {
      stopped = true
      video.cancelVideoFrameCallback(handle)
    }
  }

  let lastVideoTime = -1
  let handle = 0
  const tick = (now: DOMHighResTimeStamp) => {
    if (stopped) return
    if (
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.currentTime !== lastVideoTime
    ) {
      lastVideoTime = video.currentTime
      onFrame(now)
    }
    handle = requestAnimationFrame(tick)
  }
  handle = requestAnimationFrame(tick)
  return () => {
    stopped = true
    cancelAnimationFrame(handle)
  }
}
