-- ══════════════════════════════════════════════════════════════════════════════
-- Chœur Studio — Migration 003 : Correctifs de sécurité
-- À exécuter dans : Supabase → SQL Editor (après la migration 002)
-- ══════════════════════════════════════════════════════════════════════════════


-- ─── ÉTAPE 1 : Corriger la policy RLS du bucket tracks ───────────────────────
-- AVANT : n'importe quel utilisateur authentifié pouvait lire toutes les pistes
-- APRÈS : seuls les membres (ou l'admin) de l'organisation propriétaire du dossier

drop policy if exists "Lecture bucket tracks" on storage.objects;

create policy "Lecture bucket tracks"
  on storage.objects for select
  using (
    bucket_id = 'tracks'
    and (
      -- Membre de l'organisation propriétaire du dossier {org_id}/...
      exists (
        select 1
        from public.org_members om
        join public.organizations o on om.org_id = o.id
        where (storage.foldername(name))[1]::uuid = o.id
          and om.user_id = auth.uid()
      )
      -- Ou admin propriétaire de cette organisation
      or exists (
        select 1
        from public.organizations o
        where (storage.foldername(name))[1]::uuid = o.id
          and o.admin_id = auth.uid()
      )
    )
  );


-- ─── ÉTAPE 2 : Expiration des codes d'invitation ──────────────────────────────

alter table public.organizations
  add column if not exists invite_code_created_at timestamptz default now();

-- Les codes existants sont initialisés à now() et valides 30 jours dès la migration.
update public.organizations
  set invite_code_created_at = now()
  where invite_code_created_at is null;


-- ─── ÉTAPE 3 : Mettre à jour join_org_by_code avec vérification d'expiration ──

create or replace function public.join_org_by_code(p_code text)
returns uuid
language plpgsql security definer as $$
declare
  v_org_id uuid;
begin
  select id into v_org_id
  from public.organizations
  where upper(trim(invite_code)) = upper(trim(p_code))
    and invite_code_created_at > now() - interval '30 days';

  if v_org_id is null then
    raise exception 'Code d''invitation invalide ou expiré';
  end if;

  insert into public.org_members (user_id, org_id)
  values (auth.uid(), v_org_id)
  on conflict do nothing;

  return v_org_id;
end;
$$;


-- ─── ÉTAPE 4 : Création d'organisation avec limite enforced côté base ─────────
-- Remplace la vérification client-side qui était contournable via l'API REST.

create or replace function public.create_organization(p_name text)
returns json
language plpgsql security definer as $$
declare
  v_count int;
  v_code  text;
  v_org   record;
begin
  -- Vérifier que l'appelant est admin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Permission refusée : rôle admin requis';
  end if;

  -- Vérifier la limite de 3 organisations (sans récursion RLS, car SECURITY DEFINER)
  select count(*) into v_count
  from public.organizations
  where admin_id = auth.uid();

  if v_count >= 3 then
    raise exception 'Maximum 3 organisations par administrateur';
  end if;

  -- Générer un code d'invitation unique
  select public.generate_invite_code() into v_code;

  -- Créer l'organisation
  insert into public.organizations (name, admin_id, invite_code, invite_code_created_at)
  values (p_name, auth.uid(), v_code, now())
  returning * into v_org;

  return row_to_json(v_org);
end;
$$;


-- ─── ÉTAPE 5 : Régénération de code avec mise à jour atomique du timestamp ────

create or replace function public.regenerate_invite_code_for_org(p_org_id uuid)
returns text
language plpgsql security definer as $$
declare
  v_code text;
begin
  -- Vérifier que l'appelant est bien l'admin de cette organisation
  if not exists (
    select 1 from public.organizations
    where id = p_org_id and admin_id = auth.uid()
  ) then
    raise exception 'Permission refusée : vous n''êtes pas admin de cette organisation';
  end if;

  -- Générer un nouveau code unique
  select public.generate_invite_code() into v_code;

  -- Mettre à jour le code ET le timestamp d'expiration en une seule opération
  update public.organizations
    set invite_code            = v_code,
        invite_code_created_at = now()
  where id = p_org_id;

  return v_code;
end;
$$;
