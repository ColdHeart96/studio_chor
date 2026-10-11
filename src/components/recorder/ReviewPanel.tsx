'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { formatTime } from '@/lib/utils'
import { VOICE_PARTS, VOICE_LABELS, VOICE_COLORS } from '@/lib/constants'
import { MIN_OFFSET_MS, MAX_OFFSET_MS, clampOffsetMs } from '@/lib/audio/latency'
import type { AudioEngine } from '@/lib/audio/AudioEngine'
import type { CapturedVoice } from '@/lib/audio/captureSession'
import type { VoicePart, Track } from '@/types/app.types'

export interface ReviewSaveState {
  hearVoice: boolean
  voiceVol: number
  activeVoices: Set<VoicePart>
  trackVolumes: Partial<Record<VoicePart, number>>
  offsetMs: number
  /** Mémoriser ce réglage comme latence de cet appareil pour les prochaines prises */
  remember: boolean
}

interface ReviewPanelProps {
  voice: CapturedVoice
  elapsed: number
  engine: AudioEngine
  loadedTracks: Partial<Record<VoicePart, Track>>
  recordedWithVoices: Set<VoicePart>
  trackVolumes: Partial<Record<VoicePart, number>>   // volumes réglés avant l'enregistrement
  /** Décalage de départ (latence mesurée/estimée de l'appareil) */
  initialOffsetMs: number
  routeLabel: string
  /** Progression de l'encodage MP3 (0–1), null hors sauvegarde */
  saveProgress: number | null
  onSave: (state: ReviewSaveState) => Promise<void>
  onRetry: () => void
  onDiscard: () => void
}

const MAX_VOICE_VOL = 5

/**
 * Gain de départ de la voix : amène le niveau crête « utile » à environ −1 dBFS.
 * Le 99,5e centile (et non le maximum) évite qu'un claquement isolé fixe le gain.
 */
function computeAutoGain(samples: Int16Array): number {
  if (samples.length === 0) return 1
  const bins = new Uint32Array(256)
  const stride = Math.max(1, Math.floor(samples.length / 400000))
  let count = 0
  for (let i = 0; i < samples.length; i += stride) {
    bins[Math.min(255, Math.abs(samples[i]) >> 7)]++
    count++
  }
  let acc = 0
  let level = 0
  for (let b = 0; b < 256; b++) {
    acc += bins[b]
    if (acc >= count * 0.995) { level = (b + 1) * 128; break }
  }
  const peak = level / 32768
  if (peak <= 0.002) return 1             // silence : ne pas amplifier du bruit
  const gain = 0.9 / peak
  return Math.max(1, Math.min(MAX_VOICE_VOL, Math.round(gain * 20) / 20))
}

