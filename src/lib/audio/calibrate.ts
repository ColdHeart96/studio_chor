import { CaptureSession } from '@/lib/audio/captureSession'
import { describeMic } from '@/lib/audio/recorder'

/**
 * Calibration de la latence aller-retour (sortie audio + entrée micro).
 *
 * L'application joue un « chirp » (balayage de fréquences) dans la sortie choisie et
 * mesure quand le micro l'entend, sur la même horloge. La détection se fait par
 * corrélation avec le signal émis : elle fonctionne avec un son très faible, dans
 * le bruit, et à travers la bande passante réduite d'un casque Bluetooth.
 *
 * Le résultat inclut : délai de sortie + Bluetooth + délai du micro.
 */

export type CalibrationFailure = 'no_signal' | 'too_quiet' | 'inconsistent' | 'error'

export interface CalibrationDiagnostics {
  /** Nom du micro réellement utilisé par le navigateur (ex. « AirPods », « iPhone Microphone ») */
  micLabel: string
  /** Traitements micro réellement appliqués (écho, bruit, gain auto) */
  processing: string
  /** Niveau crête capté pendant la mesure, en dBFS (0 = saturation, −90 = silence) */
  inputPeakDb: number
  /** Nombre de sons détectés sur le total joué */
  matches: number
  total: number
  sampleRate: number
  /** Meilleure corrélation (0–1) trouvée pour chaque son joué, détecté ou non */
  corrs: number[]
  /** Niveau crête (dBFS) par tranche de 0,5 s de la capture */
  levelsDb: number[]
  /** État du contexte audio en fin de mesure (« running », « suspended », « interrupted »…) */
  ctxState: string
  /** Durée réellement capturée / attendue (s) : un écart signale des trous audio */
  capturedSec: number
  expectedSec: number
}

export type CalibrationResult =
  | { ok: true;  latencyMs: number; samplesMs: number[]; diagnostics: CalibrationDiagnostics }
  | { ok: false; reason: CalibrationFailure; samplesMs: number[]; diagnostics: CalibrationDiagnostics }

// ── Réglages ────────────────────────────────────────────────────────────────
// Bande 400–3000 Hz : passe dans la voie « appel » d'un casque Bluetooth (≈ 300–3400 Hz).
const CHIRP_S        = 0.25
const CHIRP_F0       = 400
const CHIRP_F1       = 3000
const COUNT          = 8
const GAP_S          = 1.0
const LEAD_S         = 0.5
const MAX_LATENCY_S  = 0.7
const MIN_CORRELATION = 0.14
const MIN_MATCHES    = 4

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function toDb(amplitude: number): number {
  return amplitude <= 0 ? -120 : Math.round(20 * Math.log10(amplitude))
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ── Signal émis ─────────────────────────────────────────────────────────────
function chirpAt(rate: number): Float32Array {
  const n = Math.round(CHIRP_S * rate)
  const out = new Float32Array(n)
  const k = (CHIRP_F1 - CHIRP_F0) / CHIRP_S
  for (let i = 0; i < n; i++) {
    const t = i / rate
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
    out[i] = hann * Math.sin(2 * Math.PI * (CHIRP_F0 * t + 0.5 * k * t * t))
  }
  return out
}

export function makeChirpBuffer(ctx: AudioContext): AudioBuffer {
  const data = chirpAt(ctx.sampleRate)
  const buf = ctx.createBuffer(1, data.length, ctx.sampleRate)
  const ch = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) ch[i] = 0.95 * data[i]
  return buf
}

// ── Analyse : corrélation normalisée avec le chirp (signal décimé pour la vitesse) ──
function decimate(x: Int16Array, from: number, to: number, d: number): Float32Array {
  const n = Math.max(0, Math.floor((to - from) / d))
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    const base = from + i * d
    for (let j = 0; j < d; j++) s += x[base + j]
    out[i] = s / d / 32768
  }
  return out
}

/** Meilleur alignement du modèle dans le signal : index (échantillons décimés) et corrélation 0–1. */
function bestCorrelation(sig: Float32Array, tpl: Float32Array): { index: number; corr: number } {
  const T = tpl.length
  let tplEnergy = 0
  for (let i = 0; i < T; i++) tplEnergy += tpl[i] * tpl[i]
  const tplNorm = Math.sqrt(tplEnergy)

  let winEnergy = 0
  for (let i = 0; i < Math.min(T, sig.length); i++) winEnergy += sig[i] * sig[i]

  let best = { index: -1, corr: 0 }
  for (let k = 0; k + T <= sig.length; k++) {
    if (k > 0) winEnergy += sig[k + T - 1] * sig[k + T - 1] - sig[k - 1] * sig[k - 1]
    let dot = 0
    for (let i = 0; i < T; i++) dot += sig[k + i] * tpl[i]
    const denom = tplNorm * Math.sqrt(Math.max(winEnergy, 1e-12))
    const c = Math.abs(dot) / denom
    if (c > best.corr) best = { index: k, corr: c }
  }
  return best
}

