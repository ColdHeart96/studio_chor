-- ══════════════════════════════════════════════════════════════════════════════
-- Chœur Studio — Migration 004 : métadonnées de synchro voix / pistes
-- (déjà appliquée sur ckujpnymhithpwujqwyd via le MCP)
--
-- La synchro est « cuite » dans le fichier MP3 de la prise. Cette colonne garde
-- de quoi diagnostiquer : décalage appliqué, type de sortie (haut-parleur /
-- filaire / Bluetooth), latences exposées par le navigateur, user agent.
-- ══════════════════════════════════════════════════════════════════════════════

alter table public.takes
  add column if not exists sync_info jsonb not null default '{}'::jsonb;

comment on column public.takes.sync_info is
  'Métadonnées de synchro voix/pistes : offset_ms appliqué, sortie audio (speaker/wired/bluetooth), latences navigateur, user agent.';
