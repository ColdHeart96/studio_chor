'use client'
import { useState, useEffect } from 'react'
import type { Take } from '@/types/app.types'
import { getSupabaseClient } from '@/lib/supabase/client'
import { deleteTakeFromStorage } from '@/lib/storage'

export function useTakes(userId: string | undefined, orgId: string | null | undefined) {
  const [takes, setTakes]   = useState<Take[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    if (!userId) { setTakes([]); return }
    setLoading(true)
    const sb = getSupabaseClient()
    let query = sb.from('takes').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    if (orgId) query = query.eq('org_id', orgId)

    const { data } = await query
    setTakes((data as Take[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [userId, orgId])

  async function saveTake(params: {
    name: string
    duration: string
    storagePath: string
    backingSnapshot: Record<string, unknown>
    orgId?: string
  }): Promise<Take> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('takes')
      .insert({
        user_id: userId!,
        org_id: params.orgId ?? null,
        name: params.name,
        duration: params.duration,
        date: new Date().toLocaleDateString('fr-FR'),
        storage_path: params.storagePath,
        backing_snapshot: params.backingSnapshot,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    const take = data as Take
    setTakes(prev => [take, ...prev])
    return take
  }

  async function deleteTake(take: Take): Promise<void> {
    const sb = getSupabaseClient()
    if (take.storage_path) {
      try { await deleteTakeFromStorage(take.storage_path) } catch { /* ignore */ }
    }
    const { error } = await sb.from('takes').delete().eq('id', take.id)
    if (error) throw new Error(error.message)
    setTakes(prev => prev.filter(t => t.id !== take.id))
  }

  async function toggleFavorite(take: Take): Promise<void> {
    const sb = getSupabaseClient()
    const { error } = await sb
      .from('takes')
      .update({ favorite: !take.favorite })
      .eq('id', take.id)
    if (error) throw new Error(error.message)
    setTakes(prev => prev.map(t => t.id === take.id ? { ...t, favorite: !t.favorite } : t))
  }

  return { takes, loading, reload: load, saveTake, deleteTake, toggleFavorite }
}
