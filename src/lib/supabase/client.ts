import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// Singleton — one client instance across the app
let _client: SupabaseClient<Database> | null = null

export function getSupabaseClient(): SupabaseClient<Database> {
  if (_client) return _client

  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Variables NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY manquantes. ' +
      'Créez un fichier .env.local (voir .env.local.example).'
    )
  }

  _client = createClient<Database>(url, key, {
    auth: {
      // CRITIQUE pour iframe : forcer localStorage au lieu des cookies
      // Les cookies tiers sont bloqués dans les iframes sur iOS Safari et Chrome
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      // Empêche les redirects OAuth dans le contexte iframe
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  })

  return _client
}
