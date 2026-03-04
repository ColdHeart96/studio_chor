/**
 * iOS Safari MediaRecorder workarounds:
 * 1. Only audio/mp4 is supported on iOS (not audio/webm)
 * 2. AudioContext must be resumed inside a user gesture
 * 3. timeslice=250ms is REQUIRED for iOS — without it, ondataavailable
 *    fires only at stop(), breaking live VU meter and safe interruption
 */

export type RecorderState = 'idle' | 'countdown' | 'recording' | 'reviewing'
export type AudioMode = 'headphones' | 'speakers'

/**
 * Returns the best supported MIME type for recording audio,
 * with audio/mp4 as the iOS fallback.
 */
export function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ]
  if (typeof MediaRecorder === 'undefined') return 'audio/mp4'
  return types.find(t => MediaRecorder.isTypeSupported(t)) ?? ''
}

/**
 * Request microphone access. Must be called inside a user gesture on iOS.
 * - headphones: echo cancellation OFF → natural voice, no feedback risk
 * - speakers:   echo cancellation ON  → isolates voice from speaker bleed
 */
export async function requestMicrophoneAccess(mode: AudioMode = 'headphones'): Promise<MediaStream> {
  const isHeadphones = mode === 'headphones'
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: !isHeadphones,
      noiseSuppression: !isHeadphones,
      autoGainControl:  !isHeadphones,
      channelCount: 1,
      sampleRate: 44100,
    },
    video: false,
  })
}

export class VocalRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stream: MediaStream | null = null
  public mimeType: string = ''

  async init(stream: MediaStream): Promise<void> {
    this.stream = stream
    this.mimeType = getSupportedMimeType()

    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: this.mimeType || undefined,
    })
    this.chunks = []

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data)
    }
  }

  start(): void {
    if (!this.mediaRecorder) throw new Error('VocalRecorder not initialized')
    this.chunks = []
    // timeslice=250ms: CRITICAL for iOS Safari
    this.mediaRecorder.start(250)
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) { reject(new Error('Not initialized')); return }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, {
          type: this.mimeType || 'audio/mp4',
        })
        resolve(blob)
      }

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop()
      } else {
        resolve(new Blob(this.chunks, { type: this.mimeType || 'audio/mp4' }))
      }
    })
  }

  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording'
  }

  destroy(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop() } catch { /* ignore */ }
    }
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
    this.mediaRecorder = null
    this.chunks = []
  }
}
