-- Voyage — adds local-trip migration tracking to `trips`
--
-- Run this once, after 0001_init.sql, in the Supabase SQL Editor.
-- Small and additive only: one nullable column, one partial unique
-- index. Nothing existing is altered or removed.
--
-- Why: the explicit "move my local trips to my account" action (see
-- services/tripsRepository.js's migrateLocalTripsToSupabase) has to be
-- safe to run more than once without creating duplicate trips. The
-- only way to reliably recognize "this Supabase trip already came from
-- that local trip" is to remember the local trip's own id somewhere —
-- `local_id` is that link. It's null for every trip created normally
-- (via "Create a trip" while signed in); it's only ever set by the
-- migration action.
--
-- The unique index (scoped to non-null local_id, per owner) is what
-- actually guarantees no duplicates — enforced by Postgres itself, not
-- just app-level checking, so it holds even under a double-click or a
-- retried request. migrateLocalTripsToSupabase uses this as an
-- `upsert(...).onConflict('owner_id,local_id').ignoreDuplicates(true)`,
-- so re-running the migration with the same local trips is a safe no-op
-- for whatever was already copied over.

alter table public.trips add column if not exists local_id text;

create unique index if not exists trips_owner_local_id_idx
  on public.trips (owner_id, local_id)
  where local_id is not null;
