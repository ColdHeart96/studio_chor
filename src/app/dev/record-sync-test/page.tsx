'use client'
/**
 * Standalone diagnostic page — not linked from the app nav (TabBar), reached only
 * by direct URL. Lets Emmanuelle validate the new mic+track sync architecture
 * (AudioEngine.connectMicToRecordingBus / getRecordingDestination / play(offset,
 * startTime)) on real devices before it's wired into RecordTab.tsx.
 *
 * Uses its own isolated AudioEngine instance (not the app singleton) so testing
 * here never pollutes real org/track state — and no login/org selection needed.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { AudioEngine } from '@/lib/audio/AudioEngine'
import { VocalRecorder, requestMicrophoneAccess } from '@/lib/audio/recorder'
import { audioBufferToWav } from '@/lib/audio/mixUtils'
import { extractPeaks } from '@/lib/audio/waveformUtils'
import { WaveformRenderer } from '@/components/waveform/WaveformRenderer'

const CLICK_COUNT = 6
const CLICK_INTERVAL = 1 // seconds

/** Six sharp decaying "ticks", one per second — a rhythmic reference to sing/tap along to. */
function generateClickTrack(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate
  const clickLen = Math.floor(sr * 0.03)
  const totalDuration = CLICK_COUNT * CLICK_INTERVAL + 1
  const buffer = ctx.createBuffer(1, Math.floor(totalDuration * sr), sr)
  const data = buffer.getChannelData(0)
  for (let c = 0; c < CLICK_COUNT; c++) {
    const startSample = Math.floor(c * CLICK_INTERVAL * sr)
    for (let i = 0; i < clickLen; i++) {
      const t = i / sr
      const decay = Math.exp(-t * 300)
      data[startSample + i] = Math.sin(2 * Math.PI * 1000 * t) * decay
    }
  }
  return buffer
}

type Phase = 'idle' | 'recording' | 'done'

