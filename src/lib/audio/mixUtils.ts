import { Mp3Encoder } from '@breezystack/lamejs'
import type { VoicePart } from '@/types/app.types'
import type { AudioEngine } from '@/lib/audio/AudioEngine'
import type { CapturedVoice } from '@/lib/audio/captureSession'
import { VOICE_PARTS } from '@/lib/constants'

/** Encode an AudioBuffer to a 16-bit PCM WAV Blob. */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh  = buffer.numberOfChannels
  const sr     = buffer.sampleRate
  const len    = buffer.length
  const data   = len * numCh * 2        // 16-bit = 2 bytes per sample
  const ab     = new ArrayBuffer(44 + data)
  const v      = new DataView(ab)

  const s = (off: number, str: string) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)) }
  const u16 = (off: number, n: number) => v.setUint16(off, n, true)
  const u32 = (off: number, n: number) => v.setUint32(off, n, true)

  s(0, 'RIFF');  u32(4,  36 + data)
  s(8, 'WAVE');  s(12, 'fmt ')
  u32(16, 16);   u16(20, 1)               // PCM
  u16(22, numCh); u32(24, sr)
  u32(28, sr * numCh * 2)                 // byte rate
  u16(32, numCh * 2); u16(34, 16)         // block align, bits
  s(36, 'data'); u32(40, data)

  let off = 44
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const samp = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]))
      v.setInt16(off, samp < 0 ? samp * 0x8000 : samp * 0x7FFF, true)
      off += 2
    }
  }
  return new Blob([ab], { type: 'audio/wav' })
}

export interface MixOptions {
  hearVoice: boolean
  voiceVol: number
  activeVoices: Set<VoicePart>
  trackVolumes: Partial<Record<VoicePart, number>>
  /** Décalage de la voix en ms. Positif = la voix est avancée (compense la latence). */
  offsetMs: number
  onProgress?: (fraction: number) => void
}

export interface MixResult {
  blob: Blob
  mimeType: 'audio/mpeg'
  durationSec: number
}

// Réglages de sortie. L'encodage MP3 (JavaScript) est le goulot d'étranglement, pas le rendu :
// mesuré sur 2 min — stéréo 48 kHz 12,5 s ; stéréo 32 kHz 6,1 s ; mono 32 kHz 2,9 s.
// Mono 32 kHz / 96 kbps suffit pour une voix + un accompagnement de chorale, et le fichier
// pèse ~0,7 Mo par minute.
const OUT_RATE = 32000
const OUT_CHANNELS = 1
const MP3_KBPS = 96
const SEGMENT_SECONDS = 30

export const MIX_OUTPUT = { sampleRate: OUT_RATE, channels: OUT_CHANNELS, kbps: MP3_KBPS } as const

const nextTick = () => new Promise<void>(r => setTimeout(r, 0))

function toInt16(channel: Float32Array): Int16Array {
  const out = new Int16Array(channel.length)
  for (let i = 0; i < channel.length; i++) {
    const s = Math.max(-1, Math.min(1, channel[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/**
 * Mixe la voix captée et les pistes choisies dans UN fichier MP3 déjà synchronisé.
 *
 * - La voix est décalée de `offsetMs` (compensation de latence), à l'échantillon près
 *   (calculé sur la fréquence de capture, avant tout rééchantillonnage).
 * - Le rendu se fait par segments de 30 s : la mémoire reste bornée même pour 10 min.
 * - Sortie mono 32 kHz : lisible partout (lecteur de l'app, téléchargement, WhatsApp…),
 *   et la synchro est « cuite » dans le fichier.
 */
export async function renderMixMp3(
  voice: CapturedVoice,
  engine: AudioEngine,
  options: MixOptions,
): Promise<MixResult> {
  const { hearVoice, voiceVol, activeVoices, trackVolumes, offsetMs, onProgress } = options
  const vr = voice.sampleRate                       // fréquence de capture de la voix
  const tracks = VOICE_PARTS
    .filter(v => activeVoices.has(v))
    .map(v => ({ voice: v, buffer: engine.getBuffer(v) }))
    .filter((t): t is { voice: VoicePart; buffer: AudioBuffer } => t.buffer !== null)

  // Rien d'autre que la voix à entendre : on garde la voix (jamais de fichier vide).
  const includeVoice = hearVoice || tracks.length === 0

  const shift    = Math.round((offsetMs / 1000) * vr)   // > 0 : on saute le début de la voix
  const voiceLen = voice.samples.length
  const totalSec = Math.max(0, (voiceLen - shift) / vr)
  const totalLen = Math.round(totalSec * OUT_RATE)
  if (totalLen === 0) throw new Error('Enregistrement vide ou trop court')

  const encoder = new Mp3Encoder(OUT_CHANNELS, OUT_RATE, MP3_KBPS)
  const parts: Uint8Array[] = []
  const segLen = SEGMENT_SECONDS * OUT_RATE

  for (let start = 0; start < totalLen; start += segLen) {
    const len      = Math.min(segLen, totalLen - start)
    const startSec = start / OUT_RATE
    const lenSec   = len / OUT_RATE
    const off = new OfflineAudioContext(OUT_CHANNELS, len, OUT_RATE)

    if (includeVoice) {
      // Tranche de voix correspondante, à sa fréquence NATIVE : le moteur la rééchantillonne.
      const from = Math.round(startSec * vr) + shift
      const n    = Math.ceil(lenSec * vr) + 1
      const buf  = off.createBuffer(1, n, vr)
      const ch   = buf.getChannelData(0)
      for (let i = 0; i < n; i++) {
        const j = from + i
        ch[i] = j >= 0 && j < voiceLen ? voice.samples[j] / 32768 : 0
      }
      const g = off.createGain()
      g.gain.value = voiceVol
      g.connect(off.destination)
      const src = off.createBufferSource()
      src.buffer = buf
      src.connect(g)
      src.start(0)
    }

    for (const t of tracks) {
      const g = off.createGain()
      g.gain.value = trackVolumes[t.voice] ?? 0.8
      g.connect(off.destination)
      const src = off.createBufferSource()
      src.buffer = t.buffer
      src.connect(g)
      src.start(0, startSec, lenSec)
    }

    const rendered = await off.startRendering()
    const mp3 = encoder.encodeBuffer(toInt16(rendered.getChannelData(0)))
    if (mp3.length > 0) parts.push(mp3)

    onProgress?.(Math.min(1, (start + len) / totalLen))
    await nextTick()
  }

  const last = encoder.flush()
  if (last.length > 0) parts.push(last)

  return {
    blob: new Blob(parts as BlobPart[], { type: 'audio/mpeg' }),
    mimeType: 'audio/mpeg',
    durationSec: totalSec,
  }
}
