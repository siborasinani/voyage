-- Voyage — makes trip budgets genuinely personal, per collaborator
--
-- Run this once, after 0001-0013, in the Supabase SQL Editor.
--
-- Background: `trips.budget_amount`/`budget_currency` (0001_init.sql)
-- were always exactly one value per trip — a plain pair of columns on
-- the trip row itself, writable by any owner/editor, visible to every
-- collaborator. There was never a scenario where two people had
-- "different" budgets; any edit by any editor overwrote the one
-- number everyone saw. A UI audit asked for the Budget section to
-- read as "my own planning," which would have been a fake label on
-- shared data without this migration — the whole point of this file
-- is to make that framing actually true, not just look true.
--
-- This is deliberately a *new*, narrowly-scoped table rather than two
-- new columns bolted onto `trip_members` — that table already carries
-- access-control data (`role`); a personal-planning number is a
-- different concern with a different owner-only access pattern, and
-- keeping it separate keeps both tables single-purpose, the same
-- reasoning already behind `notifications`/`activity_events` getting
-- their own tables instead of overloading an existing one.
--
-- `trips.budget_amount`/`budget_currency` are deliberately left in
-- place, not dropped — same precedent as `trips.local_id` (see
-- 0002_trips_local_id.sql / PROJECT_CONTEXT.md §6): removing a
-- retired column isn't necessary to retire its behavior, and doing so
-- would be an unrequested schema change. App code stops reading/
-- writing them as of this migration; the one-time backfill below
-- copies each trip's already-set value forward as its *owner's*
-- personal budget (the least surprising interpretation — it's the
-- value the owner themself set) rather than silently discarding
-- every trip's existing budget. Every other collaborator starts with
-- no personal budget set, same "null until you set one" starting
-- state a brand-new trip has always had.

create table if not exists public.trip_member_budgets (
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric not null,
  currency text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

alter table public.trip_member_budgets enable row level security;

-- Readable by its owner alone, regardless of their *current* role on
-- the trip — this is personal data, and a collaborator who was
-- demoted (or even removed and later re-invited) should still be able
-- to see a number they themselves set, the same way removing someone
-- from a trip has never touched their own friendships (§21) or any
-- other personal data of theirs.
drop policy if exists "a member can view their own trip budget" on public.trip_member_budgets;
create policy "a member can view their own trip budget"
  on public.trip_member_budgets for select
  to authenticated
  using (user_id = auth.uid());

-- Writable only by the row's own owner *and* only while they're
-- currently an owner/editor of the trip — the exact same boundary
-- that already existed for the one shared budget (only owner/editor
-- could ever set it; a viewer could not). Personalizing the data
-- doesn't loosen that: a viewer still can't set a budget for
-- themselves here, matching the existing UI's `canEdit` gating
-- exactly rather than quietly granting a new capability alongside an
-- unrelated fix.
drop policy if exists "an owner or editor can set their own trip budget" on public.trip_member_budgets;
create policy "an owner or editor can set their own trip budget"
  on public.trip_member_budgets for insert
  to authenticated
  with check (user_id = auth.uid() and public.trip_role(trip_id) in ('owner', 'editor'));

drop policy if exists "an owner or editor can update their own trip budget" on public.trip_member_budgets;
create policy "an owner or editor can update their own trip budget"
  on public.trip_member_budgets for update
  to authenticated
  using (user_id = auth.uid() and public.trip_role(trip_id) in ('owner', 'editor'))
  with check (user_id = auth.uid() and public.trip_role(trip_id) in ('owner', 'editor'));

-- No delete grant/policy: SetBudget.jsx has no "clear my budget"
-- action (the same as the old trips.budget_amount/currency never had
-- one either) — nothing in the app needs to remove a row here, so
-- nothing is granted that could.
grant select, insert, update on public.trip_member_budgets to authenticated;

drop trigger if exists set_trip_member_budgets_updated_at on public.trip_member_budgets;
create trigger set_trip_member_budgets_updated_at
  before update on public.trip_member_budgets
  for each row execute function public.set_updated_at();

-- One-time backfill: an already-set trip-wide budget becomes its
-- owner's personal budget. `on conflict do nothing` makes this safe
-- to run more than once (matches this project's other idempotent
-- backfills/migrations).
insert into public.trip_member_budgets (trip_id, user_id, amount, currency)
select id, owner_id, budget_amount, budget_currency
from public.trips
where budget_amount is not null
on conflict (trip_id, user_id) do nothing;