export default function RecordSyncTestPage() {
  const engineRef      = useRef<AudioEngine | null>(null)
  const recorderRef    = useRef<VocalRecorder | null>(null)
  const micStreamRef   = useRef<MediaStream | null>(null)
  const autoStopRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mixedUrlRef    = useRef<string | null>(null)
  const refUrlRef      = useRef<string | null>(null)

  const [phase, setPhase]           = useState<Phase>('idle')
  const [ready, setReady]           = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [latency, setLatency]       = useState<{ base: number; output: number } | null>(null)
  const [mixedUrl, setMixedUrl]     = useState<string | null>(null)
  const [mixedPeaks, setMixedPeaks] = useState<number[]>([])
  const [refPeaks, setRefPeaks]     = useState<number[]>([])
  const [notes, setNotes]           = useState('')

  // Set up the isolated engine + synthetic reference track once on mount.
  useEffect(() => {
    const engine = new AudioEngine()
    engineRef.current = engine
    const ctx = engine.getContext()
    const refBuffer = generateClickTrack(ctx)
    const refBlob = audioBufferToWav(refBuffer)
    const refUrl = URL.createObjectURL(refBlob)
    refUrlRef.current = refUrl
    engine.loadTrack('soprano', refUrl)
      .then(() => {
        engine.setVolume('soprano', 0.9)
        setRefPeaks(extractPeaks(refBuffer))
        setReady(true)
      })
      .catch(() => setError('Impossible de générer la piste de référence.'))

    return () => {
      if (autoStopRef.current) clearTimeout(autoStopRef.current)
      micStreamRef.current?.getTracks().forEach(t => t.stop())
      engine.destroy()
      if (refUrlRef.current) URL.revokeObjectURL(refUrlRef.current)
      if (mixedUrlRef.current) URL.revokeObjectURL(mixedUrlRef.current)
    }
  }, [])

  const startTest = useCallback(async () => {
    const engine = engineRef.current
    if (!engine || phase === 'recording') return
    setError(null)
    if (mixedUrlRef.current) { URL.revokeObjectURL(mixedUrlRef.current); mixedUrlRef.current = null }
    setMixedUrl(null)
    setMixedPeaks([])

    try {
      await engine.resumeContext()
      const micStream = await requestMicrophoneAccess()
      micStreamRef.current = micStream

      engine.seek(0)
      engine.setLoop(false)
      engine.setPlaybackRate(1.0)
      engine.connectMicToRecordingBus(micStream)
      const recordStream = engine.getRecordingDestination().stream

      const recorder = new VocalRecorder()
      await recorder.init(recordStream)
      recorderRef.current = recorder

      setLatency({
        base:   engine.getContext().baseLatency ?? 0,
        output: engine.getContext().outputLatency ?? 0,
      })

      recorder.start()
      setPhase('recording')

      const startTime = engine.getContext().currentTime + 0.1
      engine.play(0, startTime).catch(() => {})

      autoStopRef.current = setTimeout(stopTest, (engine.duration + 1) * 1000)
    } catch {
      setError('Accès au micro refusé — autorisez le microphone pour ce site.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  async function stopTest() {
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null }
    const engine = engineRef.current
    engine?.pause()
    engine?.disconnectMic()
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    micStreamRef.current = null

    const recorder = recorderRef.current
    if (!recorder || !engine) { setPhase('idle'); return }
    const blob = await recorder.stop()

    if (blob.size < 100) {
      setError('Enregistrement vide — réessayez.')
      setPhase('idle')
      return
    }

    try {
      const buf = await engine.getContext().decodeAudioData(await blob.arrayBuffer())
      setMixedPeaks(extractPeaks(buf))
    } catch {
      setError('Décodage impossible — le fichier a peut-être été coupé trop tôt.')
    }

    const url = URL.createObjectURL(blob)
    mixedUrlRef.current = url
    setMixedUrl(url)
    setPhase('done')
  }

  return (
    <div className="min-h-screen bg-[#080812] text-[#e8e4d8] font-serif px-6 py-8 max-w-2xl mx-auto">
      <h1 className="text-lg text-[#E8C547] mb-1">Test de synchro enregistrement</h1>
      <p className="text-[12px] text-[#888] mb-6">
        Page de diagnostic — pas liée dans l&apos;app. Enregistre votre voix par-dessus 6 clics
        espacés d&apos;1 seconde, avec le nouveau moteur (micro + piste sur le même graphe audio).
        Notez l&apos;appareil et le casque utilisé ci-dessous pendant vos essais.
      </p>

      {error && (
        <div className="p-3 bg-[#1a1010] border border-[#2a1010] rounded-xl text-[13px] text-[#cc8888] mb-4">
          ⚠ {error}
        </div>
      )}

      <div className="p-4 bg-[#12121a] border border-[#242430] rounded-xl mb-4">
        <div className="text-[10px] text-[#888] uppercase tracking-wider mb-2">Piste de référence (6 clics, 1/s)</div>
        <WaveformRenderer peaks={refPeaks} duration={0} currentTime={0} color="#47A8E8" height={36} />
      </div>

      <button
        onClick={phase === 'recording' ? stopTest : startTest}
        disabled={!ready}
        className="w-full py-3 rounded-xl text-sm font-medium mb-4 disabled:opacity-40"
        style={phase === 'recording'
          ? { background: '#CC2222', color: '#fff' }
          : { background: '#E8C547', color: '#0a0a0f' }
        }
      >
        {phase === 'recording' ? '⏹ Arrêter' : ready ? '⏺ Démarrer le test' : 'Préparation…'}
      </button>

      {latency && (
        <div className="text-[11px] text-[#888] mb-4">
          Latence navigateur — base : {(latency.base * 1000).toFixed(1)}ms · sortie : {(latency.output * 1000).toFixed(1)}ms
          {' '}(indicatif, ne mesure pas le délai acoustique réel du casque/haut-parleur)
        </div>
      )}

      {mixedUrl && (
        <div className="p-4 bg-[#12121a] border border-[#242430] rounded-xl mb-4">
          <div className="text-[10px] text-[#888] uppercase tracking-wider mb-2">
            Résultat — voix + référence capturées ensemble
          </div>
          <WaveformRenderer peaks={mixedPeaks} duration={0} currentTime={0} color="#E8C547" height={44} className="mb-3" />
          <audio controls src={mixedUrl} className="w-full" />
          <p className="text-[11px] text-[#666] mt-2">
            Écoutez : les clics doivent tomber exactement sur le même instant à chaque écoute,
            du début à la fin de l&apos;enregistrement — pas seulement au début.
          </p>
        </div>
      )}

      <div className="p-4 bg-[#12121a] border border-[#242430] rounded-xl">
        <div className="text-[10px] text-[#888] uppercase tracking-wider mb-2">Notes de test</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Appareil, navigateur, casque (filaire/Bluetooth/aucun), résultat…"
          className="w-full h-24 bg-[#0a0a10] border border-[#242430] rounded-lg p-2 text-[12px] text-[#e8e4d8] resize-none"
        />
        <p className="text-[10px] text-[#555] mt-1">Non sauvegardé — à copier manuellement si besoin.</p>
      </div>
    </div>
  )
}
