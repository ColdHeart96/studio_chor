'use client'

interface SpeedControlProps {
  speed: number  // percentage (50-150)
  onChange: (pct: number) => void
}

export function SpeedControl({ speed, onChange }: SpeedControlProps) {
  return (
    <div className="flex items-center gap-3 bg-studio-surface border border-studio-border rounded-xl px-4 py-3 mb-3">
      <span className="text-[11px] text-studio-muted uppercase tracking-wider w-16">Vitesse</span>
      <span className="text-xl text-studio-gold w-14 text-center tabular-nums">{speed}%</span>
      <input
        type="range"
        min="50"
        max="150"
        value={speed}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1"
        style={{
          appearance: 'none',
          height: '3px',
          background: `linear-gradient(90deg, #E8C547 ${(speed - 50) / 100 * 100}%, #2a2418 ${(speed - 50) / 100 * 100}%)`,
          borderRadius: '2px',
        }}
      />
      <button
        onClick={() => onChange(100)}
        className="px-2.5 py-1 bg-transparent border border-studio-border2 rounded text-[#666] text-[11px] font-serif cursor-pointer hover:text-[#888] transition-colors"
      >
        Reset
      </button>
    </div>
  )
}
