'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { drawWaveform } from '@/lib/audio/waveformUtils'

export interface WaveformMarker {
  id: string | number
  time_position: number | null
  note?: string
}

interface WaveformRendererProps {
  peaks: number[]
  duration: number
  currentTime: number
  markers?: WaveformMarker[]
  onSeek?: (time: number) => void
  onMarkerPlace?: (time: number) => void  // Admin only
  loopRegion?: { a: number; b: number }  // fractions 0-1
  color?: string
  className?: string
  height?: number
}

export function WaveformRenderer({
  peaks,
  duration,
  currentTime,
  markers = [],
  onSeek,
  onMarkerPlace,
  loopRegion,
  color = '#E8C547',
  className = '',
  height = 44,
}: WaveformRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Force a redraw when the container resizes (e.g. on first layout)
  const [, setResizeTick] = useState(0)

  const progress = duration > 0 ? currentTime / duration : 0

  // ResizeObserver: triggers redraw when canvas display size changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setResizeTick(n => n + 1))
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  // Draw whenever any visual input changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || peaks.length === 0) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    // Guard: skip if not yet laid out
    if (w === 0 || h === 0) return

    canvas.width  = w * dpr
    canvas.height = h * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    drawWaveform(canvas, peaks, {
      color:         '#2a2418',
      progressColor: color,
      progress,
      barWidth: 2,
      gap: 1,
    })

    // Loop region overlay
    if (loopRegion) {
      ctx.fillStyle = `${color}1e`
      ctx.fillRect(loopRegion.a * w, 0, (loopRegion.b - loopRegion.a) * w, h)
      // Loop region borders
      ctx.strokeStyle = `${color}88`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(loopRegion.a * w, 0)
      ctx.lineTo(loopRegion.a * w, h)
      ctx.moveTo(loopRegion.b * w, 0)
      ctx.lineTo(loopRegion.b * w, h)
      ctx.stroke()
    }

    // Temporal markers
    if (duration > 0) {
      for (const m of markers) {
        if (m.time_position === null || m.time_position === undefined) continue
        const x = (m.time_position / duration) * w
        ctx.strokeStyle = '#FF9944'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
        // Diamond head
        ctx.fillStyle = '#FF9944'
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + 5, 6)
        ctx.lineTo(x, 12)
        ctx.lineTo(x - 5, 6)
        ctx.closePath()
        ctx.fill()
      }
    }

    // Playhead
    if (progress > 0 && progress < 1) {
      const px = progress * w
      ctx.strokeStyle = '#ffffff44'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, h)
      ctx.stroke()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peaks, progress, loopRegion, markers, duration, color])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || duration === 0) return
    const rect  = canvas.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const time  = ratio * duration
    if (onMarkerPlace) {
      onMarkerPlace(time)
    } else if (onSeek) {
      onSeek(time)
    }
  }, [duration, onSeek, onMarkerPlace])

  if (peaks.length === 0) {
    return (
      <div
        className={`bg-studio-surface2 rounded border border-studio-border flex items-center justify-center ${className}`}
        style={{ height }}
      >
        <span className="text-[10px] text-studio-muted">Chargement…</span>
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className={`w-full rounded block ${onSeek || onMarkerPlace ? 'cursor-pointer' : ''} ${onMarkerPlace ? 'cursor-crosshair' : ''} ${className}`}
      style={{ height }}
      title={onMarkerPlace ? 'Cliquer pour placer un marqueur' : undefined}
    />
  )
}
