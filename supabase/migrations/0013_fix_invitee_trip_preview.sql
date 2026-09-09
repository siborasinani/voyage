-- Voyage — fixes a real bug found live-testing trip invitations
--
-- Run this once, after 0001-0012, in the Supabase SQL Editor.
--
-- The notification popover (NotificationBell.jsx) fetches an
-- invitee's pending invitations via invitationsRepository.js's
-- getMyPendingInvitations, which embeds the trip's name via
-- PostgREST's `trip:trips(name)` — a normal FK join. PostgREST
-- resolves an embedded join's own visibility through that table's own
-- RLS, same as a direct query on it would be. `trips`' only SELECT
-- policy (0001_init.sql) is "members can view their trips"
-- (is_trip_member(id)) — but the whole point of an invitation is that
-- the invitee is *not* a member yet, so that embed silently resolved
-- to null for them: live-testing showed the popover reading "Inv
-- OwnerA invited you to join [nothing] — VIEWER" instead of naming the
-- trip at all.
--
-- Fixed with one additional, narrowly-scoped SELECT policy — RLS
-- policies on the same table combine with OR, so this only ever
-- *adds* visibility, never removes any: an invitee can now also see a
-- trip's row (name, destination, dates, budget — the same fields any
-- member already sees, nothing about its itinerary/places/expenses/
-- people, which live in their own separately-RLS'd tables and stay
-- exactly as restricted as before) while they have a pending
-- invitation to it. This also means the invitation can show real
-- destination/date context, not just the name, if useful later — not
-- just enough to patch the one bug found today.
drop policy if exists "invitees can preview a trip they've been invited to" on public.trips;
create policy "invitees can preview a trip they've been invited to"
  on public.trips for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_invitations ti
      where ti.trip_id = trips.id
        and ti.invited_user_id = auth.uid()
        and ti.status = 'pending'
    )
  );
