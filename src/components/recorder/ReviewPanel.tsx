'use client'
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { formatTime } from '@/lib/utils'
import { extractPeaks } from '@/lib/audio/waveformUtils'
import { WaveformRenderer } from '@/components/waveform/WaveformRenderer'

interface ReviewPanelProps {
  blob: Blob
  elapsed: number
  onSave: () => Promise<void>
  onRetry: () => void
  onDiscard: () => void
}

export function ReviewPanel({ blob, elapsed, onSave, onRetry, onDiscard }: ReviewPanelProps) {
  const [isPlaying, setIsPlaying]   = useState(false)
  const [currentTime, setCurrent]   = useState(0)
  const [duration, setDuration]     = useState(0)
  const [peaks, setPeaks]           = useState<number[]>([])
  const [saving, setSaving]         = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef   = useRef<string | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(blob)
    urlRef.current = url
    const audio = new Audio(url)
    audioRef.current = audio

    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration))
    audio.addEventListener('timeupdate', () => setCurrent(audio.currentTime))
    audio.addEventListener('ended', () => { setIsPlaying(false); setCurrent(0) })

    // Decode for waveform
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    blob.arrayBuffer().then(ab => ctx.decodeAudioData(ab)).then(buf => {
      setPeaks(extractPeaks(buf))
      ctx.close()
    }).catch(() => {})

    return () => {
      audio.pause()
      URL.revokeObjectURL(url)
    }
  }, [blob])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      // iOS requires user gesture to play audio
      audio.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  }

  function handleSeek(time: number) {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrent(time)
    }
  }

  async function handleSave() {
    setSaving(true)
    try { await onSave() } finally { setSaving(false) }
  }

  const progress = duration > 0 ? currentTime / duration : 0

  return (
    <div>
      <div className="text-center mb-5">
        <div className="text-[13px] text-studio-green tracking-wide">
          ✓ Enregistrement capturé — {formatTime(elapsed)}
        </div>
      </div>

      <div className="bg-studio-surface border border-studio-border rounded-xl p-4 mb-4">
        <div className="text-[10px] text-studio-muted uppercase tracking-wider mb-3">
          Réécoute
        </div>

        <WaveformRenderer
          peaks={peaks}
          duration={duration}
          currentTime={currentTime}
          onSeek={handleSeek}
          height={44}
          className="mb-3"
        />

        <div className="flex justify-center">
          <button
            onClick={togglePlay}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-studio-gold to-studio-gold-dim text-studio-bg flex items-center justify-center text-lg shadow-[0_0_20px_#E8C54744] hover:scale-105 transition-transform"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-2">
        <Button variant="green" size="lg" loading={saving} onClick={handleSave}>
          ✓ Sauvegarder
        </Button>
        <Button variant="ghost" size="lg" onClick={onRetry}>
          ↺ Recommencer
        </Button>
      </div>
      <Button variant="ghost" size="lg" onClick={onDiscard} className="border-[#1a1814] text-[#555]">
        ✕ Supprimer
      </Button>
    </div>
  )
}
