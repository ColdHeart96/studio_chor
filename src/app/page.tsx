'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    getSupabaseClient().auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace('/app/player')
      } else {
        router.replace('/auth')
      }
    })
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-studio-bg">
      <div className="w-3 h-3 rounded-full border-2 border-studio-border border-t-studio-gold animate-spin-sm" />
    </div>
  )
}
