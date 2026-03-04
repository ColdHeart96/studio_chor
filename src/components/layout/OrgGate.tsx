'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOrgContext } from '@/contexts/OrgContext'
import { joinOrgByCode } from '@/lib/orgs'
import { Button } from '@/components/ui/Button'

export function OrgGate({ children }: { children: React.ReactNode }) {
  const { activeOrg, isLoading, reload } = useOrgContext()
  const router = useRouter()
  const [code, setCode]   = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="w-5 h-5 rounded-full border-2 border-studio-border border-t-studio-gold animate-spin-sm" />
      </div>
    )
  }

  if (!activeOrg) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-xs">
          <div className="text-center mb-6">
            <div className="text-3xl mb-2">🎼</div>
            <div className="text-sm text-studio-gold mb-1">Aucune organisation</div>
            <div className="text-xs text-studio-muted">Entrez le code reçu de votre chef de chœur</div>
          </div>

          {error && <p className="text-xs text-studio-red mb-3">{error}</p>}

          <input
            type="text"
            placeholder="Code (ex: ABCD-1234)"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            className="w-full px-3.5 py-2.5 bg-studio-surface2 border border-studio-border rounded-lg text-studio-text font-serif text-sm outline-none focus:border-studio-gold/40 placeholder:text-studio-muted tracking-widest text-center mb-3"
          />

          <Button
            variant="gold"
            size="lg"
            loading={busy}
            onClick={async () => {
              setError('')
              setBusy(true)
              try {
                await joinOrgByCode(code)
                await reload()
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Code invalide')
              } finally {
                setBusy(false)
              }
            }}
          >
            Rejoindre
          </Button>

          <button
            onClick={() => router.push('/join')}
            className="w-full mt-2 text-xs text-studio-muted hover:text-studio-text transition-colors text-center"
          >
            Ouvrir la page de rejoindre →
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
