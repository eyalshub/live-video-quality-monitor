/** Camera access. The stream is only ever drawn to a local canvas; no frame leaves the browser. */

export type CameraErrorKind = 'denied' | 'not_found' | 'in_use' | 'insecure' | 'unknown'

export interface CameraProblem {
  kind: CameraErrorKind
  message: string
}

class CameraUnavailableError extends Error {
  constructor() {
    super('navigator.mediaDevices.getUserMedia is not available')
    this.name = 'InsecureContextError'
  }
}

/** Ask for the front camera at 640x480 (the browser may pick the closest supported mode). */
export async function openCamera(): Promise<MediaStream> {
  // mediaDevices is undefined outside a secure context (http:// on a non-localhost host).
  const devices = navigator.mediaDevices as MediaDevices | undefined
  if (!devices?.getUserMedia) throw new CameraUnavailableError()
  return devices.getUserMedia({
    audio: false,
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
  })
}

/** Release the camera (the browser's camera indicator turns off). */
export function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop()
}

/** Map getUserMedia failures to a message a user can act on. */
export function describeCameraError(error: unknown): CameraProblem {
  const name = error instanceof Error || error instanceof DOMException ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return {
        kind: 'denied',
        message:
          'Camera access was denied. Allow the camera for this site (camera icon in the address bar) and press Start again.',
      }
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return {
        kind: 'not_found',
        message: 'No camera was found. Connect a camera and press Start again.',
      }
    case 'NotReadableError':
    case 'AbortError':
    case 'TrackStartError':
      return {
        kind: 'in_use',
        message:
          'The camera could not be started. It may be in use by another app or tab. Close it and press Start again.',
      }
    case 'InsecureContextError':
      return {
        kind: 'insecure',
        message: 'The camera is only available on a secure (HTTPS) page.',
      }
    default:
      return {
        kind: 'unknown',
        message: `The camera could not be opened${name ? ` (${name})` : ''}. Press Start to try again.`,
      }
  }
}
