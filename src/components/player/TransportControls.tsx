'use client'
import { useRef, useEffect } from 'react'
import { PlayButton, IconButton } from '@/components/ui/IconButton'
import { formatTime, formatTimeCode } from '@/lib/utils'

interface TransportControlsProps {
  isPlaying: boolean
  duration: number
  loopEnabled: boolean
  loopA: number   // 0-1
  loopB: number   // 0-1
  // Frame-perfect ref (bypasses React batching for smooth seekbar)
  timeRef: React.RefObject<{ t: number; d: number }>
  onTogglePlay: () => void
  onSeekFraction: (delta: number) => void
  onToggleLoop: () => void
  /** Appelé en fin de glissement (ou au clic) avec la position visée, en secondes */
  onSeek: (time: number) => void
}

export function TransportControls({
  isPlaying,
  duration,
  loopEnabled,
  loopA,
  loopB,
  timeRef,
  onTogglePlay,
  onSeekFraction,
  onToggleLoop,
  onSeek,
}: TransportControlsProps) {
  // Direct DOM refs — updated every rAF, no React re-render needed
  const barRef      = useRef<HTMLDivElement>(null)
  const fillRef     = useRef<HTMLDivElement>(null)
  const thumbRef    = useRef<HTMLDivElement>(null)
  const timeDispRef = useRef<HTMLSpanElement>(null)
  const codeDispRef = useRef<HTMLSpanElement>(null)
  const rafRef      = useRef<number>(0)
  // Fraction (0-1) pendant un glissement, null sinon : la barre suit le doigt, le son ne bouge qu'au relâchement
  const scrubRef    = useRef<number | null>(null)
  const durationRef = useRef(duration)
  durationRef.current = duration

  // rAF loop: update seekbar DOM directly every frame
  useEffect(() => {
    const tick = () => {
      const { t, d } = timeRef.current ?? { t: 0, d: 0 }
      const scrub = scrubRef.current
      const shownT = scrub !== null ? scrub * d : t
      const pct = scrub !== null ? scrub * 100 : (d > 0 ? (t / d) * 100 : 0)

      if (fillRef.current)     fillRef.current.style.width = `${pct}%`
      if (thumbRef.current)    thumbRef.current.style.left  = `${pct}%`
      if (timeDispRef.current) timeDispRef.current.textContent = formatTime(shownT)
      if (codeDispRef.current) codeDispRef.current.textContent = formatTimeCode(shownT)

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [timeRef])

  function fractionFromEvent(e: React.PointerEvent<HTMLDivElement>): number {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (durationRef.current <= 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    scrubRef.current = fractionFromEvent(e)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (scrubRef.current === null) return
    scrubRef.current = fractionFromEvent(e)
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (scrubRef.current === null) return
    const fraction = fractionFromEvent(e)
    scrubRef.current = null
    onSeek(fraction * durationRef.current)
  }

  function handlePointerCancel() {
    scrubRef.current = null
  }

  return (
    <div>
      {/* Progress bar — NO CSS transition, updated directly via rAF.
          Zone de prise haute (py-3) pour le doigt ; touch-action:none pour que le glissement ne fasse pas défiler la page. */}
      <div
        ref={barRef}
        className="relative mb-1 mt-1 py-3 cursor-pointer select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        role="slider"
        aria-label="Position de lecture"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
      >
        <div className="h-1.5 bg-studio-border rounded relative">
          {/* Zone de boucle A–B */}
          {loopEnabled && (
            <div
              className="absolute -top-1 -bottom-1 rounded-sm pointer-events-none"
              style={{
                left: `${loopA * 100}%`,
                width: `${(loopB - loopA) * 100}%`,
                background: 'rgb(var(--overlay) / 0.15)',
                borderLeft: '2px solid rgb(var(--overlay) / 0.8)',
                borderRight: '2px solid rgb(var(--overlay) / 0.8)',
              }}
            />
          )}
          <div
            ref={fillRef}
            className="h-full rounded"
            style={{
              width: '0%',
              background: 'linear-gradient(90deg, rgb(var(--gold-dim)), rgb(var(--gold)))',
            }}
          />
          {/* Thumb — positioned absolutely, also updated via rAF */}
          <div
            ref={thumbRef}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-studio-gold shadow-[0_0_8px_rgb(var(--gold)/0.53)] pointer-events-none"
            style={{ left: '0%' }}
          />
        </div>
      </div>

      {/* Time row */}
      <div className="flex justify-between text-xs text-studio-muted tabular-nums mb-4">
        <span ref={timeDispRef} className="text-studio-gold text-sm">0:00</span>
        <span ref={codeDispRef} className="text-[11px] tracking-wider">00:00:000</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <IconButton onClick={() => onSeekFraction(-0.1)} title="Début">⏮</IconButton>
        <IconButton onClick={() => onSeekFraction(-0.03)}>⏪</IconButton>
        <PlayButton playing={isPlaying} onClick={onTogglePlay} />
        <IconButton onClick={() => onSeekFraction(0.03)}>⏩</IconButton>
      </div>

      {/* Boucle : bouton explicite avec libellé et état */}
      <div className="flex justify-center mb-4">
        <button
          onClick={onToggleLoop}
          aria-pressed={loopEnabled}
          className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[12px] transition-all cursor-pointer ${
            loopEnabled
              ? 'bg-[rgb(var(--overlay)/0.09)] border-[rgb(var(--overlay)/0.67)] text-studio-text'
              : 'bg-studio-surface border-studio-border text-studio-soft hover:border-studio-border2 hover:text-studio-strong'
          }`}
          title="Répéter en boucle un passage de la piste"
        >
          <span className="text-base leading-none">🔁</span>
          <span>{loopEnabled ? 'Boucle activée' : 'Boucle'}</span>
        </button>
      </div>
    </div>
  )
}
