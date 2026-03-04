'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

type Mode = 'login' | 'signup'

export default function AuthPage() {
  const router = useRouter()
  const { user, loading, signIn, signUp } = useAuth()
  const [mode, setMode]         = useState<Mode>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)

  useEffect(() => {
    if (!loading && user) router.replace('/app/player')
  }, [user, loading, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
        router.replace('/app/player')
      } else {
        await signUp(email, password)
        setError('Compte créé ! Vérifiez votre e-mail puis connectez-vous.')
        setMode('login')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      if (msg.includes('Invalid login credentials')) {
        setError('Email ou mot de passe incorrect.')
      } else if (msg.includes('User already registered')) {
        setError('Ce compte existe déjà. Connectez-vous.')
      } else {
        setError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-studio-bg">
        <div className="w-3 h-3 rounded-full border-2 border-studio-border border-t-studio-gold animate-spin-sm" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-studio-gradient px-4">
      <div className="w-full max-w-sm p-8 bg-studio-surface border border-studio-border2 rounded-2xl animate-fadeIn">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-studio-gold to-studio-gold-dim flex items-center justify-center text-2xl mx-auto mb-3 shadow-[0_0_20px_#E8C54744]">
            ♪
          </div>
          <div className="text-lg text-studio-gold tracking-wide">Chœur Studio</div>
          <div className="text-[10px] text-studio-muted mt-1 tracking-widest uppercase">
            {mode === 'login' ? 'Connexion' : 'Créer un compte'}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <p className={`text-xs ${error.includes('Vérifiez') ? 'text-studio-green' : 'text-studio-red'} min-h-4`}>
              {error}
            </p>
          )}

          <input
            type="email"
            placeholder="Adresse e-mail"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-3.5 py-2.5 bg-studio-surface2 border border-studio-border rounded-lg text-studio-text font-serif text-sm outline-none transition-colors focus:border-studio-gold/40 placeholder:text-studio-muted"
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            onKeyDown={e => e.key === 'Enter' && handleSubmit(e as unknown as React.FormEvent)}
            className="w-full px-3.5 py-2.5 bg-studio-surface2 border border-studio-border rounded-lg text-studio-text font-serif text-sm outline-none transition-colors focus:border-studio-gold/40 placeholder:text-studio-muted"
          />

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3.5 rounded-xl font-serif text-sm tracking-wide bg-gradient-to-br from-studio-gold to-studio-gold-dim text-studio-bg font-semibold transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 mt-1"
          >
            {busy && <span className="inline-block w-3 h-3 border-2 border-studio-bg/30 border-t-studio-bg rounded-full animate-spin-sm" />}
            {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>

        <button
          onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError('') }}
          className="w-full mt-4 text-xs text-studio-muted hover:text-studio-text transition-colors text-center"
        >
          {mode === 'login'
            ? 'Pas encore de compte ? Créer un compte'
            : 'Déjà un compte ? Se connecter'}
        </button>
      </div>
    </div>
  )
}
