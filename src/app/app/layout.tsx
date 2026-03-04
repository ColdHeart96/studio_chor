'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { OrgProvider } from '@/contexts/OrgContext'
import { Header } from '@/components/layout/Header'
import { TabBar } from '@/components/layout/TabBar'
import { OrgGate } from '@/components/layout/OrgGate'
import { FullPageSpinner } from '@/components/ui/Spinner'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, loading: authLoading, signOut } = useAuth()
  const { profile, loading: profileLoading } = useProfile(user?.id)
  const [takesCount, setTakesCount] = useState(0)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth')
  }, [user, authLoading, router])

  if (authLoading || profileLoading) return <FullPageSpinner />
  if (!user || !profile) return null

  async function handleLogout() {
    await signOut()
    router.replace('/auth')
  }

  return (
    <OrgProvider userId={user.id}>
      <div className="min-h-screen bg-studio-gradient font-serif text-studio-text">
        <div className="max-w-app mx-auto min-h-screen flex flex-col">
          <Header profile={profile} onLogout={handleLogout} />
          <TabBar role={profile.role} takesCount={takesCount} />
          <OrgGate>
            <div className="flex-1 px-6 py-6">
              {children}
            </div>
          </OrgGate>
          <footer className="px-6 py-3 border-t border-[#1a1814] flex justify-between">
            <span className="text-[10px] text-[#2a2418]">Web Audio API · Enregistrement sécurisé</span>
            <span className="text-[10px] text-[#2a2418]">Chœur Studio v2.0</span>
          </footer>
        </div>
      </div>
    </OrgProvider>
  )
}
