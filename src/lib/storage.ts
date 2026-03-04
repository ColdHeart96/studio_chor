import { getSupabaseClient } from '@/lib/supabase/client'
import { STORAGE_BUCKETS } from '@/lib/constants'

/**
 * Upload a voice take (Blob) to Supabase storage.
 * Returns the storage_path.
 */
export async function uploadTake(userId: string, blob: Blob, mimeType: string): Promise<string> {
  const sb = getSupabaseClient()

  const ext  = mimeType.includes('wav') ? 'wav' : mimeType.includes('webm') ? 'webm' : 'mp4'
  const path = `${userId}/${Date.now()}.${ext}`

  const { error } = await sb.storage
    .from(STORAGE_BUCKETS.takes)
    .upload(path, blob, { contentType: mimeType, upsert: false })

  if (error) throw new Error(`Upload prise échoué: ${error.message}`)
  return path
}

/**
 * Get a short-lived signed URL for a take.
 */
export async function getTakeUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.storage
    .from(STORAGE_BUCKETS.takes)
    .createSignedUrl(storagePath, expiresIn)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

/**
 * Delete a take from storage.
 */
export async function deleteTakeFromStorage(storagePath: string): Promise<void> {
  const sb = getSupabaseClient()
  const { error } = await sb.storage
    .from(STORAGE_BUCKETS.takes)
    .remove([storagePath])
  if (error) throw new Error(error.message)
}

/**
 * Upload an admin track audio file.
 * Returns the storage_path.
 */
export async function uploadTrack(orgId: string, voice: string, file: File): Promise<string> {
  const sb = getSupabaseClient()

  const ext  = file.name.split('.').pop() ?? 'mp3'
  const path = `${orgId}/${voice}/${Date.now()}.${ext}`

  const { error } = await sb.storage
    .from(STORAGE_BUCKETS.tracks)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) throw new Error(`Upload piste échoué: ${error.message}`)
  return path
}

/**
 * Get a short-lived signed URL for a track.
 */
export async function getTrackUrl(storagePath: string, expiresIn = 3600): Promise<string> {
  const sb = getSupabaseClient()
  const { data, error } = await sb.storage
    .from(STORAGE_BUCKETS.tracks)
    .createSignedUrl(storagePath, expiresIn)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

/**
 * Delete a track from storage.
 */
export async function deleteTrackFromStorage(storagePath: string): Promise<void> {
  const sb = getSupabaseClient()
  const { error } = await sb.storage
    .from(STORAGE_BUCKETS.tracks)
    .remove([storagePath])
  if (error) throw new Error(error.message)
}
