'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { drawWaveform } from '@/lib/audio/waveformUtils'
import { useTheme, themeColor } from '@/lib/theme'

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
  color: colorProp,
  className = '',
  height = 44,
}: WaveformRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { theme } = useTheme()
  const color = colorProp ?? themeColor('gold')
  // Force a redraw when the container resizes (e.g. on first layout)
  const [, setResizeTick] = useState(0)

  // Fraction (0-1) pendant un glissement : le curseur suit le doigt, la lecture n'est déplacée qu'au relâchement
  const [scrub, setScrub] = useState<number | null>(null)
  const scrubbing = useRef(false)

  const progress = scrub !== null ? scrub : (duration > 0 ? currentTime / duration : 0)

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
      color:         themeColor('border2'),
      progressColor: color,
      progress,
      barWidth: 2,
      gap: 1,
    })

    // Zone de boucle A–B : bande blanche (couleur neutre, distincte de toutes les voix) + repères A / B
    if (loopRegion) {
      const ax = loopRegion.a * w
      const bx = loopRegion.b * w
      ctx.fillStyle = themeColor('overlay', 0.15)
      ctx.fillRect(ax, 0, bx - ax, h)
      ctx.strokeStyle = themeColor('overlay', 0.8)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(ax + 1, 0)
      ctx.lineTo(ax + 1, h)
      ctx.moveTo(bx - 1, 0)
      ctx.lineTo(bx - 1, h)
      ctx.stroke()
      ctx.fillStyle = themeColor('text')
      ctx.font = 'bold 10px sans-serif'
      ctx.textBaseline = 'top'
      ctx.fillText('A', ax + 4, 2)
      ctx.fillText('B', Math.max(ax + 14, bx - 12), 2)
    }

    // Temporal markers
    if (duration > 0) {
      for (const m of markers) {
        if (m.time_position === null || m.time_position === undefined) continue
        const x = (m.time_position / duration) * w
        ctx.strokeStyle = themeColor('orange')
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
        // Diamond head
        ctx.fillStyle = themeColor('orange')
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
      ctx.strokeStyle = themeColor('text', 0.3)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, h)
      ctx.stroke()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peaks, progress, loopRegion, markers, duration, color, theme])

  const fractionAt = useCallback((clientX: number): number => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const canDrag = !!onSeek && !onMarkerPlace

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!canDrag || duration === 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    scrubbing.current = true
    setScrub(fractionAt(e.clientX))
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!scrubbing.current) return
    setScrub(fractionAt(e.clientX))
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!scrubbing.current) return
    scrubbing.current = false
    setScrub(null)
    onSeek?.(fractionAt(e.clientX) * duration)
  }

  function handlePointerCancel() {
    scrubbing.current = false
    setScrub(null)
  }

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas || duration === 0) return
    const rect  = canvas.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const time  = ratio * duration
    if (onMarkerPlace) {
      onMarkerPlace(time)
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
      onClick={onMarkerPlace ? handleClick : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className={`w-full rounded block ${onSeek || onMarkerPlace ? 'cursor-pointer' : ''} ${onMarkerPlace ? 'cursor-crosshair' : ''} ${className}`}
      style={{ height, touchAction: canDrag ? 'pan-y' : undefined }}
      title={onMarkerPlace ? 'Cliquer pour placer un marqueur' : undefined}
    />
  )
}
