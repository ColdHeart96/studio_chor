'use client'
import { useEffect, useState, useCallback } from 'react'
import { useOrgContext } from '@/contexts/OrgContext'
import { useAudioEngine } from '@/hooks/useAudioEngine'
import { useTracks } from '@/hooks/useTracks'
import { extractPeaks } from '@/lib/audio/waveformUtils'
import { VOICE_PARTS, VOICE_LABELS, VOICE_COLORS } from '@/lib/constants'
import { SectionLabel } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { WaveformRenderer } from '@/components/waveform/WaveformRenderer'
import { VoiceMixer } from '@/components/player/VoiceMixer'
import { TransportControls } from '@/components/player/TransportControls'
import { SpeedControl } from '@/components/player/SpeedControl'
import { ABLoopControl } from '@/components/player/ABLoopControl'
import type { VoicePart, Track, Marker } from '@/types/app.types'
import type { MixStateMap } from '@/components/player/VoiceMixer'

const DEFAULT_MIX: MixStateMap = {
  soprano: { volume: 1, muted: false, solo: false },
  alto:    { volume: 1, muted: false, solo: false },
  tenor:   { volume: 1, muted: false, solo: false },
  basse:   { volume: 1, muted: false, solo: false },
}

export function PlayerTab() {
  const { activeOrg } = useOrgContext()
  const { tracks, loading } = useTracks(activeOrg?.id)
  const {
    engine, isPlaying, currentTime, duration,
    speed, loopEnabled, loopA, loopB,
    togglePlay, seek, seekFraction,
    setSpeed, setLoop,
  } = useAudioEngine()

  const [loadedTracks, setLoadedTracks] = useState<Partial<Record<VoicePart, Track>>>({})
  const [peaksMap, setPeaksMap]         = useState<Partial<Record<VoicePart, number[]>>>({})
  const [loadingTrack, setLoadingTrack] = useState<VoicePart | null>(null)
  const [status, setStatus]             = useState('Aucune piste chargée')

  // ── Mix state (volume / mute / solo) ──────────────────────────────────────
  const [mixState, setMixState] = useState<MixStateMap>(DEFAULT_MIX)

  // Apply mix state to engine: compute effective gain for each voice
  const applyMix = useCallback((next: MixStateMap) => {
    const anySolo = VOICE_PARTS.some(v => next[v].solo)
    for (const v of VOICE_PARTS) {
      const { volume, muted, solo } = next[v]
      const effective = (muted || (anySolo && !solo)) ? 0 : volume
      engine.setVolume(v as VoicePart, effective)
    }
  }, [engine])

  function handleVolumeChange(voice: VoicePart, vol: number) {
    setMixState(prev => {
      const next = { ...prev, [voice]: { ...prev[voice], volume: vol } }
      applyMix(next)
      return next
    })
  }

  function handleMuteToggle(voice: VoicePart) {
    setMixState(prev => {
      const next = { ...prev, [voice]: { ...prev[voice], muted: !prev[voice].muted, solo: false } }
      applyMix(next)
      return next
    })
  }

  function handleSoloToggle(voice: VoicePart) {
    setMixState(prev => {
      const next = { ...prev, [voice]: { ...prev[voice], solo: !prev[voice].solo, muted: false } }
      applyMix(next)
      return next
    })
  }

  // ── Markers ───────────────────────────────────────────────────────────────
  const [markers, setMarkers]           = useState<Marker[]>([])
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')

  function addMarker() {
    const id = Date.now().toString()
    const newMarker: Marker = { id, time: currentTime, label: `M${markers.length + 1}` }
    setMarkers(prev => [...prev, newMarker])
    // Start editing label immediately
    setEditingId(id)
    setEditingLabel(newMarker.label)
  }

  function commitLabel(id: string) {
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, label: editingLabel.trim() || m.label } : m))
    setEditingId(null)
    setEditingLabel('')
  }

  // Convert local markers to WaveformMarker format
  const waveformMarkers = markers.map(m => ({ id: m.id, time_position: m.time, note: m.label }))

  // ── Load tracks ───────────────────────────────────────────────────────────
  const hasLoaded = Object.keys(loadedTracks).length > 0
  const progress  = duration > 0 ? currentTime / duration : 0

  useEffect(() => {
    if (!tracks.length) return
    async function loadAll() {
      for (const track of tracks) {
        if (!track.url) continue
        setLoadingTrack(track.voice_part)
        try {
          await engine.loadTrack(track.voice_part, track.url)
          const buf = engine.getBuffer(track.voice_part)
          if (buf) {
            const peaks = extractPeaks(buf)
            setPeaksMap(prev => ({ ...prev, [track.voice_part]: peaks }))
            setLoadedTracks(prev => ({ ...prev, [track.voice_part]: track }))
          }
        } catch (e) {
          console.error('Erreur chargement piste', track.voice_part, e)
        }
      }
      setLoadingTrack(null)
      setStatus('Prêt')
    }
    loadAll()
  }, [tracks, engine])

  function handleSeekBarClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect  = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    seek(ratio * duration)
  }

  return (
    <div>
      <div className="text-[11px] text-studio-muted mb-4 text-right">{status}</div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-studio-muted mb-4">
          <Spinner size="sm" /> Chargement des pistes de l&apos;organisation…
        </div>
      )}
      {loadingTrack && (
        <div className="flex items-center gap-2 text-xs text-studio-muted mb-4">
          <Spinner size="sm" /> Chargement : {VOICE_LABELS[loadingTrack]}…
        </div>
      )}
      {!hasLoaded && !loading && !loadingTrack && (
        <div className="text-center py-12 text-studio-muted">
          <div className="text-4xl mb-3">🎼</div>
          <div className="text-sm text-[#555]">
            {activeOrg ? 'Aucune piste disponible dans cette organisation' : 'Sélectionnez une organisation'}
          </div>
        </div>
      )}

      {hasLoaded && (
        <>
          <SectionLabel>Aperçu des pistes</SectionLabel>

          {/* Per-voice waveforms with markers */}
          {VOICE_PARTS.filter(v => peaksMap[v]).map(voice => (
            <div key={voice} className="mb-2">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: VOICE_COLORS[voice], boxShadow: `0 0 4px ${VOICE_COLORS[voice]}66` }}
                />
                <span className="text-[11px] text-studio-muted">{VOICE_LABELS[voice]}</span>
              </div>
              <WaveformRenderer
                peaks={peaksMap[voice]!}
                duration={duration}
                currentTime={currentTime}
                markers={waveformMarkers}
                color={VOICE_COLORS[voice]}
                onSeek={seek}
                loopRegion={loopEnabled ? { a: loopA, b: loopB } : undefined}
                height={32}
              />
            </div>
          ))}

          <TransportControls
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            progress={progress}
            loopEnabled={loopEnabled}
            onTogglePlay={togglePlay}
            onSeekFraction={seekFraction}
            onToggleLoop={() => setLoop(!loopEnabled)}
            onSeekBarClick={handleSeekBarClick}
          />

          <SpeedControl speed={speed} onChange={setSpeed} />

          {loopEnabled && (
            <ABLoopControl
              loopA={loopA}
              loopB={loopB}
              duration={duration}
              onChange={(a, b) => setLoop(true, a, b)}
            />
          )}

          {/* ── Marqueurs ── */}
          <div className="flex justify-between items-center mt-3 mb-1.5">
            <SectionLabel className="m-0">Marqueurs</SectionLabel>
            <button
              onClick={addMarker}
              className="px-3 py-1 bg-[#E8C54718] border border-[#E8C54744] rounded text-studio-gold text-[11px] font-serif cursor-pointer"
            >
              + Marquer ici
            </button>
          </div>

          {markers.length > 0 && (
            <div className="space-y-1 mb-4">
              {markers.map(m => (
                <div key={m.id} className="flex items-center gap-2 text-[12px]">
                  {/* Editable label */}
                  {editingId === m.id ? (
                    <input
                      autoFocus
                      value={editingLabel}
                      onChange={e => setEditingLabel(e.target.value)}
                      onBlur={() => commitLabel(m.id)}
                      onKeyDown={e => { if (e.key === 'Enter') commitLabel(m.id); if (e.key === 'Escape') setEditingId(null) }}
                      className="w-20 bg-[#1a1810] border border-studio-gold rounded px-1.5 py-0.5 text-studio-gold text-[12px] font-serif outline-none"
                      maxLength={20}
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingId(m.id); setEditingLabel(m.label) }}
                      className="text-studio-gold w-20 text-left truncate hover:underline"
                      title="Cliquer pour renommer"
                    >
                      {m.label}
                    </button>
                  )}
                  <span className="text-studio-muted tabular-nums">
                    {Math.floor(m.time / 60)}:{Math.floor(m.time % 60).toString().padStart(2, '0')}
                  </span>
                  <button
                    onClick={() => seek(m.time)}
                    className="text-[10px] text-[#444] hover:text-[#888] border border-studio-border px-1.5 py-0.5 rounded font-serif"
                    title="Aller à ce marqueur"
                  >
                    ▶
                  </button>
                  <button
                    onClick={() => setMarkers(prev => prev.filter(x => x.id !== m.id))}
                    className="text-[10px] text-[#444] hover:text-studio-red"
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Mixage ── */}
          <SectionLabel>Mixage des voix</SectionLabel>
          <VoiceMixer
            tracks={loadedTracks}
            mixState={mixState}
            onVolumeChange={handleVolumeChange}
            onMuteToggle={handleMuteToggle}
            onSoloToggle={handleSoloToggle}
          />
        </>
      )}
    </div>
  )
}
