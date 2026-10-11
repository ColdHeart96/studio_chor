-- ══════════════════════════════════════════════════════════════════════════════
-- Chœur Studio — Migration 003 : Sécurité & isolation multi-tenant
-- À exécuter dans : Supabase → SQL Editor (après 001 et 002)
--
-- Corrige :
--   1. Escalade de privilèges : un utilisateur pouvait se passer admin lui-même
--   2. Rôle admin GLOBAL → rôle PAR ORGANISATION (org_members.role)
--   3. Auto-inscription directe dans org_members (contournait le code d'invitation)
--   4. Fuites inter-organisations : takes, commentaires, buckets storage, profils
--   5. Limite de 3 organisations non appliquée côté serveur
--   6. Suppression d'une org bloquée par les prises (FK sans cascade)
--
-- IMPORTANT après exécution :
--   - Seuls les PROPRIÉTAIRES d'organisation sont admin de leur org. Les anciens
--     co-admins (promus via l'ancien bouton « Changer rôle ») doivent être
--     re-promus depuis l'écran Choristes.
--   - profiles.role n'est plus modifiable depuis l'app. Il sert uniquement à
--     autoriser la CRÉATION d'organisations (admin de plateforme). Pour accorder
--     ce droit à un nouveau chef de chœur :
--       update public.profiles set role = 'admin' where email = 'chef@exemple.fr';
-- ══════════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. SCHÉMA ───────────────────────────────────────────────────────────────

alter table public.org_members
  add column if not exists role text not null default 'member'
  check (role in ('admin', 'member'));

alter table public.profiles
  add column if not exists display_name text;

-- Le propriétaire de chaque organisation est admin de son org
insert into public.org_members (user_id, org_id, role)
select admin_id, id, 'admin' from public.organizations
on conflict (user_id, org_id) do update set role = 'admin';

-- Supprimer une org supprime ses prises (avant : erreur de clé étrangère)
alter table public.takes drop constraint if exists takes_org_id_fkey;
alter table public.takes
  add constraint takes_org_id_fkey
  foreign key (org_id) references public.organizations(id) on delete cascade;

-- Rattacher les anciennes prises sans org quand l'utilisateur n'a qu'une seule org
update public.takes t
set org_id = m.org_id
from (
  select user_id, (array_agg(org_id))[1] as org_id
  from public.org_members
  group by user_id
  having count(*) = 1
) m
where t.org_id is null and t.user_id = m.user_id;

-- Toute nouvelle prise doit appartenir à une org
-- (NOT VALID : les éventuelles anciennes lignes orphelines restent, mais plus de nouvelles)
alter table public.takes drop constraint if exists takes_org_required;
alter table public.takes
  add constraint takes_org_required check (org_id is not null) not valid;

-- Index pour les policies et les listes
create index if not exists idx_org_members_org_role   on public.org_members (org_id, role);
create index if not exists idx_tracks_org             on public.tracks (org_id);
create index if not exists idx_takes_org_user_created on public.takes (org_id, user_id, created_at desc);
create index if not exists idx_takes_storage_path     on public.takes (storage_path);
create index if not exists idx_take_comments_take     on public.take_comments (take_id);


-- ─── 2. FONCTIONS D'AUTORISATION (security definer : pas de récursion RLS) ──

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org and user_id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.is_org_owner_user(p_org uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organizations where id = p_org and admin_id = p_user
  );
$$;

-- Un utilisateur voit : son propre profil, les profils des membres des orgs qu'il
-- administre, et les profils des admins des orgs dont il est membre (auteurs de commentaires).
create or replace function public.can_see_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = (select auth.uid())
  or exists (
    select 1
    from public.org_members me
    join public.org_members other on other.org_id = me.org_id
    where me.user_id = (select auth.uid())
      and other.user_id = p_user
      and (me.role = 'admin' or other.role = 'admin')
  );
$$;

create or replace function public.is_take_org_admin(p_take bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.takes t
    where t.id = p_take and t.org_id is not null and public.is_org_admin(t.org_id)
  );
$$;

create or replace function public.can_view_take(p_take bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.takes t
    where t.id = p_take
      and (t.user_id = (select auth.uid())
           or (t.org_id is not null and public.is_org_admin(t.org_id)))
  );
$$;

-- Storage « takes » : l'admin d'une org peut lire/supprimer les fichiers des prises de son org
create or replace function public.is_take_file_admin(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.takes t
    where t.storage_path = p_path and t.org_id is not null and public.is_org_admin(t.org_id)
  );
$$;

-- Storage « tracks » : premier segment du chemin = org_id (null si invalide)
create or replace function public.storage_org_id(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return (string_to_array(p_name, '/'))[1]::uuid;
exception when others then
  return null;
end;
$$;


-- ─── 3. TRIGGERS ORGANISATIONS ───────────────────────────────────────────────

create or replace function public.org_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.organizations where admin_id = new.admin_id) >= 3 then
    raise exception 'Maximum 3 organisations par administrateur.';
  end if;
  return new;
end;
$$;

create or replace function public.org_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.org_members (user_id, org_id, role)
  values (new.admin_id, new.id, 'admin')
  on conflict (user_id, org_id) do update set role = 'admin';
  return new;
end;
$$;

drop trigger if exists trg_org_before_insert on public.organizations;
create trigger trg_org_before_insert
  before insert on public.organizations
  for each row execute function public.org_before_insert();

drop trigger if exists trg_org_after_insert on public.organizations;
create trigger trg_org_after_insert
  after insert on public.organizations
  for each row execute function public.org_after_insert();


-- ─── 4. POLICIES : profiles ──────────────────────────────────────────────────

drop policy if exists "Lecture des profils"          on public.profiles;
drop policy if exists "Mise à jour de son profil"    on public.profiles;
drop policy if exists "Admin modifie les profils"    on public.profiles;
drop policy if exists "profiles_select"              on public.profiles;
drop policy if exists "profiles_update_self"         on public.profiles;

create policy "profiles_select" on public.profiles
  for select to authenticated
  using (public.can_see_profile(id));

create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Verrou de colonnes : seul display_name est modifiable (role/email/id ne le sont plus)
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;


-- ─── 5. POLICIES : organizations ─────────────────────────────────────────────

drop policy if exists "Lecture des organisations"        on public.organizations;
drop policy if exists "Admin crée organisations"         on public.organizations;
drop policy if exists "Admin modifie ses organisations"  on public.organizations;
drop policy if exists "Admin supprime ses organisations" on public.organizations;
drop policy if exists "orgs_select" on public.organizations;
drop policy if exists "orgs_insert" on public.organizations;
drop policy if exists "orgs_update" on public.organizations;
drop policy if exists "orgs_delete" on public.organizations;

create policy "orgs_select" on public.organizations
  for select to authenticated
  using (admin_id = (select auth.uid()) or public.is_org_member(id));

create policy "orgs_insert" on public.organizations
  for insert to authenticated
  with check (
    admin_id = (select auth.uid())
    and exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
  );

create policy "orgs_update" on public.organizations
  for update to authenticated
  using (admin_id = (select auth.uid()))
  with check (admin_id = (select auth.uid()));

create policy "orgs_delete" on public.organizations
  for delete to authenticated
  using (admin_id = (select auth.uid()));

-- Seuls le nom et le code sont modifiables (pas de transfert de propriété côté client)
revoke update on public.organizations from anon, authenticated;
grant update (name, invite_code) on public.organizations to authenticated;


-- ─── 6. POLICIES : org_members ───────────────────────────────────────────────

drop policy if exists "Lecture des membres"  on public.org_members;
drop policy if exists "Auto-inscription"     on public.org_members;
drop policy if exists "Quitter ou exclure"   on public.org_members;
drop policy if exists "members_select" on public.org_members;
drop policy if exists "members_update" on public.org_members;
drop policy if exists "members_delete" on public.org_members;

create policy "members_select" on public.org_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_org_admin(org_id));

-- Pas de policy INSERT : on ne rejoint une org QUE via join_org_by_code()
-- (ou via le trigger de création d'organisation).

create policy "members_update" on public.org_members
  for update to authenticated
  using (public.is_org_admin(org_id) and not public.is_org_owner_user(org_id, user_id))
  with check (public.is_org_admin(org_id) and not public.is_org_owner_user(org_id, user_id));

create policy "members_delete" on public.org_members
  for delete to authenticated
  using (
    (user_id = (select auth.uid()) or public.is_org_admin(org_id))
    and not public.is_org_owner_user(org_id, user_id)
  );

revoke insert, update on public.org_members from anon, authenticated;
grant update (role) on public.org_members to authenticated;


-- ─── 7. POLICIES : tracks ────────────────────────────────────────────────────

drop policy if exists "Lecture des pistes"     on public.tracks;
drop policy if exists "Admin upload pistes"    on public.tracks;
drop policy if exists "Admin supprime pistes"  on public.tracks;
drop policy if exists "tracks_select" on public.tracks;
drop policy if exists "tracks_insert" on public.tracks;
drop policy if exists "tracks_delete" on public.tracks;

create policy "tracks_select" on public.tracks
  for select to authenticated
  using (public.is_org_member(org_id));

create policy "tracks_insert" on public.tracks
  for insert to authenticated
  with check (public.is_org_admin(org_id) and uploaded_by = (select auth.uid()));

create policy "tracks_delete" on public.tracks
  for delete to authenticated
  using (public.is_org_admin(org_id));


-- ─── 8. POLICIES : takes ─────────────────────────────────────────────────────

drop policy if exists "Lecture des prises"     on public.takes;
drop policy if exists "Création de prise"      on public.takes;
drop policy if exists "Modification de prise"  on public.takes;
drop policy if exists "Suppression de prise"   on public.takes;
drop policy if exists "takes_select" on public.takes;
drop policy if exists "takes_insert" on public.takes;
drop policy if exists "takes_update" on public.takes;
drop policy if exists "takes_delete" on public.takes;

-- Lecture : l'auteur, ou l'admin DE L'ORG de la prise (plus tous les admins)
create policy "takes_select" on public.takes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (org_id is not null and public.is_org_admin(org_id))
  );

create policy "takes_insert" on public.takes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and org_id is not null
    and public.is_org_member(org_id)
  );

