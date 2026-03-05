'use client'
import { useState, useRef, useEffect } from 'react'
import { WaveformRenderer } from '@/components/waveform/WaveformRenderer'
import { extractPeaks } from '@/lib/audio/waveformUtils'
import { getTakeUrl } from '@/lib/storage'
import { formatTime } from '@/lib/utils'
import type { TakeComment } from '@/types/app.types'

interface TakePlayerProps {
  storagePath: string
  duration: string | null
  comments?: TakeComment[]
  onMarkerPlace?: (time: number) => void
}

export function TakePlayer({ storagePath, duration: durationStr, comments = [], onMarkerPlace }: TakePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrent] = useState(0)
  const [duration, setDuration]   = useState(0)
  const [peaks, setPeaks]         = useState<number[]>([])
  const [loading, setLoading]     = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const url   = await getTakeUrl(storagePath)
        if (!mounted) return
        const audio = new Audio()
        audio.preload = 'auto'
        audio.src = url
        audio.load()  // iOS requires explicit load() before play() works reliably
        audioRef.current = audio

        audio.addEventListener('loadedmetadata', () => {
          if (!mounted) return
          setDuration(audio.duration)
          setLoading(false)
        })
        audio.addEventListener('timeupdate', () => {
          if (!mounted) return
          setCurrent(audio.currentTime)
        })
        audio.addEventListener('ended', () => {
          if (!mounted) return
          setIsPlaying(false)
          setCurrent(0)
        })

        // Decode for waveform
        const resp = await fetch(url)
        const ab   = await resp.arrayBuffer()
        const ctx  = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        const buf  = await ctx.decodeAudioData(ab)
        if (mounted) setPeaks(extractPeaks(buf))
        ctx.close()
      } catch {
        setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
      audioRef.current?.pause()
    }
  }, [storagePath])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  }

  function handleSeek(time: number) {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrent(time)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-studio-muted">
        <span className="w-3 h-3 rounded-full border-2 border-studio-border border-t-studio-gold animate-spin-sm" />
        Chargement…
      </div>
    )
  }

  return (
    <div className="mt-3">
      <WaveformRenderer
        peaks={peaks}
        duration={duration}
        currentTime={currentTime}
        markers={comments.filter(c => c.time_position !== null)}
        onSeek={onMarkerPlace ? undefined : handleSeek}
        onMarkerPlace={onMarkerPlace}
        height={40}
        className="mb-2"
      />

      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="w-9 h-9 rounded-full bg-gradient-to-br from-studio-gold to-studio-gold-dim text-studio-bg flex items-center justify-center text-sm hover:scale-105 transition-transform"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <span className="text-xs text-studio-gold tabular-nums">{formatTime(currentTime)}</span>
        <div className="flex-1 h-0.5 bg-studio-border rounded">
          <div
            className="h-full rounded"
            style={{
              width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%',
              background: 'linear-gradient(90deg, #B8962A, #E8C547)',
            }}
          />
        </div>
        <span className="text-xs text-studio-muted tabular-nums">{formatTime(duration)}</span>
      </div>
    </div>
  )
}
