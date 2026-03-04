import { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function IconButton({ active, size = 'md', className, children, ...props }: IconButtonProps) {
  const sizes = { sm: 'w-8 h-8 text-sm', md: 'w-11 h-11 text-lg', lg: 'w-16 h-16 text-2xl' }

  return (
    <button
      className={cn(
        'rounded-full flex items-center justify-center transition-all cursor-pointer',
        active
          ? 'bg-[#E8C54722] border border-studio-gold text-studio-gold'
          : 'bg-studio-surface border border-studio-border text-[#666] hover:border-studio-border2 hover:text-[#888]',
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function PlayButton({
  playing,
  onClick,
  size = 'md',
}: {
  playing: boolean
  onClick: () => void
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizes = { sm: 'w-10 h-10 text-sm', md: 'w-16 h-16 text-[22px]', lg: 'w-20 h-20 text-3xl' }
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full bg-gradient-to-br from-studio-gold to-studio-gold-dim text-studio-bg flex items-center justify-center shadow-[0_0_30px_#E8C54755] transition-all hover:scale-105',
        sizes[size]
      )}
    >
      {playing ? '⏸' : '▶'}
    </button>
  )
}