create policy "takes_update" on public.takes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "takes_delete" on public.takes
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (org_id is not null and public.is_org_admin(org_id))
  );

-- user_id / org_id / storage_path ne sont plus modifiables après création
revoke update on public.takes from anon, authenticated;
grant update (name, favorite, date, duration, backing_snapshot, review_snapshot, voice_on, voice_vol)
  on public.takes to authenticated;


-- ─── 9. POLICIES : take_comments ─────────────────────────────────────────────

drop policy if exists "Lecture des commentaires"  on public.take_comments;
drop policy if exists "Admin crée commentaires"   on public.take_comments;
drop policy if exists "Admin modifie commentaires" on public.take_comments;
drop policy if exists "Admin supprime commentaires" on public.take_comments;
drop policy if exists "comments_select" on public.take_comments;
drop policy if exists "comments_insert" on public.take_comments;
drop policy if exists "comments_update" on public.take_comments;
drop policy if exists "comments_delete" on public.take_comments;

create policy "comments_select" on public.take_comments
  for select to authenticated
  using (public.can_view_take(take_id));

create policy "comments_insert" on public.take_comments
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_take_org_admin(take_id));

create policy "comments_update" on public.take_comments
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_take_org_admin(take_id))
  with check (user_id = (select auth.uid()) and public.is_take_org_admin(take_id));

