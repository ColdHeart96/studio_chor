'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Track } from '@/types/app.types'
import { getSupabaseClient } from '@/lib/supabase/client'
import { getTrackUrl } from '@/lib/storage'

export function useTracks(orgId: string | null | undefined) {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
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
  }, [orgId])

  useEffect(() => { load() }, [load])

  // Reload when the tab/window regains focus or becomes visible.
  // Handles the case where the user adds tracks in the admin panel
  // (in another tab or in-app navigation) and comes back here.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    const onFocus   = () => load()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  return { tracks, loading, reload: load }
}
