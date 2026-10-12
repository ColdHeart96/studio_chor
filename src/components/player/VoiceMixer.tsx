'use client'
import { VOICE_LABELS, VOICE_PARTS } from '@/lib/constants'
import { useTheme } from '@/lib/theme'
import type { VoicePart, Track } from '@/types/app.types'
import { cn } from '@/lib/utils'
import { WaveformRenderer } from '@/components/waveform/WaveformRenderer'

export interface TrackMixState {
  volume: number   // 0–1.5
  muted: boolean
  solo: boolean
}

export type MixStateMap = Record<VoicePart, TrackMixState>

interface VoiceMixerProps {
  tracks: Partial<Record<VoicePart, Track>>
  /** Pics de chaque voix : une mini forme d'onde est affichée dans sa ligne */
  peaks: Partial<Record<VoicePart, number[]>>
  duration: number
  currentTime: number
  onSeek: (time: number) => void
  loopRegion?: { a: number; b: number }
  mixState: MixStateMap
  onVolumeChange: (voice: VoicePart, vol: number) => void
  onMuteToggle: (voice: VoicePart) => void
  onSoloToggle: (voice: VoicePart) => void
}

export function VoiceMixer({ tracks, peaks, duration, currentTime, onSeek, loopRegion, mixState, onVolumeChange, onMuteToggle, onSoloToggle }: VoiceMixerProps) {
  const { voiceColors: VOICE_COLORS } = useTheme()
  const loadedParts = VOICE_PARTS.filter(v => tracks[v])
  if (loadedParts.length === 0) return null

  return (
    <div className="space-y-2">
      {/* Légende des boutons */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-studio-muted pb-1">
        <span>
          <span className="inline-block px-1.5 rounded border border-studio-border text-studio-gold mr-1">S</span>
          <b className="font-normal text-studio-text">Solo</b> : n&apos;écouter que cette voix
        </span>
        <span>
          <span className="inline-block px-1.5 rounded border border-studio-border text-studio-red mr-1">M</span>
          <b className="font-normal text-studio-text">Muet</b> : couper cette voix
        </span>
      </div>
      {loadedParts.map(voice => {
        const state = mixState[voice]
        const color = VOICE_COLORS[voice]

        return (
          <div
            key={voice}
            className="px-3.5 py-2.5 border border-studio-border rounded-xl transition-all"
          >
            <div className="flex items-center gap-2.5">
            {/* Color dot */}
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: color, boxShadow: `0 0 6px ${color}66` }}
            />

            {/* Label */}
            <span className="text-[13px] flex-shrink-0 w-14" style={{ color }}>
              {VOICE_LABELS[voice]}
            </span>

            {/* Volume slider */}
            <input
              type="range"
              min="0"
              max="150"
              value={Math.round(state.volume * 100)}
              onChange={e => onVolumeChange(voice, Number(e.target.value) / 100)}
              className="flex-1"
              style={{
                appearance: 'none',
                height: '3px',
                background: `linear-gradient(90deg, ${color} ${state.volume * 100 / 1.5}%, rgb(var(--border2)) ${state.volume * 100 / 1.5}%)`,
                borderRadius: '2px',
              }}
            />

            {/* Vol % */}
            <span className="text-[11px] text-studio-muted w-8 text-right tabular-nums">
              {Math.round(state.volume * 100)}%
            </span>

            {/* Solo */}
            <button
              onClick={() => onSoloToggle(voice)}
              title="Solo : n'écouter que cette voix"
              aria-label={`Solo ${VOICE_LABELS[voice]}`}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] border font-serif transition-all',
                state.solo
                  ? 'bg-[rgb(var(--gold)/0.13)] border-studio-gold text-studio-gold'
                  : 'bg-transparent border-studio-border text-studio-faint hover:text-studio-strong'
              )}
            >
              S
            </button>

            {/* Mute */}
            <button
              onClick={() => onMuteToggle(voice)}
              title="Muet : couper cette voix"
              aria-label={`Muet ${VOICE_LABELS[voice]}`}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] border font-serif transition-all',
                state.muted
                  ? 'bg-[rgb(var(--red)/0.13)] border-studio-red text-studio-red'
                  : 'bg-transparent border-studio-border text-studio-faint hover:text-studio-strong'
              )}
            >
              M
            </button>
            </div>

            {/* Mini forme d'onde de la voix (estompée si la voix est coupée) */}
            {peaks[voice] && (
              <div className={cn('mt-2 transition-opacity', (state.muted) && 'opacity-40')}>
                <WaveformRenderer
                  peaks={peaks[voice]!}
                  duration={duration}
                  currentTime={currentTime}
                  color={color}
                  onSeek={onSeek}
                  loopRegion={loopRegion}
                  height={22}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
