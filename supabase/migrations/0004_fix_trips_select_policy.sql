-- Voyage — fixes trip creation failing RLS on its own RETURNING clause
--
-- Root cause, confirmed live: `INSERT ... RETURNING` (what
-- createSupabaseTrip's `.insert().select()` sends) implicitly requires
-- the table's SELECT policy to pass for the newly-inserted row, not
-- just the INSERT policy's WITH CHECK. The SELECT policy was
-- `using (public.is_trip_member(id))`, and `is_trip_member` only
-- becomes true once the `on_trip_created` trigger has inserted the
-- owner's `trip_members` row — but that's an AFTER INSERT trigger, and
-- empirically its effect isn't visible yet to the same statement's own
-- RETURNING clause. Verified directly in SQL: the identical insert
-- succeeds with no RETURNING clause, and fails with one — with the
-- INSERT policy's own WITH CHECK (owner_id = auth.uid()) independently
-- confirmed true the whole time.
--
-- Fix: let a trip's owner see it directly via `owner_id = auth.uid()`,
-- without waiting on the trigger's side effect — this doesn't broaden
-- access at all (the owner was always going to end up a trip_members
-- row anyway), it just removes the ordering dependency for the one
-- moment that mattered: seeing the row `RETURNING` hands back right
-- after creating it.

drop policy if exists "members can view their trips" on public.trips;
create policy "members can view their trips"
  on public.trips for select
  to authenticated
  using (owner_id = auth.uid() or public.is_trip_member(id));

-- Belt and suspenders: make sure the trigger (disabled during
-- debugging) is definitely back on. Safe to run even if it already is.
alter table public.trips enable trigger on_trip_created;

-- Cleans up the temporary debug_whoami() diagnostic function used
-- while tracking this down — not part of the app, safe to drop.
drop function if exists public.debug_whoami();
