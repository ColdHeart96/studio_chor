import type { VoicePart } from '@/types/app.types'

export const VOICE_PARTS: VoicePart[] = ['soprano', 'alto', 'tenor', 'basse']

export const VOICE_LABELS: Record<VoicePart, string> = {
  soprano: 'Soprano',
  alto:    'Alto',
  tenor:   'Ténor',
  basse:   'Basse',
}

export const VOICE_COLORS: Record<VoicePart, string> = {
  soprano: '#E8C547',
  alto:    '#FF9944',
  tenor:   '#4ADE80',
  basse:   '#6688FF',
}

export const MAX_ORGS_PER_ADMIN = 3

export const MAX_RECORDING_SECONDS = 10 * 60 // 10 minutes

export const COUNTDOWN_SECONDS = 3

export const STORAGE_BUCKETS = {
  takes:  'takes',
  tracks: 'tracks',
} as const
