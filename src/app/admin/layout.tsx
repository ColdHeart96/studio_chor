'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { OrgProvider, useOrgContext } from '@/contexts/OrgContext'
import { Header } from '@/components/layout/Header'
import { TabBar } from '@/components/layout/TabBar'
import { FullPageSpinner } from '@/components/ui/Spinner'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, loading: authLoading, signOut } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth')
  }, [user, authLoading, router])

  if (authLoading) return <FullPageSpinner />
  if (!user) return null

  async function handleLogout() {
    await signOut()
    router.replace('/auth')
  }

  return (
    <OrgProvider userId={user.id}>
      <AdminShell userId={user.id} onLogout={handleLogout}>{children}</AdminShell>
    </OrgProvider>
  )
}

/**
 * Accès admin = admin d'AU MOINS UNE organisation (org_members.role),
 * ou admin de plateforme (profiles.role) pour pouvoir créer sa première org.
 * La vraie protection est la RLS en base ; ceci n'est que de l'UX.
 */
function AdminShell({
  userId,
  onLogout,
  children,
}: {
  userId: string
  onLogout: () => void
  children: React.ReactNode
}) {
  const router = useRouter()
  const { profile, loading: profileLoading } = useProfile(userId)
  const { isAdmin: isOrgAdmin, isLoading: orgsLoading } = useOrgContext()

  const loading  = profileLoading || orgsLoading
  const canAdmin = isOrgAdmin || profile?.role === 'admin'

  useEffect(() => {
    if (!loading && !canAdmin) router.replace('/app/player')
  }, [loading, canAdmin, router])

  if (loading) return <FullPageSpinner />
  if (!profile || !canAdmin) return null

  return (
    <div className="min-h-screen bg-studio-gradient font-serif text-studio-text">
      <div className="max-w-app mx-auto min-h-screen flex flex-col">
        <Header profile={profile} onLogout={onLogout} />
        <TabBar role="admin" />
        <div className="flex-1 px-6 py-6">{children}</div>
        <footer className="px-6 py-3 border-t border-studio-raised flex justify-between">
          <span className="text-[10px] text-studio-border2">Vue administrateur</span>
          <span className="text-[10px] text-studio-border2">Chœur Studio v2.0</span>
        </footer>
      </div>
    </div>
  )
}
