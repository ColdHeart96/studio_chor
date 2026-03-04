'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { Organization } from '@/types/app.types'
import { useOrg } from '@/hooks/useOrg'

interface OrgContextValue {
  activeOrg: Organization | null
  orgs: Organization[]
  setActiveOrg: (org: Organization) => void
  isLoading: boolean
  reload: () => void
}

const OrgContext = createContext<OrgContextValue | null>(null)

export function OrgProvider({
  children,
  userId,
}: {
  children: React.ReactNode
  userId: string | undefined
}) {
  const { orgs, loading, reload } = useOrg(userId)
  const [activeOrg, setActiveOrgState] = useState<Organization | null>(null)

  useEffect(() => {
    if (orgs.length === 0) { setActiveOrgState(null); return }
    const savedId = typeof window !== 'undefined' ? localStorage.getItem('activeOrgId') : null
    const match = orgs.find(o => o.id === savedId) ?? orgs[0]
    setActiveOrgState(match)
  }, [orgs])

  const setActiveOrg = useCallback((org: Organization) => {
    setActiveOrgState(org)
    localStorage.setItem('activeOrgId', org.id)
  }, [])

  return (
    <OrgContext.Provider value={{ activeOrg, orgs, setActiveOrg, isLoading: loading, reload }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrgContext() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrgContext must be used within OrgProvider')
  return ctx
}
