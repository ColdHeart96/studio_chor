'use client'
import { useState, useEffect } from 'react'
import type { Organization, OrgRole } from '@/types/app.types'
import { getSupabaseClient } from '@/lib/supabase/client'

interface MembershipRow {
  role: OrgRole
  organizations: Organization | null
}

export function useOrg(userId: string | undefined) {
  const [orgs, setOrgs]       = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!userId) { setOrgs([]); setLoading(false); return }
    const sb = getSupabaseClient()

    // Une seule requête : toutes mes appartenances (le propriétaire est membre admin
    // de son org depuis la migration 003), avec mon rôle dans chacune.
    const { data } = await sb
      .from('org_members')
      .select('role, organizations(*)')
      .eq('user_id', userId)

    const rows = (data ?? []) as unknown as MembershipRow[]
    const list = rows
      .filter((r): r is MembershipRow & { organizations: Organization } => !!r.organizations)
      .map(r => ({ ...r.organizations, my_role: r.role }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))

    setOrgs(list)
    setLoading(false)
  }

  useEffect(() => { load() }, [userId])

  return { orgs, loading, reload: load }
}
