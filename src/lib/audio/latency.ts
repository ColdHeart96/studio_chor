/**
 * Latence aller-retour (sortie audio + entrée micro) de l'appareil.
 *
 * Le chanteur entend la piste avec un retard (sortie), chante, et le micro
 * livre l'échantillon avec un second retard (entrée) : la voix enregistrée est
 * donc en retard d'environ « sortie + entrée » sur la piste. On compense en
 * avançant la voix de cette valeur au mixage.
 *
 * Le navigateur ne connaît pas toujours cette valeur (Safari n'expose pas
 * outputLatency, le Bluetooth ment) : on la MESURE par calibration, on la
 * mémorise par type de sortie, et le choriste peut l'ajuster à l'écoute.
 */

export type OutputRoute = 'speaker' | 'wired' | 'bluetooth'

export const ROUTE_LABELS: Record<OutputRoute, string> = {
  speaker:   'Haut-parleur',
  wired:     'Écouteurs filaires',
  bluetooth: 'Casque Bluetooth',
}

/** Décalage appliqué à la voix (ms). Positif = voix avancée. */
export const MIN_OFFSET_MS = -300
export const MAX_OFFSET_MS = 600

const KEY_ROUTE   = 'choeur.audioRoute.v1'
const KEY_LATENCY = 'choeur.latencyMs.v1'

// Valeurs de départ prudentes quand rien n'est mesuré ni exposé par le navigateur.
const DEFAULT_MS: Record<OutputRoute, number> = {
  speaker:   130,
  wired:     100,
  bluetooth: 230,
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* stockage indisponible */ }
}

export function clampOffsetMs(ms: number): number {
  return Math.max(MIN_OFFSET_MS, Math.min(MAX_OFFSET_MS, Math.round(ms)))
}

export function getRoute(): OutputRoute {
  const r = readJson<string>(KEY_ROUTE, 'wired')
  return r === 'speaker' || r === 'bluetooth' || r === 'wired' ? r : 'wired'
}

export function setRoute(route: OutputRoute) {
  writeJson(KEY_ROUTE, route)
}

export function getStoredLatencyMs(route: OutputRoute): number | null {
  const all = readJson<Partial<Record<OutputRoute, number>>>(KEY_LATENCY, {})
  const v = all[route]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function storeLatencyMs(route: OutputRoute, ms: number) {
  const all = readJson<Partial<Record<OutputRoute, number>>>(KEY_LATENCY, {})
  all[route] = clampOffsetMs(ms)
  writeJson(KEY_LATENCY, all)
}

export function clearStoredLatency(route: OutputRoute) {
  const all = readJson<Partial<Record<OutputRoute, number>>>(KEY_LATENCY, {})
  delete all[route]
  writeJson(KEY_LATENCY, all)
}

export type LatencySource = 'calibrated' | 'reported' | 'default'

export interface LatencyEstimate {
  ms: number
  source: LatencySource
}

/** Meilleure estimation de la latence aller-retour pour ce type de sortie. */
export function estimateLatencyMs(ctx: AudioContext | null, route: OutputRoute): LatencyEstimate {
  const stored = getStoredLatencyMs(route)
  if (stored !== null) return { ms: clampOffsetMs(stored), source: 'calibrated' }

  const out  = ctx && typeof ctx.outputLatency === 'number' ? ctx.outputLatency : 0
  const base = ctx ? ctx.baseLatency || 0 : 0
  if (out > 0) {
    // sortie + traitement + ~35 ms d'entrée micro
    return { ms: clampOffsetMs((out + base) * 1000 + 35), source: 'reported' }
  }
  return { ms: DEFAULT_MS[route], source: 'default' }
}
