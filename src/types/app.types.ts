// ─── Domain types for Chœur Studio ─────────────────────────────────────────

export type UserRole = 'admin' | 'choriste'
export type VoicePart = 'soprano' | 'alto' | 'tenor' | 'basse'
export type RecorderState = 'idle' | 'countdown' | 'recording' | 'reviewing'

export interface Profile {
  id: string
  email: string
  role: UserRole
  created_at: string
}

export interface Organization {
  id: string
  name: string
  admin_id: string
  invite_code: string
  created_at: string
}

export interface OrgMember {
  user_id: string
  org_id: string
  joined_at: string
  profiles?: Profile
}

export interface Track {
  id: string
  org_id: string
  voice_part: VoicePart
  name: string
  storage_path: string
  uploaded_by: string
  created_at: string
  // URL résolue (signed URL Supabase storage)
  url?: string
}

export interface Take {
  id: number
  user_id: string
  org_id: string | null
  name: string
  date: string | null
  duration: string | null
  favorite: boolean
  storage_path: string | null
  backing_snapshot: Record<string, unknown>
  review_snapshot: Record<string, unknown>
  voice_on: boolean
  voice_vol: number
  created_at: string
  // Joined
  profiles?: Pick<Profile, 'email'>
}

export interface TakeComment {
  id: number
  take_id: number
  user_id: string
  note: string
  date: string | null
  time_position: number | null  // null = commentaire global
  created_at: string
  profiles?: Pick<Profile, 'email'>
}

export interface Marker {
  id: string
  time: number
  label: string
}

// Audio engine state
export interface TrackState {
  voice: VoicePart
  label: string
  color: string
  buffer: AudioBuffer | null
  volume: number    // 0–1.5
  muted: boolean
  solo: boolean
  url?: string
}

export interface BackingSnapshot {
  [voice: string]: {
    volume: number
    muted: boolean
  }
}
