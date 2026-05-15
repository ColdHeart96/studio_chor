import type { VoicePart } from '@/types/app.types'

export interface TrackConfig {
  voice: VoicePart
  url: string
}

export class AudioEngine {
  private ctx: AudioContext | null = null

  // Buffers audio décodés — utilisés uniquement pour l'affichage de la forme d'onde
  private buffers: Partial<Record<VoicePart, AudioBuffer>> = {}

  // GainNodes — contrôle volume/mute par voix
  private gainNodes: Partial<Record<VoicePart, GainNode>> = {}
  private masterGain: GainNode | null = null

  // HTMLAudioElement.preservesPitch conserve la tonalité lors des changements de vitesse
  private audioEls:   Partial<Record<VoicePart, HTMLAudioElement>> = {}
  private mediaNodes: Partial<Record<VoicePart, MediaElementAudioSourceNode>> = {}
  private urls:       Partial<Record<VoicePart, string>> = {}
  // Blob URLs créées depuis les ArrayBuffers déjà fetchés — l'audio est en mémoire,
  // audio.play() démarre sans latence réseau (critique pour la synchronisation)
  private blobUrls:   Partial<Record<VoicePart, string>> = {}

  // AudioBufferSourceNodes utilisés uniquement par playSynced() (mode enregistrement)
  // pour une synchronisation échantillon-précise via le clock du AudioContext.
  private syncSources: AudioBufferSourceNode[] = []

  // Offset mesuré dans la piste de fond au moment où recorder.start() est appelé.
  // ReviewPanel l'utilise pour démarrer les pistes depuis la même position,
  // garantissant un alignement voix ↔ pistes indépendamment de la latence plateforme.
  public recordingOffset = 0

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
  public onReset?: () => void

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

