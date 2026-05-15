'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import type { VoicePart } from '@/types/app.types'

export function useAudioEngine() {
  const engine = getAudioEngine()
  const [isPlaying, setIsPlaying]       = useState(false)
  const [currentTime, setCurrentTime]   = useState(0)
  const [duration, setDuration]         = useState(0)
  const [speed, setSpeedState]          = useState(100)  // percentage
  const [loopEnabled, setLoopEnabled]   = useState(false)
  const [loopA, setLoopA]               = useState(0.2)
  const [loopB, setLoopB]               = useState(0.7)

  // Ref always up-to-date (frame-perfect, no React batching delay)
  const timeRef = useRef<{ t: number; d: number }>({ t: 0, d: 0 })

  // Throttle le changement de rate à 1 fois par frame (RAF) pour éviter
  // les grésillements causés par des dizaines d'événements slider par seconde
  const pendingRateRef = useRef<number | null>(null)
  const rateRafRef     = useRef<number | null>(null)

  useEffect(() => {
    engine.onTimeUpdate = (t, d) => {
      timeRef.current = { t, d }
      setCurrentTime(t)
      setDuration(d)
    }
    engine.onEnded = () => {
      timeRef.current = { t: 0, d: timeRef.current.d }
      setIsPlaying(false)
      setCurrentTime(0)
    }
    engine.onReset = () => {
      setIsPlaying(false)
    }
    return () => {
      engine.onTimeUpdate = undefined
      engine.onEnded = undefined
      engine.onReset = undefined
      if (rateRafRef.current !== null) cancelAnimationFrame(rateRafRef.current)
    }
  }, [engine])

  const togglePlay = useCallback(async () => {
    if (engine.playing) {
      engine.pause()
      setIsPlaying(false)
    } else {
      await engine.play()
      setIsPlaying(true)
    }
  }, [engine])

  const seek = useCallback((time: number) => {
    engine.seek(time)
    timeRef.current.t = time
    setCurrentTime(time)
  }, [engine])

  const seekFraction = useCallback((fraction: number) => {
    engine.seekRelative(fraction)
  }, [engine])

  const setVolume = useCallback((voice: VoicePart, vol: number) => {
    engine.setVolume(voice, vol)
  }, [engine])

  const setMute = useCallback((voice: VoicePart, muted: boolean) => {
    engine.setMute(voice, muted)
  }, [engine])

  const setSpeed = useCallback((pct: number) => {
    setSpeedState(pct)
    pendingRateRef.current = pct / 100
    if (rateRafRef.current === null) {
      rateRafRef.current = requestAnimationFrame(() => {
        if (pendingRateRef.current !== null) {
          engine.setPlaybackRate(pendingRateRef.current)
          pendingRateRef.current = null
        }
        rateRafRef.current = null
      })
    }
  }, [engine])

  const setLoop = useCallback((enabled: boolean, a?: number, b?: number) => {
    const la = a ?? loopA
    const lb = b ?? loopB
    setLoopEnabled(enabled)
    setLoopA(la)
    setLoopB(lb)
    engine.setLoop(enabled, la, lb)
  }, [engine, loopA, loopB])

  return {
    engine,
    isPlaying,
    currentTime,
    duration,
    speed,
    loopEnabled,
    loopA,
    loopB,
    timeRef,   // frame-perfect ref for direct DOM updates
    togglePlay,
    seek,
    seekFraction,
    setVolume,
    setMute,
    setSpeed,
    setLoop,
  }
}
