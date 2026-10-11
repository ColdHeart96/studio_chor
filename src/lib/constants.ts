import type { VoicePart } from '@/types/app.types'

export const VOICE_PARTS: VoicePart[] = ['soprano', 'alto', 'tenor', 'basse']

export const VOICE_LABELS: Record<VoicePart, string> = {
  soprano: 'Soprano',
  alto:    'Alto',
  tenor:   'Ténor',
  basse:   'Basse',
}

export const VOICE_COLORS: Record<VoicePart, string> = {
  // Rose : distinct de l'or de l'interface (#E8C547) et de l'orange de l'alto
  soprano: '#F472B6',
  alto:    '#FF9944',
  tenor:   '#4ADE80',
  basse:   '#6688FF',
}

// Variantes assombries pour le thème clair (textes lisibles sur fond blanc)
export const VOICE_COLORS_LIGHT: Record<VoicePart, string> = {
  soprano: '#D6409F',
  alto:    '#D9730D',
  tenor:   '#1F9D55',
  basse:   '#3B5BDB',
}

export const MAX_ORGS_PER_ADMIN = 3

export const MAX_RECORDING_SECONDS = 10 * 60 // 10 minutes

export const COUNTDOWN_SECONDS = 3

export const STORAGE_BUCKETS = {
  takes:  'takes',
  tracks: 'tracks',
} as const