function analyse(
  x: Int16Array,
  startFrame: number,
  sr: number,
  times: number[],
): { ms: number[]; corrs: number[] } {
  const D = Math.max(1, Math.round(sr / 8000))
  const tpl = chirpAt(sr / D)
  const out: number[] = []
  const corrs: number[] = []

  for (const t of times) {
    const ws = Math.round((t - 0.02) * sr) - startFrame
    const we = Math.min(x.length, ws + Math.round((MAX_LATENCY_S + CHIRP_S + 0.04) * sr))
    if (ws < 0 || we - ws < tpl.length * D * 2) continue

    const seg = decimate(x, ws, we, D)
    const { index, corr } = bestCorrelation(seg, tpl)
    corrs.push(+corr.toFixed(2))
    if (index < 0 || corr < MIN_CORRELATION) continue

    const ms = ((startFrame + ws + index * D) / sr - t) * 1000
    if (ms > -20 && ms < MAX_LATENCY_S * 1000) out.push(ms)
  }
  return { ms: out, corrs }
}

/** Niveau crête (dBFS) par tranche de 0,5 s. */
function levelsPerHalfSecond(x: Int16Array, sr: number): number[] {
  const step = Math.round(0.5 * sr)
  const out: number[] = []
  for (let i = 0; i < x.length; i += step) {
    let m = 0
    for (let j = i; j < Math.min(x.length, i + step); j++) m = Math.max(m, Math.abs(x[j]))
    out.push(toDb(m / 32768))
  }
  return out
}

// ── Point d'entrée ──────────────────────────────────────────────────────────
export type CalibrationPhase = 'warmup' | 'listening' | 'analysing'

export interface CalibrationOptions {
  /**
   * Attente après l'ouverture du micro, AVANT le premier son. Un casque Bluetooth bascule
   * en « mode appel » quand le micro s'ouvre : plusieurs secondes pendant lesquelles le son
   * et le micro sont perturbés. Rien n'est joué ni mesuré pendant ce temps.
   */
  warmupS?: number
  onPhase?: (phase: CalibrationPhase) => void
}

/**
 * @param ctx    AudioContext À USAGE UNIQUE, créé dans le geste utilisateur juste avant
 *               d'ouvrir le micro. Réutiliser un contexte déjà « posé » sur l'ancienne route
 *               audio (haut-parleur) donne des mesures fausses après la bascule Bluetooth.
 * @param stream flux micro (requestMicrophoneAccess)
 */
export async function measureRoundTripLatency(
  ctx: AudioContext,
  stream: MediaStream,
  options: CalibrationOptions = {},
): Promise<CalibrationResult> {
  const warmupS = options.warmupS ?? 0.6
  const session = new CaptureSession(ctx)
  const sr = ctx.sampleRate
  const gain = ctx.createGain()
  gain.gain.value = 1
  gain.connect(ctx.destination)

  const mic = describeMic(stream)
  const diagnostics: CalibrationDiagnostics = {
    micLabel: mic.label,
    processing: mic.processing,
    inputPeakDb: -120,
    matches: 0,
    total: COUNT,
    sampleRate: sr,
    corrs: [],
    levelsDb: [],
    ctxState: ctx.state,
    capturedSec: 0,
    expectedSec: 0,
  }

  try {
    await ctx.resume()
    await session.open(stream)

    options.onPhase?.('warmup')
    await sleep(warmupS * 1000)
    // La bascule de route audio peut avoir suspendu le contexte : on le relance avant de planifier.
    if (ctx.state !== 'running') await ctx.resume()

    options.onPhase?.('listening')
    const chirp = makeChirpBuffer(ctx)
    const t0 = ctx.currentTime + LEAD_S
    session.begin(t0 - 0.1)

    const times: number[] = []
    for (let i = 0; i < COUNT; i++) {
      const t = t0 + i * GAP_S
      const src = ctx.createBufferSource()
      src.buffer = chirp
      src.connect(gain)
      src.start(t)
      times.push(t)
    }

    await sleep((LEAD_S + COUNT * GAP_S + MAX_LATENCY_S) * 1000)
    options.onPhase?.('analysing')
    const voice = await session.finish(100)
    const x = voice.samples

    let peak = 0
    for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]))
    diagnostics.inputPeakDb = toDb(peak / 32768)
    diagnostics.levelsDb = levelsPerHalfSecond(x, sr)
    diagnostics.ctxState = ctx.state
    diagnostics.capturedSec = +(x.length / sr).toFixed(1)
    diagnostics.expectedSec = +(LEAD_S + 0.1 + COUNT * GAP_S + MAX_LATENCY_S).toFixed(1)

    // Micro coupé / muet : aucun signal du tout
    if (diagnostics.inputPeakDb < -75) {
      return { ok: false, reason: 'no_signal', samplesMs: [], diagnostics }
    }

    const { ms: samplesMs, corrs } = analyse(x, voice.startFrame, sr, times)
    diagnostics.matches = samplesMs.length
    diagnostics.corrs = corrs

    if (samplesMs.length < MIN_MATCHES) {
      return { ok: false, reason: 'too_quiet', samplesMs, diagnostics }
    }

    const med = median(samplesMs)
    const dev = samplesMs.map(v => Math.abs(v - med))
    if (median(dev) > 10 || Math.max(...dev) > 40) {
      return { ok: false, reason: 'inconsistent', samplesMs, diagnostics }
    }

    return { ok: true, latencyMs: Math.round(med), samplesMs, diagnostics }
  } catch {
    return { ok: false, reason: 'error', samplesMs: [], diagnostics }
  } finally {
    session.destroy()
    try { gain.disconnect() } catch { /* ignore */ }
  }
}
