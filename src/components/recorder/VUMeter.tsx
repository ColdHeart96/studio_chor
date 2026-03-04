'use client'
import { useVUMeter } from '@/hooks/useVUMeter'

const VOICE_COLORS = ['#E8C547', '#FF9944', '#4ADE80', '#6688FF', '#FF4444', '#E87B47']

interface VUMeterProps {
  stream: MediaStream | null
  barCount?: number
  color?: string
}

export function VUMeter({ stream, barCount = 20, color = '#E8C547' }: VUMeterProps) {
  const bars = useVUMeter(stream, barCount)

  return (
    <div className="flex items-end gap-[3px] h-7">
      {bars.map((level, i) => {
        const h = Math.max(3, level * 28)
        // Color gradient: green → yellow → red based on level
        const c = level < 0.5 ? '#4ADE80' : level < 0.8 ? '#E8C547' : '#FF4444'
        return (
          <div
            key={i}
            className="w-[7px] rounded-sm transition-[height] duration-[60ms] ease-linear"
            style={{ height: `${h}px`, background: c }}
          />
        )
      })}
    </div>
  )
}
