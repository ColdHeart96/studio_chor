import type { VoicePart } from '@/types/app.types'

export interface TrackConfig {
  voice: VoicePart
  url: string
}

export class AudioEngine {
  private ctx: AudioContext | null = null

  // Buffers audio décodés — utilisés uniquement pour l'affichage de la forme d'onde
  private buffers: Partial<Record<VoicePart, AudioBuffer>> = {}

  // GainNodes — contrôle volume/mute par voix, communs aux deux modes de lecture
  private gainNodes: Partial<Record<VoicePart, GainNode>> = {}
  private masterGain: GainNode | null = null

  // ── Mode natif (vitesse = 1.0) ──────────────────────────────────────────
  private sources: Partial<Record<VoicePart, AudioBufferSourceNode>> = {}

  // ── Mode HTMLAudioElement (vitesse ≠ 1.0) ───────────────────────────────
  // HTMLAudioElement.preservesPitch conserve la tonalité lors des changements de vitesse
  private audioEls:   Partial<Record<VoicePart, HTMLAudioElement>> = {}
  private mediaNodes: Partial<Record<VoicePart, MediaElementAudioSourceNode>> = {}
  private urls:       Partial<Record<VoicePart, string>> = {}

  private _volumes: Partial<Record<VoicePart, number>> = {}

  private _playing = false
  private _startTime = 0      // AudioContext.currentTime au démarrage
  private _startOffset = 0    // Offset (secondes) dans l'audio au démarrage
  private _playbackRate = 1.0
  private _loopEnabled = false
  private _loopA = 0
  private _loopB = 1

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

