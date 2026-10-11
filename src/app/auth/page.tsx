'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

type Mode = 'login' | 'signup' | 'forgot' | 'reset'

const INPUT_CLASS =
  'w-full px-3.5 py-2.5 bg-studio-surface2 border border-studio-border rounded-lg text-studio-text font-serif text-sm outline-none transition-colors focus:border-studio-gold/40 placeholder:text-studio-muted'

const TITLES: Record<Mode, string> = {
  login:  'Connexion',
  signup: 'Créer un compte',
  forgot: 'Mot de passe oublié',
  reset:  'Nouveau mot de passe',
}

/** Champ mot de passe avec bouton Afficher / Masquer. */
function PasswordField({
  value, onChange, placeholder, autoComplete,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  autoComplete: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        minLength={6}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`${INPUT_CLASS} pr-[84px]`}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-[11px] text-studio-muted hover:text-studio-gold transition-colors"
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        aria-pressed={visible}
      >
        {visible ? 'Masquer' : 'Afficher'}
      </button>
    </div>
  )
}

export default function AuthPage() {
  const router = useRouter()
  const {
    user, loading, signIn, signUp, sendPasswordReset, exchangeRecoveryCode, updatePassword,
  } = useAuth()

  const [mode, setMode]         = useState<Mode>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [info, setInfo]         = useState('')
  const [busy, setBusy]         = useState(false)

  // Arrivée par le lien de réinitialisation : on ne doit PAS rediriger vers l'app
  // tant que le nouveau mot de passe n'est pas saisi (le lien ouvre déjà une session).
  const recoveryRef = useRef(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('reset') === '1',
  )

  useEffect(() => {
    if (!loading && user && !recoveryRef.current) router.replace('/app/player')
  }, [user, loading, router])

  // Traitement du retour du lien e-mail
  useEffect(() => {
    if (!recoveryRef.current) return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const linkError = params.get('error_description') || params.get('error')

    if (linkError) {
      recoveryRef.current = false
      setError('Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien.')
      setMode('forgot')
      return
    }
    if (!code) {
      // Page rechargée : la session de récupération existe peut-être déjà
      setMode('reset')
      return
    }
    exchangeRecoveryCode(code)
      .then(() => {
        window.history.replaceState({}, '', '/auth?reset=1')
        setMode('reset')
      })
      .catch(() => {
        recoveryRef.current = false
        setError(
          'Lien invalide ou expiré. Ouvrez le lien dans le même navigateur que celui où vous avez fait la demande, ou demandez un nouveau lien.',
        )
        setMode('forgot')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setInfo('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
        router.replace('/app/player')
      } else if (mode === 'signup') {
        await signUp(email, password)
        setMode('login')
        setInfo('Compte créé ! Vérifiez votre e-mail puis connectez-vous.')
      } else if (mode === 'forgot') {
        await sendPasswordReset(email)
        // Même message que le compte existe ou non (pas de fuite d'information)
        setInfo('Si un compte existe pour cette adresse, un e-mail avec un lien de réinitialisation vient d\'être envoyé. Ouvrez-le dans ce même navigateur.')
      } else {
        if (password !== confirm) {
          setError('Les deux mots de passe ne sont pas identiques.')
          return
        }
        await updatePassword(password)
        recoveryRef.current = false
        window.history.replaceState({}, '', '/auth')
        router.replace('/app/player')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      if (msg.includes('Invalid login credentials')) {
        setError('E-mail ou mot de passe incorrect.')
      } else if (msg.includes('User already registered')) {
        setError('Ce compte existe déjà. Connectez-vous.')
      } else if (msg.toLowerCase().includes('same password') || msg.toLowerCase().includes('different from the old')) {
        setError('Choisissez un mot de passe différent de l\'ancien.')
      } else if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('too many')) {
        setError('Trop de demandes. Patientez quelques minutes avant de réessayer.')
      } else if (msg.toLowerCase().includes('at least')) {
        setError('Le mot de passe doit contenir au moins 6 caractères.')
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

  const submitLabel: Record<Mode, string> = {
    login:  'Se connecter',
    signup: 'Créer mon compte',
    forgot: 'Envoyer le lien',
    reset:  'Enregistrer le mot de passe',
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
            {TITLES[mode]}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-xs text-studio-red leading-relaxed">{error}</p>}
          {info && <p className="text-xs text-studio-green leading-relaxed">{info}</p>}

          {mode === 'forgot' && !info && (
            <p className="text-xs text-studio-muted leading-relaxed">
              Saisissez l&apos;adresse e-mail de votre compte : nous vous enverrons un lien pour choisir un
              nouveau mot de passe.
            </p>
          )}
          {mode === 'reset' && (
            <p className="text-xs text-studio-muted leading-relaxed">
              Choisissez votre nouveau mot de passe (6 caractères minimum).
            </p>
          )}

          {mode !== 'reset' && (
            <input
              type="email"
              placeholder="Adresse e-mail"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoCapitalize="none"
              className={INPUT_CLASS}
            />
          )}

          {(mode === 'login' || mode === 'signup') && (
            <PasswordField
              value={password}
              onChange={setPassword}
              placeholder="Mot de passe"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          )}

          {mode === 'reset' && (
            <>
              <PasswordField
                value={password}
                onChange={setPassword}
                placeholder="Nouveau mot de passe"
                autoComplete="new-password"
              />
              <PasswordField
                value={confirm}
                onChange={setConfirm}
                placeholder="Confirmer le mot de passe"
                autoComplete="new-password"
              />
            </>
          )}

          {mode === 'login' && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-[11px] text-studio-muted hover:text-studio-gold transition-colors"
              >
                Mot de passe oublié ?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3.5 rounded-xl font-serif text-sm tracking-wide bg-gradient-to-br from-studio-gold to-studio-gold-dim text-studio-bg font-semibold transition-all hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 mt-1"
          >
            {busy && <span className="inline-block w-3 h-3 border-2 border-studio-bg/30 border-t-studio-bg rounded-full animate-spin-sm" />}
            {submitLabel[mode]}
          </button>
        </form>

        {(mode === 'login' || mode === 'signup') && (
          <button
            onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            className="w-full mt-4 text-xs text-studio-muted hover:text-studio-text transition-colors text-center"
          >
            {mode === 'login'
              ? 'Pas encore de compte ? Créer un compte'
              : 'Déjà un compte ? Se connecter'}
          </button>
        )}
        {mode === 'forgot' && (
          <button
            onClick={() => switchMode('login')}
            className="w-full mt-4 text-xs text-studio-muted hover:text-studio-text transition-colors text-center"
          >
            ← Retour à la connexion
          </button>
        )}
      </div>
    </div>
  )
}
