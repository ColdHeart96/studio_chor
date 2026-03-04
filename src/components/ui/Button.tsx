import { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'gold' | 'red' | 'green' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({
  variant = 'gold',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-serif tracking-wide rounded-xl transition-all disabled:opacity-60 cursor-pointer'

  const variants = {
    gold:    'bg-gradient-to-br from-studio-gold to-studio-gold-dim text-studio-bg font-semibold shadow-[0_0_24px_#E8C54744] hover:opacity-90',
    red:     'bg-gradient-to-br from-studio-red-dark to-[#881111] text-white shadow-[0_0_24px_#CC222244] hover:opacity-90',
    green:   'bg-[#1a4a1a] border border-[#2a4a2a] text-studio-green hover:opacity-90',
    ghost:   'bg-transparent border border-studio-border2 text-studio-muted hover:border-studio-border hover:text-studio-text',
    outline: 'bg-transparent border border-studio-border text-studio-muted hover:border-studio-border2 hover:text-studio-text',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'w-full px-4 py-3.5 text-sm',
  }

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="inline-block w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin-sm" />
      )}
      {children}
    </button>
  )
}
