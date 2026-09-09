-- Voyage — Optional profile photos (Supabase Storage)
--
-- Run this once, after 0001-0008, in the Supabase SQL Editor. No new
-- table: `profiles.avatar_url` already exists (0001_init.sql) and was
-- already read by every repository that embeds a profile
-- (friendsRepository.js's fromProfileRow, tripsRepository.js's
-- fromMemberRow) — it was just never populated or rendered until now.
-- This migration only adds a Storage bucket to actually hold the image
-- files, plus the RLS policies on `storage.objects` that keep one
-- user's photo genuinely private to write/delete, and extends
-- `delete_own_account()` to also purge Storage.
--
-- Path convention: every avatar is stored at exactly
-- `{user_id}/avatar.jpg` — one canonical file per user, always
-- normalized to JPEG client-side before upload (see utils/image.js's
-- compressImageFile), so "replace" is a plain upsert overwrite of the
-- same key, never a second orphaned file in a different original
-- format. This is also what makes the delete-on-account-deletion
-- cleanup below a simple, exact single-row delete rather than a
-- pattern scan.
--
-- Bucket is public (readable by anyone with the URL, no signed URLs)
-- — matching the openness level `profiles` already has for
-- display_name/avatar_url ("profiles are readable by authenticated
-- users", 0001_init.sql): an avatar photo isn't more sensitive than a
-- display name here, and a public bucket lets every existing plain
-- `<img src>` avatar surface (navbar, Friends, trip People) work with
-- zero signed-URL refresh logic. Writing (insert/update/delete) is
-- still restricted to each user's own folder by RLS below — the
-- bucket being public only affects reads.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar images are publicly readable" on storage.objects;
create policy "avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- `(storage.foldername(name))[1]` is the first path segment of the
-- object's key — since every avatar is written to `{user_id}/...`,
-- this is exactly "does the path's own folder match the caller's own
-- id". This is what "User A cannot upload/overwrite/delete User B's
-- profile image" means at the database level, not just the app never
-- offering another user's id as a target.
drop policy if exists "users can upload their own avatar" on storage.objects;
create policy "users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can replace their own avatar" on storage.objects;
create policy "users can replace their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users can delete their own avatar" on storage.objects;
create policy "users can delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Extends 0008's delete_own_account() to also remove the caller's
-- avatar file (if any) from Storage before deleting their auth.users
-- row — `storage.objects` is a normal Postgres table underneath, so a
-- security-definer function can delete straight from it via SQL, no
-- separate Storage API call needed. Deleting it *before* the
-- auth.users row (rather than relying on some future cascade) means
-- this keeps working even though `storage.objects` has no foreign key
-- relationship to `auth.users` to cascade through in the first place.
-- A user with no avatar simply has nothing here to delete — this is a
-- no-op for them, not an error.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth, storage
as $$
begin
  delete from storage.objects
  where bucket_id = 'avatars' and name = auth.uid()::text || '/avatar.jpg';

  delete from auth.users where id = auth.uid();
end;
$$;
