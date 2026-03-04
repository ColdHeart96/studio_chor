'use client'
import { cn } from '@/lib/utils'

interface RecordButtonProps {
  recording: boolean
  onClick: () => void
}

export function RecordButton({ recording, onClick }: RecordButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-20 h-20 rounded-full flex items-center justify-center text-[28px] transition-all mx-auto mb-4 cursor-pointer',
        recording
          ? 'bg-gradient-to-br from-studio-red to-[#CC2222] border-2 border-studio-red text-white animate-pulseRec'
          : 'bg-[#1a0a0a] border-2 border-[#2a1010] text-[#553333] hover:border-[#3a1515]'
      )}
    >
      ⏺
    </button>
  )
}
