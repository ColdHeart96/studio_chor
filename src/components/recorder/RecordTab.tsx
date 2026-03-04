'use client'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useOrgContext } from '@/contexts/OrgContext'
import { useRecorder } from '@/hooks/useRecorder'
import { useTracks } from '@/hooks/useTracks'
import { useTakes } from '@/hooks/useTakes'
import { uploadTake } from '@/lib/storage'
import { renderMix } from '@/lib/audio/mixUtils'
import { formatTime } from '@/lib/utils'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import { VOICE_PARTS, VOICE_LABELS, VOICE_COLORS } from '@/lib/constants'
import { Card, SectionLabel } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { VUMeter } from '@/components/recorder/VUMeter'
import { CountdownOverlay } from '@/components/recorder/CountdownOverlay'
import { ReviewPanel } from '@/components/recorder/ReviewPanel'
import type { VoicePart, Track } from '@/types/app.types'
import type { AudioMode } from '@/lib/audio/recorder'

export function RecordTab() {
  const { user }      = useAuth()
  const { activeOrg } = useOrgContext()
  const { saveTake }  = useTakes(user?.id, activeOrg?.id)
  const {
    state, countdown, elapsed, stream, blob, mimeType, error,
    startCountdown, stopRecording, restartRecording, discardRecording,
  } = useRecorder()

  const { tracks, loading: tracksLoading } = useTracks(activeOrg?.id)
  const engine = getAudioEngine()

  const [audioMode, setAudioMode] = useState<AudioMode>('headphones')
  const [selectedVoices, setSelectedVoices] = useState<Set<VoicePart>>(new Set())
  const [loadedTracks, setLoadedTracks]     = useState<Partial<Record<VoicePart, Track>>>({})
  const [loadingTrack, setLoadingTrack]     = useState(false)
  const [saveError, setSaveError]           = useState('')

  // Volume per voice part (0–1), default 0.8 like index.html
  const [trackVolumes, setTrackVolumes] = useState<Partial<Record<VoicePart, number>>>(() => {
    const init: Partial<Record<VoicePart, number>> = {}
    for (const v of VOICE_PARTS) init[v] = 0.8
    return init
  })

  // Always-current ref: avoids stale-closure bug in the recording useEffect
  const selectedVoicesRef = useRef<Set<VoicePart>>(selectedVoices)
  selectedVoicesRef.current = selectedVoices

  const trackVolumesRef = useRef(trackVolumes)
  trackVolumesRef.current = trackVolumes

  // Load tracks into engine when list changes; init selection to all
  useEffect(() => {
    if (!tracks.length) return
    setSelectedVoices(new Set(tracks.map(t => t.voice_part)))

    async function loadMissing() {
      setLoadingTrack(true)
      const next: Partial<Record<VoicePart, Track>> = {}
      for (const track of tracks) {
        if (!track.url) continue
        if (!engine.hasBuffer(track.voice_part)) {
          try { await engine.loadTrack(track.voice_part, track.url) } catch { continue }
        }
        next[track.voice_part] = track
      }
      setLoadedTracks(next)
      setLoadingTrack(false)
    }
    loadMissing()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks.length])

  const [isPreviewing, setIsPreviewing] = useState(false)

  // Stop preview when leaving idle state
  useEffect(() => {
    if (state !== 'idle') {
      setIsPreviewing(false)
      try { engine.pause() } catch { /* ignore */ }
    }
  }, [state, engine])

  // Start / stop backing tracks when recording state changes
  useEffect(() => {
    if (state === 'recording') {
      const sel = selectedVoicesRef.current
      const vols = trackVolumesRef.current
      for (const v of VOICE_PARTS) {
        engine.setVolume(v, sel.has(v) ? (vols[v] ?? 0.8) : 0)
      }
      engine.seek(0)
      engine.setLoop(false)   // no loop during recording — tracks play once and stop
      engine.play().catch(() => {})
    } else if (state === 'reviewing') {
      try { engine.pause() } catch { /* ignore */ }
    }
  }, [state, engine])

  function togglePreview() {
    if (isPreviewing) {
      setIsPreviewing(false)
      try { engine.pause() } catch { /* ignore */ }
    } else {
      const sel = selectedVoicesRef.current
      const vols = trackVolumesRef.current
      for (const v of VOICE_PARTS) {
        engine.setVolume(v, sel.has(v) ? (vols[v] ?? 0.8) : 0)
      }
      engine.seek(0)
      engine.setLoop(true, 0, 1)  // loop during preview so user can adjust volumes
      engine.play().catch(() => {})
      setIsPreviewing(true)
    }
  }

  function toggleVoice(v: VoicePart) {
    setSelectedVoices(prev => {
      const next = new Set(prev)
      next.has(v) ? next.delete(v) : next.add(v)
      return next
    })
  }

  function setTrackVolume(v: VoicePart, vol: number) {
    setTrackVolumes(prev => ({ ...prev, [v]: vol }))
    // Apply live during recording OR preview
    if ((state === 'recording' || isPreviewing) && selectedVoicesRef.current.has(v)) {
      engine.setVolume(v, vol)
    }
  }

  async function handleSave(reviewState: {
    hearVoice: boolean
    voiceVol: number
    activeVoices: Set<VoicePart>
    trackVolumes: Partial<Record<VoicePart, number>>
  }) {
    if (!blob || !user) return
    setSaveError('')
    try {
      const { blob: mixedBlob, mimeType: mixMime } = await renderMix(blob, engine, reviewState)
      const path = await uploadTake(user.id, mixedBlob, mixMime)
      await saveTake({
        name:            `Prise ${new Date().toLocaleDateString('fr-FR')}`,
        duration:        formatTime(elapsed),
        storagePath:     path,
        backingSnapshot: Object.fromEntries(
          VOICE_PARTS.map(v => [v, {
            volume: reviewState.activeVoices.has(v) ? (reviewState.trackVolumes[v] ?? 0.8) : 0,
            muted:  !reviewState.activeVoices.has(v),
          }])
        ),
        orgId: activeOrg?.id,
      })
      discardRecording()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    }
  }

  // ── Countdown ─────────────────────────────────────────────────────────────
  if (state === 'countdown') {
    return <CountdownOverlay count={countdown} />
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  if (state === 'recording') {
    return (
      <div>
        <div className="text-center mb-5">
          <div className="text-[11px] text-studio-red tracking-[0.2em] uppercase animate-pulse">
            Enregistrement en cours
          </div>
          <div className="text-[32px] text-studio-text tabular-nums mt-1">
            {formatTime(elapsed)}
          </div>
        </div>

        <Card className="mb-4">
          <div className="flex items-center gap-3 mb-2.5">
            <span className="text-xs text-[#888]">Micro</span>
            <VUMeter stream={stream} />
          </div>
          <div className="h-1 bg-studio-border rounded">
            <div
              className="h-full rounded"
              style={{
                width: `${(elapsed / 600) * 100}%`,
                background: 'linear-gradient(90deg, #CC2222, #FF6644)',
                transition: 'width 1s linear',
              }}
            />
          </div>
        </Card>

        {selectedVoices.size > 0 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap text-[11px] text-studio-muted">
            <span>Pistes :</span>
            {VOICE_PARTS.filter(v => selectedVoices.has(v) && loadedTracks[v]).map(v => (
              <span
                key={v}
                className="px-2 py-0.5 rounded text-[10px]"
                style={{ background: `${VOICE_COLORS[v]}22`, color: VOICE_COLORS[v], border: `1px solid ${VOICE_COLORS[v]}44` }}
              >
                {VOICE_LABELS[v]}
              </span>
            ))}
          </div>
        )}

        <Button variant="ghost" size="lg" onClick={stopRecording}>
          ⏹ &nbsp;Arrêter
        </Button>
      </div>
    )
  }

  // ── Review ─────────────────────────────────────────────────────────────────
  if (state === 'reviewing' && blob) {
    return (
      <div>
        {saveError && <p className="text-xs text-studio-red mb-3">{saveError}</p>}
        <ReviewPanel
          blob={blob}
          elapsed={elapsed}
          engine={engine}
          loadedTracks={loadedTracks}
          recordedWithVoices={selectedVoices}
          trackVolumes={trackVolumes}
          onSave={handleSave}
          onRetry={restartRecording}
          onDiscard={discardRecording}
        />
      </div>
    )
  }

  // ── Idle ───────────────────────────────────────────────────────────────────
  return (
    <div>
      {error && (
        <div className="p-4 bg-[#1a1010] border border-[#2a1010] rounded-xl text-[13px] text-[#886655] mb-4">
          ⚠ {error}
        </div>
      )}

      <SectionLabel>Microphone</SectionLabel>
      <Card className="flex items-center gap-3.5 mb-5">
        <span className="text-2xl">🎤</span>
        <span className="text-[11px] text-studio-muted">{stream ? 'Micro actif' : 'En attente'}</span>
        {stream && <VUMeter stream={stream} />}
      </Card>

      <SectionLabel>Pistes d&apos;accompagnement</SectionLabel>

      {tracksLoading || loadingTrack ? (
        <div className="flex items-center gap-2 text-xs text-studio-muted mb-5">
          <Spinner size="sm" /> Chargement des pistes…
        </div>
      ) : tracks.length === 0 ? (
        <div className="text-[12px] text-[#444] mb-5">
          {activeOrg ? 'Aucune piste disponible dans cette organisation.' : 'Sélectionnez une organisation.'}
        </div>
      ) : (
        <div className="mb-5">
          {/* Quick select buttons */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setSelectedVoices(new Set(tracks.map(t => t.voice_part)))}
              className="text-[10px] px-2 py-1 rounded border border-studio-border text-studio-muted hover:text-studio-gold hover:border-studio-gold transition-colors"
            >
              Toutes
            </button>
            <button
              onClick={() => setSelectedVoices(new Set())}
              className="text-[10px] px-2 py-1 rounded border border-studio-border text-studio-muted hover:text-[#888] transition-colors"
            >
              Aucune
            </button>
          </div>

          <div className="space-y-2">
            {VOICE_PARTS.filter(v => tracks.find(t => t.voice_part === v)).map(v => {
              const track   = tracks.find(t => t.voice_part === v)!
              const checked = selectedVoices.has(v)
              const loaded  = !!loadedTracks[v]
              const color   = VOICE_COLORS[v]
              const vol     = trackVolumes[v] ?? 0.8

              return (
                <div key={v} className="rounded-xl border transition-all" style={checked
                  ? { borderColor: `${color}55`, background: `${color}0a` }
                  : { borderColor: '#1e1c18', opacity: 0.6 }
                }>
                  {/* Track row */}
                  <button
                    onClick={() => toggleVoice(v)}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left"
                  >
                    <div
                      className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all"
                      style={checked ? { borderColor: color, background: color } : { borderColor: '#444' }}
                    >
                      {checked && <span className="text-[9px] text-studio-bg font-bold leading-none">✓</span>}
                    </div>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-[13px] flex-1 font-serif" style={{ color: checked ? color : '#555' }}>
                      {VOICE_LABELS[v]}
                    </span>
                    <span className="text-[11px] text-studio-muted truncate max-w-[120px]">{track.name}</span>
                    {!loaded && <Spinner size="sm" />}
                  </button>

                  {/* Volume slider (visible when checked) */}
                  {checked && loaded && (
                    <div
                      className="flex items-center gap-2 px-3.5 pb-2.5"
                      onClick={e => e.stopPropagation()}
                    >
                      <span className="text-[10px] text-studio-muted w-12 uppercase tracking-wide">Volume</span>
                      <input
                        type="range" min={0} max={100} step={1}
                        value={Math.round(vol * 100)}
                        onChange={e => setTrackVolume(v, parseInt(e.target.value) / 100)}
                        className="flex-1 h-[3px] rounded"
                        style={{
                          accentColor: color,
                          background: `linear-gradient(90deg,${color} ${vol*100}%,#2a2418 ${vol*100}%)`,
                        }}
                      />
                      <span className="text-[10px] tabular-nums w-8 text-right" style={{ color }}>
                        {Math.round(vol * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Prévisualisation ─────────────────────────────────────────────────── */}
      {Object.keys(loadedTracks).length > 0 && (
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={togglePreview}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-all text-[13px]"
            style={isPreviewing
              ? { borderColor: '#E8C54755', background: '#E8C54712', color: '#E8C547' }
              : { borderColor: '#2a2418', background: 'transparent', color: '#888' }
            }
          >
            <span className="text-base">{isPreviewing ? '⏹' : '▶'}</span>
            {isPreviewing ? 'Arrêter la prévisualisation' : 'Prévisualiser les pistes'}
          </button>
          {isPreviewing && (
            <span className="text-[11px] text-studio-muted animate-pulse">
              Ajustez les volumes…
            </span>
          )}
        </div>
      )}

      {/* ── Mode audio ─────────────────────────────────────────────────────── */}
      <SectionLabel>Mode d&apos;écoute</SectionLabel>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={() => setAudioMode('headphones')}
          className="p-3.5 rounded-xl border transition-all text-center"
          style={audioMode === 'headphones'
            ? { border: '2px solid #E8C547', background: '#E8C54718' }
            : { border: '1px solid #2a2418', background: 'transparent' }
          }
        >
          <div className="text-2xl mb-1.5">🎧</div>
          <div className="text-[13px] font-bold mb-0.5" style={{ color: audioMode === 'headphones' ? '#E8C547' : '#666' }}>
            Casque
          </div>
          <div className="text-[10px] leading-snug" style={{ color: audioMode === 'headphones' ? '#A89050' : '#444' }}>
            Qualité maximale<br />Recommandé
          </div>
        </button>
        <button
          onClick={() => setAudioMode('speakers')}
          className="p-3.5 rounded-xl border transition-all text-center"
          style={audioMode === 'speakers'
            ? { border: '2px solid #47A8E8', background: '#47A8E818' }
            : { border: '1px solid #2a2418', background: 'transparent' }
          }
        >
          <div className="text-2xl mb-1.5">🔊</div>
          <div className="text-[13px] font-bold mb-0.5" style={{ color: audioMode === 'speakers' ? '#47A8E8' : '#666' }}>
            Haut-parleurs
          </div>
          <div className="text-[10px] leading-snug" style={{ color: audioMode === 'speakers' ? '#7AAAC0' : '#444' }}>
            Annulation écho<br />Qualité réduite
          </div>
        </button>
      </div>
      <div
        className="text-[12px] leading-relaxed px-3.5 py-2.5 rounded-lg mb-5"
        style={audioMode === 'headphones'
          ? { background: '#1a1408', border: '1px solid #E8C54722', color: '#A89050' }
          : { background: '#0a1520', border: '1px solid #47A8E822', color: '#7AAAC0' }
        }
      >
        {audioMode === 'headphones'
          ? <>🎧 <strong style={{ color: '#E8C547' }}>Mode casque actif</strong> — Annulation d&apos;écho désactivée pour une voix naturelle. Assurez-vous que votre casque est branché.</>
          : <>🔊 <strong style={{ color: '#47A8E8' }}>Mode haut-parleurs actif</strong> — Annulation d&apos;écho activée. Votre voix sera légèrement moins naturelle mais mieux isolée des pistes.</>
        }
      </div>

      <Button variant="red" size="lg" onClick={() => startCountdown(audioMode)}>
        ⏺ &nbsp;Démarrer l&apos;enregistrement
      </Button>
    </div>
  )
}
