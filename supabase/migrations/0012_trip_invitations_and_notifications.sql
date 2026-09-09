-- Voyage — Trip invitations (replacing immediate add) + notifications
--
-- Run this once, after 0001-0011, in the Supabase SQL Editor.
--
-- ============================================================
-- Part 1 — trip_invitations: reused, not duplicated
-- ============================================================
--
-- `trip_invitations` already existed (0001_init.sql), scaffolded for
-- "invite by email — they may not have an account yet", never actually
-- wired up by any app code. This migration reuses it rather than
-- creating a second table, but adapts it to what's actually being
-- built: inviting an existing Voyage friend (a known user id), not an
-- arbitrary email. `invited_email` is left in place and now nullable
-- (nothing ever populated it, so no data migration), and a new
-- `invited_user_id` is what every real invitation actually uses going
-- forward — the email path stays available for a possible future
-- "invite someone not on Voyage yet" feature, untouched and unused by
-- this one.
alter table public.trip_invitations
  alter column invited_email drop not null;

alter table public.trip_invitations
  add column if not exists invited_user_id uuid references auth.users (id) on delete cascade;

create index if not exists trip_invitations_invited_user_id_idx
  on public.trip_invitations (invited_user_id);

-- "Duplicate pending invitations for the same person/trip should not
-- be possible" — a partial unique index, the same pattern
-- 0005_friendships.sql's own friendships_unique_active_pair already
-- established for an equivalent rule: scoped to `status = 'pending'`
-- only, so a past declined/cancelled invitation never blocks a fresh
-- one later.
create unique index if not exists trip_invitations_unique_pending
  on public.trip_invitations (trip_id, invited_user_id)
  where status = 'pending' and invited_user_id is not null;

