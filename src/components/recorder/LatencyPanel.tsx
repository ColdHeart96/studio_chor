'use client'
import { useState, useEffect, useRef } from 'react'
import {
  requestMicrophoneAccess,
  listMicrophones,
  getPreferredMicId,
  setPreferredMicId,
  resolveMicDeviceId,
  isHeadsetMic,
  findBuiltInMic,
  describeMic,
  type MicDevice,
} from '@/lib/audio/recorder'
import {
  measureRoundTripLatency,
  makeChirpBuffer,
  type CalibrationPhase,
  type CalibrationResult,
} from '@/lib/audio/calibrate'
import {
  ROUTE_LABELS,
  estimateLatencyMs,
  storeLatencyMs,
  clearStoredLatency,
  setRoute as persistRoute,
  type OutputRoute,
  type LatencySource,
} from '@/lib/audio/latency'
import { Spinner } from '@/components/ui/Spinner'
import { RefreshHint } from '@/components/ui/RefreshHint'

interface LatencyPanelProps {
  route: OutputRoute
  onRouteChange: (route: OutputRoute) => void
}

const ROUTES: OutputRoute[] = ['wired', 'bluetooth', 'speaker']
const ROUTE_ICONS: Record<OutputRoute, string> = { wired: '🎧', bluetooth: '🎧', speaker: '🔊' }

const SOURCE_LABELS: Record<LatencySource, string> = {
  calibrated: 'mesurée sur cet appareil',
  reported:   'estimée par le navigateur',
  default:    'valeur par défaut — calibrez pour plus de précision',
}

function failureMessage(result: Extract<CalibrationResult, { ok: false }>, route: OutputRoute): string {
  const { micLabel, inputPeakDb, matches, total } = result.diagnostics
  const headsetMic = isHeadsetMic(micLabel)

  switch (result.reason) {
    case 'no_signal':
      return 'Le micro ne capte aucun son. Vérifiez que l\'accès au micro est autorisé et qu\'il n\'est pas coupé.'
    case 'error':
      return 'La mesure a échoué. Vérifiez l\'accès au micro et réessayez.'
    case 'inconsistent':
      return 'Mesure instable (bruit ambiant ou son trop faible). Réessayez dans un endroit plus calme, volume du casque au maximum.'
    case 'too_quiet':
    default:
      if (route === 'speaker') {
        return `Seulement ${matches} son(s) détecté(s) sur ${total}. Augmentez le volume et rapprochez-vous du téléphone.`
      }
      return headsetMic
        ? `Seulement ${matches} son(s) détecté(s) sur ${total}. Le téléphone utilise le micro du casque (« ${micLabel} », niveau ${inputPeakDb} dB) : posez l'oreillette contre ce micro-là, ou choisissez le micro du téléphone dans la liste ci-dessus.`
        : `Seulement ${matches} son(s) détecté(s) sur ${total}. Le micro « ${micLabel} » (niveau ${inputPeakDb} dB) n'entend pas assez le casque : posez l'oreillette contre le micro du téléphone (en bas, près de la prise de charge) et mettez le volume du casque au maximum.`
  }
}

