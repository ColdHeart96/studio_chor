'use client'
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { formatTime } from '@/lib/utils'
import { VOICE_PARTS, VOICE_LABELS, VOICE_COLORS } from '@/lib/constants'
import type { AudioEngine } from '@/lib/audio/AudioEngine'
import type { RecordingData } from '@/lib/audio/recorder'
import type { VoicePart, Track } from '@/types/app.types'

const OFFSET_STORAGE_KEY = 'choral-studio-voice-offset'

interface ReviewPanelProps {
  pcmData: RecordingData
  structuralDelay: number          // seconds: time elapsed in backing track when recorder.start() was called
  elapsed: number
  engine: AudioEngine
  loadedTracks: Partial<Record<VoicePart, Track>>
  recordedWithVoices: Set<VoicePart>
  trackVolumes: Partial<Record<VoicePart, number>>
  onSave: (state: {
    hearVoice: boolean
    voiceVol: number
    activeVoices: Set<VoicePart>
    trackVolumes: Partial<Record<VoicePart, number>>
    finalOffset: number            // structuralDelay + userOffset, in seconds
  }) => Promise<void>
  onRetry: () => void
  onDiscard: () => void
}

export function ReviewPanel({
  pcmData, structuralDelay, elapsed, engine, loadedTracks, recordedWithVoices,
  trackVolumes, onSave, onRetry, onDiscard,
}: ReviewPanelProps) {
  const [ready, setReady]         = useState(false)
  const [saving, setSaving]       = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  // ── Voice controls ────────────────────────────────────────────────────────
  const [hearVoice, setHearVoice] = useState(true)
  const [voiceVol, setVoiceVol]   = useState(1.0)

  // ── Sync offset slider (persisted in localStorage) ────────────────────────
  // Positive = delay voice (if voice sounds early); negative = advance voice
  const [userOffsetMs, setUserOffsetMs] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    return parseInt(localStorage.getItem(OFFSET_STORAGE_KEY) ?? '0', 10) || 0
  })

  // ── Track toggles ─────────────────────────────────────────────────────────
  const [trackOn, setTrackOn] = useState<Partial<Record<VoicePart, boolean>>>(() => {
    const init: Partial<Record<VoicePart, boolean>> = {}
    for (const v of VOICE_PARTS) {
      init[v] = recordedWithVoices.has(v) && engine.hasBuffer(v)
    }
    return init
  })

  // ── Voice AudioBuffer (created from raw PCM — no decode latency) ──────────
  const voiceBufferRef   = useRef<AudioBuffer | null>(null)
  const voiceGainNodeRef = useRef<GainNode | null>(null)
  const trackGainRefs    = useRef<Partial<Record<VoicePart, GainNode>>>({})
  const sourcesRef       = useRef<AudioBufferSourceNode[]>([])
  const isStartingRef    = useRef(false)

  // ── Waveform canvas ───────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // ── Build AudioBuffer from PCM samples once ───────────────────────────────
  useEffect(() => {
    const ctx = engine.getContext()
    const buf = ctx.createBuffer(1, pcmData.samples.length, pcmData.sampleRate)
    buf.copyToChannel(pcmData.samples, 0)
    voiceBufferRef.current = buf
    setReady(true)
    setTimeout(() => drawWaveform(), 50)

    return () => { _stopAll() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pcmData])

  // ── Live voice volume update ──────────────────────────────────────────────
  useEffect(() => {
    if (voiceGainNodeRef.current) {
      voiceGainNodeRef.current.gain.value = hearVoice ? voiceVol : 0
    }
  }, [voiceVol, hearVoice])

  // ── Waveform drawing ──────────────────────────────────────────────────────
  function drawWaveform() {
    const canvas = canvasRef.current
    if (!canvas || !pcmData.samples.length) return
    const W = canvas.offsetWidth || 560
    canvas.width  = W
    canvas.height = 44
    const ctx2d = canvas.getContext('2d')!
    const data   = pcmData.samples
    const step   = Math.ceil(data.length / W)
    const mid    = canvas.height / 2
    const anyTrack = VOICE_PARTS.some(v => trackOn[v])
    const color = hearVoice && anyTrack ? '#E8C547'
                : hearVoice             ? '#4ADE80'
                :                        '#47A8E8'
    for (let x = 0; x < W; x++) {
      let max = 0
      for (let j = 0; j < step; j++) max = Math.max(max, Math.abs(data[x * step + j] || 0))
      const h = max * mid * 0.9 || 2
      ctx2d.fillStyle = `${color}88`
      ctx2d.fillRect(x, mid - h, 1, h * 2)
    }
  }

  useEffect(() => { drawWaveform() }, [hearVoice, trackOn])

  // ── Audio helpers ─────────────────────────────────────────────────────────
  function _stopAll() {
    for (const s of sourcesRef.current) { try { s.stop() } catch { /* ignore */ } }
    sourcesRef.current = []
    // Déconnecter les GainNodes du destination avant de lâcher les références.
    // Sans ça, chaque session play() accumule des nœuds fantômes branchés au
    // destination — si une source n'était pas encore arrêtée, elle serait encore audible.
    if (voiceGainNodeRef.current) {
      try { voiceGainNodeRef.current.disconnect() } catch { /* ignore */ }
      voiceGainNodeRef.current = null
    }
    for (const g of Object.values(trackGainRefs.current)) {
      if (g) try { g.disconnect() } catch { /* ignore */ }
    }
    trackGainRefs.current = {}
  }

  async function startReviewPlay() {
    if (isStartingRef.current) return
    isStartingRef.current = true
    const voiceBuf = voiceBufferRef.current
    if (!voiceBuf) { isStartingRef.current = false; return }
    await engine.resumeContext()
    // forceStop() arrête toutes les sources sans vérifier _playing — contrairement
    // à pause() qui rend la main immédiatement si _playing est false. Cela garantit
    // que les syncSources de playSynced() (enregistrement) ne jouent pas en parallèle.
    engine.forceStop()
    const aac = engine.getContext()
    _stopAll()

    const newSources: AudioBufferSourceNode[] = []
    voiceGainNodeRef.current = null

    const startAt = aac.currentTime + 0.1

    // Combine structural delay (measured at recording time) + user's manual offset
    const finalOffset   = structuralDelay + userOffsetMs / 1000
    const backingStart  = Math.max(0,  finalOffset)
    const voiceTrim     = Math.max(0, -finalOffset)

    // ── Voice ─────────────────────────────────────────────────────────────
    if (hearVoice) {
      const vGain = aac.createGain()
      vGain.gain.value = voiceVol
      vGain.connect(aac.destination)
      voiceGainNodeRef.current = vGain

      const vSrc = aac.createBufferSource()
      vSrc.buffer = voiceBuf
      vSrc.connect(vGain)
      vSrc.start(startAt, voiceTrim)
      vSrc.onended = () => stopReviewPlay()
      newSources.push(vSrc)
    }

    // ── Backing tracks ─────────────────────────────────────────────────────
    const newTrackGains: Partial<Record<VoicePart, GainNode>> = {}
    for (const v of VOICE_PARTS) {
      if (!recordedWithVoices.has(v) || !engine.hasBuffer(v)) continue
      const buf = engine.getBuffer(v)!
      const vol = trackVolumes[v] ?? 0.8
      const g = aac.createGain()
      g.gain.value = trackOn[v] ? vol : 0
      g.connect(aac.destination)
      const s = aac.createBufferSource()
      s.buffer = buf
      // Start from backingStart so voice and track are aligned
      s.start(startAt, backingStart, voiceBuf.duration - voiceTrim)
      s.connect(g)
      newTrackGains[v] = g
      newSources.push(s)
    }
    trackGainRefs.current = newTrackGains

    if (newSources.length === 0) { isStartingRef.current = false; return }
    sourcesRef.current = newSources
    setIsPlaying(true)
    isStartingRef.current = false
  }

  function stopReviewPlay() {
    _stopAll()
    setIsPlaying(false)
  }

  function togglePlay() {
    if (isPlaying || isStartingRef.current) {
      stopReviewPlay()
    } else {
      engine.resumeContext().catch(() => {})
      startReviewPlay()
    }
  }

  function handleToggleVoice() {
    const next = !hearVoice
    setHearVoice(next)
    if (voiceGainNodeRef.current) {
      voiceGainNodeRef.current.gain.value = next ? voiceVol : 0
    }
  }

  function handleToggleTrack(v: VoicePart) {
    const next = !trackOn[v]
    setTrackOn(prev => ({ ...prev, [v]: next }))
    const g = trackGainRefs.current[v]
    if (g) g.gain.value = next ? (trackVolumes[v] ?? 0.8) : 0
  }

  function handleOffsetChange(ms: number) {
    setUserOffsetMs(ms)
    localStorage.setItem(OFFSET_STORAGE_KEY, String(ms))
  }

  async function handleSave() {
    setSaving(true)
    const activeVoices  = new Set(VOICE_PARTS.filter(v => trackOn[v]))
    const finalOffset   = structuralDelay + userOffsetMs / 1000
    try {
      await onSave({ hearVoice, voiceVol, activeVoices, trackVolumes, finalOffset })
    } finally { setSaving(false) }
  }

  const reviewTracks = VOICE_PARTS.filter(v => recordedWithVoices.has(v) && engine.hasBuffer(v))

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
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all"
            style={hearVoice ? { background: '#4ADE80', boxShadow: '0 0 8px #4ADE8088' } : { background: '#333' }} />
          <span className="text-[13px] flex-1" style={{ color: hearVoice ? '#4ADE80' : '#444' }}>
            🎤 Ma voix
          </span>
          <div className="w-[18px] h-[18px] rounded border-2 flex items-center justify-content flex-shrink-0 transition-all text-[11px]"
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
            type="range" min={0} max={150} step={1}
            value={Math.round(voiceVol * 100)}
            onChange={e => setVoiceVol(parseInt(e.target.value) / 100)}
            className="flex-1 h-[3px] rounded accent-[#4ADE80]"
            style={{ background: `linear-gradient(90deg,#4ADE80 ${(voiceVol/1.5)*100}%,#2a2418 ${(voiceVol/1.5)*100}%)` }}
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
            <button key={v} onClick={() => handleToggleTrack(v)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border mb-2 transition-all text-left"
              style={on
                ? { borderColor: `${color}33`, background: `${color}08` }
                : { borderColor: '#1e1c18', background: 'transparent' }
              }
            >
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all"
                style={on ? { background: color, boxShadow: `0 0 8px ${color}88` } : { background: '#333' }} />
              <span className="text-[13px] flex-1 font-serif" style={{ color: on ? color : '#444' }}>
                {VOICE_LABELS[v]}
              </span>
              <div className="w-[18px] h-[18px] rounded border-2 flex items-center justify-center flex-shrink-0 transition-all text-[11px]"
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
        <canvas ref={canvasRef} className="w-full rounded-md mt-3"
          style={{ display: ready ? 'block' : 'none', height: '44px' }} />
        {!ready && <div className="text-[11px] text-studio-muted text-center py-4">Décodage…</div>}

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

      {/* ── Sync offset ──────────────────────────────────────────────────────── */}
      <div className="bg-studio-surface border border-studio-border rounded-xl p-4 mb-4">
        <div className="text-[10px] text-studio-muted uppercase tracking-wider mb-2">
          Synchronisation
        </div>
        <div className="text-[11px] text-studio-muted mb-3 leading-relaxed">
          Si votre voix est <span style={{ color: '#E8C547' }}>en avance</span> sur la musique,
          déplacez vers la droite. Si elle est <span style={{ color: '#47A8E8' }}>en retard</span>,
          vers la gauche.
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-studio-muted w-16 text-right tabular-nums">
            {userOffsetMs > 0 ? `+${userOffsetMs}` : userOffsetMs}ms
          </span>
          <input
            type="range" min={-1000} max={500} step={5}
            value={userOffsetMs}
            onChange={e => handleOffsetChange(parseInt(e.target.value))}
            className="flex-1 h-[3px] rounded"
            style={{
              accentColor: '#E8C547',
              background: `linear-gradient(90deg,
                #2a2418 0%,
                #2a2418 ${((userOffsetMs + 1000) / 1500) * 100}%,
                #E8C547 ${((userOffsetMs + 1000) / 1500) * 100}%,
                #E8C547 100%
              )`,
            }}
          />
          <button
            onClick={() => handleOffsetChange(0)}
            className="text-[10px] px-2 py-1 rounded border border-studio-border text-studio-muted hover:text-studio-gold hover:border-studio-gold transition-colors"
          >
            0
          </button>
        </div>
        <div className="flex justify-between text-[9px] text-studio-muted mt-1 px-0">
          <span>← En retard</span>
          <span>En avance →</span>
        </div>
      </div>

      {/* ── Action buttons ───────────────────────────────────────────────────── */}
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