    // 1. Fetch une seule fois : la même donnée sert pour le buffer (waveform) ET le Blob URL
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`Failed to load track: ${url}`)
    const arrayBuffer = await resp.arrayBuffer()

    // Créer le Blob URL AVANT decodeAudioData qui peut détacher l'ArrayBuffer
    const contentType = resp.headers.get('content-type') || 'audio/mpeg'
    const blobUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: contentType }))

    // decodeAudioData peut transférer/détacher arrayBuffer — le Blob est déjà créé
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    this.buffers[voice] = audioBuffer

    // 2. GainNode
    if (!this.gainNodes[voice]) {
      const gain = ctx.createGain()
      gain.connect(this.masterGain!)
      this.gainNodes[voice] = gain
    }
    if (this._volumes[voice] !== undefined) {
      this.gainNodes[voice]!.gain.value = this._volumes[voice]!
    }

    this.urls[voice] = url

    if (!this.audioEls[voice]) {
      const audio = new Audio()
      // Blob URL = données en mémoire → pas de crossOrigin nécessaire
      audio.preload = 'auto'
      audio.preservesPitch = true
      ;(audio as unknown as Record<string, unknown>).mozPreservesPitch = true
      audio.src = blobUrl
      this.blobUrls[voice] = blobUrl
      this.audioEls[voice] = audio

      const mediaNode = ctx.createMediaElementSource(audio)
      mediaNode.connect(this.gainNodes[voice]!)
      this.mediaNodes[voice] = mediaNode
    } else {
      // Recharge (URL signée expirée) : révoquer l'ancien Blob et en créer un nouveau
      if (this.blobUrls[voice]) URL.revokeObjectURL(this.blobUrls[voice]!)
      this.audioEls[voice]!.src = blobUrl
      this.blobUrls[voice] = blobUrl
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
    if (!this.ctx) return this._startOffset

    // Math.max(0, ...) : si _startTime a été placé légèrement dans le futur
    // par playSynced() pour le lookahead, elapsed peut être négatif au tout
    // début. On clamp à 0 pour éviter une currentTime aberrante.
    const elapsed = Math.max(0, (this.ctx.currentTime - this._startTime) * this._playbackRate)
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

    const voicesToPlay = Object.entries(this.audioEls) as [VoicePart, HTMLAudioElement][]
    if (voicesToPlay.length === 0) return

    let activeCount = voicesToPlay.length

    const handleEnd = () => {
      activeCount--
      if (activeCount <= 0 && this._playing && !this._loopEnabled) {
        this._playing = false
        this._startOffset = 0
        this._stopAnimation()
        this.onEnded?.()
      }
    }

    const playPromises: Promise<void>[] = []

    for (const [, audio] of voicesToPlay) {
      audio.currentTime  = startOffset
      audio.playbackRate = this._playbackRate
      // preservesPitch : conserve la tonalité d'origine malgré le changement de vitesse
      audio.preservesPitch = true
      ;(audio as unknown as Record<string, unknown>).mozPreservesPitch = true
      audio.loop = false
      audio.onended = () => {
        if (!this._loopEnabled) handleEnd()
      }
      playPromises.push(audio.play().catch(() => {}))
    }

    // Fixer la référence temporelle AVANT d'attendre les promesses.
    // audio.play() peut prendre plusieurs secondes si l'audio doit être bufferisé,
    // et l'audio avance déjà pendant cette attente. Si on fixait _startTime après,
    // le currentTime serait faux et le recorder.start() serait décalé.
    this._startTime   = this.ctx!.currentTime
    this._startOffset = startOffset
    this._playing = true
    this._startAnimation()

    // Attendre en arrière-plan (non bloquant pour la ref temporelle)
    await Promise.all(playPromises)
  }

  // ── Synchronised playback (recording flow) ────────────────────────────────
  // HTMLAudioElement.play() a une latence variable et imprévisible avant que
  // l'audio ne soit réellement audible (50-500 ms selon la plateforme). Pour
  // l'enregistrement, on a besoin que les pistes commencent EXACTEMENT au
  // moment où recorder.start() est appelé.
  //
  // Web Audio API offre du scheduling échantillon-précis via source.start(when) :
  // on planifie tous les sources à `ctx.currentTime + LOOKAHEAD`, on attend
  // jusqu'à ce moment, puis on retourne. Le caller (RecordTab) appelle ensuite
  // recorder.start() qui sera synchronisé à quelques ms près.
  async playSynced(): Promise<void> {
    await this.resumeContext()
    const ctx = this.ctx!

    // Stoppe tout ce qui pourrait jouer (HTMLAudio ou sync sources précédents)
    this._stopSources()
    // Désactiver la boucle A/B : si elle était active depuis le PlayerTab,
    // _startAnimation() la déclencherait au mauvais moment pendant l'enregistrement.
    this._loopEnabled = false

    if (this.duration === 0) return

    // Lookahead de 150 ms : ample pour les appareils lents ET pour que le
    // polling RAF (≤16ms/frame) se résolve avant que les sources démarrent.
    const LOOKAHEAD = 0.15
    const startAt = ctx.currentTime + LOOKAHEAD
    this.syncSources = []

    for (const voice of Object.keys(this.buffers) as VoicePart[]) {
      const buf = this.buffers[voice]
      if (!buf) continue

      if (!this.gainNodes[voice]) {
        const gain = ctx.createGain()
        gain.connect(this.masterGain!)
        this.gainNodes[voice] = gain
      }
      if (this._volumes[voice] !== undefined) {
        this.gainNodes[voice]!.gain.value = this._volumes[voice]!
      }

      const source = ctx.createBufferSource()
      source.buffer = buf
      source.connect(this.gainNodes[voice]!)
      source.start(startAt)
      this.syncSources.push(source)
    }

    this._startTime   = startAt
    this._startOffset = 0
    this._playing = true
    this._startAnimation()

    // Les sources démarrent dans l'AudioContext à `startAt`, mais elles ne
    // sont audibles qu'après `ctx.outputLatency` secondes (latence du buffer
    // matériel, typiquement 20-80 ms). L'utilisateur chante en réponse à ce
    // qu'il entend, donc recorder.start() doit être appelé quand l'audio est
    // réellement audible — pas quand il est planifié dans le contexte.
    //
    // On poll AudioContext.currentTime via RAF (précis à ≤16 ms, indépendant
    // de la granularité de setTimeout) jusqu'à ce que le son soit audible.
    const outputLatency = ctx.outputLatency || ctx.baseLatency || 0
    const audibleAt = startAt + outputLatency
    await new Promise<void>(resolve => {
      const poll = () => {
        if (ctx.currentTime >= audibleAt) {
          resolve()
        } else {
          requestAnimationFrame(poll)
        }
      }
      requestAnimationFrame(poll)
    })

    // Temps réellement écoulé dans la piste depuis startAt jusqu'à maintenant.
    // recorder.start() sera appelé immédiatement après ce retour, donc cet
    // offset mesure exactement le décalage accumulé (outputLatency + RAF jitter).
    // ReviewPanel l'utilise pour démarrer les pistes depuis cette même position.
    this.recordingOffset = ctx.currentTime - startAt
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
    // Recaler le point de référence AVANT de changer le rate,
    // sinon currentTime = (elapsed) * NEW_RATE donne une position erronée
    // et la barre de progression saute.
    if (this._playing && this.ctx) {
      this._startOffset = this.currentTime
      this._startTime   = this.ctx.currentTime
    }

    this._playbackRate = rate

    // preservesPitch déjà initialisé dans loadTrack — ne pas le réassigner
    // ici pour éviter que le navigateur réinitialise son algorithme de pitch
    for (const audio of Object.values(this.audioEls)) {
      if (audio) audio.playbackRate = rate
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
    }
  }

  hasBuffer(voice: VoicePart): boolean {
    return !!this.buffers[voice]
  }

  getBuffer(voice: VoicePart): AudioBuffer | null {
    return this.buffers[voice] ?? null
  }

  removeTrack(voice: VoicePart): void {
    if (this.audioEls[voice]) {
      this.audioEls[voice]!.pause()
      delete this.audioEls[voice]
    }
    if (this.mediaNodes[voice]) {
      // Déconnecter explicitement avant de supprimer la référence JS.
      // Sans ça, le nœud fantôme reste branché à gainNode → masterGain
      // jusqu'au GC, causant une double sommation = distorsion.
      try { this.mediaNodes[voice]!.disconnect() } catch { /* ignore */ }
      delete this.mediaNodes[voice]
    }
    if (this.gainNodes[voice]) {
      try { this.gainNodes[voice]!.disconnect() } catch { /* ignore */ }
      delete this.gainNodes[voice]
    }
    if (this.blobUrls[voice]) {
      URL.revokeObjectURL(this.blobUrls[voice]!)
      delete this.blobUrls[voice]
    }
    delete this.buffers[voice]
    delete this.urls[voice]
  }

  // Arrête toutes les sources sans condition (pas de vérification de _playing).
  // À utiliser avant de créer de nouvelles sources dans ReviewPanel pour garantir
  // qu'aucune source résiduelle (syncSources de playSynced) ne joue en parallèle.
  forceStop(): void {
    this._stopSources()
    this._playing = false
    this._stopAnimation()
  }

  // Remet le curseur à 0 et notifie les callbacks UI — à appeler après un
  // changement de pistes pour que le lecteur affiche la bonne durée et position.
  resetPosition(): void {
    if (this._playing) {
      this._stopSources()
      this._playing = false
    }
    this._stopAnimation()
    this._startOffset = 0
    this.onReset?.()
    this.onTimeUpdate?.(0, this.duration)
  }

  // ── Internal ──────────────────────────────────────────────────────────────
  private _stopSources(): void {
    for (const audio of Object.values(this.audioEls)) {
      try { audio?.pause() } catch { /* ignore */ }
    }
    for (const source of this.syncSources) {
      try { source.stop() } catch { /* ignore */ }
    }
    this.syncSources = []
  }

  private _startAnimation(): void {
    const dur = this.duration

    const tick = () => {
      if (!this._playing) return

      const ct = this.currentTime

      // ── Gestion manuelle de la boucle A/B ────────────────────────────────
      if (this._loopEnabled) {
        const loopEnd = this._loopB * dur
        if (ct >= loopEnd) {
          const loopStart = this._loopA * dur
          for (const audio of Object.values(this.audioEls)) {
            if (audio) audio.currentTime = loopStart
          }
          this._startTime   = this.ctx!.currentTime
          this._startOffset = loopStart
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
    for (const blobUrl of Object.values(this.blobUrls)) {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
    this.blobUrls = {}
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
