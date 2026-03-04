'use client'
import { PlayButton, IconButton } from '@/components/ui/IconButton'
import { formatTime, formatTimeCode } from '@/lib/utils'

interface TransportControlsProps {
  isPlaying: boolean
  currentTime: number
  duration: number
  progress: number
  loopEnabled: boolean
  onTogglePlay: () => void
  onSeekFraction: (delta: number) => void
  onToggleLoop: () => void
  onSeekBarClick: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function TransportControls({
  isPlaying,
  currentTime,
  duration,
  progress,
  loopEnabled,
  onTogglePlay,
  onSeekFraction,
  onToggleLoop,
  onSeekBarClick,
}: TransportControlsProps) {
  return (
    <div>
      {/* Progress bar */}
      <div
        className="h-1 bg-studio-border rounded cursor-pointer relative mb-1"
        onClick={onSeekBarClick}
      >
        <div
          className="h-full rounded relative transition-[width] duration-[50ms] linear"
          style={{
            width: `${progress * 100}%`,
            background: 'linear-gradient(90deg, #B8962A, #E8C547)',
          }}
        >
          <div className="absolute right-[-5px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-studio-gold shadow-[0_0_8px_#E8C54788]" />
        </div>
      </div>

      {/* Time row */}
      <div className="flex justify-between text-xs text-studio-muted tabular-nums mb-4">
        <span className="text-studio-gold text-sm">{formatTime(currentTime)}</span>
        <span className="text-[11px] tracking-wider">{formatTimeCode(currentTime)}</span>
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
