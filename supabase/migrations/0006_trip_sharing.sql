-- Voyage — Trip sharing: add an existing friend as a trip collaborator
--
-- Run this once, after 0001-0005, in the Supabase SQL Editor. No new
-- table: reuses `trip_members` (already scaffolded in 0001_init.sql
-- for exactly this — "future collaborators get 'editor'/'viewer' rows
-- added by invitation") and `friendships` (0005_friendships.sql). This
-- migration only tightens two existing `trip_members` policies so the
-- *database* enforces this feature's product rules, not just the
-- frontend only ever offering the right choices — nothing else here
-- is touched, and no other table/policy changes at all.
--
-- Why these two policies specifically, and not the others:
--   - `trip_members`'s SELECT policy ("members can view fellow
--     members") already scopes correctly once a collaborator has a
--     row — nothing to change.
--   - `trips`/`activities`/`saved_places`/`expenses`'s own policies
--     already grant an 'editor' full read/write via
--     `trip_role(trip_id) in ('owner', 'editor')` — an editor added
--     through this feature automatically gets full existing trip
--     functionality with zero further changes, exactly as intended by
--     "do not expand permissions beyond what the current
--     trip_members role/RLS architecture already supports".
--   - The UPDATE policy ("owners can change member roles") is
--     unused by this feature (nothing here ever changes an existing
--     member's role) — left exactly as-is.

-- A security-definer check, same pattern as is_trip_member/trip_role
-- right above it in 0001_init.sql: are these two users accepted
-- friends? Used by the INSERT policy below so "only existing accepted
-- Voyage friends can be added" is enforced at the database level, not
-- trusted to the Add-friends modal only ever listing friends.
create or replace function public.are_friends(_user_a uuid, _user_b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = _user_a and recipient_id = _user_b)
        or (requester_id = _user_b and recipient_id = _user_a))
  );
$$;

-- Replaces 0001_init.sql's original "owners can add members", which
-- only checked that the caller owns the trip — fine while nothing yet
-- exercised this insert path. Now that trip sharing actually uses it,
-- it also requires the person being added to be an accepted friend of
-- the owner. This is what "only existing accepted Voyage friends can
-- be added" and "the owner cannot add themselves" mean at the
-- database level, not just app-level trust: a self-friendship is
-- impossible (see friendships_no_self_check in 0005_friendships.sql),
-- so are_friends(auth.uid(), auth.uid()) is always false — the owner
-- can never satisfy this check for their own id, no separate check
-- needed for that rule. `trip_role(trip_id) = 'owner'` independently
-- means a non-owner (e.g. an editor B tries to add some third user to
-- A's trip) can never satisfy this policy either way. The owner's own
-- 'owner'-role row is still created exclusively by the
-- on_trip_created trigger (security definer, bypasses RLS entirely) —
-- this policy was never involved in that and still isn't.
drop policy if exists "owners can add members" on public.trip_members;
create policy "owners can add friends as collaborators"
  on public.trip_members for insert
  to authenticated
  with check (
    public.trip_role(trip_id) = 'owner'
    and public.are_friends(auth.uid(), user_id)
  );

-- Replaces 0001_init.sql's original delete policy, which let an owner
-- delete *any* row on their own trip — including their own 'owner'
-- row. Now excludes 'owner'-role rows from both branches: the owner
-- can remove a collaborator but can never remove themself, and "a
-- member can leave" only ever applies to a non-owner membership. This
-- is what "the trip owner must always remain the owner" / "do not
-- allow the owner to remove themselves from their own trip" mean at
-- the database level.
drop policy if exists "owners can remove members, members can leave" on public.trip_members;
create policy "owners can remove collaborators, non-owners can leave"
  on public.trip_members for delete
  to authenticated
  using (
    (public.trip_role(trip_id) = 'owner' and role <> 'owner')
    or (user_id = auth.uid() and role <> 'owner')
  );
