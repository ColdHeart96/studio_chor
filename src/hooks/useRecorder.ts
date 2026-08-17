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

  // setupGraph: given the raw mic stream, connects it to the engine's recording bus
  // and returns the mixed (mic + tracks) stream to actually record from.
  // scheduleTracks: schedules the backing tracks to start on the shared AudioContext
  // clock — called right after recorder.start() so both live on the same timeline
  // instead of racing two independent async starts.
  async function startCountdown(callbacks?: {
    setupGraph: (micStream: MediaStream) => MediaStream
    scheduleTracks: () => void
  }) {
    if (busyRef.current) return  // prevent double-tap
    busyRef.current = true
    setError(null)
    try {
      const s = await requestMicrophoneAccess()
      setStream(s)

      const recordStream = callbacks ? callbacks.setupGraph(s) : s
      const recorder = new VocalRecorder()
      await recorder.init(recordStream)
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
          beginRecording(recorder, callbacks?.scheduleTracks)
        }
      }, 1000)
      countdownTimer.current = timer
    } catch {
      setError('Accès au micro refusé. Autorisez le microphone dans les réglages.')
      setState('idle')
      busyRef.current = false
    }
  }

  function beginRecording(recorder: VocalRecorder, scheduleTracks?: () => void) {
    // Mic and backing tracks are both already wired into the same AudioContext graph
    // (see setupGraph) — recorder.start() and scheduleTracks() no longer race each
    // other, so the order between them doesn't affect sync. Starting the recorder
    // first just avoids clipping the singer's very first notes.
    try { recorder.start() } catch { return }
    setState('recording')
    setElapsed(0)

    scheduleTracks?.()

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
