'use client'
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { formatTime } from '@/lib/utils'
import { extractPeaks } from '@/lib/audio/waveformUtils'
import { VOICE_PARTS, VOICE_LABELS, VOICE_COLORS } from '@/lib/constants'
import type { AudioEngine } from '@/lib/audio/AudioEngine'
import type { VoicePart, Track } from '@/types/app.types'

interface ReviewPanelProps {
  blob: Blob
  elapsed: number
  engine: AudioEngine
  loadedTracks: Partial<Record<VoicePart, Track>>
  recordedWithVoices: Set<VoicePart>
  trackVolumes: Partial<Record<VoicePart, number>>   // volumes set before recording
  onSave: (state: {
    hearVoice: boolean
    voiceVol: number
    activeVoices: Set<VoicePart>
    trackVolumes: Partial<Record<VoicePart, number>>
  }) => Promise<void>
  onRetry: () => void
  onDiscard: () => void
}

export function ReviewPanel({
  blob, elapsed, engine, loadedTracks, recordedWithVoices,
  trackVolumes, onSave, onRetry, onDiscard,
}: ReviewPanelProps) {
  const [ready, setReady]       = useState(false)
  const [saving, setSaving]     = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  // ── Voice controls ────────────────────────────────────────────────────────
  const [hearVoice, setHearVoice] = useState(true)
  const [voiceVol, setVoiceVol]   = useState(1.0)   // 0–1.5

  // ── Track toggles: only tracks used during recording, all ON by default ──
  const [trackOn, setTrackOn] = useState<Partial<Record<VoicePart, boolean>>>(() => {
    const init: Partial<Record<VoicePart, boolean>> = {}
    for (const v of VOICE_PARTS) {
      init[v] = recordedWithVoices.has(v) && engine.hasBuffer(v)
    }
    return init
  })

  // ── Decoded voice buffer ──────────────────────────────────────────────────
  const voiceBufferRef   = useRef<AudioBuffer | null>(null)
  const voiceGainNodeRef = useRef<GainNode | null>(null)   // kept for live vol updates
  const sourcesRef       = useRef<AudioBufferSourceNode[]>([])

  // ── Waveform canvas ───────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // ── Decode blob once ──────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = engine.getContext()
    blob.arrayBuffer()
      .then(ab => ctx.decodeAudioData(ab))
      .then(buf => {
        voiceBufferRef.current = buf
        setReady(true)
        setTimeout(() => drawWaveform(), 50)
      })
      .catch(err => console.error('ReviewPanel decode error', err))

    return () => { _stopAll() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob])

  // ── Live voice volume update ──────────────────────────────────────────────
  useEffect(() => {
    if (voiceGainNodeRef.current) {
      voiceGainNodeRef.current.gain.value = hearVoice ? voiceVol : 0
    }
  }, [voiceVol, hearVoice])

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
    // Color matches active state (like index.html)
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

  // Redraw when toggles change
  useEffect(() => { drawWaveform() }, [hearVoice, trackOn])

  // ── Audio helpers ─────────────────────────────────────────────────────────
  function _stopAll() {
    for (const s of sourcesRef.current) { try { s.stop() } catch { /* ignore */ } }
    sourcesRef.current = []
    voiceGainNodeRef.current = null
  }

  // Matches index.html startReviewPlay() exactly
  function startReviewPlay() {
    const voiceBuf = voiceBufferRef.current
    if (!voiceBuf) return
    const aac = engine.getContext()
    if (aac.state === 'suspended') aac.resume()
    _stopAll()

    const newSources: AudioBufferSourceNode[] = []
    voiceGainNodeRef.current = null

    // ── Voice ─────────────────────────────────────────────────────────────
    if (hearVoice) {
      const vGain = aac.createGain()
      vGain.gain.value = voiceVol
      vGain.connect(aac.destination)
      voiceGainNodeRef.current = vGain

      const vSrc = aac.createBufferSource()
      vSrc.buffer = voiceBuf
      vSrc.connect(vGain)
      vSrc.start(0)
      vSrc.onended = () => {
        // Natural end: stop everything (backing tracks may still be running)
        stopReviewPlay()
      }
      newSources.push(vSrc)
    }

    // ── Selected backing tracks ────────────────────────────────────────────
    for (const v of VOICE_PARTS) {
      if (!trackOn[v]) continue
      const buf = engine.getBuffer(v)
      if (!buf) continue
      const vol = trackVolumes[v] ?? 0.8
      const g = aac.createGain()
      g.gain.value = vol
      g.connect(aac.destination)
      const s = aac.createBufferSource()
      s.buffer = buf
      // Limit backing track to voice recording duration (prevents tracks playing past voice end)
      s.start(0, 0, voiceBuf.duration)
      s.connect(g)
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
    if (isPlaying) stopReviewPlay()
    else startReviewPlay()
  }

  // Toggle voice: stop playback (user must re-press play), like index.html
  function handleToggleVoice() {
    stopReviewPlay()
    setHearVoice(v => !v)
  }

  // Toggle track: stop playback (user must re-press play), like index.html
  function handleToggleTrack(v: VoicePart) {
    stopReviewPlay()
    setTrackOn(prev => ({ ...prev, [v]: !prev[v] }))
  }

  async function handleSave() {
    setSaving(true)
    const activeVoices = new Set(VOICE_PARTS.filter(v => trackOn[v]))
    try {
      await onSave({ hearVoice, voiceVol, activeVoices, trackVolumes })
    } finally { setSaving(false) }
  }

  // ── Which tracks to show: only those used during recording ────────────────
  const reviewTracks = VOICE_PARTS.filter(v => recordedWithVoices.has(v) && engine.hasBuffer(v))

  return (
    <div>
      <div className="text-center mb-4">
        <div className="text-[13px] text-studio-green tracking-wide">
          ✓ Enregistrement capturé — {formatTime(elapsed)}
        </div>
      </div>

      {/* ── Review card (same layout as index.html) ────────────────────────── */}
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
            className="w-[18px] h-[18px] rounded border-2 flex items-center justify-content flex-shrink-0 transition-all text-[11px]"
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
            style={{
              background: `linear-gradient(90deg,#4ADE80 ${(voiceVol/1.5)*100}%,#2a2418 ${(voiceVol/1.5)*100}%)`
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
          <div className="text-[11px] text-studio-muted text-center py-4">Décodage…</div>
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
