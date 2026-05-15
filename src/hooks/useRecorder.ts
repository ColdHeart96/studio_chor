'use client'
import { useState, useRef, useEffect } from 'react'
import {
  VocalRecorder,
  requestMicrophoneAccess,
  type RecorderState,
  type AudioMode,
  type RecordingData,
} from '@/lib/audio/recorder'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import { COUNTDOWN_SECONDS, MAX_RECORDING_SECONDS } from '@/lib/constants'

export function useRecorder() {
  const [state, setState]         = useState<RecorderState>('idle')
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [elapsed, setElapsed]     = useState(0)
  const [stream, setStream]       = useState<MediaStream | null>(null)
  const [pcmData, setPcmData]     = useState<RecordingData | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const recorderRef    = useRef<VocalRecorder | null>(null)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedTimer   = useRef<ReturnType<typeof setInterval> | null>(null)

  function clearTimers() {
    if (countdownTimer.current) clearInterval(countdownTimer.current)
    if (elapsedTimer.current)   clearInterval(elapsedTimer.current)
  }

  useEffect(() => () => {
    clearTimers()
    recorderRef.current?.destroy()
    stream?.getTracks().forEach(t => t.stop())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // onBeforeRecord : callback async exécuté juste avant recorder.start().
  // Permet à RecordTab de démarrer l'engine et d'attendre qu'il joue vraiment
  // avant que le micro ne commence à capturer → synchronisation parfaite.
  async function startCountdown(
    audioMode: AudioMode = 'headphones',
    onBeforeRecord?: () => Promise<void>,
  ) {
    setError(null)
    try {
      // Must request mic inside user gesture (iOS requirement)
      const s = await requestMicrophoneAccess(audioMode)
      setStream(s)

      // Get (or create) the AudioContext — must be in the user gesture scope
      const ctx = getAudioEngine().getContext()
      const recorder = new VocalRecorder()
      await recorder.init(s, ctx)
      recorderRef.current = recorder

      setState('countdown')
      setCountdown(COUNTDOWN_SECONDS)

      let count = COUNTDOWN_SECONDS
      countdownTimer.current = setInterval(() => {
        count--
        setCountdown(count)
        if (count <= 0) {
          clearInterval(countdownTimer.current!)
          if (onBeforeRecord) {
            onBeforeRecord()
              .then(() => beginRecording(recorder))
              .catch(() => beginRecording(recorder))
          } else {
            beginRecording(recorder)
          }
        }
      }, 1000)
    } catch {
      setError('Accès au micro refusé. Autorisez le microphone dans les réglages.')
      setState('idle')
    }
  }

  function beginRecording(recorder: VocalRecorder) {
    recorder.start()
    setState('recording')
    setElapsed(0)

    let secs = 0
    elapsedTimer.current = setInterval(() => {
      secs++
      setElapsed(secs)
      if (secs >= MAX_RECORDING_SECONDS) stopRecording()
    }, 1000)
  }

  async function stopRecording() {
    clearTimers()
    if (!recorderRef.current) return
    const data = await recorderRef.current.stop()
    setPcmData(data)
    setState('reviewing')
  }

  function restartRecording() {
    clearTimers()
    recorderRef.current?.destroy()
    recorderRef.current = null
    setPcmData(null)
    stream?.getTracks().forEach(t => t.stop())
    setStream(null)
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
    pcmData,
    error,
    startCountdown,
    stopRecording,
    restartRecording,
    discardRecording,
  }
}
