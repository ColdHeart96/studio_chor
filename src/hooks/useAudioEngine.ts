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

  useEffect(() => {
    engine.onTimeUpdate = (t, d) => {
      setCurrentTime(t)
      setDuration(d)
    }
    engine.onEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }
    return () => {
      engine.onTimeUpdate = undefined
      engine.onEnded = undefined
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
    engine.setPlaybackRate(pct / 100)
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
    togglePlay,
    seek,
    seekFraction,
    setVolume,
    setMute,
    setSpeed,
    setLoop,
  }
}
