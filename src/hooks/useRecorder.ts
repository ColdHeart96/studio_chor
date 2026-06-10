'use client'
import { useState, useRef, useEffect } from 'react'
import {
  VocalRecorder,
  requestMicrophoneAccess,
  type RecorderState,
} from '@/lib/audio/recorder'
import { COUNTDOWN_SECONDS, MAX_RECORDING_SECONDS } from '@/lib/constants'

export function useRecorder() {
  const [state, setState]         = useState<RecorderState>('idle')
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [elapsed, setElapsed]     = useState(0)
  const [stream, setStream]       = useState<MediaStream | null>(null)
  const [blob, setBlob]           = useState<Blob | null>(null)
  const [mimeType, setMimeType]   = useState('audio/mp4')
  const [error, setError]         = useState<string | null>(null)

  const recorderRef    = useRef<VocalRecorder | null>(null)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedTimer   = useRef<ReturnType<typeof setInterval> | null>(null)
  // Mutex: prevents double-tap from launching two concurrent countdowns
  const busyRef        = useRef(false)

  function clearTimers() {
    if (countdownTimer.current) { clearInterval(countdownTimer.current); countdownTimer.current = null }
    if (elapsedTimer.current)   { clearInterval(elapsedTimer.current);   elapsedTimer.current   = null }
  }

  useEffect(() => () => {
    clearTimers()
    recorderRef.current?.destroy()
    stream?.getTracks().forEach(t => t.stop())
  }, [])

  // onBeforeRecord: called just before recorder.start().
  // Should start the backing tracks and return when ready.
  async function startCountdown(onBeforeRecord?: () => Promise<void>) {
    if (busyRef.current) return  // prevent double-tap
    busyRef.current = true
    setError(null)
    try {
      const s = await requestMicrophoneAccess()
      setStream(s)

      const recorder = new VocalRecorder()
      await recorder.init(s)
      recorderRef.current = recorder
      setMimeType(recorder.mimeType)

      setState('countdown')
      setCountdown(COUNTDOWN_SECONDS)

      let count = COUNTDOWN_SECONDS
      // Store in local var so the callback always clears the right interval,
      // even if startCountdown were somehow called again (race safety).
      const timer = setInterval(() => {
        count--
        setCountdown(count)
        if (count <= 0) {
          clearInterval(timer)
          countdownTimer.current = null
          busyRef.current = false
          beginRecording(recorder, onBeforeRecord)
        }
      }, 1000)
      countdownTimer.current = timer
    } catch {
      setError('Accès au micro refusé. Autorisez le microphone dans les réglages.')
      setState('idle')
      busyRef.current = false
    }
  }

  function beginRecording(recorder: VocalRecorder, onBeforeRecord?: () => Promise<void>) {
    // Start recorder FIRST so we capture the user's first notes.
    // If we waited for engine.play() to finish, the engine's resume + scheduling
    // delay (50-300ms) would make us miss the start of the singing — in playback
    // the voice would appear "ahead" of the track because the recording starts
    // mid-phrase.
    try { recorder.start() } catch { return }
    setState('recording')
    setElapsed(0)

    // Start backing tracks in parallel — they catch up within ~50ms
    if (onBeforeRecord) onBeforeRecord().catch(() => {})

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
    const recorded = await recorderRef.current.stop()
    setBlob(recorded)
    setState('reviewing')
  }

  function restartRecording() {
    clearTimers()
    busyRef.current = false
    recorderRef.current?.destroy()
    recorderRef.current = null
    setBlob(null)
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
    blob,
    mimeType,
    error,
    startCountdown,
    stopRecording,
    restartRecording,
    discardRecording,
  }
}