export function ReviewPanel({
  voice, elapsed, engine, loadedTracks, recordedWithVoices,
  trackVolumes, initialOffsetMs, routeLabel, saveProgress, onSave, onRetry, onDiscard,
}: ReviewPanelProps) {
  const [ready, setReady]             = useState(false)
  const [decodeError, setDecodeError] = useState(false)
  const [saving, setSaving]           = useState(false)
  const [isPlaying, setIsPlaying]     = useState(false)

  // ── Voice controls ────────────────────────────────────────────────────────
  // Le volume de départ est calculé sur l'enregistrement (voix faible = micro éloigné ou micro
  // de casque) : la voix est amenée à un niveau audible sans saturer. Réglable ensuite.
  const [hearVoice, setHearVoice] = useState(true)
  const autoGain = useMemo(() => computeAutoGain(voice.samples), [voice])
  const [voiceVol, setVoiceVol]   = useState(autoGain)   // 0–MAX_VOICE_VOL

  // ── Synchronisation (ms, positif = voix avancée) ──────────────────────────
  const [offsetMs, setOffsetMs]   = useState(clampOffsetMs(initialOffsetMs))
  const [remember, setRemember]   = useState(true)

  // ── Track toggles: only tracks used during recording, all ON by default ──
  const [trackOn, setTrackOn] = useState<Partial<Record<VoicePart, boolean>>>(() => {
    const init: Partial<Record<VoicePart, boolean>> = {}
    for (const v of VOICE_PARTS) {
      init[v] = recordedWithVoices.has(v) && engine.hasBuffer(v)
    }
    return init
  })

  const voiceBufferRef   = useRef<AudioBuffer | null>(null)
  const voiceGainNodeRef = useRef<GainNode | null>(null)
  const sourcesRef       = useRef<AudioBufferSourceNode[]>([])
  const canvasRef        = useRef<HTMLCanvasElement>(null)

  // Valeurs courantes pour les callbacks (évite les fermetures périmées)
  const offsetRef    = useRef(offsetMs)
  offsetRef.current  = offsetMs
  const playingRef   = useRef(false)
  playingRef.current = isPlaying

  // ── Construit le buffer de voix à partir du PCM capturé ───────────────────
  useEffect(() => {
    if (voice.samples.length < voice.sampleRate * 0.3) { setDecodeError(true); return }
    const ctx = engine.getContext()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    try {
      const buf = ctx.createBuffer(1, voice.samples.length, voice.sampleRate)
      const ch = buf.getChannelData(0)
      for (let i = 0; i < voice.samples.length; i++) ch[i] = voice.samples[i] / 32768
      voiceBufferRef.current = buf
      setReady(true)
      setTimeout(() => drawWaveform(), 50)
    } catch (err) {
      console.error('ReviewPanel buffer error', err)
      setDecodeError(true)
    }
    return () => { _stopAll() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice])

  // ── Live voice volume update ──────────────────────────────────────────────
  useEffect(() => {
    if (voiceGainNodeRef.current) {
      voiceGainNodeRef.current.gain.value = hearVoice ? voiceVol : 0
    }
  }, [voiceVol, hearVoice])

  // ── Réglage de synchro : on relance l'écoute depuis le début pour entendre l'effet ──
  useEffect(() => {
    if (!playingRef.current) return
    const t = setTimeout(() => { void startReviewPlay() }, 150)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offsetMs])

  // ── Waveform drawing ──────────────────────────────────────────────────────
  function drawWaveform() {
    const buf = voiceBufferRef.current
    const canvas = canvasRef.current
    if (!canvas || !buf) return
    const W = canvas.offsetWidth || 560
    canvas.width  = W
    canvas.height = 44
    const ctx  = canvas.getContext('2d')!
    const data = buf.getChannelData(0)
    const step = Math.ceil(data.length / W)
    const mid  = canvas.height / 2
    const anyTrack = VOICE_PARTS.some(v => trackOn[v])
    const color = hearVoice && anyTrack ? '#E8C547'
                : hearVoice             ? '#4ADE80'
                :                        '#47A8E8'
    for (let x = 0; x < W; x++) {
      let max = 0
      for (let j = 0; j < step; j++) max = Math.max(max, Math.abs(data[x * step + j] || 0))
      const h = max * mid * 0.9 || 2
      ctx.fillStyle = `${color}88`
      ctx.fillRect(x, mid - h, 1, h * 2)
    }
  }

  useEffect(() => { drawWaveform() }, [hearVoice, trackOn])

  // ── Audio helpers ─────────────────────────────────────────────────────────
  function _stopAll() {
    for (const s of sourcesRef.current) {
      s.onended = null
      try { s.stop() } catch { /* ignore */ }
    }
    sourcesRef.current = []
    voiceGainNodeRef.current = null
  }

  /**
   * Même règle de synchro que le rendu final (renderMixMp3) :
   * - voix avancée de offsetMs  → on saute le début de la voix
   * - voix retardée (offset < 0) → on la lance plus tard
   * Les pistes partent toutes à `when`, sur la même horloge.
   */
  async function startReviewPlay() {
    const voiceBuf = voiceBufferRef.current
    if (!voiceBuf) return
    await engine.resumeContext()
    const aac = engine.getContext()
    _stopAll()

    const newSources: AudioBufferSourceNode[] = []
    voiceGainNodeRef.current = null

    const when      = aac.currentTime + 0.08
    const offsetSec = offsetRef.current / 1000
    const outLen    = Math.max(0.05, voiceBuf.duration - offsetSec)

    // ── Voice ─────────────────────────────────────────────────────────────
    if (hearVoice) {
      const vGain = aac.createGain()
      vGain.gain.value = voiceVol
      vGain.connect(aac.destination)
      voiceGainNodeRef.current = vGain

      const vSrc = aac.createBufferSource()
      vSrc.buffer = voiceBuf
      vSrc.connect(vGain)
      if (offsetSec >= 0) vSrc.start(when, Math.min(offsetSec, Math.max(0, voiceBuf.duration - 0.01)))
      else                vSrc.start(when - offsetSec, 0)
      vSrc.onended = () => { stopReviewPlay() }
      newSources.push(vSrc)
    }

    // ── Selected backing tracks ────────────────────────────────────────────
    for (const v of VOICE_PARTS) {
      if (!trackOn[v]) continue
      const buf = engine.getBuffer(v)
      if (!buf) continue
      const g = aac.createGain()
      g.gain.value = trackVolumes[v] ?? 0.8
      g.connect(aac.destination)
      const s = aac.createBufferSource()
      s.buffer = buf
      s.connect(g)
      s.start(when, 0, outLen)
      // Sans voix, c'est la piste qui marque la fin de l'écoute
      if (!hearVoice && newSources.length === 0) s.onended = () => { stopReviewPlay() }
      newSources.push(s)
    }

    if (newSources.length === 0) return
    sourcesRef.current = newSources
    setIsPlaying(true)
  }

  function stopReviewPlay() {
    _stopAll()
    setIsPlaying(false)
  }

  function togglePlay() {
    if (isPlaying) {
      stopReviewPlay()
    } else {
      engine.resumeContext().catch(() => {})
      void startReviewPlay()
    }
  }

  function handleToggleVoice() {
    stopReviewPlay()
    setHearVoice(v => !v)
  }

  function handleToggleTrack(v: VoicePart) {
    stopReviewPlay()
    setTrackOn(prev => ({ ...prev, [v]: !prev[v] }))
  }

  function nudge(deltaMs: number) {
    setOffsetMs(prev => clampOffsetMs(prev + deltaMs))
  }

  async function handleSave() {
    stopReviewPlay()
    setSaving(true)
    const activeVoices = new Set(VOICE_PARTS.filter(v => trackOn[v]))
    try {
      await onSave({ hearVoice, voiceVol, activeVoices, trackVolumes, offsetMs, remember })
    } finally { setSaving(false) }
  }

  const reviewTracks = VOICE_PARTS.filter(v => recordedWithVoices.has(v) && engine.hasBuffer(v))
  const offsetLabel  = `${offsetMs > 0 ? '+' : ''}${offsetMs} ms`
  const pct          = ((offsetMs - MIN_OFFSET_MS) / (MAX_OFFSET_MS - MIN_OFFSET_MS)) * 100

  if (decodeError) {
    return (
      <div className="text-center py-8">
        <div className="text-[13px] text-studio-red mb-4">
          ⚠ Enregistrement vide ou trop court — réessayez
        </div>
        <Button variant="ghost" size="lg" onClick={onRetry}>↺ Recommencer</Button>
      </div>
    )
  }

  return (
    <div>
      <div className="text-center mb-4">
        <div className="text-[13px] text-studio-green tracking-wide">
          ✓ Enregistrement capturé — {formatTime(elapsed)}
        </div>
      </div>

      <div className="bg-studio-surface border border-studio-border rounded-xl p-4 mb-4">
        <div className="text-[10px] text-studio-muted uppercase tracking-wider mb-3">
          Réécoute — Choisissez ce que vous entendez
        </div>

        {/* ── Voice toggle ────────────────────────────────────────────────── */}
        <button
          onClick={handleToggleVoice}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border mb-2 transition-all text-left"
          style={hearVoice
            ? { borderColor: '#4ADE8033', background: '#4ADE8008' }
            : { borderColor: '#1e1c18', background: 'transparent' }
          }
        >
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all"
            style={hearVoice
              ? { background: '#4ADE80', boxShadow: '0 0 8px #4ADE8088' }
              : { background: '#333' }
            }
          />
          <span className="text-[13px] flex-1" style={{ color: hearVoice ? '#4ADE80' : '#444' }}>
            🎤 Ma voix
          </span>
          <div
            className="w-[18px] h-[18px] rounded border-2 flex items-center justify-center flex-shrink-0 transition-all text-[11px]"
            style={hearVoice
              ? { background: '#4ADE80', borderColor: '#4ADE80', color: '#0a0a0f' }
              : { background: 'transparent', borderColor: '#333', color: 'transparent' }
            }
          >
            {hearVoice && '✓'}
          </div>
        </button>

        {/* ── Voice volume slider ──────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <span className="text-[11px] text-studio-muted uppercase tracking-wide w-16">Vol. voix</span>
          <input
            type="range" min={0} max={MAX_VOICE_VOL * 100} step={1}
            value={Math.round(voiceVol * 100)}
            onChange={e => setVoiceVol(parseInt(e.target.value) / 100)}
            className="flex-1 h-[3px] rounded accent-[#4ADE80]"
            style={{
              background: `linear-gradient(90deg,#4ADE80 ${(voiceVol / MAX_VOICE_VOL) * 100}%,#2a2418 ${(voiceVol / MAX_VOICE_VOL) * 100}%)`
            }}
          />
          <span className="text-[12px] w-9 text-right tabular-nums" style={{ color: '#4ADE80' }}>
            {Math.round(voiceVol * 100)}%
          </span>
        </div>

        {/* ── Track toggles ────────────────────────────────────────────────── */}
        {reviewTracks.map(v => {
          const on    = !!trackOn[v]
          const color = VOICE_COLORS[v]
          return (
            <button
              key={v}
              onClick={() => handleToggleTrack(v)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border mb-2 transition-all text-left"
              style={on
                ? { borderColor: `${color}33`, background: `${color}08` }
                : { borderColor: '#1e1c18', background: 'transparent' }
              }
            >
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all"
                style={on
                  ? { background: color, boxShadow: `0 0 8px ${color}88` }
                  : { background: '#333' }
                }
              />
              <span className="text-[13px] flex-1 font-serif" style={{ color: on ? color : '#444' }}>
                {VOICE_LABELS[v]}
              </span>
              <div
                className="w-[18px] h-[18px] rounded border-2 flex items-center justify-center flex-shrink-0 transition-all text-[11px]"
                style={on
                  ? { background: color, borderColor: color, color: '#0a0a0f' }
                  : { background: 'transparent', borderColor: '#333', color: 'transparent' }
                }
              >
                {on && '✓'}
              </div>
            </button>
          )
        })}

        {/* ── Waveform ─────────────────────────────────────────────────────── */}
        <canvas
          ref={canvasRef}
          className="w-full rounded-md mt-3"
          style={{ display: ready ? 'block' : 'none', height: '44px' }}
        />
        {!ready && (
          <div className="text-[11px] text-studio-muted text-center py-4">Préparation…</div>
        )}

        {/* ── Play button ──────────────────────────────────────────────────── */}
        <div className="flex justify-center mt-3">
          <button
            disabled={!ready}
            onClick={togglePlay}
            className="w-12 h-12 rounded-full bg-studio-surface border border-studio-border text-studio-muted flex items-center justify-center text-xl hover:border-studio-gold hover:text-studio-gold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>
      </div>

      {/* ── Synchronisation voix / pistes ──────────────────────────────────── */}
      <div className="bg-studio-surface border border-studio-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] text-studio-muted uppercase tracking-wider">
            Synchronisation de la voix
          </div>
          <div className="text-[13px] tabular-nums" style={{ color: '#E8C547' }}>{offsetLabel}</div>
        </div>
        <div className="text-[11px] text-studio-muted mb-3">
          Réglé pour : {routeLabel}. Si votre voix paraît en retard sur la musique, avancez-la ;
          si elle paraît en avance, retardez-la. L&apos;écoute repart du début à chaque réglage.
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => nudge(-10)}
            className="w-9 h-9 rounded-lg border border-studio-border2 text-studio-muted hover:text-studio-gold hover:border-studio-gold transition-colors text-sm"
            aria-label="Retarder la voix de 10 ms"
          >−</button>
          <input
            type="range"
            min={MIN_OFFSET_MS} max={MAX_OFFSET_MS} step={1}
            value={offsetMs}
            onChange={e => setOffsetMs(clampOffsetMs(parseInt(e.target.value)))}
            className="flex-1 h-[3px] rounded"
            style={{
              accentColor: '#E8C547',
              background: `linear-gradient(90deg,#E8C547 ${pct}%,#2a2418 ${pct}%)`,
            }}
            aria-label="Décalage de la voix en millisecondes"
          />
          <button
            onClick={() => nudge(10)}
            className="w-9 h-9 rounded-lg border border-studio-border2 text-studio-muted hover:text-studio-gold hover:border-studio-gold transition-colors text-sm"
            aria-label="Avancer la voix de 10 ms"
          >+</button>
        </div>
        <div className="flex justify-between text-[10px] text-[#444] mt-1 px-11">
          <span>voix plus tard</span>
          <span>voix plus tôt</span>
        </div>

        <label className="flex items-center gap-2 mt-3 text-[11px] text-studio-muted cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={e => setRemember(e.target.checked)}
            className="accent-[#E8C547]"
          />
          Mémoriser ce réglage pour cet appareil ({routeLabel})
        </label>
      </div>

      {/* ── Action buttons ───────────────────────────────────────────────────── */}
      {saveProgress !== null && (
        <div className="mb-3">
          <div className="text-[11px] text-studio-muted mb-1 text-center">
            Préparation du fichier… {Math.round(saveProgress * 100)}%
          </div>
          <div className="h-1 bg-studio-border rounded">
            <div
              className="h-full rounded"
              style={{ width: `${saveProgress * 100}%`, background: 'linear-gradient(90deg,#B8962A,#E8C547)' }}
            />
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 mb-2">
        <Button variant="green" size="lg" loading={saving} onClick={handleSave}>
          ✓ Sauvegarder
        </Button>
        <Button variant="ghost" size="lg" onClick={onRetry}>
          ↺ Recommencer
        </Button>
      </div>
      <Button variant="ghost" size="lg" onClick={onDiscard} className="border-[#1a1814] text-[#555]">
        ✕ Supprimer
      </Button>
    </div>
  )
}
