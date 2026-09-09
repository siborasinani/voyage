-- Voyage — Shared expenses: split a trip expense between trip members
--
-- Run this once, after 0001-0006, in the Supabase SQL Editor. No new
-- table or column: `expenses.paid_by` and `expense_participants`
-- (`expense_id`, `user_id`, `share_amount`) were both already
-- scaffolded in 0001_init.sql for exactly this and are structurally
-- sufficient as-is. This migration only tightens two existing WITH
-- CHECK clauses so the database — not just the create/edit form only
-- ever offering trip members as choices — enforces "only users who are
-- members of the trip should be able to participate in or access
-- shared-expense data".
--
-- A "personal" vs. "shared" expense is *not* a new column either: an
-- expense with zero `expense_participants` rows is personal, one with
-- one or more is shared. Every expense created before this migration
-- has zero participant rows already, so nothing here reinterprets, or
-- needs to touch, a single existing row — they keep reading as
-- personal automatically, with no data migration.
--
-- Deleting a shared expense already needs no new code at all:
-- `expense_participants.expense_id` already has `on delete cascade`
-- to `expenses.id` (0001_init.sql), so removing the expense row
-- removes its participant rows atomically, at the database level —
-- "deleting an expense must also remove its participant/share records
-- correctly" was already true before this migration.

-- Replaces 0001_init.sql's original "owners and editors can manage
-- expense participants" — the USING/original WITH CHECK only verified
-- the *acting* user is an owner/editor of the expense's trip; it never
-- checked that the participant row's own `user_id` is actually a
-- member of that trip. Now the WITH CHECK also requires
-- `is_trip_member(e.trip_id, user_id)` — reusing the exact function
-- `trip_members`'s own policies already use (0001_init.sql), not a new
-- one — so a share can never be recorded for someone who isn't (or is
-- no longer) on the trip, regardless of what a client sends.
drop policy if exists "owners and editors can manage expense participants" on public.expense_participants;
create policy "owners and editors can manage expense participants"
  on public.expense_participants for all
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.trip_role(e.trip_id) in ('owner', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and public.trip_role(e.trip_id) in ('owner', 'editor')
        and public.is_trip_member(e.trip_id, user_id)
    )
  );

-- Replaces 0001_init.sql's original "owners and editors can manage
-- expenses" — same gap, on the other side of the relationship: nothing
-- ever verified that `paid_by` (nullable — null for every personal
-- expense, exactly as before) is actually a trip member when it *is*
-- set. Now the WITH CHECK also requires `paid_by is null or
-- is_trip_member(trip_id, paid_by)` — a personal expense (paid_by
-- null) is completely unaffected by this change, only a shared
-- expense's payer is constrained to genuinely be on the trip.
drop policy if exists "owners and editors can manage expenses" on public.expenses;
create policy "owners and editors can manage expenses"
  on public.expenses for all
  to authenticated
  using (public.trip_role(trip_id) in ('owner', 'editor'))
  with check (
    public.trip_role(trip_id) in ('owner', 'editor')
    and (paid_by is null or public.is_trip_member(trip_id, paid_by))
  );
