'use client'
import { useState, useEffect } from 'react'
import { useOrgContext } from '@/contexts/OrgContext'
import { getSupabaseClient } from '@/lib/supabase/client'
import { TakeReviewPlayer } from '@/components/admin/TakeReviewPlayer'
import { SectionLabel } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { formatDate } from '@/lib/utils'
import type { Take } from '@/types/app.types'

interface TakeWithProfile extends Take {
  profiles: { email: string }
}

export function TakeReviewList() {
  const { activeOrg } = useOrgContext()
  const [takes, setTakes]           = useState<TakeWithProfile[]>([])
  const [loading, setLoading]       = useState(false)
  const [selectedTake, setSelected] = useState<TakeWithProfile | null>(null)

  async function load() {
    if (!activeOrg) { setTakes([]); return }
    setLoading(true)
    const sb = getSupabaseClient()
    const { data } = await sb
      .from('takes')
      .select('*, profiles(email)')
      .eq('org_id', activeOrg.id)
      .order('created_at', { ascending: false })
    setTakes((data as TakeWithProfile[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [activeOrg?.id])

  if (!activeOrg) {
    return <div className="text-center py-8 text-[#444] text-sm">Sélectionnez une organisation</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <SectionLabel className="m-0">
          Prises — {activeOrg.name} ({takes.length})
        </SectionLabel>
        <button
          onClick={load}
          className="text-[10px] text-studio-muted border border-studio-border px-2 py-1 rounded font-serif hover:text-studio-text"
        >
          ↻ Actualiser
        </button>
      </div>

      {loading && (
        <div className="flex gap-2 items-center py-4 text-xs text-studio-muted">
          <Spinner size="sm" /> Chargement…
        </div>
      )}

      {selectedTake && (
        <TakeReviewPlayer
          take={selectedTake}
          choriste={selectedTake.profiles}
          onClose={() => setSelected(null)}
        />
      )}

      {!loading && takes.length === 0 && (
        <div className="text-center py-8 text-[#444] text-sm">
          Aucune prise dans cette organisation
        </div>
      )}

      <div className="space-y-2">
        {takes.map(take => (
          <div
            key={take.id}
            className={`flex items-center gap-3 px-3.5 py-3 bg-studio-surface border rounded-xl cursor-pointer transition-all ${
              selectedTake?.id === take.id
                ? 'border-[rgba(232,197,71,0.3)] bg-[rgba(232,197,71,0.03)]'
                : 'border-studio-border hover:border-studio-border2'
            }`}
            onClick={() => setSelected(selectedTake?.id === take.id ? null : take)}
          >
            <div className="w-8 h-8 rounded-full bg-studio-surface2 border border-studio-border flex items-center justify-center text-[10px] text-studio-muted flex-shrink-0">
              {take.profiles?.email[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-studio-text truncate">{take.name}</div>
              <div className="text-[10px] text-studio-muted">
                {take.profiles?.email} · {take.date} · {take.duration}
              </div>
            </div>
            <span className="text-[10px] text-studio-muted">
              {selectedTake?.id === take.id ? '▲' : '▶'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
