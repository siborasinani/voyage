-- Voyage — fixes delete_own_account() after a live-testing failure
--
-- Run this once, after 0001-0009, in the Supabase SQL Editor.
--
-- 0009_profile_avatars.sql had `delete_own_account()` also
-- `delete from storage.objects` directly in SQL, before deleting the
-- caller's `auth.users` row. Live-testing the Profile-photo fix found
-- this fails outright: Supabase rejects a raw SQL DELETE against
-- `storage.objects` with "Direct deletion from storage tables is not
-- allowed. Use the Storage API instead." — Storage manages a real
-- backing blob alongside that metadata row, and a plain SQL delete
-- would only remove the row, orphaning the actual file, so Supabase
-- blocks it categorically, even from a security-definer function.
-- Since that statement ran *before* the `auth.users` delete in the
-- same function body, it aborted the whole function on any account
-- that had an avatar — account deletion was completely broken for
-- exactly those accounts, never even reaching the `auth.users` delete.
--
-- Fixed the correct way: the avatar file is now removed client-side,
-- through the real Storage API (`services/profilesRepository.js`'s
-- `deleteOwnAccount(userId)`), *before* this RPC is called — while the
-- caller is still authenticated and Storage's own RLS
-- (0009_profile_avatars.sql) still recognizes them as the file's
-- owner. This migration just reverts `delete_own_account()` itself
-- back to exactly what it was before 0009 — auth.users only, letting
-- every other table's existing cascading/SET NULL foreign keys handle
-- the rest, same as 0008 originally established.
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
