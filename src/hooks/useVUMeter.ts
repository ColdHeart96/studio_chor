'use client'
import { useState, useEffect, useRef } from 'react'

export function useVUMeter(stream: MediaStream | null, barCount = 20) {
  const [bars, setBars] = useState<number[]>(Array(barCount).fill(0))
  const rafRef          = useRef<number | null>(null)
  const analyserRef     = useRef<AnalyserNode | null>(null)
  const ctxRef          = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!stream) {
      setBars(Array(barCount).fill(0))
      return
    }

    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const audioCtx = new Ctx()
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256

    const source = audioCtx.createMediaStreamSource(stream)
    source.connect(analyser)

    ctxRef.current    = audioCtx
    analyserRef.current = analyser

    const data = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      analyser.getByteFrequencyData(data)
      const newBars: number[] = []
      const step = Math.floor(data.length / barCount)
      for (let i = 0; i < barCount; i++) {
        let sum = 0
        for (let j = 0; j < step; j++) sum += data[i * step + j]
        newBars.push((sum / step) / 255)
      }
      setBars(newBars)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      source.disconnect()
      audioCtx.close()
    }
  }, [stream, barCount])

  return bars
}
