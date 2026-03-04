import type { VoicePart } from '@/types/app.types'

export interface TrackConfig {
  voice: VoicePart
  url: string
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private buffers: Partial<Record<VoicePart, AudioBuffer>> = {}
  private gainNodes: Partial<Record<VoicePart, GainNode>> = {}
  private masterGain: GainNode | null = null
  private sources: Partial<Record<VoicePart, AudioBufferSourceNode>> = {}

  // Track volumes separately from mute state so we can restore on unmute
  private _volumes: Partial<Record<VoicePart, number>> = {}

  private _playing = false
  private _startTime = 0      // AudioContext time when play started
  private _startOffset = 0    // Offset (seconds) into the audio at play start
  private _playbackRate = 1.0
  private _loopEnabled = false
  private _loopA = 0          // loop start (0-1 fraction)
  private _loopB = 1          // loop end (0-1 fraction)

  private _animFrame: number | null = null
  public onTimeUpdate?: (currentTime: number, duration: number) => void
  public onEnded?: () => void

  // ── Context ───────────────────────────────────────────────────────────────
  getContext(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctx()
      this.masterGain = this.ctx.createGain()
      this.masterGain.connect(this.ctx.destination)
    }
    return this.ctx
  }

  async resumeContext() {
    const ctx = this.getContext()
    if (ctx.state === 'suspended') await ctx.resume()
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  async loadTrack(voice: VoicePart, url: string): Promise<void> {
    const ctx = this.getContext()

    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`Failed to load track: ${url}`)
    const arrayBuffer = await resp.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

    this.buffers[voice] = audioBuffer

    if (!this.gainNodes[voice]) {
      const gain = ctx.createGain()
      gain.connect(this.masterGain!)
      this.gainNodes[voice] = gain
    }
    // Restore volume if previously set
    if (this._volumes[voice] !== undefined) {
      this.gainNodes[voice]!.gain.value = this._volumes[voice]!
    }
  }

  get duration(): number {
    let max = 0
    for (const buf of Object.values(this.buffers)) {
      if (buf && buf.duration > max) max = buf.duration
    }
    return max
  }

  get currentTime(): number {
    if (!this._playing || !this.ctx) return this._startOffset
    const elapsed = (this.ctx.currentTime - this._startTime) * this._playbackRate
    const rawTime = this._startOffset + elapsed

    if (this._loopEnabled && this.duration > 0) {
      const loopStart = this._loopA * this.duration
      const loopEnd   = this._loopB * this.duration
      const loopLen   = loopEnd - loopStart
      if (rawTime >= loopEnd && loopLen > 0) {
        return loopStart + ((rawTime - loopStart) % loopLen)
      }
    }
    return Math.min(rawTime, this.duration)
  }

  get playing(): boolean {
    return this._playing
  }

  // ── Playback ──────────────────────────────────────────────────────────────
  async play(offset?: number): Promise<void> {
    await this.resumeContext()
    if (this._playing) this._stopSources()

    const ctx = this.ctx!
    const startOffset = offset ?? this._startOffset
    const dur = this.duration
    if (dur === 0) return

    // Count active sources; only fire onEnded when ALL have ended
    const bufferEntries = Object.entries(this.buffers) as [VoicePart, AudioBuffer][]
    let activeCount = bufferEntries.length

    for (const [voice, buffer] of bufferEntries) {
      const gain = this.gainNodes[voice]
      if (!gain) continue

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = this._playbackRate
      source.connect(gain)

      if (this._loopEnabled) {
        source.loop = true
        source.loopStart = this._loopA * dur
        source.loopEnd   = this._loopB * dur
      }
      // FIX: never pass a duration arg when looping (causes RangeError when offset > loopEnd)
      source.start(0, startOffset)

      source.onended = () => {
        activeCount--
        // Only reset when ALL sources have ended (avoids premature stop when tracks differ in length)
        if (activeCount <= 0 && this._playing && !this._loopEnabled) {
          this._playing = false
          this._startOffset = 0
          this._stopAnimation()
          this.onEnded?.()
        }
      }

      this.sources[voice] = source
    }

    this._startTime   = ctx.currentTime
    this._startOffset = startOffset
    this._playing     = true
    this._startAnimation()
  }

  pause(): void {
    if (!this._playing) return
    this._startOffset = this.currentTime
    this._stopSources()
    this._playing = false
    this._stopAnimation()
  }

  seek(time: number): void {
    const wasPlaying = this._playing
    if (this._playing) this._stopSources()
    this._startOffset = Math.max(0, Math.min(time, this.duration))
    this._playing = false
    if (wasPlaying) this.play()
  }

  seekRelative(fraction: number): void {
    this.seek(this.currentTime + fraction * this.duration)
  }

  // ── Voice control ─────────────────────────────────────────────────────────
  setVolume(voice: VoicePart, value: number): void {
    this._volumes[voice] = value
    if (this.gainNodes[voice]) {
      this.gainNodes[voice]!.gain.value = value
    }
  }

  /** Mute/unmute a voice, restoring the stored volume on unmute */
  setMute(voice: VoicePart, muted: boolean): void {
    if (this.gainNodes[voice]) {
      this.gainNodes[voice]!.gain.value = muted ? 0 : (this._volumes[voice] ?? 1)
    }
  }

  setPlaybackRate(rate: number): void {
    this._playbackRate = rate
    for (const source of Object.values(this.sources)) {
      if (source) source.playbackRate.value = rate
    }
  }

  setLoop(enabled: boolean, a = 0.2, b = 0.7): void {
    this._loopEnabled = enabled
    this._loopA = a
    this._loopB = b
    for (const source of Object.values(this.sources)) {
      if (!source) continue
      source.loop = enabled
      if (enabled) {
        source.loopStart = a * this.duration
        source.loopEnd   = b * this.duration
      }
    }
  }

  hasBuffer(voice: VoicePart): boolean {
    return !!this.buffers[voice]
  }

  getBuffer(voice: VoicePart): AudioBuffer | null {
    return this.buffers[voice] ?? null
  }

  removeTrack(voice: VoicePart): void {
    if (this.sources[voice]) {
      try { this.sources[voice]!.stop() } catch { /* ignore */ }
      delete this.sources[voice]
    }
    delete this.buffers[voice]
  }

  // ── Internal ──────────────────────────────────────────────────────────────
  private _stopSources(): void {
    for (const source of Object.values(this.sources)) {
      try { source?.stop() } catch { /* ignore */ }
    }
    this.sources = {}
  }

  private _startAnimation(): void {
    const tick = () => {
      if (!this._playing) return
      this.onTimeUpdate?.(this.currentTime, this.duration)
      this._animFrame = requestAnimationFrame(tick)
    }
    this._animFrame = requestAnimationFrame(tick)
  }

  private _stopAnimation(): void {
    if (this._animFrame !== null) {
      cancelAnimationFrame(this._animFrame)
      this._animFrame = null
    }
  }

  destroy(): void {
    this._stopSources()
    this._stopAnimation()
    this.ctx?.close()
    this.ctx = null
  }
}

// Singleton engine for the choriste player
let _engine: AudioEngine | null = null
export function getAudioEngine(): AudioEngine {
  if (!_engine) _engine = new AudioEngine()
  return _engine
}
