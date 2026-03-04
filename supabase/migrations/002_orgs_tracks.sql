-- ══════════════════════════════════════════════════════════════════════════════
-- Chœur Studio — Migration 002 : Organisations, Pistes, Extensions
-- À exécuter dans : Supabase → SQL Editor (après la migration 001)
--
-- IMPORTANT : toutes les tables sont créées avant les policies RLS
-- pour éviter les erreurs de référence circulaire.
-- ══════════════════════════════════════════════════════════════════════════════


-- ─── ÉTAPE 1 : ENUM ──────────────────────────────────────────────────────────
do $$ begin
  create type public.voice_part as enum ('soprano', 'alto', 'tenor', 'basse');
exception when duplicate_object then null;
end $$;


-- ─── ÉTAPE 2 : TABLES (sans policies) ────────────────────────────────────────

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  admin_id    uuid references public.profiles(id) on delete cascade not null,
  invite_code text unique not null,
  created_at  timestamptz default now()
);

create table if not exists public.org_members (
  user_id    uuid references public.profiles(id) on delete cascade not null,
  org_id     uuid references public.organizations(id) on delete cascade not null,
  joined_at  timestamptz default now(),
  primary key (user_id, org_id)
);

create table if not exists public.tracks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.organizations(id) on delete cascade not null,
  voice_part   public.voice_part not null,
  name         text not null,
  storage_path text not null,
  uploaded_by  uuid references public.profiles(id) not null,
  created_at   timestamptz default now()
);


-- ─── ÉTAPE 3 : EXTENSIONS DES TABLES EXISTANTES ──────────────────────────────

alter table public.takes
  add column if not exists org_id uuid references public.organizations(id);

alter table public.take_comments
  add column if not exists time_position float default null;
-- null = commentaire global ; valeur en secondes = marqueur temporel


-- ─── ÉTAPE 4 : ACTIVER RLS ───────────────────────────────────────────────────

alter table public.organizations enable row level security;
alter table public.org_members    enable row level security;
alter table public.tracks         enable row level security;


-- ─── ÉTAPE 5 : POLICIES organizations ────────────────────────────────────────
-- (org_members existe déjà à ce stade)

create policy "Lecture des organisations"
  on public.organizations for select
  using (
    admin_id = auth.uid()
    or exists (
      select 1 from public.org_members
      where org_id = organizations.id and user_id = auth.uid()
    )
  );

-- Note: la limite max 3 orgs est vérifiée côté application (orgs.ts createOrg).
-- Ne PAS l'ajouter ici : requêter organizations depuis sa propre policy INSERT
-- cause une récursion infinie dans Supabase RLS.
create policy "Admin crée organisations"
  on public.organizations for insert
  with check (
    admin_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin modifie ses organisations"
  on public.organizations for update
  using (admin_id = auth.uid());

create policy "Admin supprime ses organisations"
  on public.organizations for delete
  using (admin_id = auth.uid());


-- ─── ÉTAPE 6 : POLICIES org_members ──────────────────────────────────────────

create policy "Lecture des membres"
  on public.org_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organizations
      where id = org_id and admin_id = auth.uid()
    )
  );

create policy "Auto-inscription"
  on public.org_members for insert
  with check (user_id = auth.uid());

create policy "Quitter ou exclure"
  on public.org_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.organizations
      where id = org_id and admin_id = auth.uid()
    )
  );


-- ─── ÉTAPE 7 : POLICIES tracks ───────────────────────────────────────────────

create policy "Lecture des pistes"
  on public.tracks for select
  using (
    exists (
      select 1 from public.org_members
      where org_id = tracks.org_id and user_id = auth.uid()
    )
    or exists (
      select 1 from public.organizations
      where id = tracks.org_id and admin_id = auth.uid()
    )
  );

create policy "Admin upload pistes"
  on public.tracks for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    and uploaded_by = auth.uid()
  );

create policy "Admin supprime pistes"
  on public.tracks for delete
  using (
    exists (
      select 1 from public.organizations
      where id = tracks.org_id and admin_id = auth.uid()
    )
  );


-- ─── ÉTAPE 8 : STORAGE BUCKET tracks ─────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('tracks', 'tracks', false)
on conflict do nothing;

create policy "Admin upload bucket tracks"
  on storage.objects for insert
  with check (
    bucket_id = 'tracks'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Lecture bucket tracks"
  on storage.objects for select
  using (
    bucket_id = 'tracks'
    and exists (select 1 from public.profiles where id = auth.uid())
  );

create policy "Admin supprime bucket tracks"
  on storage.objects for delete
  using (
    bucket_id = 'tracks'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );


-- ─── ÉTAPE 9 : RPC join_org_by_code ──────────────────────────────────────────

create or replace function public.join_org_by_code(p_code text)
returns uuid
language plpgsql security definer as $$
declare
  v_org_id uuid;
begin
  select id into v_org_id
  from public.organizations
  where upper(trim(invite_code)) = upper(trim(p_code));

  if v_org_id is null then
    raise exception 'Code d''invitation invalide ou expiré';
  end if;

  insert into public.org_members (user_id, org_id)
  values (auth.uid(), v_org_id)
  on conflict do nothing;

  return v_org_id;
end;
$$;


-- ─── ÉTAPE 10 : RPC generate_invite_code ─────────────────────────────────────

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
    -- Format lisible : ABCD-1234
    code := substr(code, 1, 4) || '-' || substr(code, 5, 4);
    select (count(*) > 0) into taken
    from public.organizations
    where invite_code = code;
  end loop;
  return code;
end;
$$;
