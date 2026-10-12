'use client'

interface RefreshHintProps {
  /** Phrase principale (ce qui ne marche pas) */
  title: string
  /** Détail / conseil */
  children?: React.ReactNode
  className?: string
}

/**
 * Bandeau « ça ne marche pas ? réactualisez la page ».
 * La cause la plus fréquente d'une lecture muette ou d'un micro silencieux est une
 * autorisation (son, micro) accordée APRÈS le chargement : un rechargement règle ça.
 */
export function RefreshHint({ title, children, className = '' }: RefreshHintProps) {
  return (
    <div
      className={`text-[12px] px-3.5 py-3 rounded-xl ${className}`}
      style={{ background: 'rgb(var(--orange) / 0.07)', border: '1px solid rgb(var(--orange) / 0.2)' }}
      role="alert"
    >
      <div className="mb-1" style={{ color: 'rgb(var(--orange))' }}>⚠ {title}</div>
      {children && <div className="text-[11px] text-studio-muted leading-relaxed mb-2.5">{children}</div>}
      <button
        onClick={() => window.location.reload()}
        className="px-3 py-1.5 rounded-lg text-[12px] transition-all"
        style={{ background: 'rgb(var(--gold) / 0.13)', border: '1px solid rgb(var(--gold) / 0.33)', color: 'rgb(var(--gold))' }}
      >
        ↻ Réactualiser la page
      </button>
    </div>
  )
}
