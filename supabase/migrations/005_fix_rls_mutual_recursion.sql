-- ══════════════════════════════════════════════════════════════════════════════
-- Chœur Studio — Migration 005 : Fix récursion mutuelle organizations ↔ org_members
-- À exécuter dans : Supabase → SQL Editor (après la migration 004)
--
-- Problème : récursion infinie dans les policies RLS
--   organizations SELECT → vérifie org_members
--   org_members SELECT  → vérifie organizations  ← cycle !
--
-- La création d'une organisation déclenche ce cycle dès que le client
-- fait un SELECT sur organizations (count check dans createOrg).
--
-- Fix : réécrire la policy SELECT de org_members pour ne plus référencer
-- organizations. On vérifie le rôle admin via profiles (toujours sûr car
-- la policy profiles court-circuite sur auth.uid() = id sans récursion).
-- ══════════════════════════════════════════════════════════════════════════════


-- ─── Recréer la policy SELECT de org_members sans référencer organizations ────

drop policy if exists "Lecture des membres" on public.org_members;

create policy "Lecture des membres"
  on public.org_members for select
  using (
    -- Voir ses propres memberships
    user_id = auth.uid()
    or
    -- Admin : voir les membres (rôle vérifié via profiles, pas via organizations)
    -- Évite le cycle : org_members → organizations → org_members → ∞
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
