// Auto-generated Supabase types (or run: supabase gen types typescript)
// Keep in sync with your Supabase schema

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          role: 'admin' | 'choriste'
          created_at: string
        }
        Insert: {
          id: string
          email: string
          role?: 'admin' | 'choriste'
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          role?: 'admin' | 'choriste'
          created_at?: string
        }
      }
      organizations: {
        Row: {
          id: string
          name: string
          admin_id: string
          invite_code: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          admin_id: string
          invite_code: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          admin_id?: string
          invite_code?: string
          created_at?: string
        }
      }
      org_members: {
        Row: {
          user_id: string
          org_id: string
          joined_at: string
        }
        Insert: {
          user_id: string
          org_id: string
          joined_at?: string
        }
        Update: {
          user_id?: string
          org_id?: string
          joined_at?: string
        }
      }
      tracks: {
        Row: {
          id: string
          org_id: string
          voice_part: 'soprano' | 'alto' | 'tenor' | 'basse'
          name: string
          storage_path: string
          uploaded_by: string
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          voice_part: 'soprano' | 'alto' | 'tenor' | 'basse'
          name: string
          storage_path: string
          uploaded_by: string
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          voice_part?: 'soprano' | 'alto' | 'tenor' | 'basse'
          name?: string
          storage_path?: string
          uploaded_by?: string
          created_at?: string
        }
      }
      takes: {
        Row: {
          id: number
          user_id: string
          org_id: string | null
          name: string
          date: string | null
          duration: string | null
          favorite: boolean
          storage_path: string | null
          backing_snapshot: Json
          review_snapshot: Json
          voice_on: boolean
          voice_vol: number
          created_at: string
        }
        Insert: {
          user_id: string
          org_id?: string | null
          name: string
          date?: string | null
          duration?: string | null
          favorite?: boolean
          storage_path?: string | null
          backing_snapshot?: Json
          review_snapshot?: Json
          voice_on?: boolean
          voice_vol?: number
          created_at?: string
        }
        Update: {
          user_id?: string
          org_id?: string | null
          name?: string
          date?: string | null
          duration?: string | null
          favorite?: boolean
          storage_path?: string | null
          backing_snapshot?: Json
          review_snapshot?: Json
          voice_on?: boolean
          voice_vol?: number
          created_at?: string
        }
      }
      take_comments: {
        Row: {
          id: number
          take_id: number
          user_id: string
          note: string
          date: string | null
          time_position: number | null
          created_at: string
        }
        Insert: {
          take_id: number
          user_id: string
          note: string
          date?: string | null
          time_position?: number | null
          created_at?: string
        }
        Update: {
          take_id?: number
          user_id?: string
          note?: string
          date?: string | null
          time_position?: number | null
          created_at?: string
        }
      }
    }
    Functions: {
      join_org_by_code: {
        Args: { p_code: string }
        Returns: string
      }
      generate_invite_code: {
        Args: Record<string, never>
        Returns: string
      }
    }
  }
}
