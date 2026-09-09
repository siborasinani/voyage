-- Voyage — adds a unique username to `profiles`
--
-- Run this once, after 0001-0017, in the Supabase SQL Editor.
--
-- Background: Voyage had no username concept before this (confirmed by
-- searching the whole codebase) — only `display_name` (free text, not
-- unique, still isn't) and `avatar_url`. This adds a second, genuinely
-- unique identity field: a username, required for every new signup,
-- never required to be unique for `display_name` (unchanged, and not
-- touched by this migration at all).
--
-- Nullable, on purpose, forever (not just "for now"): every existing
-- profile keeps `username = null` — there is no backfill here, and
-- none is safe to invent (a fabricated username could collide with a
-- real one someone signs up with later, which is exactly what this
-- migration exists to prevent). A plain (non-partial) unique index
-- already does the right thing with that: Postgres never considers
-- two NULLs equal, so any number of existing NULL-username rows can
-- coexist under this index with zero conflict — only two *real*,
-- equal, non-null usernames would ever collide. "Required for new
-- signups" is enforced at the application layer (AuthDialog.jsx's own
-- required-field validation, same as firstName/lastName already are —
-- neither of those is a NOT NULL column constraint either), not by a
-- table-level NOT NULL here, since that would immediately break every
-- existing account the moment this migration ran.
--
-- Canonical form: the app stores/compares usernames already
-- lowercased (see utils/profile.js's normalizeUsername) — so this is
-- a plain unique index on the column itself, not an expression index
-- on `lower(username)`. There is nothing case-varying ever stored here
-- to index around.

alter table public.profiles
  add column if not exists username text;

-- Same "create unique index if not exists <table>_<col>_idx" shape
-- every other unique rule in this project already uses (see
-- 0002_trips_local_id.sql, 0005_friendships.sql,
-- 0012_trip_invitations_and_notifications.sql) — a full (non-partial)
-- index this time, since (per the comment above) NULL rows already
-- never conflict with each other, so there's no "only when set" carve-
-- out to write, unlike those other, genuinely partial indexes.
create unique index if not exists profiles_username_idx
  on public.profiles (username);

-- No RLS policy changes: both of `profiles`' existing policies
-- ("profiles are readable by authenticated users" / "users can update
-- their own profile") are row-level, not column-scoped, so they
-- already cover this new column with zero changes — same precedent
-- 0015_profile_default_currency.sql and
-- 0016_saved_places_coordinates.sql both already documented for their
-- own new columns on other tables.

-- Extends the existing handle_new_user() trigger function (defined in
-- 0001_init.sql, already `create or replace`-safe to redefine here) to
-- also read `username` out of the same `raw_user_meta_data` JSON
-- `display_name`/`avatar_url` already come from — AuthDialog.jsx now
-- sends it alongside those in signUp()'s own metadata. Deliberately
-- no `coalesce`/fallback here the way `display_name` has one (falling
-- back to the email's local part): a missing username should surface
-- as a missing username (null), matching every existing account's
-- state, never a fabricated value — the frontend is what actually
-- guarantees a real signup always sends one, same "required" division
-- of responsibility as firstName/lastName already have (validated in
-- AuthDialog.jsx, not enforced by a trigger-level exception here).
--
-- This is also where the *real* uniqueness enforcement lives for a
-- genuine race (two people submitting the same available-looking
-- username within the same instant): this insert runs inside the same
-- transaction as the new `auth.users` row (the trigger fires `after
-- insert on auth.users`), so a unique-index violation here raises an
-- exception that rolls back that transaction — the losing signup's
-- `auth.users` row is never actually created, not left as an orphaned
-- account with a missing profile. AuthDialog.jsx's own pre-check query
-- (services/profilesRepository.js's isUsernameAvailable) exists purely
-- for a fast, friendly error in the common case — this index is what
-- actually decides it, exactly as required.
-- AuthDialog.jsx's own pre-check (profilesRepository.js's
-- isUsernameAvailable) runs *before* signup succeeds — i.e. while the
-- visitor is still signed out, with no `authenticated` session at
-- all. `profiles`' existing select policy ("profiles are readable by
-- authenticated users") is scoped to the `authenticated` role only
-- (deliberately — see 0001_init.sql's own comment on why that's the
-- one open read policy in this file), so a plain `select` from a
-- signed-out client would just fail RLS outright — confirmed live: it
-- 401s every time. Opening `profiles` itself to `anon` reads would fix
-- that but exposes far more than "is this one username taken"
-- (display_name/avatar_url of every user, to anyone, no account
-- needed). This function is the narrow alternative — the same
-- `security definer` RPC shape this project already uses for exactly
-- this kind of purpose-built exception (delete_own_account(),
-- accept_trip_invitation()): it answers one specific boolean question
-- and returns nothing else, so granting it to `anon` exposes nothing
-- beyond that yes/no.
create or replace function public.is_username_available(check_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.profiles where username = check_username
  );
$$;

-- This project's roles have no default privileges (see
-- 0003_fix_trips_access.sql's own header comment — every grant here
-- has always had to be explicit); `anon` specifically has never
-- needed anything granted before this (Explore is public but reads no
-- table — it only ever calls Geoapify/Pexels directly), so `usage on
-- schema public` is included here defensively rather than assumed.
grant usage on schema public to anon;
grant execute on function public.is_username_available(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'username'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
