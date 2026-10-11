'use client'
import { useState, useRef, useEffect } from 'react'
import { requestMicrophoneAccess, resolveMicDeviceId, type RecorderState } from '@/lib/audio/recorder'
import { getRoute } from '@/lib/audio/latency'
import { CaptureSession, type CapturedVoice } from '@/lib/audio/captureSession'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import { COUNTDOWN_SECONDS, MAX_RECORDING_SECONDS } from '@/lib/constants'

/** Avance donnée au planning audio : le démarrage doit être dans le futur du contexte. */
const START_LEAD_S = 0.25
/** Temps laissé à la fin de la dernière note pour arriver du micro. */
const STOP_TAIL_MS = 300

export function useRecorder() {
  const [state, setState]         = useState<RecorderState>('idle')
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [elapsed, setElapsed]     = useState(0)
  const [stream, setStream]       = useState<MediaStream | null>(null)
  const [voice, setVoice]         = useState<CapturedVoice | null>(null)
  const [error, setError]         = useState<string | null>(null)
  // Vrai si le micro n'a rien livré après quelques secondes (autorisation manquante, micro coupé)
  const [noSignal, setNoSignal]   = useState(false)

  const sessionRef     = useRef<CaptureSession | null>(null)
  const streamRef      = useRef<MediaStream | null>(null)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedTimer   = useRef<ReturnType<typeof setInterval> | null>(null)
  // Mutex : empêche un double-tap de lancer deux décomptes
  const busyRef        = useRef(false)

  function clearTimers() {
    if (countdownTimer.current) { clearInterval(countdownTimer.current); countdownTimer.current = null }
    if (elapsedTimer.current)   { clearInterval(elapsedTimer.current);   elapsedTimer.current   = null }
  }

  function releaseMic() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setStream(null)
  }

  useEffect(() => () => {
    clearTimers()
    sessionRef.current?.destroy()
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  /**
   * onBeforeRecord(t0) : doit lancer les pistes EXACTEMENT à `t0` (temps AudioContext).
   * La voix capturée à partir de `t0` est alors alignée sur le début des pistes.
   */
  async function startCountdown(onBeforeRecord?: (t0: number) => Promise<void> | void) {
    if (busyRef.current) return
    busyRef.current = true
    setError(null)

    let s: MediaStream
    try {
      s = await requestMicrophoneAccess(await resolveMicDeviceId(getRoute()))
    } catch {
      setError('Accès au micro refusé. Autorisez le microphone dans les réglages.')
      setState('idle')
      busyRef.current = false
      return
    }

    try {
      streamRef.current = s
      setStream(s)

      const engine = getAudioEngine()
      await engine.resumeContext()
      const session = new CaptureSession(engine.getContext())
      await session.open(s)
      sessionRef.current = session

      setState('countdown')
      setCountdown(COUNTDOWN_SECONDS)

      let count = COUNTDOWN_SECONDS
      const timer = setInterval(() => {
        count--
        setCountdown(count)
        if (count <= 0) {
          clearInterval(timer)
          countdownTimer.current = null
          busyRef.current = false
          beginRecording(session, onBeforeRecord)
        }
      }, 1000)
      countdownTimer.current = timer
    } catch {
      sessionRef.current?.destroy()
      sessionRef.current = null
      releaseMic()
      setError('Impossible de démarrer l\'enregistrement audio sur cet appareil.')
      setState('idle')
      busyRef.current = false
    }
  }

  function beginRecording(
    session: CaptureSession,
    onBeforeRecord?: (t0: number) => Promise<void> | void,
  ) {
    const ctx = getAudioEngine().getContext()
    // Un seul instant de référence pour la voix ET les pistes.
    const t0 = ctx.currentTime + START_LEAD_S
    session.begin(t0)
    if (onBeforeRecord) {
      Promise.resolve(onBeforeRecord(t0)).catch(() => {})
    }

    setState('recording')
    setElapsed(0)
    setNoSignal(false)

    let secs = 0
    elapsedTimer.current = setInterval(() => {
      secs++
      setElapsed(secs)
      if (secs === 4 && session.peak < 0.002) setNoSignal(true)
      if (secs >= MAX_RECORDING_SECONDS) void stopRecording()
    }, 1000)
  }

  async function stopRecording() {
    clearTimers()
    const session = sessionRef.current
    if (!session) return
    sessionRef.current = null

    // On coupe les pistes tout de suite : la fin de capture ne dépend plus d'elles.
    try { getAudioEngine().pause() } catch { /* ignore */ }

    const captured = await session.finish(STOP_TAIL_MS)
    releaseMic()
    setVoice(captured)
    setState('reviewing')
  }

  function restartRecording() {
    clearTimers()
    busyRef.current = false
    sessionRef.current?.destroy()
    sessionRef.current = null
    releaseMic()
    setVoice(null)
    setNoSignal(false)
    setState('idle')
    setElapsed(0)
  }

  function discardRecording() {
    restartRecording()
  }

  return {
    state,
    countdown,
    elapsed,
    stream,
    voice,
    error,
    noSignal,
    startCountdown,
    stopRecording,
    restartRecording,
    discardRecording,
  }
}