    // 1. Charger et décoder en AudioBuffer (pour la forme d'onde)
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`Failed to load track: ${url}`)
    const arrayBuffer = await resp.arrayBuffer()
    const audioBuffer  = await ctx.decodeAudioData(arrayBuffer)
    this.buffers[voice] = audioBuffer

    // 2. GainNode commun aux deux modes
    if (!this.gainNodes[voice]) {
      const gain = ctx.createGain()
      gain.connect(this.masterGain!)
      this.gainNodes[voice] = gain
    }
    if (this._volumes[voice] !== undefined) {
      this.gainNodes[voice]!.gain.value = this._volumes[voice]!
    }

    // 3. Stocker l'URL et préparer l'HTMLAudioElement pour le mode pitch-correct
    this.urls[voice] = url

    if (!this.audioEls[voice]) {
      // Créer l'élément et le MediaElementSourceNode une seule fois par voix
      const audio = new Audio()
      // crossOrigin doit être défini AVANT src pour que CORS fonctionne
      audio.crossOrigin = 'anonymous'
      audio.preload = 'none'
      audio.src = url
      this.audioEls[voice] = audio

      // Connecter au graphe Web Audio pour le contrôle de gain/mute par voix
      const mediaNode = ctx.createMediaElementSource(audio)
      mediaNode.connect(this.gainNodes[voice]!)
      this.mediaNodes[voice] = mediaNode
    } else {
      // Mettre à jour l'URL si la piste est rechargée (URL signée expirée)
      this.audioEls[voice]!.src = url
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
    if (!this._playing) return this._startOffset

    // Mode HTMLAudioElement : lire directement depuis l'élément audio (plus précis)
    if (Math.abs(this._playbackRate - 1.0) >= 0.001) {
      const anyEl = Object.values(this.audioEls).find(Boolean)
      if (anyEl) return anyEl.currentTime
    }

    // Mode natif : calculer depuis le temps AudioContext
    if (!this.ctx) return this._startOffset
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

    // ── Mode natif : AudioBufferSourceNode (vitesse = 1.0) ─────────────────
    if (Math.abs(this._playbackRate - 1.0) < 0.001) {
      const ctx = this.ctx!
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

      this._startTime   = this.ctx!.currentTime
      this._startOffset = startOffset
    }

    // ── Mode pitch-correct : HTMLAudioElement + preservesPitch (vitesse ≠ 1.0) ──
    else {
      // Préparer et lancer tous les éléments audio simultanément
      const playPromises: Promise<void>[] = []

      for (const [voice] of bufferEntries) {
        const audio = this.audioEls[voice]
        if (!audio) continue

        // Positionner et configurer
        audio.currentTime  = startOffset
        audio.playbackRate = this._playbackRate

        // preservesPitch : conserve la tonalité d'origine malgré le changement de vitesse
        // Standard W3C — supporté Chrome 86+, Firefox 99+, Safari 14.5+
        audio.preservesPitch = true
        ;(audio as unknown as Record<string, unknown>).mozPreservesPitch = true

        // Boucle complète gérée via requestAnimationFrame (A/B loop manuel)
        audio.loop = false
        audio.onended = () => {
          if (!this._loopEnabled) handleEnd()
        }

        playPromises.push(audio.play().catch(() => {}))
      }

      // Démarrer toutes les voix en même temps (meilleure sync possible)
      await Promise.all(playPromises)

      this._startOffset = startOffset
    }

    this._playing = true
    this._startAnimation()
  }

  pause(): void {
    if (!this._playing) return

    const pos = this.currentTime
    this._startOffset = pos
    this._stopSources()
    this._playing = false
    this._stopAnimation()
  }

  seek(time: number): void {
    const wasPlaying = this._playing
    const clamped = Math.max(0, Math.min(time, this.duration))

    if (this._playing) this._stopSources()
    this._startOffset = clamped
    this._playing = false

    if (wasPlaying) this.play(clamped)
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

  // ── Vitesse avec correction de pitch ─────────────────────────────────────
  setPlaybackRate(rate: number): void {
    const wasNative  = Math.abs(this._playbackRate - 1.0) < 0.001
    const willNative = Math.abs(rate - 1.0) < 0.001
    const wasPlaying = this._playing
    const currentPos = this.currentTime

    this._playbackRate = rate

    if (wasPlaying) {
      if (wasNative !== willNative) {
        // Changement de mode (natif ↔ HTMLAudioElement) : redémarrer
        this._stopSources()
        this._playing = false
        this.play(currentPos)
      } else if (!willNative) {
        // Rester en mode HTMLAudioElement : mettre à jour la vitesse en direct
        for (const audio of Object.values(this.audioEls)) {
          if (audio) {
            audio.playbackRate = rate
            audio.preservesPitch = true
            ;(audio as unknown as Record<string, unknown>).mozPreservesPitch = true
          }
        }
      } else {
        // Rester en mode natif (1.0 → 1.0) : rien à faire
      }
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
      // Mise à jour des sources natives actives si pas en lecture
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
    if (this.audioEls[voice]) {
      this.audioEls[voice]!.pause()
      delete this.audioEls[voice]
      delete this.mediaNodes[voice]
    }
    delete this.buffers[voice]
    delete this.urls[voice]
  }

  // ── Internal ──────────────────────────────────────────────────────────────
  private _stopSources(): void {
    // Arrêt des sources natives
    for (const source of Object.values(this.sources)) {
      try { source?.stop() } catch { /* ignore */ }
    }
    this.sources = {}

    // Pause des éléments HTMLAudioElement
    for (const audio of Object.values(this.audioEls)) {
      try { audio?.pause() } catch { /* ignore */ }
    }
  }

  private _startAnimation(): void {
    const dur = this.duration

    const tick = () => {
      if (!this._playing) return

      const ct = this.currentTime

      // ── Gestion manuelle de la boucle A/B pour HTMLAudioElement ──────────
      if (this._loopEnabled && Math.abs(this._playbackRate - 1.0) >= 0.001) {
        const loopEnd = this._loopB * dur
        if (ct >= loopEnd) {
          const loopStart = this._loopA * dur
          for (const audio of Object.values(this.audioEls)) {
            if (audio) audio.currentTime = loopStart
          }
          this.onTimeUpdate?.(loopStart, dur)
          this._animFrame = requestAnimationFrame(tick)
          return
        }
      }

      this.onTimeUpdate?.(ct, dur)
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