create policy "comments_delete" on public.take_comments
  for delete to authenticated
  using (public.is_take_org_admin(take_id));

revoke update on public.take_comments from anon, authenticated;
grant update (note, time_position) on public.take_comments to authenticated;


-- ─── 10. POLICIES : storage ──────────────────────────────────────────────────

drop policy if exists "Upload de ses prises"         on storage.objects;
drop policy if exists "Lecture de ses prises"        on storage.objects;
drop policy if exists "Suppression de ses prises"    on storage.objects;
drop policy if exists "Admin upload bucket tracks"   on storage.objects;
drop policy if exists "Lecture bucket tracks"        on storage.objects;
drop policy if exists "Admin supprime bucket tracks" on storage.objects;
drop policy if exists "takes_files_insert" on storage.objects;
drop policy if exists "takes_files_select" on storage.objects;
drop policy if exists "takes_files_delete" on storage.objects;
drop policy if exists "tracks_files_insert" on storage.objects;
drop policy if exists "tracks_files_select" on storage.objects;
drop policy if exists "tracks_files_delete" on storage.objects;

-- Bucket takes : chemin = {user_id}/{fichier}
create policy "takes_files_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'takes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "takes_files_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'takes'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_take_file_admin(name)
    )
  );

create policy "takes_files_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'takes'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_take_file_admin(name)
    )
  );

