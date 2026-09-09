-- Voyage — initial Supabase schema (accounts + trips foundation)
--
-- Run this once, in full, in the Supabase dashboard's SQL Editor for a
-- fresh project (Project -> SQL Editor -> New query -> paste -> Run).
-- It is idempotent-ish for re-running during setup (uses `if not
-- exists`/`or replace` throughout) but is not a repeatable migration
-- tool — for a second migration, write a new numbered file instead of
-- editing this one, once real data exists.
--
-- What this sets up, and why (see PROJECT_CONTEXT.md's Supabase section
-- for the full narrative):
--   1. `profiles`      — one row per auth.users row, auto-created on
--                         sign-up via a trigger (see handle_new_user).
--   2. `trips`          — mirrors the existing localStorage Trip shape
--                         (utils/storage.js) closely enough that a
--                         later migration from local data is a
--                         straightforward field-for-field copy, not a
--                         redesign.
--   3. `trip_members`   — the collaboration seam: every trip owner is
--                         auto-added here with role 'owner' (see
--                         handle_new_trip); future collaborators get
--                         'editor'/'viewer' rows added by invitation
--                         (see trip_invitations) — no code outside this
--                         migration needs to change when that ships.
--   4. `activities`, `expenses`, `expense_participants`, `saved_places`,
--      `trip_invitations` — created now (not just documented) so trips'
--      relationships never need restructuring later, even though no
--      app code reads/writes them yet — Voyage still runs entirely on
--      localStorage for these until a future migration (see
--      PROJECT_CONTEXT.md).
--
-- Security model (RLS): every table below has Row Level Security
-- enabled, and every policy is scoped through `trip_members` — nobody
-- can read or write a trip (or anything hanging off it) unless they
-- have a trip_members row for it. There is no "any authenticated user
-- can read every trip" policy anywhere in this file. See the
-- `is_trip_member`/`trip_role` helper functions below for how that's
-- checked without the classic RLS-self-reference recursion problem.

