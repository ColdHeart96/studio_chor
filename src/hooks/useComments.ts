'use client'
import { useState, useEffect } from 'react'
import type { TakeComment } from '@/types/app.types'
import { getSupabaseClient } from '@/lib/supabase/client'

export function useComments(takeId: number | null | undefined) {
  const [comments, setComments] = useState<TakeComment[]>([])
  const [loading, setLoading]   = useState(false)

  async function load() {
    if (!takeId) { setComments([]); return }
    setLoading(true)
    const sb = getSupabaseClient()
    const { data } = await sb
      .from('take_comments')
      .select('*, profiles(email)')
      .eq('take_id', takeId)
      .order('time_position', { ascending: true, nullsFirst: false })

    setComments((data as TakeComment[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [takeId])

  async function addComment(
    userId: string,
    note: string,
    timePosition: number | null = null
  ): Promise<TakeComment> {
    const sb = getSupabaseClient()
    const { data, error } = await sb
      .from('take_comments')
      .insert({
        take_id: takeId!,
        user_id: userId,
        note,
        time_position: timePosition,
        date: new Date().toLocaleDateString('fr-FR'),
      })
      .select('*, profiles(email)')
      .single()

    if (error) throw new Error(error.message)
    const comment = data as TakeComment
    setComments(prev => [...prev, comment].sort((a, b) => {
      if (a.time_position === null) return 1
      if (b.time_position === null) return -1
      return a.time_position - b.time_position
    }))
    return comment
  }

  async function deleteComment(id: number): Promise<void> {
    const sb = getSupabaseClient()
    const { error } = await sb.from('take_comments').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setComments(prev => prev.filter(c => c.id !== id))
  }

  return { comments, loading, reload: load, addComment, deleteComment }
}
