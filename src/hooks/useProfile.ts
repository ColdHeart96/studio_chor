'use client'
import { useState, useEffect } from 'react'
import type { Profile } from '@/types/app.types'
import { getSupabaseClient } from '@/lib/supabase/client'

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }

    const sb = getSupabaseClient()
    sb.from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        setProfile(data as Profile | null)
        setLoading(false)
      })
  }, [userId])

  return { profile, loading }
}
