export type RecorderState = 'idle' | 'countdown' | 'recording' | 'reviewing'
export type AudioMode = 'headphones' | 'speakers'

export interface RecordingData {
  samples: Float32Array<ArrayBuffer>
  sampleRate: number
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
    },
    video: false,
  })
}

/**
 * AudioWorklet-based recorder: captures raw PCM Float32Array samples on the
 * same AudioContext clock as the backing tracks. Eliminates codec latency
 * (100–500 ms with MediaRecorder) for sample-accurate alignment.
 */
export class VocalRecorder {
  private workletNode: AudioWorkletNode | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private chunks: Float32Array[] = []
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  public readonly mimeType = 'audio/wav'

  async init(stream: MediaStream, ctx: AudioContext): Promise<void> {
    this.stream = stream
    this.ctx = ctx
    this.chunks = []

    await ctx.audioWorklet.addModule('/recorder-processor.js')

    this.workletNode = new AudioWorkletNode(ctx, 'recorder-processor')
    this.workletNode.port.onmessage = (e) => {
      if (e.data.type === 'AUDIO_CHUNK') {
        this.chunks.push(new Float32Array(e.data.samples))
      }
    }

    this.micSource = ctx.createMediaStreamSource(stream)
    // Connect mic → worklet but do NOT connect worklet to destination
    // (prevents mic playback through speakers)
    this.micSource.connect(this.workletNode)
  }

  start(): void {
    if (!this.workletNode) throw new Error('VocalRecorder not initialized')
    this.chunks = []
    this.workletNode.port.postMessage({ type: 'START' })
  }

  stop(): Promise<RecordingData> {
    return new Promise((resolve) => {
      if (!this.workletNode) {
        resolve({ samples: new Float32Array(new ArrayBuffer(0)) as Float32Array<ArrayBuffer>, sampleRate: 44100 })
        return
      }

      const assemble = () => {
        const sampleRate = this.ctx?.sampleRate ?? 44100
        const total = this.chunks.reduce((acc, c) => acc + c.length, 0)
        const merged = new Float32Array(new ArrayBuffer(total * 4))
        let off = 0
        for (const chunk of this.chunks) { merged.set(chunk, off); off += chunk.length }
        resolve({ samples: merged as Float32Array<ArrayBuffer>, sampleRate })
      }

      // Wait for worklet to flush its partial buffer and confirm STOPPED
      const onMsg = (e: MessageEvent) => {
        if (e.data.type === 'STOPPED') {
          this.workletNode!.port.removeEventListener('message', onMsg)
          assemble()
        }
      }
      this.workletNode.port.addEventListener('message', onMsg)
      this.workletNode.port.postMessage({ type: 'STOP' })

      // Safety timeout — assemble even if STOPPED never arrives
      setTimeout(() => {
        this.workletNode?.port.removeEventListener('message', onMsg)
        assemble()
      }, 600)
    })
  }

  get isRecording(): boolean {
    return !!this.workletNode
  }

  destroy(): void {
    try { this.micSource?.disconnect() } catch { /* ignore */ }
    try { this.workletNode?.disconnect() } catch { /* ignore */ }
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
    this.workletNode = null
    this.micSource = null
    this.chunks = []
  }
}
