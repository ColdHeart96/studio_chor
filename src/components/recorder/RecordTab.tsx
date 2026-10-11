'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useOrgContext } from '@/contexts/OrgContext'
import { useRecorder } from '@/hooks/useRecorder'
import { useTracks } from '@/hooks/useTracks'
import { useTakes } from '@/hooks/useTakes'
import { uploadTake } from '@/lib/storage'
import { renderMixMp3 } from '@/lib/audio/mixUtils'
import { formatTime } from '@/lib/utils'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import {
  ROUTE_LABELS, getRoute, estimateLatencyMs, storeLatencyMs, type OutputRoute,
} from '@/lib/audio/latency'
import { LatencyPanel } from '@/components/recorder/LatencyPanel'
import { RefreshHint } from '@/components/ui/RefreshHint'
import type { ReviewSaveState } from '@/components/recorder/ReviewPanel'
import { VOICE_PARTS, VOICE_LABELS, VOICE_COLORS } from '@/lib/constants'
import { Card, SectionLabel } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { VUMeter } from '@/components/recorder/VUMeter'
import { CountdownOverlay } from '@/components/recorder/CountdownOverlay'
import { ReviewPanel } from '@/components/recorder/ReviewPanel'
import type { VoicePart, Track } from '@/types/app.types'

