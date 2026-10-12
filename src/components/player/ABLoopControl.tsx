'use client'
import { formatTime } from '@/lib/utils'

interface ABLoopControlProps {
  loopA: number    // 0-1
  loopB: number    // 0-1
  duration: number
  onChange: (a: number, b: number) => void
}

export function ABLoopControl({ loopA, loopB, duration, onChange }: ABLoopControlProps) {
  return (
    <div className="bg-studio-surface border border-studio-border rounded-xl p-4 mb-3">
      <div className="text-[10px] text-studio-gold uppercase tracking-wider mb-1">🔁 Boucle A-B</div>
      <div className="text-[11px] text-studio-muted mb-3">
        La lecture répète sans fin le passage entre <span className="text-studio-text">A</span> et{' '}
        <span className="text-studio-text">B</span> (zone blanche sur les formes d&apos;onde).
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] text-studio-strong mb-1.5">
            A (début) : <span className="text-studio-gold">{formatTime(loopA * duration)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(loopA * 100)}
            onChange={e => {
              const a = Number(e.target.value) / 100
              if (a < loopB - 0.02) onChange(a, loopB)
            }}
            className="w-full"
            style={{
              appearance: 'none',
              height: '3px',
              background: `linear-gradient(90deg, rgb(var(--gold)) ${loopA * 100}%, rgb(var(--border2)) ${loopA * 100}%)`,
              borderRadius: '2px',
            }}
          />
        </div>
        <div>
          <div className="text-[11px] text-studio-strong mb-1.5">
            B (fin) : <span className="text-studio-gold">{formatTime(loopB * duration)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(loopB * 100)}
            onChange={e => {
              const b = Number(e.target.value) / 100
              if (b > loopA + 0.02) onChange(loopA, b)
            }}
            className="w-full"
            style={{
              appearance: 'none',
              height: '3px',
              background: `linear-gradient(90deg, rgb(var(--gold)) ${loopB * 100}%, rgb(var(--border2)) ${loopB * 100}%)`,
              borderRadius: '2px',
            }}
          />
        </div>
      </div>
    </div>
  )
}
