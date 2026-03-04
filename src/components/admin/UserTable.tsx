'use client'
import { useState, useEffect } from 'react'
import { useOrgContext } from '@/contexts/OrgContext'
import { removeOrgMember } from '@/lib/orgs'
import { getSupabaseClient } from '@/lib/supabase/client'
import { SectionLabel } from '@/components/ui/Card'
import { RolePill } from '@/components/ui/RolePill'
import { Spinner } from '@/components/ui/Spinner'
import type { Profile } from '@/types/app.types'

interface Member {
  user_id: string
  joined_at: string
  profiles: Profile
}

export function UserTable() {
  const { activeOrg } = useOrgContext()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    if (!activeOrg) { setMembers([]); return }
    setLoading(true)
    const sb = getSupabaseClient()
    const { data } = await sb
      .from('org_members')
      .select('user_id, joined_at, profiles(*)')
      .eq('org_id', activeOrg.id)
      .order('joined_at')
    setMembers((data as Member[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [activeOrg?.id])

  async function handleRemove(userId: string) {
    if (!activeOrg || !confirm('Exclure ce choriste de l\'organisation ?')) return
    await removeOrgMember(userId, activeOrg.id)
    setMembers(prev => prev.filter(m => m.user_id !== userId))
  }

  async function handleRoleToggle(member: Member) {
    const newRole = member.profiles.role === 'admin' ? 'choriste' : 'admin'
    if (!confirm(`Changer le rôle de ${member.profiles.email} en ${newRole} ?`)) return
    const sb = getSupabaseClient()
    await sb.from('profiles').update({ role: newRole }).eq('id', member.user_id)
    setMembers(prev => prev.map(m =>
      m.user_id === member.user_id
        ? { ...m, profiles: { ...m.profiles, role: newRole } }
        : m
    ))
  }

  if (!activeOrg) return <div className="text-[#444] text-sm text-center py-8">Sélectionnez une organisation</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <SectionLabel className="m-0">Choristes — {activeOrg.name} ({members.length})</SectionLabel>
        <button
          onClick={load}
          className="text-[10px] text-studio-muted hover:text-studio-text border border-studio-border px-2 py-1 rounded font-serif"
        >
          ↻ Actualiser
        </button>
      </div>

      {loading && (
        <div className="flex gap-2 items-center py-4 text-xs text-studio-muted">
          <Spinner size="sm" /> Chargement…
        </div>
      )}

      {!loading && members.length === 0 && (
        <div className="text-center py-8 text-[#444] text-sm">
          Aucun choriste dans cette organisation.<br />
          <span className="text-[11px] text-[#333]">
            Partagez le code : <span className="text-studio-gold font-mono">{activeOrg.invite_code}</span>
          </span>
        </div>
      )}

      <div className="space-y-2">
        {members.map(member => (
          <div
            key={member.user_id}
            className="flex items-center gap-3 px-3.5 py-3 bg-studio-surface border border-studio-border rounded-xl"
          >
            <div className="w-7 h-7 rounded-full bg-studio-surface2 border border-studio-border flex items-center justify-center text-[11px] text-studio-muted flex-shrink-0">
              {member.profiles.email[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-studio-text truncate">{member.profiles.email}</div>
              <div className="text-[10px] text-studio-muted">
                Rejoint le {new Date(member.joined_at).toLocaleDateString('fr-FR')}
              </div>
            </div>
            <RolePill role={member.profiles.role} />
            <button
              onClick={() => handleRoleToggle(member)}
              className="text-[10px] px-2 py-0.5 border border-studio-border2 rounded text-studio-muted hover:text-studio-text font-serif transition-colors"
            >
              Changer rôle
            </button>
            <button
              onClick={() => handleRemove(member.user_id)}
              className="text-[11px] text-studio-muted hover:text-studio-red transition-colors"
              title="Exclure"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
