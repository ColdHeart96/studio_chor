'use client'
import { useState, useEffect } from 'react'
import type { Track, VoicePart } from '@/types/app.types'
import { getSupabaseClient } from '@/lib/supabase/client'
import { getTrackUrl } from '@/lib/storage'

export function useTracks(orgId: string | null | undefined) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    if (!orgId) { setTracks([]); return }
    setLoading(true)
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('tracks')
      .select('*')
      .eq('org_id', orgId)
      .order('voice_part')

    if (error) { setLoading(false); return }

    // Resolve signed URLs
    const resolved = await Promise.all(
      (data as Track[]).map(async t => {
        try {
          const url = await getTrackUrl(t.storage_path)
          return { ...t, url }
        } catch {
          return t
        }
      })
    )
    setTracks(resolved)
    setLoading(false)
  }

  useEffect(() => { load() }, [orgId])

  return { tracks, loading, reload: load }
}
