import { getSupabaseClient } from '@/lib/supabase/client'
import type { Organization } from '@/types/app.types'

export async function joinOrgByCode(code: string): Promise<string> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.rpc('join_org_by_code', { p_code: code.toUpperCase() })
  if (error) throw new Error(error.message)
  return data as string
}

export async function createOrg(name: string, adminId: string): Promise<Organization> {
  const sb = getSupabaseClient()

  // Check max 3 orgs
  const { count } = await sb
    .from('organizations')
    .select('*', { count: 'exact', head: true })
    .eq('admin_id', adminId)

  if ((count ?? 0) >= 3) {
    throw new Error('Maximum 3 organisations par administrateur.')
  }

  // Generate invite code via RPC
  const { data: code, error: codeError } = await sb.rpc('generate_invite_code')
  if (codeError) throw new Error(codeError.message)

  const { data, error } = await sb
    .from('organizations')
    .insert({ name, admin_id: adminId, invite_code: code as string })
    .select()
    .single()

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
  const { data: code, error: codeError } = await sb.rpc('generate_invite_code')
  if (codeError) throw new Error(codeError.message)
  const { error } = await sb
    .from('organizations')
    .update({ invite_code: code as string })
    .eq('id', orgId)
  if (error) throw new Error(error.message)
  return code as string
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
