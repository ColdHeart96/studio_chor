/**
 * Accès au micro.
 *
 * L'enregistrement lui-même est fait par CaptureSession (PCM sur l'horloge de
 * l'AudioContext) : plus de MediaRecorder, dont le démarrage et l'encodeur
 * introduisent un décalage variable d'un appareil à l'autre.
 */

export type RecorderState = 'idle' | 'countdown' | 'recording' | 'reviewing'

const KEY_MIC = 'choeur.micDeviceId.v1'

export function getPreferredMicId(): string | undefined {
  try { return window.localStorage.getItem(KEY_MIC) || undefined } catch { return undefined }
}

export function setPreferredMicId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(KEY_MIC, id)
    else window.localStorage.removeItem(KEY_MIC)
  } catch { /* stockage indisponible */ }
}

export interface MicDevice {
  id: string
  label: string
}

/** Micros disponibles. Les noms ne sont fournis qu'après une première autorisation du micro. */
export async function listMicrophones(): Promise<MicDevice[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    return all
      .filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Micro ${i + 1}` }))
  } catch {
    return []
  }
}

const HEADSET_MIC = /airpods|bluetooth|headset|headphone|hands.?free|casque|earbud|buds|pods|beats|jabra|bose|oraimo|jbl|soundcore|anker|\bwh-|\bwf-|\bbt\b/i

/** Vrai si le nom du micro ressemble à un micro de casque / oreillettes. */
export function isHeadsetMic(label: string): boolean {
  return HEADSET_MIC.test(label)
}

/**
 * Micro à utiliser selon la sortie audio.
 *
 * Avec un casque Bluetooth, le téléphone prend par défaut le micro DU CASQUE : qualité
 * « téléphone » (bande étroite, réduction de bruit automatique qui fait pomper la voix) et
 * le son des pistes passe en mode appel, dégradé. En choisissant le micro intégré du
 * téléphone, le casque garde sa qualité musicale et la voix est propre.
 * Un choix explicite de l'utilisateur est toujours prioritaire.
 */
export async function resolveMicDeviceId(route: 'speaker' | 'wired' | 'bluetooth'): Promise<string | undefined> {
  const preferred = getPreferredMicId()
  if (preferred) return preferred
  if (route !== 'bluetooth') return undefined
  return findBuiltInMic(await listMicrophones())?.id
}

/**
 * Noms des micros INTÉGRÉS : on les reconnaît positivement (« iPhone Microphone », « Micro du bas »,
 * « Built-in Microphone »…). Reconnaître les casques par exclusion ne marche pas : un casque
 * s'appelle « oraimo BoomPop Lite », sans aucun mot évocateur.
 */
const BUILT_IN_MIC = /iphone|ipad|ipod|built.?in|internal|int[ée]gr|interne|t[ée]l[ée]phone|\bphone\b|bottom|\bfront\b|\bback\b|avant|arri[èe]re|\bbas\b|pixel|galaxy|samsung|xiaomi|huawei|oneplus|^micro(phone)?$/i

export function isBuiltInMic(label: string): boolean {
  return BUILT_IN_MIC.test(label) && !HEADSET_MIC.test(label)
}

export function findBuiltInMic(mics: MicDevice[]): MicDevice | undefined {
  if (mics.length < 2) return undefined
  return mics.find(m => isBuiltInMic(m.label))
}

const isConstraintError = (e: unknown) =>
  e instanceof DOMException && (e.name === 'OverconstrainedError' || e.name === 'ConstraintNotSatisfiedError')

/**
 * Demande l'accès au micro. Doit être appelé dans un geste utilisateur sur iOS.
 *
 * Écho / réduction de bruit / gain automatique sont désactivés : ces traitements
 * font « pomper » la voix (le niveau monte et descend), retardent le signal, et
 * suppriment justement les sons de calibration. On demande d'abord ces réglages de
 * façon STRICTE (`exact`) : sans ça, certains navigateurs les laissent actifs.
 */
export async function requestMicrophoneAccess(deviceId?: string): Promise<MediaStream> {
  const device = deviceId ? { deviceId: { exact: deviceId } } : {}
  const off = (strict: boolean) => ({
    echoCancellation: strict ? { exact: false } : false,
    noiseSuppression: strict ? { exact: false } : false,
    autoGainControl:  strict ? { exact: false } : false,
  })
  const attempts: MediaTrackConstraints[] = [
    { channelCount: 1, ...device, ...off(true) },
    { channelCount: 1, ...device, ...off(false) },
    ...(deviceId ? [{ channelCount: 1, ...off(false) }] : []),
  ]

  let lastError: unknown
  for (const audio of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio, video: false })
    } catch (e) {
      lastError = e
      if (!isConstraintError(e)) throw e
    }
  }
  throw lastError
}

/** Résumé lisible de ce que le navigateur a réellement appliqué sur le micro. */
export function describeMic(stream: MediaStream): { label: string; processing: string } {
  const track = stream.getAudioTracks()[0]
  if (!track) return { label: 'micro inconnu', processing: 'inconnu' }
  const s = track.getSettings() as MediaTrackSettings & { voiceIsolation?: boolean }
  const flag = (v: boolean | undefined) => (v === undefined ? '?' : v ? 'actif' : 'coupé')
  const parts = [
    `écho ${flag(s.echoCancellation)}`,
    `bruit ${flag(s.noiseSuppression)}`,
    `gain auto ${flag(s.autoGainControl)}`,
  ]
  if (s.voiceIsolation !== undefined) parts.push(`isolation vocale ${flag(s.voiceIsolation)}`)
  return { label: track.label || 'micro inconnu', processing: parts.join(' · ') }
}
