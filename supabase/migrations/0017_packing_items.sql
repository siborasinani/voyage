-- Voyage — adds a trip-level packing checklist
--
-- Run this once, after 0001-0016, in the Supabase SQL Editor.
--
-- Background: Packing Checklist v1 (see PROJECT_CONTEXT.md and the
-- dedicated architecture investigation that preceded it) — a flat,
-- trip-level list of items a collaborator wants to pack, each with a
-- name and a completed/not-completed state. Deliberately the smallest
-- possible shape: no categories, quantities, per-person ownership, or
-- templates (all explicitly out of scope for v1).
--
-- This table is a direct copy of the existing `activities`/
-- `saved_places` pattern (0001_init.sql) — same columns shape, same
-- index, same RLS approach, same trigger. No new permission concept,
-- no new helper function: `is_trip_member`/`trip_role` (both defined
-- in 0001_init.sql) are reused exactly as every other trip-child table
-- already reuses them.

create table if not exists public.packing_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists packing_items_trip_id_idx on public.packing_items (trip_id);

alter table public.packing_items enable row level security;

-- Same `set_updated_at` trigger function `activities` already uses
-- (defined once in 0001_init.sql) — keeps `updated_at` honest on every
-- toggle/rename without every UPDATE statement having to set it itself.
drop trigger if exists set_packing_items_updated_at on public.packing_items;
create trigger set_packing_items_updated_at
  before update on public.packing_items
  for each row execute function public.set_updated_at();

-- Read: any trip member (owner, editor, or viewer).
drop policy if exists "members can view packing items" on public.packing_items;
create policy "members can view packing items"
  on public.packing_items for select
  to authenticated
  using (public.is_trip_member(trip_id));

-- Write (insert/update/delete): owners and editors only — a viewer can
-- see the checklist but never add/toggle/remove an item. Same single
-- `for all` policy shape as "owners and editors can manage activities"/
-- "...saved places" in 0001_init.sql.
drop policy if exists "owners and editors can manage packing items" on public.packing_items;
create policy "owners and editors can manage packing items"
  on public.packing_items for all
  to authenticated
  using (public.trip_role(trip_id) in ('owner', 'editor'))
  with check (public.trip_role(trip_id) in ('owner', 'editor'));

-- This project's `authenticated` role has no default table privileges
-- (see 0003_fix_trips_access.sql's own header comment — every table
-- that existed at that point needed an explicit grant, and every new
-- table since has needed the same, e.g. 0005_friendships.sql,
-- 0014_personal_trip_budgets.sql). RLS policies alone are not enough:
-- without this grant, every query above still fails with "permission
-- denied for table packing_items" regardless of how permissive the
-- policies are, since a table-level grant is Postgres's first, coarser
-- gate — RLS only ever narrows what a grant already allows, never
-- substitutes for it.
grant select, insert, update, delete on public.packing_items to authenticated;

-- No backfill needed: every existing trip simply has zero packing_items
-- rows until someone adds one — the app already reads this as
-- `packingItems: []` (see tripsRepository.js), the same "starts empty,
-- no migration of old data" behavior every other trip-child table here
-- already has.
