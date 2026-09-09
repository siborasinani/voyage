-- Voyage — Recent Activity: a minimal, trigger-derived activity feed
--
-- Run this once, after 0001-0010, in the Supabase SQL Editor.
--
-- Inspected first, per this milestone's own instruction, before
-- deciding a new table was actually necessary:
--   - `trips`/`activities`/`expenses` already have created_at AND
--     updated_at (with a trigger keeping the latter honest).
--   - `trip_members`/`saved_places`/`expense_participants` only have
--     created_at — no updated_at at all.
--   - Critically, *none* of activities/saved_places/expenses has any
--     column recording *who* performed the write — a shared trip can
--     be edited by its owner or any editor, and nothing on the row
--     itself says which one actually did it. Attributing "Chuck added
--     Dinner" from these tables alone would mean guessing the actor —
--     exactly what this milestone was told never to do.
--   - `trip_members` (an add-a-collaborator event) and `friendships`
--     (an accept-a-request event) are the two exceptions: both have a
--     database-*enforced* actor, not a guessed one — only a trip's
--     owner can ever insert a trip_members row (0006/0008's own RLS),
--     and only a request's recipient can ever flip its status to
--     'accepted' (0005's own RLS) — so `auth.uid()` at the moment
--     either write happens is always, provably, the right actor.
--
-- Conclusion: the existing schema can reliably support two of the
-- requested event types (a trip being shared, a friendship forming)
-- but not "added an activity/place/expense" — those three needed an
-- actual actor to be captured at write time, which nothing currently
-- does. Per this milestone's own fallback instruction, the smallest
-- clean addition is *not* a new column on each of those three tables
-- (that would mean three near-identical `created_by` columns, and
-- would still need something to actually turn "an activity was
-- inserted" into "an activity feed row" for reading) — it's one small
-- table, `activity_events`, populated *exclusively* by
-- `security definer` triggers on the real write paths that already
-- exist (activities/saved_places/expenses insert, trip_members insert,
-- friendships accept). No app code ever inserts into this table
-- directly — see the missing INSERT/UPDATE/DELETE grants at the
-- bottom — so a client can never fabricate an event, only the
-- database itself, from a real write, with the real authenticated
-- actor. Nothing is backfilled: every row that existed before this
-- migration runs simply has no corresponding activity_events row,
-- which is exactly correct — a truthful record only starts existing
-- from here on.

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  -- Set for every event except 'friend_added' (a pairwise relationship,
  -- not tied to any one trip). This single column is also the entire
  -- authorization boundary for trip-scoped events — see the RLS policy
  -- below.
  trip_id uuid references public.trips (id) on delete cascade,
  -- Always the real, database-verified actor — see this migration's
  -- own header comment on why each trigger below can trust auth.uid()
  -- here, never a value read off the affected row itself.
  actor_id uuid not null references auth.users (id) on delete cascade,
  -- The "someone else" side of the event, when there is one: the
  -- newly-added collaborator for a 'trip_shared' event, or the other
  -- side of a new friendship for 'friend_added'. Purely for display
  -- copy ("...with you" vs "...with Chuck") — never used for
  -- authorization (see the RLS policy below, which never references
  -- this column for trip-scoped events; is_trip_member(trip_id) is
  -- what actually authorizes those, and already exactly matches "can
  -- currently see this trip").
  subject_user_id uuid references auth.users (id) on delete cascade,
  event_type text not null check (
    event_type in ('trip_shared', 'activity_added', 'place_added', 'expense_added', 'friend_added')
  ),
  -- A small, truthful snapshot captured at the moment of the event
  -- (an activity's name, a place's name, a trip's name) — not a live
  -- reference re-resolved on every read. Deliberately not a foreign
  -- key to the activity/place/expense row itself: that row can later
  -- be renamed or deleted, and a real "this happened" record shouldn't
  -- silently change or vanish just because someone edited or removed
  -- the thing afterward — this is what "never fabricate, never
  -- backfill" means for edits too, not only for history before this
  -- migration existed. Nullable: 'friend_added' has nothing that needs
  -- one (both parties' names are already resolved via actor_id/
  -- subject_user_id).
  summary text,
  created_at timestamptz not null default now()
);

create index activity_events_trip_id_idx on public.activity_events (trip_id);
create index activity_events_created_at_idx on public.activity_events (created_at desc);

alter table public.activity_events enable row level security;

-- The entire privacy model in one policy: a trip-scoped event
-- (trip_id is not null) is visible to exactly the trip's *current*
-- members — is_trip_member(trip_id) already excludes anyone removed
-- since, and automatically includes a new member for the trip's past
-- activity too, matching "owners and members can see activity for
-- that trip" / "removed members must no longer have access" exactly,
-- with no separate logic needed here. A non-trip event (trip_id is
-- null — only ever 'friend_added') is visible only to the two people
-- actually in it. Nobody else can ever see a row, regardless of
-- event_type.
drop policy if exists "trip members and event participants can view activity" on public.activity_events;
create policy "trip members and event participants can view activity"
  on public.activity_events for select
  to authenticated
  using (
    (trip_id is not null and public.is_trip_member(trip_id))
    or (trip_id is null and auth.uid() in (actor_id, subject_user_id))
  );

-- Deliberately no insert/update/delete policy, and — see the grant at
-- the very bottom — no insert/update/delete grant to `authenticated`
-- either. The only way a row is ever created is a security-definer
-- trigger below, which runs with the trigger owner's own privileges
-- and so needs no grant to `authenticated` at all. This is what makes
-- fabricating an event structurally impossible from the client, not
-- just discouraged: there is no request an authenticated user's own
-- session could ever send that would insert a row here.

-- --- activities: "X added <name> to <trip>" ------------------------

create or replace function public.log_activity_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_events (trip_id, actor_id, event_type, summary)
  values (new.trip_id, auth.uid(), 'activity_added', new.name);
  return new;
end;
$$;

drop trigger if exists log_activity_added on public.activities;
create trigger log_activity_added
  after insert on public.activities
  for each row execute function public.log_activity_added();

-- --- saved_places: "X saved <name> to <trip>" -----------------------

create or replace function public.log_place_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_events (trip_id, actor_id, event_type, summary)
  values (new.trip_id, auth.uid(), 'place_added', new.name);
  return new;
end;
$$;

drop trigger if exists log_place_added on public.saved_places;
create trigger log_place_added
  after insert on public.saved_places
  for each row execute function public.log_place_added();

-- --- expenses: "X added a shared expense to <trip>" -----------------
--
-- Only when it's actually shared at the moment of creation — a
-- personal expense (paid_by null, the overwhelming majority of rows)
-- never generates activity at all, per "only meaningful social/
-- collaboration events". `paid_by` being non-null here is exactly
-- AddExpense.jsx's own Shared toggle, already set on the very insert
-- (see tripsRepository.js's createSupabaseExpense/toExpenseFields) —
-- no separate "was this shared" lookup needed. The *actor* is still
-- always auth.uid(), never paid_by: paid_by only means "who the
-- expense says paid", which a trip's owner/editor can set to any
-- fellow member, not necessarily themself — using it as the actor
-- would be exactly the kind of guess this migration's own header
-- explains why to avoid.
create or replace function public.log_shared_expense_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.paid_by is not null then
    insert into public.activity_events (trip_id, actor_id, event_type, summary)
    values (new.trip_id, auth.uid(), 'expense_added', new.name);
  end if;
  return new;
end;
$$;

drop trigger if exists log_shared_expense_added on public.expenses;
create trigger log_shared_expense_added
  after insert on public.expenses
  for each row execute function public.log_shared_expense_added();

-- --- trip_members: "X shared <trip> with <someone>" ------------------
--
-- Excludes the owner's own row (role <> 'owner'): that row is created
-- by handle_new_trip (0001_init.sql) the instant a trip is made, and
-- "you shared this trip with yourself" is never a real event. For
-- every other row, 0006_trip_sharing.sql's/0008's own INSERT policy
-- already guarantees only the trip's owner could have performed this
-- write — auth.uid() here is provably that owner, not a guess.
create or replace function public.log_trip_shared()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trip_name text;
begin
  if new.role <> 'owner' then
    select name into trip_name from public.trips where id = new.trip_id;
    insert into public.activity_events (trip_id, actor_id, subject_user_id, event_type, summary)
    values (new.trip_id, auth.uid(), new.user_id, 'trip_shared', trip_name);
  end if;
  return new;
end;
$$;

drop trigger if exists log_trip_shared on public.trip_members;
create trigger log_trip_shared
  after insert on public.trip_members
  for each row execute function public.log_trip_shared();

-- --- friendships: "X and Y are now friends" ---------------------------
--
-- Fires only on the pending -> accepted transition (never on decline,
-- and never again on a later update to an already-accepted row).
-- 0005_friendships.sql's own UPDATE policy already guarantees only the
-- request's *recipient* can ever flip status to 'accepted' — auth.uid()
-- here is provably that recipient, not a guess. requester_id (the
-- other side) becomes subject_user_id; trip_id stays null (this isn't
-- about any trip).
create or replace function public.log_friend_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    insert into public.activity_events (actor_id, subject_user_id, event_type)
    values (auth.uid(), new.requester_id, 'friend_added');
  end if;
  return new;
end;
$$;

drop trigger if exists log_friend_added on public.friendships;
create trigger log_friend_added
  after update on public.friendships
  for each row execute function public.log_friend_added();

-- Read-only from the client's own perspective — see this migration's
-- own comment above on why insert/update/delete are deliberately never
-- granted. Learned the hard way in 0003_fix_trips_access.sql: without
-- even this SELECT grant, every query would fail with "permission
-- denied" regardless of how correct the RLS policy above is.
grant select on public.activity_events to authenticated;
