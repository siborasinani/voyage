-- Voyage — Collaboration + Account completeness pass
--
-- Run this once, after 0001-0007, in the Supabase SQL Editor. Three
-- unrelated fixes, grouped into one file because they shipped in the
-- same pass — each is independent of the other two:
--
--   1. Trip collaborator roles (Viewer vs Editor) — trip_members already
--      supports 'viewer' (see 0001_init.sql's own check constraint,
--      always `role in ('owner', 'editor', 'viewer')`) but nothing ever
--      created or changed a row to 'viewer': addTripCollaborator always
--      hardcoded 'editor', and the existing "owners can change member
--      roles" UPDATE policy (0001_init.sql) never actually constrained
--      *what* an owner could change a role to or from — an owner could
--      previously flip their own 'owner' row to 'editor', or promote a
--      collaborator to 'owner', neither of which the product has ever
--      intended ("the owner remains owner and can never be changed to
--      another role", "do not create a new role"). Tightened below.
--      No RLS change was needed for mutation-blocking itself: every
--      existing "owners and editors can manage ..." policy on trips/
--      activities/saved_places/expenses/expense_participants already
--      required `trip_role(trip_id) in ('owner', 'editor')` from
--      0001_init.sql onward — a 'viewer' row was already correctly
--      refused at the database level the moment one could exist, this
--      migration is what finally lets one exist on purpose.
--
--   2. Friend request cancel / remove friend — already fully supported
--      by 0005_friendships.sql's existing "either side can delete a
--      friendship" policy (a pending request and an accepted friendship
--      are both just rows in the same table, and deleting either one is
--      already allowed for either party). No schema change needed —
--      services/friendsRepository.js just gets a `cancelFriendRequest`
--      wrapper around the same delete, and FriendsPage.jsx gets a
--      Cancel button. Nothing in this migration touches friendships.
--
--   3. Incoming-request count badge — reads the same `friendships` rows
--      through a new `{ count: 'exact', head: true }` query, same
--      pattern as `getFriendsCount` (see PROJECT_CONTEXT.md's Profile
--      section). No schema change needed.
--
--   4. Delete account — a real `auth.users` deletion, not just a
--      `profiles` row. `auth.users` cascades correctly into almost the
--      entire graph already, by design, from 0001_init.sql onward:
--        - profiles.id -> auth.users(id) on delete cascade
--          -> friendships.requester_id/recipient_id -> profiles(id) on
--             delete cascade (0005_friendships.sql)
--        - trips.owner_id -> auth.users(id) on delete cascade
--          -> activities/saved_places/expenses/expense_participants/
--             trip_members, each trip_id -> trips(id) on delete cascade
--        - trip_members.user_id -> auth.users(id) on delete cascade
--          (a membership on someone *else's* trip disappears too — the
--          trip itself is untouched, its owner and other collaborators
--          keep everything)
--        - expense_participants.user_id -> auth.users(id) on delete
--          cascade (a share on someone else's shared expense disappears
--          with it too)
--      The two gaps: `expenses.paid_by` and `trip_invitations.invited_by`
--      both reference auth.users with no ON DELETE behavior specified
--      (defaults to NO ACTION), which would make deleting a user who
--      ever paid for a shared expense on *any* trip — including one
--      they don't own — fail outright with a foreign key violation.
--      Fixed below by making both SET NULL instead: the expense/
--      invitation survives, just with an unattributed payer/inviter,
--      exactly like an expense that was never marked as paid by anyone.
--
--      Ownership decision (the one genuinely product-level call here):
--      when an account that owns trips is deleted, those trips —  and
--      everything hanging off them, including any collaborators'
--      access to them — are deleted too, via the *existing*,
--      already-live `trips.owner_id ... on delete cascade` from
--      0001_init.sql. This isn't new behavior invented for this
--      feature: it's the schema's original, foundational ownership
--      model (a trip has exactly one owner, ownership is never
--      transferable, a collaborator only ever has *access* to the
--      owner's trip, never a copy of it) applied to its logical
--      conclusion. It does not touch any *other* user's own data —
--      only the deleted owner's own trips, and a departing
--      collaborator's own membership/participation rows on someone
--      else's trip, exactly like "remove a friend"/"remove a
--      collaborator" already only ever remove the one relationship row,
--      never the other person's data.
--
--      A user is only ever able to delete their *own* account —
--      `delete_own_account()` takes no parameters and only ever
--      targets `auth.uid()`, so there is no privilege-escalation
--      surface here at all.

-- --- 1. Trip collaborator roles ----------------------------------------

-- Replaces 0006_trip_sharing.sql's insert policy: adds `role in
-- ('editor', 'viewer')` so a client can never insert a fresh 'owner'
-- row through this path (the trigger-created owner row from
-- handle_new_trip is unaffected — it's security definer and bypasses
-- RLS entirely, same as always).
drop policy if exists "owners can add friends as collaborators" on public.trip_members;
create policy "owners can add friends as collaborators"
  on public.trip_members for insert
  to authenticated
  with check (
    public.trip_role(trip_id) = 'owner'
    and public.are_friends(auth.uid(), user_id)
    and role in ('editor', 'viewer')
  );

-- Replaces 0001_init.sql's original "owners can change member roles",
-- which let an owner update any trip_members row (including their own)
-- to any role at all. Now: the USING clause excludes any row whose
-- *current* role is 'owner' (the owner's own row can never be targeted
-- by this policy, whatever the intended new value), and the WITH CHECK
-- clause requires the *new* role to be 'editor' or 'viewer' (a client
-- can never promote a collaborator to 'owner' this way either). Between
-- the two, "the owner remains owner and can never be changed to another
-- role, and no second owner can ever be created" holds at the database
-- level, not just because the Trip People UI never offers that choice.
drop policy if exists "owners can change member roles" on public.trip_members;
create policy "owners can change member roles"
  on public.trip_members for update
  to authenticated
  using (public.trip_role(trip_id) = 'owner' and role <> 'owner')
  with check (public.trip_role(trip_id) = 'owner' and role in ('editor', 'viewer'));

-- --- 4. Delete account: two FK fixes + the self-delete function --------

-- Looked up dynamically (rather than assuming the default
-- `expenses_paid_by_fkey` auto-generated name) so this doesn't silently
-- no-op if the actual name ever differs.
do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.conrelid = 'public.expenses'::regclass
    and c.contype = 'f'
    and a.attname = 'paid_by';
  if conname is not null then
    execute format('alter table public.expenses drop constraint %I', conname);
  end if;

  alter table public.expenses
    add constraint expenses_paid_by_fkey
    foreign key (paid_by) references auth.users (id) on delete set null;
end $$;

do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.conrelid = 'public.trip_invitations'::regclass
    and c.contype = 'f'
    and a.attname = 'invited_by';
  if conname is not null then
    execute format('alter table public.trip_invitations drop constraint %I', conname);
  end if;

  alter table public.trip_invitations
    add constraint trip_invitations_invited_by_fkey
    foreign key (invited_by) references auth.users (id) on delete set null;
end $$;

-- `security definer`, same documented pattern as handle_new_user/
-- handle_new_trip above (0001_init.sql) — runs with the function
-- owner's privileges so it can reach into `auth.users`, which a normal
-- `authenticated`-role query never can. Takes no arguments and only
-- ever deletes `auth.uid()`'s own row — there is no way to call this
-- for anyone but yourself. Everything else (profile, friendships, trip
-- memberships, owned trips and their activities/saved places/expenses/
-- expense_participants, expense participation on other people's trips)
-- is cleaned up automatically by the existing `on delete cascade`/(now)
-- `on delete set null` foreign keys above — nothing else to do here.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_own_account() to authenticated;
