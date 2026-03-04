'use client'
import { useState, useRef } from 'react'
import { useOrgContext } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'
import { useTracks } from '@/hooks/useTracks'
import { uploadTrack } from '@/lib/storage'
import { getSupabaseClient } from '@/lib/supabase/client'
import { VOICE_PARTS, VOICE_LABELS, VOICE_COLORS } from '@/lib/constants'
import { Card, SectionLabel } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import type { Track, VoicePart } from '@/types/app.types'

export function TrackManager() {
  const { user } = useAuth()
  const { activeOrg, orgs, setActiveOrg } = useOrgContext()
  const { tracks, loading, reload } = useTracks(activeOrg?.id)
  const [uploading, setUploading] = useState<VoicePart | null>(null)
  const [error, setError]         = useState('')

  const inputRefs = useRef<Partial<Record<VoicePart, HTMLInputElement | null>>>({})

  async function handleUpload(voice: VoicePart, file: File) {
    if (!activeOrg || !user) return
    setUploading(voice); setError('')
    try {
      const path = await uploadTrack(activeOrg.id, voice, file)
      const sb = getSupabaseClient()
      await sb.from('tracks').insert({
        org_id:       activeOrg.id,
        voice_part:   voice,
        name:         file.name.replace(/\.[^.]+$/, ''),
        storage_path: path,
        uploaded_by:  user.id,
      })
      await reload()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'upload')
    } finally {
      setUploading(null)
    }
  }

  async function handleDelete(track: Track) {
    const sb = getSupabaseClient()
    // Remove from DB (storage cleanup is optional)
    await sb.from('tracks').delete().eq('id', track.id)
    await reload()
  }

  if (!activeOrg) {
    return (
      <div className="text-center py-8 text-[#444] text-sm">
        Sélectionnez ou créez une organisation
      </div>
    )
  }

  const tracksByVoice = VOICE_PARTS.reduce((acc, v) => {
    acc[v] = tracks.filter(t => t.voice_part === v)
    return acc
  }, {} as Record<VoicePart, Track[]>)

  return (
    <div>
      {/* Org switcher */}
      {orgs.length > 1 && (
        <div className="mb-4">
          <SectionLabel>Organisation</SectionLabel>
          <div className="flex gap-2 flex-wrap">
            {orgs.map(o => (
              <button
                key={o.id}
                onClick={() => setActiveOrg(o)}
                className={`px-3 py-1.5 rounded-lg text-[11px] border font-serif transition-all ${
                  activeOrg.id === o.id
                    ? 'bg-[#E8C54722] border-studio-gold text-studio-gold'
                    : 'bg-transparent border-studio-border2 text-studio-muted hover:text-studio-text'
                }`}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-studio-red mb-3">{error}</p>}

      <SectionLabel>Pistes — {activeOrg.name}</SectionLabel>

      {loading && (
        <div className="flex items-center gap-2 py-4 text-xs text-studio-muted">
          <Spinner size="sm" /> Chargement…
        </div>
      )}

      <div className="space-y-3">
        {VOICE_PARTS.map(voice => {
          const color = VOICE_COLORS[voice]
          const voiceTracks = tracksByVoice[voice] ?? []
          const isUploading = uploading === voice

          return (
            <div key={voice}>
              {/* Upload zone */}
              <div
                className={`flex items-center gap-3 border-2 rounded-xl px-4 py-3.5 cursor-pointer transition-all mb-2 ${
                  isUploading
                    ? 'border-studio-border'
                    : 'border-dashed border-studio-border2 hover:opacity-80'
                }`}
                onClick={() => !isUploading && inputRefs.current[voice]?.click()}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: color, boxShadow: `0 0 6px ${color}66` }}
                />
                <span className="text-sm flex-1" style={{ color }}>
                  {VOICE_LABELS[voice]}
                </span>
                {isUploading ? (
                  <Spinner size="sm" />
                ) : (
                  <span className="text-[10px] text-studio-muted">+ Ajouter une piste</span>
                )}
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  ref={el => { inputRefs.current[voice] = el }}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleUpload(voice, file)
                    e.target.value = ''
                  }}
                />
              </div>

              {/* Existing tracks */}
              {voiceTracks.map(track => (
                <div
                  key={track.id}
                  className="flex items-center gap-2 px-3 py-2 bg-studio-surface border border-studio-border rounded-lg mb-1"
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  <span className="text-[12px] text-studio-text flex-1 truncate">{track.name}</span>
                  <button
                    onClick={() => handleDelete(track)}
                    className="text-[10px] text-studio-muted hover:text-studio-red transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
