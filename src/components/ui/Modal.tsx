'use client'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full max-w-sm bg-studio-surface border border-studio-border2 rounded-2xl p-6 animate-fadeIn',
          className
        )}
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="text-sm text-studio-gold tracking-wide mb-4">{title}</div>
        )}
        {children}
      </div>
    </div>
  )
}
