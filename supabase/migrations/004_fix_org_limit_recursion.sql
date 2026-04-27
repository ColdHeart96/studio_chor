-- ══════════════════════════════════════════════════════════════════════════════
-- Chœur Studio — Migration 004 : Correction récursion infinie organizations
-- À exécuter dans : Supabase → SQL Editor (après la migration 003)
--
-- Problème : la migration 003 a introduit un trigger enforce_org_limit qui
-- fait un SELECT sur organizations depuis un trigger BEFORE INSERT.
-- La policy SELECT d'organizations interroge org_members, dont la policy
-- SELECT interroge organizations → récursion infinie.
--
-- Note : la migration 002 avait déjà documenté cette contrainte :
--   "Ne PAS l'ajouter ici : requêter organizations depuis sa propre policy
--    INSERT cause une récursion infinie dans Supabase RLS."
--
-- Fix : supprimer le trigger et revenir à la vérification côté application.
-- La limite max 3 orgs est déjà vérifiée dans createOrg() (service orgs.ts).
-- ══════════════════════════════════════════════════════════════════════════════


-- ─── 1. Supprimer le trigger qui cause la récursion ───────────────────────────

drop trigger if exists enforce_org_limit on public.organizations;
drop function if exists public.check_org_limit();


-- ─── 2. Revenir à generate_invite_code fonctionnel (sans gen_random_bytes) ───
-- La migration 003 utilisait gen_random_bytes() du schéma extensions qui
-- n'est pas accessible dans le search_path par défaut de Supabase.

create or replace function public.generate_invite_code()
returns text
language plpgsql as $$
declare
  chars    text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code     text;
  taken    boolean := true;
  i        int;
begin
  while taken loop
    code := '';
    for i in 1..8 loop
      code := code || substr(chars, floor(random() * length(chars))::int + 1, 1);
    end loop;
    code := substr(code, 1, 4) || '-' || substr(code, 5, 4);
    select (count(*) > 0) into taken
    from public.organizations
    where invite_code = code;
  end loop;
  return code;
end;
$$;