export function RecordTab() {
  const { user }      = useAuth()
  const { activeOrg } = useOrgContext()
  const { saveTake }  = useTakes(user?.id, activeOrg?.id)
  const {
    state, countdown, elapsed, stream, voice, error, noSignal,
    startCountdown, stopRecording, restartRecording, discardRecording,
  } = useRecorder()

  const { tracks, loading: tracksLoading } = useTracks(activeOrg?.id)
  const engine = getAudioEngine()

  const [selectedVoices, setSelectedVoices] = useState<Set<VoicePart>>(new Set())
  const [loadedTracks, setLoadedTracks]     = useState<Partial<Record<VoicePart, Track>>>({})
  const [loadingTrack, setLoadingTrack]     = useState(false)
  const [saveError, setSaveError]           = useState('')
  const [saveProgress, setSaveProgress]     = useState<number | null>(null)

  // Type de sortie audio (filaire / Bluetooth / haut-parleur), mémorisé sur l'appareil.
  // Lu après le montage : localStorage n'existe pas côté serveur.
  const [route, setRouteState] = useState<OutputRoute>('wired')
  useEffect(() => { setRouteState(getRoute()) }, [])

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
    if (!tracks.length) {
      setLoadedTracks({})
      setSelectedVoices(new Set())
      return
    }
    setSelectedVoices(new Set(tracks.map(t => t.voice_part)))

    // Drop stale buffers (admin removed a voice_part from the org)
    const currentParts = new Set(tracks.map(t => t.voice_part))
    for (const v of VOICE_PARTS) {
      if (!currentParts.has(v) && engine.hasBuffer(v)) engine.removeTrack(v)
    }

    async function loadAll() {
      setLoadingTrack(true)
      const next: Partial<Record<VoicePart, Track>> = {}
      for (const track of tracks) {
        if (!track.url) continue
        // Always reload — admin may have replaced the audio file
        try { await engine.loadTrack(track.voice_part, track.url) } catch { continue }
        next[track.voice_part] = track
      }
      setLoadedTracks(next)
      setLoadingTrack(false)
    }
    loadAll()
  }, [tracks, engine])

  const [isPreviewing, setIsPreviewing] = useState(false)

  // Stop engine whenever we leave the recording state
  useEffect(() => {
    if (state !== 'recording') {
      setIsPreviewing(false)
      try { engine.pause() } catch { /* ignore */ }
    }
  }, [state, engine])

  // Lance les pistes EXACTEMENT à t0 (temps AudioContext). La voix est capturée sur la
  // même horloge à partir de t0 : l'échantillon 0 de la voix = le début des pistes.
  const onBeforeRecord = useCallback(async (t0: number) => {
    const sel  = selectedVoicesRef.current
    const vols = trackVolumesRef.current
    for (const v of VOICE_PARTS) {
      engine.setVolume(v, sel.has(v) ? (vols[v] ?? 0.8) : 0)
    }
    engine.seek(0)
    engine.setLoop(false)
    // Vitesse normale pendant l'enregistrement (un réglage fait dans l'onglet Lecteur
    // ne doit pas se retrouver dans la prise).
    engine.setPlaybackRate(1.0)
    await engine.play(0, t0)
  }, [engine])

  function togglePreview() {
    if (isPreviewing) {
      setIsPreviewing(false)
      try { engine.pause() } catch { /* ignore */ }
    } else {
      // iOS: trigger resume synchronously within the user gesture
      engine.resumeContext().catch(() => {})
      const sel = selectedVoicesRef.current
      const vols = trackVolumesRef.current
      for (const v of VOICE_PARTS) {
        engine.setVolume(v, sel.has(v) ? (vols[v] ?? 0.8) : 0)
      }
      engine.seek(0)
      engine.setLoop(true, 0, 1)
      engine.setPlaybackRate(1.0)  // preview at the same speed as recording
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

  async function handleSave(reviewState: ReviewSaveState) {
    if (!voice || !user) return
    setSaveError('')
    setSaveProgress(0)
    try {
      // Le fichier final est déjà synchronisé (voix décalée de offsetMs) et lisible partout.
      const mixed = await renderMixMp3(voice, engine, {
        hearVoice:    reviewState.hearVoice,
        voiceVol:     reviewState.voiceVol,
        activeVoices: reviewState.activeVoices,
        trackVolumes: reviewState.trackVolumes,
        offsetMs:     reviewState.offsetMs,
        onProgress:   setSaveProgress,
      })
      const path = await uploadTake(user.id, mixed.blob, mixed.mimeType)

      const ctx = engine.getContext()
      await saveTake({
        name:            `Prise ${new Date().toLocaleDateString('fr-FR')}`,
        duration:        formatTime(Math.round(mixed.durationSec)),
        storagePath:     path,
        backingSnapshot: Object.fromEntries(
          VOICE_PARTS.map(v => [v, {
            volume: reviewState.activeVoices.has(v) ? (reviewState.trackVolumes[v] ?? 0.8) : 0,
            muted:  !reviewState.activeVoices.has(v),
          }])
        ),
        // Télémétrie de synchro : permet de voir quels appareils/sorties demandent quel décalage.
        syncInfo: {
          offset_ms:      reviewState.offsetMs,
          route,
          calibrated:     estimateLatencyMs(null, route).source === 'calibrated',
          sample_rate:    voice.sampleRate,
          base_latency:   ctx.baseLatency ?? null,
          output_latency: typeof ctx.outputLatency === 'number' ? ctx.outputLatency : null,
          mp3_kbps:       128,
          user_agent:     typeof navigator !== 'undefined' ? navigator.userAgent : null,
        },
        orgId: activeOrg?.id,
      })

      // Le réglage final devient la latence de cet appareil pour les prochaines prises.
      if (reviewState.remember) storeLatencyMs(route, reviewState.offsetMs)
      discardRecording()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    } finally {
      setSaveProgress(null)
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

        {noSignal && (
          <RefreshHint className="mb-4" title="Aucun son n'est capté par le micro">
            Vérifiez que le navigateur a bien l&apos;autorisation d&apos;utiliser le microphone (réglages du
            navigateur ou du téléphone), puis réactualisez la page et recommencez.
          </RefreshHint>
        )}

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
  if (state === 'reviewing' && voice) {
    return (
      <div>
        {saveError && <p className="text-xs text-studio-red mb-3">{saveError}</p>}
        <ReviewPanel
          voice={voice}
          elapsed={elapsed}
          engine={engine}
          loadedTracks={loadedTracks}
          recordedWithVoices={selectedVoices}
          trackVolumes={trackVolumes}
          initialOffsetMs={estimateLatencyMs(engine.getContext(), route).ms}
          routeLabel={ROUTE_LABELS[route]}
          saveProgress={saveProgress}
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
        <RefreshHint className="mb-4" title={error}>
          Autorisez le micro pour ce site dans les réglages, puis réactualisez la page.
        </RefreshHint>
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

      {/* ── Sortie audio + calibration de la latence ─────────────────────────── */}
      <LatencyPanel route={route} onRouteChange={setRouteState} />

      <Button variant="red" size="lg" onClick={() => {
        // Pre-warm AudioContext inside the user gesture so engine.play() is instant
        // when the countdown ends — avoids 50-300ms resume delay that would delay
        // backing tracks relative to the voice.
        try { engine.getContext().resume().catch(() => {}) } catch { /* ignore */ }
        startCountdown(onBeforeRecord)
      }}>
        ⏺ &nbsp;Démarrer l&apos;enregistrement
      </Button>
    </div>
  )
}
