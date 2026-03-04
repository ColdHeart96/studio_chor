'use client'
import { useState, useEffect } from 'react'
import type { Organization } from '@/types/app.types'
import { getSupabaseClient } from '@/lib/supabase/client'

export function useOrg(userId: string | undefined) {
  const [orgs, setOrgs]       = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!userId) { setOrgs([]); setLoading(false); return }
    const sb = getSupabaseClient()

    // Fetch orgs where user is admin OR is a member
    const [{ data: adminOrgs }, { data: memberOrgIds }] = await Promise.all([
      sb.from('organizations').select('*').eq('admin_id', userId),
      sb.from('org_members').select('org_id').eq('user_id', userId),
    ])

    const memberIds = (memberOrgIds ?? []).map((m: { org_id: string }) => m.org_id)

    let memberOrgs: Organization[] = []
    if (memberIds.length > 0) {
      const { data } = await sb
        .from('organizations')
        .select('*')
        .in('id', memberIds)
      memberOrgs = (data as Organization[]) ?? []
    }

    // Merge, deduplicate
    const map = new Map<string, Organization>()
    for (const o of [...(adminOrgs as Organization[] ?? []), ...memberOrgs]) {
      map.set(o.id, o)
    }
    setOrgs([...map.values()])
    setLoading(false)
  }

  useEffect(() => { load() }, [userId])

  return { orgs, loading, reload: load }
}