-- ============================================================
-- 1. profiles
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Any signed-in user can look up a profile (needed to show a trip
-- member's name/avatar to their fellow members) — this is the one
-- deliberately open read policy in this file, and it's scoped to
-- `profiles` (name/avatar only), never to trip data itself.
drop policy if exists "profiles are readable by authenticated users" on public.profiles;
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Normally only ever written by the handle_new_user trigger below
-- (which runs as security definer and so isn't subject to RLS at all),
-- but this policy exists too in case a client ever needs to insert its
-- own row directly (e.g. retrying after the trigger somehow didn't
-- fire) — it can only ever insert a row for itself.
drop policy if exists "users can insert their own profile" on public.profiles;
create policy "users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Creates a profiles row automatically whenever someone signs up.
-- `security definer` + `set search_path` is the standard, documented
-- Supabase pattern for a trigger that needs to write into `public`
-- from an `auth` trigger context.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. trips
-- ============================================================

-- Field-for-field notes against the existing localStorage Trip shape
-- (see utils/storage.js / App.jsx's handleCreateTrip):
--   name/destination/start_date/end_date  <- tripData from CreateTrip.jsx
--   budget_amount/budget_currency         <- trip.budget's { amount, currency }
--                                             (null/null until a budget is set,
--                                             matching trip.budget starting `null`)
--   activities/savedPlaces/expenses       <- their own tables below, not
--                                             columns here (see §4)
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  destination text not null,
  start_date date,
  end_date date,
  budget_amount numeric,
  budget_currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trips_owner_id_idx on public.trips (owner_id);

alter table public.trips enable row level security;

-- ============================================================
-- 3. trip_members
-- ============================================================

create table if not exists public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create index if not exists trip_members_trip_id_idx on public.trip_members (trip_id);
create index if not exists trip_members_user_id_idx on public.trip_members (user_id);

alter table public.trip_members enable row level security;

-- --- Membership helper functions -----------------------------------
-- `security definer` here is deliberate and important: a normal RLS
-- policy on trip_members that queries trip_members itself (e.g. "you
-- can see a membership row if you're also a member of that trip")
-- causes Postgres to report "infinite recursion detected in policy for
-- relation trip_members", because evaluating the policy re-triggers
-- the same policy. Wrapping the check in a `security definer` function
-- runs the lookup with the function owner's privileges, which bypasses
-- RLS for *this query only* — the function itself still only ever
-- answers "is this specific user a member of this specific trip",
-- never returns raw rows, so nothing is actually exposed by that
-- bypass. This is the standard, documented Supabase pattern for
-- team/membership-style RLS.
create or replace function public.is_trip_member(_trip_id uuid, _user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = _trip_id and user_id = _user_id
  );
$$;

create or replace function public.trip_role(_trip_id uuid, _user_id uuid default auth.uid())
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.trip_members
  where trip_id = _trip_id and user_id = _user_id
  limit 1;
$$;

-- Auto-adds the trip's owner as an 'owner' member the moment a trip is
-- created — nothing else in the app (or a future invitation flow) ever
-- needs to special-case "the owner is always a member too".
create or replace function public.handle_new_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (trip_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_trip_created on public.trips;
create trigger on_trip_created
  after insert on public.trips
  for each row execute function public.handle_new_trip();

-- Keeps `updated_at` honest without every UPDATE statement having to
-- remember to set it — reused by every table below that has the column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_trips_updated_at on public.trips;
create trigger set_trips_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

-- --- trips policies ---------------------------------------------------
-- A trip is only ever visible to, or writable by, its members — never
-- "any authenticated user". Read access covers every role; write access
-- is narrower (below); delete is owner-only.

drop policy if exists "members can view their trips" on public.trips;
create policy "members can view their trips"
  on public.trips for select
  to authenticated
  using (public.is_trip_member(id));

drop policy if exists "users can create their own trips" on public.trips;
create policy "users can create their own trips"
  on public.trips for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "owners and editors can update trips" on public.trips;
create policy "owners and editors can update trips"
  on public.trips for update
  to authenticated
  using (public.trip_role(id) in ('owner', 'editor'))
  with check (public.trip_role(id) in ('owner', 'editor'));

drop policy if exists "owners can delete trips" on public.trips;
create policy "owners can delete trips"
  on public.trips for delete
  to authenticated
  using (public.trip_role(id) = 'owner');

-- --- trip_members policies --------------------------------------------

drop policy if exists "members can view fellow members" on public.trip_members;
create policy "members can view fellow members"
  on public.trip_members for select
  to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists "owners can add members" on public.trip_members;
create policy "owners can add members"
  on public.trip_members for insert
  to authenticated
  with check (public.trip_role(trip_id) = 'owner');

drop policy if exists "owners can change member roles" on public.trip_members;
create policy "owners can change member roles"
  on public.trip_members for update
  to authenticated
  using (public.trip_role(trip_id) = 'owner')
  with check (public.trip_role(trip_id) = 'owner');

-- Either the owner removes someone, or a member removes themself
-- (leaving a trip they were invited to).
drop policy if exists "owners can remove members, members can leave" on public.trip_members;
create policy "owners can remove members, members can leave"
  on public.trip_members for delete
  to authenticated
  using (public.trip_role(trip_id) = 'owner' or user_id = auth.uid());

-- ============================================================
-- 4. Future tables — created now with clean relationships so trips
--    never need restructuring later, but not yet read/written by any
--    app code (Voyage still runs on localStorage for these today).
-- ============================================================

-- --- activities --------------------------------------------------------
-- Mirrors trip.activities[dayNumber] (utils storage — an object keyed
-- by relative day number, each value an array). `day_number` here is
-- that same key, flattened into rows instead of a nested object.
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  day_number integer not null,
  name text not null,
  start_time time,
  end_time time,
  category text,
  custom_category text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists activities_trip_id_idx on public.activities (trip_id);

alter table public.activities enable row level security;

drop trigger if exists set_activities_updated_at on public.activities;
create trigger set_activities_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

drop policy if exists "members can view activities" on public.activities;
create policy "members can view activities"
  on public.activities for select
  to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists "owners and editors can manage activities" on public.activities;
create policy "owners and editors can manage activities"
  on public.activities for all
  to authenticated
  using (public.trip_role(trip_id) in ('owner', 'editor'))
  with check (public.trip_role(trip_id) in ('owner', 'editor'));

-- --- saved_places --------------------------------------------------------
-- Mirrors trip.savedPlaces (see utils/explore.js's toSavedPlace and
-- AddPlace.jsx) — `source_place_id`/`image`/`image_source` are only
-- ever set for a place saved from Explore, and stay null for a
-- manually-added one, matching today's shape exactly.
create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  source_place_id text,
  name text not null,
  category text,
  custom_category text,
  location text,
  notes text,
  image text,
  image_source text,
  created_at timestamptz not null default now()
);

create index if not exists saved_places_trip_id_idx on public.saved_places (trip_id);

alter table public.saved_places enable row level security;

drop policy if exists "members can view saved places" on public.saved_places;
create policy "members can view saved places"
  on public.saved_places for select
  to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists "owners and editors can manage saved places" on public.saved_places;
create policy "owners and editors can manage saved places"
  on public.saved_places for all
  to authenticated
  using (public.trip_role(trip_id) in ('owner', 'editor'))
  with check (public.trip_role(trip_id) in ('owner', 'editor'));

-- --- expenses --------------------------------------------------------
-- Mirrors trip.expenses (see AddExpense.jsx). `paid_by` isn't part of
-- today's local shape — added now, nullable, for the future expense-
-- splitting feature (see expense_participants below); every current
-- expense would just leave it null until that ships.
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  name text not null,
  amount numeric not null,
  category text,
  expense_date date,
  notes text,
  paid_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_trip_id_idx on public.expenses (trip_id);

alter table public.expenses enable row level security;

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

drop policy if exists "members can view expenses" on public.expenses;
create policy "members can view expenses"
  on public.expenses for select
  to authenticated
  using (public.is_trip_member(trip_id));

drop policy if exists "owners and editors can manage expenses" on public.expenses;
create policy "owners and editors can manage expenses"
  on public.expenses for all
  to authenticated
  using (public.trip_role(trip_id) in ('owner', 'editor'))
  with check (public.trip_role(trip_id) in ('owner', 'editor'));

-- --- expense_participants --------------------------------------------------------
-- Future expense-splitting: who an expense is shared between, and
-- (optionally) each person's share. Not read/written by any app code
-- yet — Voyage's current Budget UI has no splitting concept at all.
create table if not exists public.expense_participants (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  share_amount numeric,
  created_at timestamptz not null default now(),
  unique (expense_id, user_id)
);

create index if not exists expense_participants_expense_id_idx
  on public.expense_participants (expense_id);

alter table public.expense_participants enable row level security;

drop policy if exists "members can view expense participants" on public.expense_participants;
create policy "members can view expense participants"
  on public.expense_participants for select
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_trip_member(e.trip_id)
    )
  );

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
      where e.id = expense_id and public.trip_role(e.trip_id) in ('owner', 'editor')
    )
  );

