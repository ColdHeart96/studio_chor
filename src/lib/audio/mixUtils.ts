import type { VoicePart } from '@/types/app.types'
import type { AudioEngine } from '@/lib/audio/AudioEngine'
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

/**
 * Render voice blob + selected backing tracks into a single WAV using OfflineAudioContext.
 * voiceOffset: seconds into the backing track where the voice recording starts.
 *   > 0 → back track plays from voiceOffset, voice plays from 0
 *   < 0 → voice trimmed by |voiceOffset|, back track plays from 0
 */
export async function renderMix(
  voiceBlob: Blob,
  engine: AudioEngine,
  options: {
    hearVoice: boolean
    voiceVol: number
    activeVoices: Set<VoicePart>
    trackVolumes: Partial<Record<VoicePart, number>>
    voiceOffset?: number
  },
): Promise<{ blob: Blob; mimeType: string }> {
  const { hearVoice, voiceVol, activeVoices, trackVolumes, voiceOffset = 0 } = options
  const activeTracks = VOICE_PARTS.filter(v => activeVoices.has(v) && engine.getBuffer(v))

  if (!hearVoice && activeTracks.length === 0) {
    return { blob: voiceBlob, mimeType: voiceBlob.type || 'audio/wav' }
  }

  try {
    const mainCtx    = engine.getContext()
    const voiceBuf   = await mainCtx.decodeAudioData(await voiceBlob.arrayBuffer())
    const sampleRate = voiceBuf.sampleRate
    const numCh      = 2

    // backingStart: where in the backing track audio begins (skip first N seconds)
    // voiceTrim: how many seconds to cut from voice start (if voiceOffset negative)
    const backingStart = Math.max(0,  voiceOffset)
    const voiceTrim    = Math.max(0, -voiceOffset)
    const mixDuration  = voiceBuf.duration - voiceTrim

    const offCtx = new OfflineAudioContext(numCh, Math.ceil(mixDuration * sampleRate), sampleRate)

    if (hearVoice) {
      const vGain = offCtx.createGain()
      vGain.gain.value = voiceVol
      vGain.connect(offCtx.destination)
      const vSrc = offCtx.createBufferSource()
      vSrc.buffer = voiceBuf
      vSrc.connect(vGain)
      vSrc.start(0, voiceTrim)
    }

    for (const v of activeTracks) {
      const buf = engine.getBuffer(v)!
      const g   = offCtx.createGain()
      g.gain.value = trackVolumes[v] ?? 0.8
      g.connect(offCtx.destination)
      const src = offCtx.createBufferSource()
      src.buffer = buf
      src.connect(g)
      src.start(0, backingStart, mixDuration)
    }

    const rendered = await offCtx.startRendering()
    return { blob: audioBufferToWav(rendered), mimeType: 'audio/wav' }
  } catch (err) {
    console.warn('renderMix failed, falling back to voice only', err)
    return { blob: voiceBlob, mimeType: 'audio/wav' }
  }
}
