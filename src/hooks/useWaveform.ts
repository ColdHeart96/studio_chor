'use client'
import { useState, useEffect, useRef } from 'react'
import { extractPeaks, drawWaveform } from '@/lib/audio/waveformUtils'

export function useWaveform(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  audioBuffer: AudioBuffer | null,
  progress = 0,
  color = '#2a2418',
  progressColor = '#E8C547'
) {
  const [peaks, setPeaks] = useState<number[]>([])

  useEffect(() => {
    if (!audioBuffer) { setPeaks([]); return }
    const p = extractPeaks(audioBuffer, 200)
    setPeaks(p)
  }, [audioBuffer])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || peaks.length === 0) return
    // Set canvas pixel dimensions to match display size
    canvas.width  = canvas.offsetWidth  * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    drawWaveform(canvas, peaks, { color, progressColor, progress })
  }, [peaks, progress, color, progressColor, canvasRef])

  return { peaks }
}
