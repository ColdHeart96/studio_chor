'use client'

interface CountdownOverlayProps {
  count: number
}

export function CountdownOverlay({ count }: CountdownOverlayProps) {
  return (
    <div className="text-center py-12">
      <div className="text-[13px] text-[#666] tracking-[0.2em] uppercase mb-6">Préparez-vous…</div>
      <div
        key={count}
        className="text-[96px] text-studio-gold italic text-shadow-gold animate-cdPop"
        style={{ textShadow: '0 0 60px #E8C54788' }}
      >
        {count}
      </div>
      <div className="text-xs text-[#555] mt-6">Commencez à chanter au départ</div>
    </div>
  )
}
