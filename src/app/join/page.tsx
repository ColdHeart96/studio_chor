'use client'
import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { joinOrgByCode } from '@/lib/orgs'

function JoinPageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const { user, loading } = useAuth()
  const [code, setCode]   = useState(params.get('code') ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)
  const [done, setDone]   = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/auth')
  }, [user, loading, router])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await joinOrgByCode(code)
      setDone(true)
      setTimeout(() => router.replace('/app/player'), 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-studio-gradient px-4">
      <div className="w-full max-w-sm p-8 bg-studio-surface border border-studio-border2 rounded-2xl animate-fadeIn">
        <div className="text-center mb-6">
          <div className="text-2xl mb-2">🎼</div>
          <div className="text-base text-studio-gold">Rejoindre une organisation</div>
          <div className="text-xs text-studio-muted mt-1">Entrez le code reçu de votre chef de chœur</div>
        </div>

        {done ? (
          <div className="text-center text-studio-green text-sm">
            ✓ Vous avez rejoint l&apos;organisation !<br />
            <span className="text-studio-muted text-xs">Redirection…</span>
          </div>
        ) : (
          <form onSubmit={handleJoin} className="space-y-3">
            {error && <p className="text-xs text-studio-red">{error}</p>}
            <input
              type="text"
              placeholder="Code d'invitation (ex: ABCD-1234)"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              required
              className="w-full px-3.5 py-2.5 bg-studio-surface2 border border-studio-border rounded-lg text-studio-text font-serif text-sm outline-none focus:border-studio-gold/40 placeholder:text-studio-muted tracking-widest text-center"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3.5 rounded-xl font-serif text-sm bg-gradient-to-br from-studio-gold to-studio-gold-dim text-studio-bg font-semibold transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy && <span className="inline-block w-3 h-3 border-2 border-studio-bg/30 border-t-studio-bg rounded-full animate-spin-sm" />}
              Rejoindre
            </button>
            <button
              type="button"
              onClick={() => router.replace('/app/player')}
              className="w-full text-xs text-studio-muted hover:text-studio-text transition-colors text-center mt-1"
            >
              Plus tard →
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinPageContent />
    </Suspense>
  )
}
