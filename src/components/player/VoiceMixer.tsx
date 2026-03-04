'use client'
import { VOICE_LABELS, VOICE_COLORS, VOICE_PARTS } from '@/lib/constants'
import type { VoicePart, Track } from '@/types/app.types'
import { cn } from '@/lib/utils'

export interface TrackMixState {
  volume: number   // 0–1.5
  muted: boolean
  solo: boolean
}

export type MixStateMap = Record<VoicePart, TrackMixState>

interface VoiceMixerProps {
  tracks: Partial<Record<VoicePart, Track>>
  mixState: MixStateMap
  onVolumeChange: (voice: VoicePart, vol: number) => void
  onMuteToggle: (voice: VoicePart) => void
  onSoloToggle: (voice: VoicePart) => void
}

export function VoiceMixer({ tracks, mixState, onVolumeChange, onMuteToggle, onSoloToggle }: VoiceMixerProps) {
  const loadedParts = VOICE_PARTS.filter(v => tracks[v])
  if (loadedParts.length === 0) return null

  return (
    <div className="space-y-2">
      {loadedParts.map(voice => {
        const state = mixState[voice]
        const color = VOICE_COLORS[voice]

        return (
          <div
            key={voice}
            className="flex items-center gap-2.5 px-3.5 py-2.5 border border-studio-border rounded-xl transition-all"
          >
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
                background: `linear-gradient(90deg, ${color} ${state.volume * 100 / 1.5}%, #2a2418 ${state.volume * 100 / 1.5}%)`,
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
              title="Solo"
              className={cn(
                'px-2 py-0.5 rounded text-[11px] border font-serif transition-all',
                state.solo
                  ? 'bg-[#E8C54722] border-studio-gold text-studio-gold'
                  : 'bg-transparent border-studio-border text-[#444] hover:text-[#888]'
              )}
            >
              S
            </button>

            {/* Mute */}
            <button
              onClick={() => onMuteToggle(voice)}
              title="Mute"
              className={cn(
                'px-2 py-0.5 rounded text-[11px] border font-serif transition-all',
                state.muted
                  ? 'bg-[#FF444422] border-studio-red text-studio-red'
                  : 'bg-transparent border-studio-border text-[#444] hover:text-[#888]'
              )}
            >
              M
            </button>
          </div>
        )
      })}
    </div>
  )
}
