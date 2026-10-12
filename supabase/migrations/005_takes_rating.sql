-- ══════════════════════════════════════════════════════════════════════════════
-- Chœur Studio — Migration 005 : note personnelle (étoiles) d'une prise
--
-- 0 = pas de note, 1 à 5 = nombre d'étoiles. Migration additive, sans risque
-- pour le code déjà en production (la colonne est simplement ignorée).
-- La mise à jour est verrouillée par colonne (voir 003e) : on ajoute `rating`.
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.takes
  add column if not exists rating smallint not null default 0
  check (rating between 0 and 5);

comment on column public.takes.rating is
  'Note personnelle du choriste sur sa prise : 0 (aucune) à 5 étoiles.';

grant update (rating) on public.takes to authenticated;
