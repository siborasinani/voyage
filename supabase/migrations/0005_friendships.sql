-- Voyage — Friends system foundation (schema)
--
-- Run this once, after 0001-0004, in the Supabase SQL Editor. Adds
-- exactly one new table, `friendships`, and nothing else — no existing
-- table, column, policy, or grant is touched. Friendships are a
-- completely separate concept from trip collaboration: `trip_members`/
-- `trip_invitations` (see 0001_init.sql) are about who can see/edit a
-- specific trip, scaffolded for a future trip-sharing feature that
-- hasn't shipped yet; a friendship between two users has nothing to do
-- with any trip and never grants access to one. This migration doesn't
-- reference either table.
--
-- Shape: one row per relationship (not two) — `requester_id` /
-- `recipient_id` distinguish who sent it, and `status` (pending /
-- accepted / declined) is the one thing that changes as the other
-- person responds. `requester_id`/`recipient_id` reference
-- `public.profiles` rather than `auth.users` directly — functionally
-- identical (profiles.id already references auth.users(id) 1:1, and a
-- profile is guaranteed to exist for every real account via
-- handle_new_user, see 0001_init.sql) but this is what lets a query
-- embed the *other* person's display_name/avatar_url in one round trip
-- via PostgREST's `!<fkey_name>` syntax (see the named foreign key
-- constraints below) instead of a second manual lookup per row.
--
-- Two constraints do the actual safety work — enforced by Postgres
-- itself, not just app-level checking, so they hold even under a race
-- or a retried request:
--   1. `friendships_no_self_check` — a user can never send a request
--      to themself.
--   2. `friendships_unique_active_pair` — a partial unique index on the
--      *normalized* (least, greatest) pair of the two user ids, scoped
--      to status in ('pending', 'accepted'). Normalizing means it
--      doesn't matter who's the requester: A->B and B->A collide on
--      the exact same index entry, so at most one active relationship
--      can ever exist between any two users, regardless of who
--      initiated — this is "prevents duplicate relationships
--      regardless of who initiated" and "a pending request should not
--      be duplicated" enforced at the database level. It's partial
--      (only pending/accepted count) so a past declined row doesn't
--      permanently block a new request between the same two people
--      later; the app layer (see services/friendsRepository.js) uses
--      this same normalized-pair lookup up front to give a friendly
--      error instead of just letting the insert fail, and to detect
--      "they already sent me a request" so that case auto-accepts
--      instead of erroring.

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null,
  recipient_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_no_self_check check (requester_id <> recipient_id),
  constraint friendships_requester_id_fkey
    foreign key (requester_id) references public.profiles (id) on delete cascade,
  constraint friendships_recipient_id_fkey
    foreign key (recipient_id) references public.profiles (id) on delete cascade
);

create index if not exists friendships_requester_id_idx on public.friendships (requester_id);
create index if not exists friendships_recipient_id_idx on public.friendships (recipient_id);

create unique index if not exists friendships_unique_active_pair
  on public.friendships (least(requester_id, recipient_id), greatest(requester_id, recipient_id))
  where status in ('pending', 'accepted');

alter table public.friendships enable row level security;

-- Reuses the same trigger function 0001_init.sql already defined for
-- trips/activities/expenses — no new function needed.
drop trigger if exists set_friendships_updated_at on public.friendships;
create trigger set_friendships_updated_at
  before update on public.friendships
  for each row execute function public.set_updated_at();

-- --- friendships policies -----------------------------------------
-- Visible to either side of the relationship — a recipient needs to
-- see an incoming pending request just as much as the requester needs
-- to see their own outgoing one, and both need to see an accepted
-- friendship. Never visible to anyone else.
drop policy if exists "either side can view a friendship" on public.friendships;
create policy "either side can view a friendship"
  on public.friendships for select
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = recipient_id);

-- Only the requester can create a request, only as themself (never
-- forged on someone else's behalf) — the table's own check constraint
-- independently blocks a self-request too.
drop policy if exists "users can send friend requests" on public.friendships;
create policy "users can send friend requests"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = requester_id and requester_id <> recipient_id);

-- Only the recipient can respond to a request (accept/decline —
-- both are just a status change on the same row). "Remove friend" and
-- "cancel my own pending request" are both deletes, not updates (see
-- the delete policy below), so update never needs to cover the
-- requester's side at all.
drop policy if exists "recipient can respond to a pending request" on public.friendships;
create policy "recipient can respond to a pending request"
  on public.friendships for update
  to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- Either side can delete: the requester withdrawing their own pending
-- request, or either side ending an accepted friendship. Deleting a
-- friendship row never touches, and has no relationship to, any trip,
-- trip_members, activity, expense, or saved_places row.
drop policy if exists "either side can delete a friendship" on public.friendships;
create policy "either side can delete a friendship"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = recipient_id);

-- Learned the hard way in 0003_fix_trips_access.sql: RLS policies
-- restrict access *within* whatever a role is already granted — they
-- don't grant it themselves. Without this, every query here would fail
-- with "permission denied for table friendships" regardless of how
-- correct the policies above are.
grant select, insert, update, delete on public.friendships to authenticated;
