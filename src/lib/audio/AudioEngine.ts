import type { VoicePart } from '@/types/app.types'
import {
  SoundTouch,
  SimpleFilter,
  WebAudioBufferSource,
} from '@soundtouchjs/core'

export interface TrackConfig {
  voice: VoicePart
  url: string
}

const ST_BUFFER_SIZE = 4096

export class AudioEngine {
  private ctx: AudioContext | null = null
  private buffers: Partial<Record<VoicePart, AudioBuffer>> = {}
  private gainNodes: Partial<Record<VoicePart, GainNode>> = {}
  private masterGain: GainNode | null = null

  // Native sources (rate = 1.0)
  private sources: Partial<Record<VoicePart, AudioBufferSourceNode>> = {}

  // SoundTouch nodes (rate ≠ 1.0) — one ScriptProcessorNode per voice
  private stNodes: Partial<Record<VoicePart, ScriptProcessorNode>> = {}

  private _volumes: Partial<Record<VoicePart, number>> = {}

  private _playing = false
  private _startTime = 0      // AudioContext time when play started
  private _startOffset = 0    // Offset (seconds) into the audio at play start
  private _playbackRate = 1.0
  private _loopEnabled = false
  private _loopA = 0          // loop start (0–1 fraction)
  private _loopB = 1          // loop end (0–1 fraction)

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

    const bufferEntries = Object.entries(this.buffers) as [VoicePart, AudioBuffer][]
    let activeCount = bufferEntries.length

    const handleEnd = () => {
      activeCount--
      if (activeCount <= 0 && this._playing && !this._loopEnabled) {
        this._playing = false
        this._startOffset = 0
        this._stopAnimation()
        this.onEnded?.()
      }
    }

    // ── Mode natif (vitesse = 1.0) ─────────────────────────────────────────
    if (Math.abs(this._playbackRate - 1.0) < 0.001) {
      for (const [voice, buffer] of bufferEntries) {
        const gain = this.gainNodes[voice]
        if (!gain) continue

        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.playbackRate.value = 1.0
        source.connect(gain)

        if (this._loopEnabled) {
          source.loop = true
          source.loopStart = this._loopA * dur
          source.loopEnd   = this._loopB * dur
        }
        source.start(0, startOffset)

        source.onended = () => {
          if (!this._loopEnabled) handleEnd()
        }

        this.sources[voice] = source
      }
    }

    // ── Mode SoundTouch (pitch-correct, vitesse ≠ 1.0) ────────────────────
    else {
      const sampleRate      = ctx.sampleRate
      const loopStartSample = Math.round(this._loopA * dur * sampleRate)
      const loopEndSample   = Math.round(this._loopB * dur * sampleRate)
      const scratchBuf      = new Float32Array(ST_BUFFER_SIZE * 2)

      for (const [voice, buffer] of bufferEntries) {
        const gain = this.gainNodes[voice]
        if (!gain) continue

        const st = new SoundTouch()
        // tempo : change la vitesse SANS changer le pitch (WSOLA)
        st.tempo = this._playbackRate

        const stSource = new WebAudioBufferSource(buffer)
        const filter   = new SimpleFilter(stSource, st)

        // Positionner à l'offset de départ (en samples)
        filter.sourcePosition = Math.round(startOffset * sampleRate)

        let ended = false

        const node = ctx.createScriptProcessor(ST_BUFFER_SIZE, 2, 2)
        node.onaudioprocess = (e) => {
          if (ended) return

          // ── Gestion de la boucle A/B ────────────────────────────────────
          if (this._loopEnabled && filter.sourcePosition >= loopEndSample) {
            // Vider les buffers internes SoundTouch et repositionner au début de la boucle
            filter.clear()
            filter.sourcePosition = loopStartSample
          }

          const left  = e.outputBuffer.getChannelData(0)
          const right = e.outputBuffer.getChannelData(1)
          const framesExtracted = filter.extract(scratchBuf, ST_BUFFER_SIZE)

          for (let i = 0; i < framesExtracted; i++) {
            left[i]  = scratchBuf[i * 2]
            right[i] = scratchBuf[i * 2 + 1]
          }
          // Silence les frames restantes (fin de buffer ou flush SoundTouch)
          for (let i = framesExtracted; i < ST_BUFFER_SIZE; i++) {
            left[i]  = 0
            right[i] = 0
          }

          // Détection fin de lecture (SoundTouch a flushed tous ses samples)
          if (!this._loopEnabled && framesExtracted === 0) {
            ended = true
            node.disconnect()
            handleEnd()
          }
        }

        node.connect(gain)
        this.stNodes[voice] = node
      }
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

  setMute(voice: VoicePart, muted: boolean): void {
    if (this.gainNodes[voice]) {
      this.gainNodes[voice]!.gain.value = muted ? 0 : (this._volumes[voice] ?? 1)
    }
  }

  // ── Vitesse (avec correction de pitch via SoundTouch) ─────────────────────
  setPlaybackRate(rate: number): void {
    const wasPlaying  = this._playing
    const currentPos  = this.currentTime
    this._playbackRate = rate

    if (wasPlaying) {
      // Redémarrer depuis la position courante avec le nouveau tempo
      this._stopSources()
      this._playing = false
      this.play(currentPos)
    }
  }

  setLoop(enabled: boolean, a = 0.2, b = 0.7): void {
    const wasPlaying = this._playing
    const prevOffset = this.currentTime

    this._loopEnabled = enabled
    this._loopA = a
    this._loopB = b

    if (wasPlaying) {
      const loopStart = a * this.duration
      const offset = enabled ? loopStart : prevOffset
      this._stopSources()
      this._playing = false
      this.play(offset)
    } else {
      // Mise à jour des sources natives actives (quand pas en lecture)
      for (const source of Object.values(this.sources)) {
        if (!source) continue
        source.loop = enabled
        if (enabled) {
          source.loopStart = a * this.duration
          source.loopEnd   = b * this.duration
        }
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
    if (this.stNodes[voice]) {
      try { this.stNodes[voice]!.disconnect() } catch { /* ignore */ }
      delete this.stNodes[voice]
    }
    delete this.buffers[voice]
  }

  // ── Internal ──────────────────────────────────────────────────────────────
  private _stopSources(): void {
    // Arrêt des sources natives
    for (const source of Object.values(this.sources)) {
      try { source?.stop() } catch { /* ignore */ }
    }
    this.sources = {}

    // Déconnexion des nœuds SoundTouch
    for (const node of Object.values(this.stNodes)) {
      try { node?.disconnect() } catch { /* ignore */ }
    }
    this.stNodes = {}
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

// Singleton engine pour le player choriste
let _engine: AudioEngine | null = null
export function getAudioEngine(): AudioEngine {
  if (!_engine) _engine = new AudioEngine()
  return _engine
}
