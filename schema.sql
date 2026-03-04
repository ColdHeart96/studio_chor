-- ══════════════════════════════════════════════════════════════════════════════
-- Chœur Studio — Schéma Supabase
-- À exécuter dans : Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. TABLE PROFILES ────────────────────────────────────────────────────────
create table public.profiles (
  id      uuid references auth.users(id) on delete cascade primary key,
  email   text not null,
  role    text not null default 'choriste' check (role in ('admin', 'choriste')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Tout utilisateur connecté peut lire les profils (nécessaire pour l'admin)
create policy "Lecture des profils"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- Chaque utilisateur peut modifier son propre profil
create policy "Mise à jour de son profil"
  on public.profiles for update
  using (auth.uid() = id);

-- L'admin peut modifier n'importe quel profil (rôles)
create policy "Admin modifie les profils"
  on public.profiles for update
  using (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));

-- Trigger : créer un profil automatiquement à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ─── 2. TABLE TAKES ───────────────────────────────────────────────────────────
create table public.takes (
  id             bigint generated always as identity primary key,
  user_id        uuid references public.profiles(id) on delete cascade not null,
  name           text not null,
  date           text,
  duration       text,
  favorite       boolean default false,
  storage_path   text,
  backing_snapshot jsonb default '{}',
  review_snapshot  jsonb default '{}',
  voice_on       boolean default true,
  voice_vol      real    default 1.0,
  created_at     timestamptz default now()
);

alter table public.takes enable row level security;

-- Choriste voit ses prises ; admin voit tout
create policy "Lecture des prises"
  on public.takes for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Création de prise"
  on public.takes for insert
  with check (auth.uid() = user_id);

create policy "Modification de prise"
  on public.takes for update
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Suppression de prise"
  on public.takes for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );


-- ─── 3. TABLE TAKE_COMMENTS ───────────────────────────────────────────────────
create table public.take_comments (
  id       bigint generated always as identity primary key,
  take_id  bigint references public.takes(id) on delete cascade not null,
  user_id  uuid references public.profiles(id) not null,
  note     text not null,
  date     text,
  created_at timestamptz default now()
);

alter table public.take_comments enable row level security;

-- Visible par le propriétaire de la prise et l'admin
create policy "Lecture des commentaires"
  on public.take_comments for select
  using (
    exists (select 1 from public.takes where id = take_id and user_id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Seul l'admin peut créer / modifier / supprimer des commentaires
create policy "Admin crée commentaires"
  on public.take_comments for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin modifie commentaires"
  on public.take_comments for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin supprime commentaires"
  on public.take_comments for delete
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );


-- ─── 4. STORAGE BUCKET ────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('takes', 'takes', false)
on conflict do nothing;

-- Upload : dans son propre dossier user_id/
create policy "Upload de ses prises"
  on storage.objects for insert
  with check (
    bucket_id = 'takes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Téléchargement : ses propres fichiers ou admin
create policy "Lecture de ses prises"
  on storage.objects for select
  using (
    bucket_id = 'takes'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    )
  );

-- Suppression : ses propres fichiers ou admin
create policy "Suppression de ses prises"
  on storage.objects for delete
  using (
    bucket_id = 'takes'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    )
  );