export function LatencyPanel({ route, onRouteChange }: LatencyPanelProps) {
  const [open, setOpen]         = useState(false)
  const [busy, setBusy]         = useState(false)
  const [phase, setPhase]       = useState<CalibrationPhase | null>(null)
  const [message, setMessage]   = useState<{ ok: boolean; text: string } | null>(null)
  const [micInfo, setMicInfo]   = useState<string | null>(null)
  // Le micro ne livre aucun son (autorisation manquante) : on propose de réactualiser
  const [noMicSignal, setNoMicSignal] = useState(false)
  const [estimate, setEstimate] = useState(() => estimateLatencyMs(null, route))
  const [mics, setMics]         = useState<MicDevice[]>([])
  const [micId, setMicId]       = useState<string>('')

  // ── Test de position (indicateur de niveau en direct) ─────────────────────
  const [testing, setTesting]     = useState(false)
  const [testReady, setTestReady] = useState(false)
  const [levelDb, setLevelDb]     = useState(-90)
  const [testMic, setTestMic]     = useState<string | null>(null)
  const stopTestRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    setEstimate(estimateLatencyMs(null, route))
    setMessage(null)
    setMicInfo(null)
  }, [route])

  // Coupe le test si le composant est démonté
  useEffect(() => () => { stopTestRef.current?.() }, [])

  // Micro qui captera la voix, affiché en permanence (les noms ne sont connus qu'après une
  // première autorisation du micro).
  const [allMics, setAllMics] = useState<MicDevice[]>([])
  useEffect(() => {
    let alive = true
    void listMicrophones().then(list => { if (alive) setAllMics(list) })
    return () => { alive = false }
  }, [route, open, busy, testing])

  const preferredMic = allMics.find(m => m.id === micId)
  const singMic = route !== 'bluetooth'
    ? null
    : preferredMic ?? findBuiltInMic(allMics) ?? null

  /**
   * Joue un son toutes les ~0,8 s dans le casque et affiche en direct ce que le micro entend.
   * Permet de trouver la bonne position / de vérifier quel micro est utilisé AVANT de calibrer.
   */
  function startTest() {
    const Ctx = window.AudioContext
      || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx({ latencyHint: 'interactive' })
    void ctx.resume()
    setTesting(true)
    setTestReady(false)
    setLevelDb(-90)
    setMessage(null)

    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    let raf = 0
    let stopped = false

    const stop = () => {
      if (stopped) return
      stopped = true
      if (timer) clearInterval(timer)
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach(t => t.stop())
      void ctx.close().catch(() => {})
      stopTestRef.current = null
      setTesting(false)
      setTestReady(false)
    }
    stopTestRef.current = stop

    void (async () => {
      try {
        stream = await requestMicrophoneAccess(await resolveMicDeviceId(route))
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return }
        setTestMic(describeMic(stream).label)

        const analyser = ctx.createAnalyser()
        analyser.fftSize = 2048
        ctx.createMediaStreamSource(stream).connect(analyser)
        const buf = new Float32Array(analyser.fftSize)

        let hold = -90
        let holdUntil = 0
        let lastSound = performance.now()
        let armed = false   // devient vrai une fois le casque prêt (bascule Bluetooth terminée)
        const tick = () => {
          analyser.getFloatTimeDomainData(buf)
          let peak = 0
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]))
          const db = peak <= 0.00003 ? -90 : Math.max(-90, 20 * Math.log10(peak))
          const now = performance.now()
          if (db >= hold || now > holdUntil) { hold = db; holdUntil = now + 700 }
          if (db > -78) lastSound = now
          // Rien du tout pendant 6 s après la préparation : autorisation manquante ou micro coupé
          if (armed && now - lastSound > 6000) setNoMicSignal(true)
          setLevelDb(Math.round(hold))
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)

        // Le casque Bluetooth bascule en mode appel à l'ouverture du micro : on attend avant de jouer.
        const warmupMs = (route === 'bluetooth' ? 3 : route === 'wired' ? 1.5 : 0.6) * 1000
        await new Promise<void>(r => setTimeout(r, warmupMs))
        if (stopped) return
        if (ctx.state !== 'running') await ctx.resume()
        setTestReady(true)
        armed = true
        lastSound = performance.now()

        const chirp = makeChirpBuffer(ctx)
        const gain = ctx.createGain()
        gain.connect(ctx.destination)
        const play = () => {
          const src = ctx.createBufferSource()
          src.buffer = chirp
          src.connect(gain)
          src.start()
        }
        play()
        timer = setInterval(play, 800)
      } catch {
        setMessage({ ok: false, text: 'Accès au micro refusé : autorisez-le dans les réglages, puis réactualisez la page.' })
        setNoMicSignal(true)
        stop()
      }
    })()
  }

  function stopTest() {
    stopTestRef.current?.()
  }

  useEffect(() => {
    if (!open) return
    setMicId(getPreferredMicId() ?? '')
    listMicrophones().then(setMics)
  }, [open])

  function chooseRoute(r: OutputRoute) {
    persistRoute(r)
    onRouteChange(r)
  }

  function chooseMic(id: string) {
    setMicId(id)
    setPreferredMicId(id || null)
  }

  function calibrate() {
    // Un AudioContext NEUF, créé ici, dans le geste utilisateur : réutiliser un contexte
    // posé sur l'ancienne route audio (avant la bascule Bluetooth) donne des mesures fausses
    // ou des échecs un essai sur deux.
    const Ctx = window.AudioContext
      || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx({ latencyHint: 'interactive' })
    void ctx.resume()
    void run(ctx)
  }

  async function run(ctx: AudioContext) {
    setBusy(true)
    setMessage(null)
    setNoMicSignal(false)
    let stream: MediaStream | null = null
    try {
      stream = await requestMicrophoneAccess(await resolveMicDeviceId(route))
      // Casque Bluetooth : il bascule en « mode appel » à l'ouverture du micro (plusieurs secondes).
      const warmupS = route === 'bluetooth' ? 3 : route === 'wired' ? 1.5 : 0.6
      const result = await measureRoundTripLatency(ctx, stream, { warmupS, onPhase: setPhase })
      const d = result.diagnostics
      setMicInfo(
        `Micro utilisé : ${d.micLabel} · ${d.processing} · ${d.sampleRate} Hz · contexte : ${d.ctxState}\n`
        + `Sons détectés : ${d.matches}/${d.total} · niveau max : ${d.inputPeakDb} dB · `
        + `capturé : ${d.capturedSec} s sur ~${d.expectedSec} s\n`
        + `Corrélations : ${d.corrs.join(' ') || '—'}\n`
        + `Niveaux (dB / 0,5 s) : ${d.levelsDb.join(' ')}`,
      )

      if (result.ok) {
        storeLatencyMs(route, result.latencyMs)
        setEstimate(estimateLatencyMs(null, route))
        setMessage({
          ok: true,
          text: `Latence mesurée : ${result.latencyMs} ms, enregistrée pour « ${ROUTE_LABELS[route]} ». `
              + 'Vous pourrez l\'affiner avec le curseur à la réécoute.',
        })
      } else {
        setNoMicSignal(result.reason === 'no_signal')
        setMessage({ ok: false, text: failureMessage(result, route) })
      }
      void listMicrophones().then(setMics)
    } catch {
      setMessage({ ok: false, text: 'Accès au micro refusé.' })
    } finally {
      stream?.getTracks().forEach(t => t.stop())
      void ctx.close().catch(() => {})
      setBusy(false)
      setPhase(null)
    }
  }

  function reset() {
    clearStoredLatency(route)
    setEstimate(estimateLatencyMs(null, route))
    setMessage(null)
  }

  return (
    <div className="mb-5">
      <div className="text-[10px] text-studio-muted uppercase tracking-wider mb-2">
        Comment vous écoutez les pistes ?
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
        {ROUTES.map(r => (
          <button
            key={r}
            onClick={() => chooseRoute(r)}
            className="px-2 py-2.5 rounded-xl border text-[11px] transition-all"
            style={route === r
              ? { borderColor: 'rgb(var(--gold) / 0.33)', background: 'rgb(var(--gold) / 0.07)', color: 'rgb(var(--gold))' }
              : { borderColor: 'rgb(var(--border))', background: 'transparent', color: 'rgb(var(--soft))' }
            }
          >
            <div className="text-base mb-0.5">{ROUTE_ICONS[r]}</div>
            {ROUTE_LABELS[r]}
          </button>
        ))}
      </div>

      {route === 'speaker' && (
        <div className="text-[11px] mb-2 px-3 py-2 rounded-lg" style={{ background: 'rgb(var(--orange) / 0.07)', border: '1px solid rgb(var(--orange) / 0.2)', color: 'rgb(var(--orange))' }}>
          Avec le haut-parleur, le micro entend aussi les pistes : l&apos;enregistrement contiendra un peu de musique.
          Pour un meilleur résultat, utilisez des écouteurs.
        </div>
      )}

      {route === 'bluetooth' && allMics.length > 0 && (
        singMic && !isHeadsetMic(singMic.label) ? (
          <div className="text-[11px] mb-2 px-3 py-2 rounded-lg" style={{ background: 'rgb(var(--green) / 0.07)', border: '1px solid rgb(var(--green) / 0.2)', color: 'rgb(var(--green))' }}>
            🎤 Votre voix sera captée par <b>{singMic.label}</b> : chantez à 30–50 cm du téléphone.
            Le casque ne sert que pour écouter (meilleure qualité).
          </div>
        ) : (
          <div className="text-[11px] mb-2 px-3 py-2 rounded-lg" style={{ background: 'rgb(var(--orange) / 0.07)', border: '1px solid rgb(var(--orange) / 0.2)', color: 'rgb(var(--orange))' }}>
            ⚠ Le téléphone n&apos;a pas indiqué son micro intégré : votre voix sera captée par le micro du casque,
            souvent faible et irrégulière (traitement du casque). Micros détectés :{' '}
            {allMics.map(m => `« ${m.label} »`).join(', ')}. Si l&apos;un d&apos;eux est celui du téléphone,
            choisissez-le dans « Latence de l&apos;appareil » → « Micro utilisé ».
          </div>
        )
      )}

      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between text-[11px] text-studio-muted hover:text-studio-text px-1 py-1.5 transition-colors"
      >
        <span>
          Latence de l&apos;appareil : <span className="tabular-nums text-studio-gold">{estimate.ms} ms</span>
          {' '}<span className="text-studio-muted">({SOURCE_LABELS[estimate.source]})</span>
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="bg-studio-surface border border-studio-border rounded-xl p-3.5 mt-1">
          <div className="text-[11px] text-studio-muted mb-3">
            Votre voix arrive toujours un peu en retard sur la musique : délai du casque, du Bluetooth et du micro.
            L&apos;application le mesure une fois, puis le compense à chaque prise.
          </div>

          {mics.length > 1 && (
            <div className="mb-3">
              <div className="text-[10px] text-studio-muted uppercase tracking-wide mb-1">Micro utilisé</div>
              <select
                value={micId}
                onChange={e => chooseMic(e.target.value)}
                disabled={busy}
                className="w-full text-[12px] bg-studio-surface2 border border-studio-border rounded-lg px-2.5 py-2 text-studio-text outline-none"
              >
                <option value="">
                  {route === 'bluetooth'
                    ? 'Automatique (micro du téléphone, meilleure qualité)'
                    : 'Automatique (choix du téléphone)'}
                </option>
                {mics.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
          )}

          {/* ── Étape 1 : vérifier que le micro entend le casque ─────────────── */}
          <div className="text-[11px] text-studio-text mb-1">1 · Vérifier que le micro entend le casque</div>
          <div className="text-[11px] text-studio-muted mb-2">
            {route === 'speaker'
              ? 'Gardez le téléphone à portée de voix, dans un endroit calme.'
              : <>
                  Mettez le <span className="text-studio-text">volume de votre casque au maximum</span>, posez
                  une oreillette contre le micro du téléphone (en bas, près de la prise de charge). Le casque
                  joue un petit son en boucle : la barre ci-dessous doit monter. Bougez le casque jusqu&apos;à
                  ce qu&apos;elle soit verte.
                </>}
          </div>

          {testing ? (
            <div className="mb-4">
              <div className="h-3 rounded bg-studio-raised overflow-hidden mb-1.5">
                <div
                  className="h-full transition-[width] duration-100"
                  style={{
                    width: `${Math.max(2, Math.min(100, ((levelDb + 80) / 80) * 100))}%`,
                    background: levelDb > -40 ? 'rgb(var(--green))' : levelDb > -55 ? 'rgb(var(--gold))' : 'rgb(var(--coral))',
                  }}
                />
              </div>
              <div className="flex justify-between text-[11px] mb-2">
                <span style={{ color: levelDb > -40 ? 'rgb(var(--green))' : levelDb > -55 ? 'rgb(var(--gold))' : 'rgb(var(--coral))' }}>
                  {!testReady
                    ? 'Préparation du micro… patientez'
                    : levelDb > -40 ? 'Parfait : le micro entend bien le casque'
                    : levelDb > -55 ? 'Faible : rapprochez l\'oreillette ou montez le volume'
                    : 'Rien n\'est entendu : changez de position'}
                </span>
                <span className="tabular-nums text-studio-muted">{levelDb} dB</span>
              </div>
              {testMic && <div className="text-[10px] text-studio-muted mb-2">Micro écouté : {testMic}</div>}
              <button
                onClick={stopTest}
                className="w-full px-3 py-2 rounded-xl text-[12px] border border-studio-border2 text-studio-muted hover:text-studio-text transition-colors"
              >
                ■ Arrêter le test
              </button>
            </div>
          ) : (
            <button
              onClick={startTest}
              disabled={busy}
              className="w-full px-3 py-2.5 rounded-xl text-[12px] transition-all disabled:opacity-50 mb-4"
              style={{ background: 'rgb(var(--blue) / 0.13)', border: '1px solid rgb(var(--blue) / 0.33)', color: 'rgb(var(--blue))' }}
            >
              ◔ Tester la position (niveau en direct)
            </button>
          )}

          {/* ── Étape 2 : mesurer ────────────────────────────────────────────── */}
          <div className="text-[11px] text-studio-text mb-1">2 · Calibrer</div>
          <div className="text-[11px] text-studio-muted mb-2">
            Gardez la même position pendant toute la mesure. Durée :
            {' '}environ {route === 'bluetooth' ? '13' : route === 'wired' ? '12' : '10'} secondes.
          </div>

          <button
            onClick={calibrate}
            disabled={busy || testing}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[12px] transition-all disabled:opacity-50"
            style={{ background: 'rgb(var(--gold) / 0.13)', border: '1px solid rgb(var(--gold) / 0.33)', color: 'rgb(var(--gold))' }}
          >
            {busy
              ? <><Spinner size="sm" /> {phase === 'warmup' ? 'Préparation du micro…' : 'Mesure en cours… ne bougez pas'}</>
              : '◉ Calibrer'}
          </button>

          {estimate.source === 'calibrated' && (
            <button
              onClick={reset}
              disabled={busy}
              className="mt-3 text-[11px] text-studio-muted hover:text-studio-text underline"
            >
              Réinitialiser la mesure
            </button>
          )}

          {message && (
            <div className="text-[11px] mt-3" style={{ color: message.ok ? 'rgb(var(--green))' : 'rgb(var(--orange))' }}>
              {message.text}
            </div>
          )}
          {noMicSignal && (
            <RefreshHint className="mt-3" title="Aucun son n'arrive du micro">
              Le plus souvent, l&apos;autorisation du micro a été accordée après le chargement de la page :
              réactualisez la page, puis relancez le test. Sinon, rapprochez l&apos;oreillette du micro et
              mettez le volume du casque au maximum.
            </RefreshHint>
          )}
          {micInfo && (
            <div className="text-[10px] mt-2 text-studio-muted break-words whitespace-pre-wrap">{micInfo}</div>
          )}

          <div className="text-[10px] text-studio-muted mt-3 leading-relaxed">
            Voix qui « pompe » (le volume monte et descend) ? Sur iPhone : Centre de contrôle → Mode du micro →
            <span className="text-studio-soft"> Standard</span> (pas « Isolation vocale »). Sur Bluetooth, éteignez la
            réduction de bruit du casque si possible.
          </div>
        </div>
      )}
    </div>
  )
}
