// Types générés depuis la base Supabase (projet ckujpnymhithpwujqwyd).
// Régénérer après chaque migration :
//   npx supabase gen types typescript --project-id ckujpnymhithpwujqwyd > src/types/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Permet à createClient d'inférer automatiquement les bonnes options
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      org_members: {
        Row: {
          joined_at: string | null
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          joined_at?: string | null
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          joined_at?: string | null
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'org_members_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'org_members_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      organizations: {
        Row: {
          admin_id: string
          created_at: string | null
          id: string
          invite_code: string
          name: string
        }
        Insert: {
          admin_id: string
          created_at?: string | null
          id?: string
          invite_code: string
          name: string
        }
        Update: {
          admin_id?: string
          created_at?: string | null
          id?: string
          invite_code?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: 'organizations_admin_id_fkey'
            columns: ['admin_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email: string
          id: string
          role?: string
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      take_comments: {
        Row: {
          created_at: string | null
          date: string | null
          id: number
          note: string
          take_id: number
          time_position: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date?: string | null
          id?: never
          note: string
          take_id: number
          time_position?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string | null
          id?: never
          note?: string
          take_id?: number
          time_position?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'take_comments_take_id_fkey'
            columns: ['take_id']
            isOneToOne: false
            referencedRelation: 'takes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'take_comments_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      takes: {
        Row: {
          backing_snapshot: Json | null
          created_at: string | null
          date: string | null
          duration: string | null
          favorite: boolean | null
          id: number
          name: string
          org_id: string | null
          rating: number
          review_snapshot: Json | null
          storage_path: string | null
          sync_info: Json
          user_id: string
          voice_on: boolean | null
          voice_vol: number | null
        }
        Insert: {
          backing_snapshot?: Json | null
          created_at?: string | null
          date?: string | null
          duration?: string | null
          favorite?: boolean | null
          id?: never
          name: string
          org_id?: string | null
          rating?: number
          review_snapshot?: Json | null
          storage_path?: string | null
          sync_info?: Json
          user_id: string
          voice_on?: boolean | null
          voice_vol?: number | null
        }
        Update: {
          backing_snapshot?: Json | null
          created_at?: string | null
          date?: string | null
          duration?: string | null
          favorite?: boolean | null
          id?: never
          name?: string
          org_id?: string | null
          rating?: number
          review_snapshot?: Json | null
          storage_path?: string | null
          sync_info?: Json
          user_id?: string
          voice_on?: boolean | null
          voice_vol?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'takes_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'takes_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      tracks: {
        Row: {
          created_at: string | null
          id: string
          name: string
          org_id: string
          storage_path: string
          uploaded_by: string
          voice_part: Database['public']['Enums']['voice_part']
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          org_id: string
          storage_path: string
          uploaded_by: string
          voice_part: Database['public']['Enums']['voice_part']
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          org_id?: string
          storage_path?: string
          uploaded_by?: string
          voice_part?: Database['public']['Enums']['voice_part']
        }
        Relationships: [
          {
            foreignKeyName: 'tracks_org_id_fkey'
            columns: ['org_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tracks_uploaded_by_fkey'
            columns: ['uploaded_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_see_profile: { Args: { p_user: string }; Returns: boolean }
      can_view_take: { Args: { p_take: number }; Returns: boolean }
      generate_invite_code: { Args: never; Returns: string }
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      is_org_owner_user: {
        Args: { p_org: string; p_user: string }
        Returns: boolean
      }
      is_take_file_admin: { Args: { p_path: string }; Returns: boolean }
      is_take_org_admin: { Args: { p_take: number }; Returns: boolean }
      join_org_by_code: { Args: { p_code: string }; Returns: string }
      storage_org_id: { Args: { p_name: string }; Returns: string }
    }
    Enums: {
      voice_part: 'soprano' | 'alto' | 'tenor' | 'basse'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