-- Replaces the original "owners and editors can create invitations" —
-- narrowed to owner-only ("Only the trip owner can send/cancel
-- invitations"), and now also requires the invitee to be an accepted
-- friend (are_friends(), the same security-definer check
-- 0006_trip_sharing.sql already established for the old immediate-add
-- policy) and the role to be a real one. are_friends() already makes
-- self-invitation impossible (a self-friendship can never exist —
-- 0005_friendships.sql's own check constraint), so no separate check
-- for that is needed. `invited_by = auth.uid()` is also required
-- explicitly, not just "the caller happens to own the trip" — without
-- it, an owner could insert a row naming a *different* user as
-- `invited_by`, which would misattribute who the notifications
-- trigger below sends the eventual accept/decline notice to (the same
-- class of gap this project has hit before: a WITH CHECK must
-- validate every relevant field being written, not only the acting
-- user's own permission).
drop policy if exists "owners and editors can create invitations" on public.trip_invitations;
create policy "owners can invite accepted friends"
  on public.trip_invitations for insert
  to authenticated
  with check (
    public.trip_role(trip_id) = 'owner'
    and invited_by = auth.uid()
    and invited_user_id is not null
    and public.are_friends(auth.uid(), invited_user_id)
    and role in ('editor', 'viewer')
  );

-- Replaces the original owner/editor + email-JWT read policy — the
-- email-JWT clause is kept (harmless, matches nothing for the
-- user-id-based invitations this app actually sends) alongside a new
-- invited_user_id clause. Narrowed to owner-only for the "manage
-- invites" side (editors no longer see/manage a trip's invitations,
-- matching "only the owner" throughout this feature) plus the invitee
-- themself.
drop policy if exists "owners/editors and invitees can view invitations" on public.trip_invitations;
create policy "owners and invitees can view invitations"
  on public.trip_invitations for select
  to authenticated
  using (
    public.trip_role(trip_id) = 'owner'
    or invited_user_id = auth.uid()
    or invited_email = (auth.jwt() ->> 'email')
  );

-- Replaces the original owner/editor + email-JWT update policy.
-- Narrowed to exactly one action: the invitee declining their own
-- still-pending invitation (pending -> declined only — the USING
-- clause requires the *current* row to still be pending, so a
-- cancelled — i.e. deleted — or already-resolved invitation can never
-- be updated at all, and the WITH CHECK clause only ever allows the
-- *new* status to be 'declined', never 'accepted': accepting goes
-- through accept_trip_invitation() below instead, which atomically
-- creates the real trip_members row alongside the status change — a
-- plain client-side UPDATE could otherwise "accept" an invitation
-- without ever actually granting trip access, an inconsistent state
-- this design makes impossible). The owner has no UPDATE path at all
-- here — cancelling is a DELETE (below), not a status change.
drop policy if exists "invitees and owners/editors can update invitations" on public.trip_invitations;
create policy "invitees can decline their own pending invitation"
  on public.trip_invitations for update
  to authenticated
  using (invited_user_id = auth.uid() and status = 'pending')
  with check (invited_user_id = auth.uid() and status = 'declined');

-- Replaces the original owner-only delete policy — same rule, now
-- also requires the invitation to still be pending (cancelling an
-- already-resolved invitation is meaningless; once accepted, removing
-- the invitations row must never be how access is revoked — that's
-- what removing the trip_members row is for).
drop policy if exists "owners can delete invitations" on public.trip_invitations;
create policy "owners can cancel a pending invitation"
  on public.trip_invitations for delete
  to authenticated
  using (public.trip_role(trip_id) = 'owner' and status = 'pending');

-- The old "immediate add" path is retired at the database level, not
-- just in the UI: previously an owner could insert a trip_members row
-- for any accepted friend directly (0006/0008_...sql). That policy is
-- dropped with no replacement — a non-owner trip_members row can now
-- only ever be created by accept_trip_invitation() below, which runs
-- security definer and so needs no RLS policy granting it access; a
-- raw client-side insert attempt for anyone but yourself (see that
-- function) is simply refused, matching "a user cannot access a trip
-- before accepting" and "a user cannot accept someone else's
-- invitation" at the database level, not just the app never offering
-- the option.
drop policy if exists "owners can add friends as collaborators" on public.trip_members;

-- Atomically accepts a still-pending invitation addressed to the
-- caller: creates the real trip_members row (with the role the owner
-- actually chose) and marks the invitation accepted, in one
-- transaction — never a state where the invitation says "accepted"
-- but no membership exists, or vice versa. `invited_user_id =
-- auth.uid()` is checked explicitly (not just relied on via RLS, since
-- this function's own writes bypass RLS as security definer) — this is
-- what "a user cannot accept someone else's invitation" means at the
-- database level. Raises if the invitation doesn't exist, isn't
-- pending (already accepted/declined), or isn't the caller's own —
-- covering "a cancelled invitation cannot be accepted" too, since
-- cancelling deletes the row outright.
create or replace function public.accept_trip_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation record;
begin
  select * into invitation
  from public.trip_invitations
  where id = p_invitation_id
  for update;

  if invitation is null then
    raise exception 'Invitation not found.';
  end if;

  if invitation.invited_user_id is distinct from auth.uid() then
    raise exception 'This invitation is not yours to accept.';
  end if;

  if invitation.status <> 'pending' then
    raise exception 'This invitation is no longer pending.';
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (invitation.trip_id, auth.uid(), invitation.role)
  on conflict (trip_id, user_id) do nothing;

  update public.trip_invitations
  set status = 'accepted'
  where id = p_invitation_id;
end;
$$;

grant execute on function public.accept_trip_invitation(uuid) to authenticated;

-- ============================================================
-- Part 2 — notifications: only for what genuinely needs persisting
-- ============================================================
--
-- Deliberately NOT used for "you have a friend request" or "you have
-- a trip invitation" — those are already fully, correctly derivable
-- live from friendships/trip_invitations' own pending rows (exactly
-- how the existing Friends nav badge already worked), and a duplicate
-- copy of that same fact here would be exactly the "unnecessary
-- duplicate data" this task said not to create. This table exists
-- only for the two notification types with no natural "pending state
-- that clears itself" to derive from: telling the *inviter* that their
-- already-resolved (accepted/declined) invitation was resolved. That
-- fact is permanently true the moment it happens (as it should be —
-- it's also what activity_events' own trip_joined event derives from)
-- but a *notification* about it is a one-time, dismissible thing, so
-- it needs its own read/unread bit somewhere.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete cascade,
  trip_id uuid references public.trips (id) on delete cascade,
  type text not null check (type in ('invitation_accepted', 'invitation_declined')),
  -- Same "truthful snapshot captured at event time" reasoning as
  -- activity_events.summary (0011_activity_feed.sql) — the trip's name
  -- at the moment of the notification, not a live reference that could
  -- change or vanish later.
  summary text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_recipient_id_idx on public.notifications (recipient_id);

alter table public.notifications enable row level security;

-- A user only ever sees their own notifications — never another
-- user's, regardless of who the actor or trip is.
drop policy if exists "users can view their own notifications" on public.notifications;
create policy "users can view their own notifications"
  on public.notifications for select
  to authenticated
  using (recipient_id = auth.uid());

-- The one write a client is ever allowed: marking their own
-- notification read. No insert/delete grant at all (see the missing
-- grants at the bottom) — every row is created exclusively by the
-- trigger below, from a real, already-RLS-verified status change, the
-- same "fabrication is structurally impossible" design
-- activity_events (0011_activity_feed.sql) already established.
drop policy if exists "users can mark their own notifications read" on public.notifications;
create policy "users can mark their own notifications read"
  on public.notifications for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

create or replace function public.log_invitation_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trip_name text;
begin
  if new.status in ('accepted', 'declined') and old.status is distinct from new.status then
    select name into trip_name from public.trips where id = new.trip_id;
    insert into public.notifications (recipient_id, actor_id, trip_id, type, summary)
    values (
      new.invited_by,
      auth.uid(),
      new.trip_id,
      case when new.status = 'accepted' then 'invitation_accepted' else 'invitation_declined' end,
      trip_name
    );
  end if;
  return new;
end;
$$;

-- Fires for both paths that can change status: accept_trip_invitation()
-- above (pending -> accepted) and the invitee's own direct decline
-- update (pending -> declined) — both are real UPDATE statements on
-- this table either way, so one trigger covers both.
drop trigger if exists log_invitation_response on public.trip_invitations;
create trigger log_invitation_response
  after update on public.trip_invitations
  for each row execute function public.log_invitation_response();

grant select, update on public.notifications to authenticated;

-- ============================================================
-- Part 3 — activity_events: correcting actor attribution now that
-- invitations, not direct owner-adds, are how membership is created
-- ============================================================
--
-- The existing log_trip_shared trigger (0011_activity_feed.sql) fired
-- on trip_members insert and trusted auth.uid() as "the owner who
-- shared" — true under the old immediate-add design, where only the
-- owner could ever insert a non-owner trip_members row. Under this
-- design, accept_trip_invitation() is what inserts that row, running
-- as the *invitee* — auth.uid() at that point is correctly the
-- invitee, not the owner, which would silently invert "X shared this
-- trip with Y" into nonsense. Fixed by splitting into two distinct,
-- individually-accurate events instead of trying to keep one trigger
-- covering two different actors: 'trip_shared' now fires when an
-- invitation is *sent* (actor is provably the owner, per this
-- migration's own insert policy above) and a new 'trip_joined' fires
-- when membership is actually *created* (actor is provably the
-- invitee, since accept_trip_invitation() is the only remaining way a
-- non-owner trip_members row comes into existence at all).
drop trigger if exists log_trip_shared on public.trip_members;
drop function if exists public.log_trip_shared();

do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  where c.conrelid = 'public.activity_events'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%event_type%';
  if conname is not null then
    execute format('alter table public.activity_events drop constraint %I', conname);
  end if;

  alter table public.activity_events
    add constraint activity_events_event_type_check
    check (event_type in (
      'trip_shared', 'activity_added', 'place_added', 'expense_added', 'friend_added', 'trip_joined'
    ));
end $$;

-- "X shared <trip> with <someone>" — now fires at invite-send time.
create or replace function public.log_trip_invitation_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trip_name text;
begin
  select name into trip_name from public.trips where id = new.trip_id;
  insert into public.activity_events (trip_id, actor_id, subject_user_id, event_type, summary)
  values (new.trip_id, auth.uid(), new.invited_user_id, 'trip_shared', trip_name);
  return new;
end;
$$;

drop trigger if exists log_trip_invitation_sent on public.trip_invitations;
create trigger log_trip_invitation_sent
  after insert on public.trip_invitations
  for each row execute function public.log_trip_invitation_sent();

-- "X joined <trip>" — fires when real membership is created, i.e. only
-- ever from inside accept_trip_invitation() now (the owner's own row,
-- created by handle_new_trip, is still excluded via role <> 'owner').
create or replace function public.log_trip_joined()
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
    insert into public.activity_events (trip_id, actor_id, event_type, summary)
    values (new.trip_id, auth.uid(), 'trip_joined', trip_name);
  end if;
  return new;
end;
$$;

drop trigger if exists log_trip_joined on public.trip_members;
create trigger log_trip_joined
  after insert on public.trip_members
  for each row execute function public.log_trip_joined();
