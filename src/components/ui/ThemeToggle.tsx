'use client'
import { useTheme } from '@/lib/theme'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const toLight = theme === 'dark'
  return (
    <button
      onClick={toggle}
      className={`bg-transparent border border-studio-border2 rounded px-2 py-1 text-studio-muted text-[11px] cursor-pointer hover:text-studio-text transition-colors ${className}`}
      title={toLight ? 'Passer au thème clair' : 'Passer au thème sombre'}
      aria-label={toLight ? 'Passer au thème clair' : 'Passer au thème sombre'}
    >
      {toLight ? '☀' : '☾'}
    </button>
  )
}
