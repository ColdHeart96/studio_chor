'use client'
import { useState, useEffect } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase/client'

export function useAuth() {
  const [user, setUser]       = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sb = getSupabaseClient()

    // Load initial session
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    // Subscribe to auth changes
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const sb = getSupabaseClient()
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signUp(email: string, password: string) {
    const sb = getSupabaseClient()
    const { error } = await sb.auth.signUp({ email, password })
    if (error) throw error
  }

  async function signOut() {
    const sb = getSupabaseClient()
    await sb.auth.signOut()
  }

  return { user, session, loading, signIn, signUp, signOut }
}
