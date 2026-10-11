-- ══════════════════════════════════════════════════════════════════════════════
-- Chœur Studio — Migration 003e : fin du durcissement sécurité
-- À exécuter dans : Supabase → SQL Editor (projet ckujpnymhithpwujqwyd)
--
-- Les étapes 003a à 003d sont DÉJÀ appliquées (colonne role, fonctions, triggers,
-- nouvelles policies). Tant que ce script n'est pas exécuté, les ANCIENNES policies
-- permissives restent actives (elles s'additionnent aux nouvelles) : la base n'est
-- donc pas encore protégée.
-- ══════════════════════════════════════════════════════════════════════════════

begin;

-- 1. Retrait des anciennes policies permissives ──────────────────────────────

drop policy if exists "Lecture des profils"          on public.profiles;
drop policy if exists "Mise à jour de son profil"    on public.profiles;
drop policy if exists "Admin modifie les profils"    on public.profiles;

drop policy if exists "Lecture des organisations"        on public.organizations;
drop policy if exists "Admin crée organisations"         on public.organizations;
drop policy if exists "Admin modifie ses organisations"  on public.organizations;
drop policy if exists "Admin supprime ses organisations" on public.organizations;

drop policy if exists "Lecture des membres"  on public.org_members;
drop policy if exists "Auto-inscription"     on public.org_members;
drop policy if exists "Quitter ou exclure"   on public.org_members;

drop policy if exists "Lecture des pistes"     on public.tracks;
drop policy if exists "Admin upload pistes"    on public.tracks;
drop policy if exists "Admin supprime pistes"  on public.tracks;

drop policy if exists "Lecture des prises"     on public.takes;
drop policy if exists "Création de prise"      on public.takes;
drop policy if exists "Modification de prise"  on public.takes;
drop policy if exists "Suppression de prise"   on public.takes;

drop policy if exists "Lecture des commentaires"    on public.take_comments;
drop policy if exists "Admin crée commentaires"     on public.take_comments;
drop policy if exists "Admin modifie commentaires"  on public.take_comments;
drop policy if exists "Admin supprime commentaires" on public.take_comments;

drop policy if exists "Upload de ses prises"         on storage.objects;
drop policy if exists "Lecture de ses prises"        on storage.objects;
drop policy if exists "Suppression de ses prises"    on storage.objects;
drop policy if exists "Admin upload bucket tracks"   on storage.objects;
drop policy if exists "Lecture bucket tracks"        on storage.objects;
drop policy if exists "Admin supprime bucket tracks" on storage.objects;

-- 2. Verrous de colonnes (empêche l'auto-promotion en admin, le transfert de propriété…)

revoke update on public.profiles      from anon, authenticated;
grant  update (display_name)          on public.profiles to authenticated;

revoke update on public.organizations from anon, authenticated;
grant  update (name, invite_code)     on public.organizations to authenticated;

revoke insert, update on public.org_members from anon, authenticated;
grant  update (role)                  on public.org_members to authenticated;

revoke update on public.takes         from anon, authenticated;
grant  update (name, favorite, date, duration, backing_snapshot, review_snapshot, voice_on, voice_vol)
  on public.takes to authenticated;

revoke update on public.take_comments from anon, authenticated;
grant  update (note, time_position)   on public.take_comments to authenticated;

-- 3. Supprimer une organisation supprime ses prises (avant : erreur de clé étrangère)

alter table public.takes drop constraint if exists takes_org_id_fkey;
alter table public.takes
  add constraint takes_org_id_fkey
  foreign key (org_id) references public.organizations(id) on delete cascade;

-- 4. Fonctions de trigger : jamais appelables depuis l'API

revoke execute on function
  public.org_before_insert(), public.org_after_insert(), public.handle_new_user()
  from public, anon, authenticated;

revoke execute on function public.join_org_by_code(text), public.generate_invite_code()
  from public, anon;
grant execute on function public.join_org_by_code(text), public.generate_invite_code()
  to authenticated;

commit;
