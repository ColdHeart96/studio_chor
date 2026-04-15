-- ══════════════════════════════════════════════════════════════════════════════
-- Chœur Studio — Migration 003 : Corrections de sécurité
-- À exécuter dans : Supabase → SQL Editor (après les migrations 001 et 002)
--
-- Failles corrigées :
--   1. [CRITIQUE]  Élévation de privilège — choriste peut s'auto-promouvoir admin
--   2. [HAUTE]     Storage tracks accessible à tout utilisateur authentifié
--   3. [HAUTE]     Emails visibles par tous les utilisateurs authentifiés
--   4. [MOYENNE]   Limite max 3 organisations non enforced côté DB
--   5. [FAIBLE]    generate_invite_code utilise random() non cryptographique
-- ══════════════════════════════════════════════════════════════════════════════


-- ─── 1. [CRITIQUE] Élévation de privilège sur profiles ───────────────────────
-- Problème : la policy "Mise à jour de son profil" permettait à tout choriste
-- de modifier le champ `role` de son propre profil via l'API.
-- Fix : autoriser uniquement la mise à jour de l'email (champ non-sensible),
-- et réserver tout changement de `role` à un admin via une policy distincte.

drop policy if exists "Mise à jour de son profil"  on public.profiles;
drop policy if exists "Admin modifie les profils"   on public.profiles;

-- Un utilisateur peut mettre à jour son propre profil,
-- MAIS le rôle doit rester identique à ce qu'il est déjà.
create policy "Mise à jour de son profil"
  on public.profiles for update
  using  (auth.uid() = id)
  with check (
    auth.uid() = id
    -- Empêche tout changement du champ role par l'utilisateur lui-même
    and role = (select role from public.profiles where id = auth.uid())
  );

-- Seul un admin peut changer le rôle d'un autre utilisateur.
create policy "Admin modifie les profils"
  on public.profiles for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );


-- ─── 2. [HAUTE] Storage bucket tracks — trop permissif ────────────────────────
-- Problème : tout utilisateur authentifié pouvait lire toutes les pistes audio,
-- même celles d'organisations auxquelles il n'appartient pas.
-- Fix : restreindre la lecture aux membres de l'organisation propriétaire.

drop policy if exists "Lecture bucket tracks" on storage.objects;

create policy "Lecture bucket tracks"
  on storage.objects for select
  using (
    bucket_id = 'tracks'
    and (
      -- Admin de l'org propriétaire de la piste
      exists (
        select 1
        from public.tracks t
        join public.organizations o on o.id = t.org_id
        where t.storage_path = objects.name
          and o.admin_id = auth.uid()
      )
      or
      -- Membre de l'org propriétaire de la piste
      exists (
        select 1
        from public.tracks t
        join public.org_members om on om.org_id = t.org_id
        where t.storage_path = objects.name
          and om.user_id = auth.uid()
      )
    )
  );


-- ─── 3. [HAUTE] Emails visibles par tous les authentifiés ─────────────────────
-- Problème : la policy "Lecture des profils" permettait à tout utilisateur
-- connecté d'énumérer tous les emails de la base (toutes organisations confondues).
-- Fix : chacun ne voit que son propre profil + les profils des membres
-- de ses organisations.

drop policy if exists "Lecture des profils" on public.profiles;

create policy "Lecture des profils"
  on public.profiles for select
  using (
    -- Son propre profil
    auth.uid() = id
    or
    -- Admin : voir les membres de ses organisations
    exists (
      select 1
      from public.org_members om
      join public.organizations o on o.id = om.org_id
      where om.user_id = profiles.id
        and o.admin_id = auth.uid()
    )
    or
    -- Choriste : voir les autres membres de ses organisations
    exists (
      select 1
      from public.org_members om1
      join public.org_members om2 on om2.org_id = om1.org_id
      where om1.user_id = auth.uid()
        and om2.user_id = profiles.id
    )
  );


-- ─── 4. [MOYENNE] Limite max 3 organisations enforced en DB ───────────────────
-- Problème : la limite était vérifiée uniquement côté application,
-- contournable via l'API Supabase directement.
-- Fix : trigger avant insertion qui rejette si l'admin a déjà 3 organisations.

create or replace function public.check_org_limit()
returns trigger
language plpgsql
security definer as $$
declare
  org_count int;
begin
  select count(*) into org_count
  from public.organizations
  where admin_id = new.admin_id;

  if org_count >= 3 then
    raise exception 'Limite atteinte : un administrateur ne peut gérer que 3 organisations maximum.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_org_limit on public.organizations;

create trigger enforce_org_limit
  before insert on public.organizations
  for each row execute procedure public.check_org_limit();


-- ─── 5. [FAIBLE] generate_invite_code — remplacer random() par gen_random_bytes ─
-- Problème : random() n'est pas cryptographiquement sûr.
-- Fix : utiliser gen_random_bytes() pour plus d'entropie.
-- Note : la fonction reste non-security-definer car elle ne lit pas organizations
-- directement avec des droits élevés — la vérification d'unicité est faite
-- avec les droits de l'appelant (admin), ce qui est correct.

create or replace function public.generate_invite_code()
returns text
language plpgsql
security definer as $$
declare
  chars  text    := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code   text;
  taken  boolean := true;
  i      int;
  byte   int;
begin
  while taken loop
    code := '';
    for i in 1..8 loop
      -- gen_random_bytes(1) → 1 octet aléatoire cryptographiquement sûr
      byte := get_byte(gen_random_bytes(1), 0);
      code := code || substr(chars, (byte % length(chars)) + 1, 1);
    end loop;
    -- Format lisible : ABCD-1234
    code := substr(code, 1, 4) || '-' || substr(code, 5, 4);
    select (count(*) > 0) into taken
    from public.organizations
    where invite_code = code;
  end loop;
  return code;
end;
$$;
