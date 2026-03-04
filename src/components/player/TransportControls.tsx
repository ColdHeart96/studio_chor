'use client'
import { useRef, useEffect } from 'react'
import { PlayButton, IconButton } from '@/components/ui/IconButton'
import { formatTime, formatTimeCode } from '@/lib/utils'

interface TransportControlsProps {
  isPlaying: boolean
  duration: number
  loopEnabled: boolean
  // Frame-perfect ref (bypasses React batching for smooth seekbar)
  timeRef: React.RefObject<{ t: number; d: number }>
  onTogglePlay: () => void
  onSeekFraction: (delta: number) => void
  onToggleLoop: () => void
  onSeekBarClick: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function TransportControls({
  isPlaying,
  duration,
  loopEnabled,
  timeRef,
  onTogglePlay,
  onSeekFraction,
  onToggleLoop,
  onSeekBarClick,
}: TransportControlsProps) {
  // Direct DOM refs — updated every rAF, no React re-render needed
  const fillRef     = useRef<HTMLDivElement>(null)
  const thumbRef    = useRef<HTMLDivElement>(null)
  const timeDispRef = useRef<HTMLSpanElement>(null)
  const codeDispRef = useRef<HTMLSpanElement>(null)
  const rafRef      = useRef<number>(0)

  // rAF loop: update seekbar DOM directly every frame
  useEffect(() => {
    const tick = () => {
      const { t, d } = timeRef.current ?? { t: 0, d: 0 }
      const pct = d > 0 ? (t / d) * 100 : 0

      if (fillRef.current)     fillRef.current.style.width = `${pct}%`
      if (thumbRef.current)    thumbRef.current.style.left  = `${pct}%`
      if (timeDispRef.current) timeDispRef.current.textContent = formatTime(t)
      if (codeDispRef.current) codeDispRef.current.textContent = formatTimeCode(t)

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [timeRef])

  return (
    <div>
      {/* Progress bar — NO CSS transition, updated directly via rAF */}
      <div
        className="h-1 bg-studio-border rounded cursor-pointer relative mb-1 mt-3"
        onClick={onSeekBarClick}
      >
        <div
          ref={fillRef}
          className="h-full rounded"
          style={{
            width: '0%',
            background: 'linear-gradient(90deg, #B8962A, #E8C547)',
          }}
        />
        {/* Thumb — positioned absolutely, also updated via rAF */}
        <div
          ref={thumbRef}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-studio-gold shadow-[0_0_8px_#E8C54788] pointer-events-none"
          style={{ left: '0%' }}
        />
      </div>

      {/* Time row */}
      <div className="flex justify-between text-xs text-studio-muted tabular-nums mb-4">
        <span ref={timeDispRef} className="text-studio-gold text-sm">0:00</span>
        <span ref={codeDispRef} className="text-[11px] tracking-wider">00:00:000</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <IconButton onClick={() => onSeekFraction(-0.1)} title="Début">⏮</IconButton>
        <IconButton onClick={() => onSeekFraction(-0.03)}>⏪</IconButton>
        <PlayButton playing={isPlaying} onClick={onTogglePlay} />
        <IconButton onClick={() => onSeekFraction(0.03)}>⏩</IconButton>
        <IconButton active={loopEnabled} onClick={onToggleLoop} title="Boucle A-B">⌁</IconButton>
      </div>
    </div>
  )
}
