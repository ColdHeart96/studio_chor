'use client'
import { useState, useRef, useEffect } from 'react'
import {
  VocalRecorder,
  requestMicrophoneAccess,
  type RecorderState,
  type AudioMode,
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

  function clearTimers() {
    if (countdownTimer.current) clearInterval(countdownTimer.current)
    if (elapsedTimer.current)   clearInterval(elapsedTimer.current)
  }

  useEffect(() => () => {
    clearTimers()
    recorderRef.current?.destroy()
    stream?.getTracks().forEach(t => t.stop())
  }, [])

  async function startCountdown(audioMode: AudioMode = 'headphones') {
    setError(null)
    try {
      // Must request mic inside user gesture (iOS requirement)
      const s = await requestMicrophoneAccess(audioMode)
      setStream(s)

      const recorder = new VocalRecorder()
      await recorder.init(s)
      recorderRef.current = recorder
      setMimeType(recorder.mimeType)

      setState('countdown')
      setCountdown(COUNTDOWN_SECONDS)

      let count = COUNTDOWN_SECONDS
      countdownTimer.current = setInterval(() => {
        count--
        setCountdown(count)
        if (count <= 0) {
          clearInterval(countdownTimer.current!)
          beginRecording(recorder)
        }
      }, 1000)
    } catch (err: unknown) {
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
    const recorded = await recorderRef.current.stop()
    setBlob(recorded)
    setState('reviewing')
  }

  function restartRecording() {
    clearTimers()
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
