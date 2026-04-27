-- ══════════════════════════════════════════════════════════════════════════════
-- Chœur Studio — Migration 006 : Fix récursion profiles ↔ org_members
-- À exécuter dans : Supabase → SQL Editor (après la migration 005)
--
-- Problème : la migration 003 a rendu la policy profiles SELECT complexe
-- (références à org_members + organizations). Avec la migration 005,
-- org_members SELECT référence maintenant profiles → cycle :
--   profiles → org_members → profiles → ∞
--
-- Fix : revenir à la policy profiles SELECT de la migration 001.
-- Tous les utilisateurs authentifiés peuvent voir tous les profils.
-- C'est la version qui fonctionnait avant migration 003.
-- ══════════════════════════════════════════════════════════════════════════════


drop policy if exists "Lecture des profils" on public.profiles;

create policy "Lecture des profils"
  on public.profiles for select
  using (auth.role() = 'authenticated');
