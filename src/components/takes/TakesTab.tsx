'use client'
import { useAuth } from '@/hooks/useAuth'
import { useOrgContext } from '@/contexts/OrgContext'
import { useTakes } from '@/hooks/useTakes'
import { TakeCard } from '@/components/takes/TakeCard'
import { Spinner } from '@/components/ui/Spinner'
import { useRouter } from 'next/navigation'
import type { Take } from '@/types/app.types'

export function TakesTab() {
  const { user }       = useAuth()
  const { activeOrg }  = useOrgContext()
  const router         = useRouter()
  const { takes, loading, deleteTake, toggleFavorite } = useTakes(user?.id, activeOrg?.id)

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center">
        <Spinner /> <span className="text-sm text-studio-muted">Chargement…</span>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="text-[10px] text-studio-muted uppercase tracking-widest">
          Mes enregistrements ({takes.length})
        </div>
        <button
          onClick={() => router.push('/app/record')}
          className="px-3.5 py-1.5 bg-[#CC222218] border border-studio-red rounded text-[#FF6644] text-[11px] font-serif cursor-pointer hover:bg-[#CC222228] transition-colors"
        >
          + Nouvelle prise
        </button>
      </div>

      {takes.length === 0 ? (
        <div className="text-center py-12 text-studio-muted">
          <div className="text-3xl mb-3">♪</div>
          <div className="text-sm text-[#444]">Aucune prise pour le moment</div>
          <div className="text-[11px] text-[#333] mt-1">
            Enregistrez votre voix dans l&apos;onglet Enregistrer
          </div>
        </div>
      ) : (
        <div>
          {takes.map(take => (
            <TakeCard
              key={take.id}
              take={take}
              onDelete={deleteTake}
              onToggleFavorite={toggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  )
}
