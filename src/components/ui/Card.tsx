import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  accent?: boolean
}

export function Card({ children, className, accent }: CardProps) {
  return (
    <div
      className={cn(
        'bg-studio-surface border border-studio-border rounded-xl p-4',
        accent && 'bg-[rgb(var(--gold)/0.03)] border-[rgb(var(--gold)/0.12)]',
        className
      )}
    >
      {children}
    </div>
  )
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('text-[10px] text-studio-muted uppercase tracking-[0.15em] mb-2.5 mt-5', className)}>
      {children}
    </div>
  )
}