-- Bucket tracks : chemin = {org_id}/{voix}/{fichier}
create policy "tracks_files_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tracks'
    and public.is_org_member(public.storage_org_id(name))
  );

create policy "tracks_files_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tracks'
    and public.is_org_admin(public.storage_org_id(name))
  );

create policy "tracks_files_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tracks'
    and public.is_org_admin(public.storage_org_id(name))
  );


-- ─── 11. FONCTIONS EXISTANTES DURCIES ────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create or replace function public.join_org_by_code(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Non authentifié';
  end if;

  select id into v_org_id
  from public.organizations
  where upper(trim(invite_code)) = upper(trim(p_code));

  if v_org_id is null then
    raise exception 'Code d''invitation invalide ou expiré';
  end if;

  insert into public.org_members (user_id, org_id, role)
  values ((select auth.uid()), v_org_id, 'member')
  on conflict (user_id, org_id) do nothing;

  return v_org_id;
end;
$$;

create or replace function public.generate_invite_code()
returns text language plpgsql set search_path = '' as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code  text;
  taken boolean := true;
  i     int;
begin
  while taken loop
    code := '';
    for i in 1..8 loop
      code := code || substr(chars, floor(random() * length(chars))::int + 1, 1);
    end loop;
    code := substr(code, 1, 4) || '-' || substr(code, 5, 4);
    select (count(*) > 0) into taken from public.organizations where invite_code = code;
  end loop;
  return code;
end;
$$;


-- ─── 12. DROITS D'EXÉCUTION ──────────────────────────────────────────────────

revoke execute on function
  public.is_org_member(uuid), public.is_org_admin(uuid),
  public.is_org_owner_user(uuid, uuid), public.can_see_profile(uuid),
  public.is_take_org_admin(bigint), public.can_view_take(bigint),
  public.is_take_file_admin(text), public.storage_org_id(text),
  public.join_org_by_code(text), public.generate_invite_code()
  from public, anon;

grant execute on function
  public.is_org_member(uuid), public.is_org_admin(uuid),
  public.is_org_owner_user(uuid, uuid), public.can_see_profile(uuid),
  public.is_take_org_admin(bigint), public.can_view_take(bigint),
  public.is_take_file_admin(text), public.storage_org_id(text),
  public.join_org_by_code(text), public.generate_invite_code()
  to authenticated;

-- Fonctions de trigger : jamais appelables depuis l'API
revoke execute on function
  public.org_before_insert(), public.org_after_insert(), public.handle_new_user()
  from public, anon, authenticated;

commit;
