import { getSupabaseClient } from '@/lib/supabase/client'
import type { Organization } from '@/types/app.types'

export async function joinOrgByCode(code: string): Promise<string> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.rpc('join_org_by_code', { p_code: code.toUpperCase() })
  if (error) throw new Error(error.message)
  return data as string
}

export async function createOrg(name: string): Promise<Organization> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.rpc('create_organization', { p_name: name })
  if (error) throw new Error(error.message)
  return data as Organization
}

export async function updateOrgName(orgId: string, name: string): Promise<void> {
  const sb = getSupabaseClient()
  const { error } = await sb.from('organizations').update({ name }).eq('id', orgId)
  if (error) throw new Error(error.message)
}

export async function regenerateInviteCode(orgId: string): Promise<string> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.rpc('regenerate_invite_code_for_org', { p_org_id: orgId })
  if (error) throw new Error(error.message)
  return data as string
}

export async function deleteOrg(orgId: string): Promise<void> {
  const sb = getSupabaseClient()
  const { error } = await sb.from('organizations').delete().eq('id', orgId)
  if (error) throw new Error(error.message)
}

export async function removeOrgMember(userId: string, orgId: string): Promise<void> {
  const sb = getSupabaseClient()
  const { error } = await sb
    .from('org_members')
    .delete()
    .eq('user_id', userId)
    .eq('org_id', orgId)
  if (error) throw new Error(error.message)
}