-- --- trip_invitations --------------------------------------------------------
-- Future collaboration: inviting someone (by email — they may not have
-- an account yet) to join a trip as 'editor' or 'viewer'. Accepting an
-- invitation is intended to create the matching trip_members row (via
-- a future function/trigger, not written yet — no app code creates or
-- reads these rows today).
create table if not exists public.trip_invitations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  invited_email text not null,
  role text not null default 'viewer' check (role in ('editor', 'viewer')),
  invited_by uuid references auth.users (id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

create index if not exists trip_invitations_trip_id_idx on public.trip_invitations (trip_id);

alter table public.trip_invitations enable row level security;

-- Visible to the trip's owner/editors (to manage invites) and to the
-- invited person themself, matched by the email on their JWT — this is
-- the one place `auth.jwt()` is used instead of trip_members, since an
-- invitee has no membership row yet by definition.
drop policy if exists "owners/editors and invitees can view invitations" on public.trip_invitations;
create policy "owners/editors and invitees can view invitations"
  on public.trip_invitations for select
  to authenticated
  using (
    public.trip_role(trip_id) in ('owner', 'editor')
    or invited_email = (auth.jwt() ->> 'email')
  );

drop policy if exists "owners and editors can create invitations" on public.trip_invitations;
create policy "owners and editors can create invitations"
  on public.trip_invitations for insert
  to authenticated
  with check (public.trip_role(trip_id) in ('owner', 'editor'));

-- An invitee accepting/declining, or an owner/editor managing the
-- invite (e.g. cancelling it), are both just updates to `status`.
drop policy if exists "invitees and owners/editors can update invitations" on public.trip_invitations;
create policy "invitees and owners/editors can update invitations"
  on public.trip_invitations for update
  to authenticated
  using (
    public.trip_role(trip_id) in ('owner', 'editor')
    or invited_email = (auth.jwt() ->> 'email')
  )
  with check (
    public.trip_role(trip_id) in ('owner', 'editor')
    or invited_email = (auth.jwt() ->> 'email')
  );

drop policy if exists "owners can delete invitations" on public.trip_invitations;
create policy "owners can delete invitations"
  on public.trip_invitations for delete
  to authenticated
  using (public.trip_role(trip_id) = 'owner');
