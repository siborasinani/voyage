// Voyage's profile data-access layer — the one seam the Profile UI
// goes through, matching services/tripsRepository.js's/
// services/friendsRepository.js's existing pattern (no raw Supabase
// calls in components). There is no second/new profile system here:
// this reads and writes the exact same `profiles` table
// 0001_init.sql already created and Friends already reads from.
import { supabase } from './supabase'

// A best-effort pre-check only — used by AuthDialog.jsx to show a
// fast, friendly "Username is already taken." before ever attempting
// signup. This is NOT the actual authority on uniqueness: two people
// submitting the same username at nearly the same instant could both
// see `true` here. The real, final authority is the unique index on
// `profiles.username` (see supabase/migrations/0018_profile_
// usernames.sql), enforced inside the same transaction as the
// signup's own `auth.users` insert — useAuth.js's signUp() handles
// that race outcome separately. `username` must already be the
// normalized (trimmed + lowercased) form — see utils/profile.js's
// normalizeUsername; this function does no normalization of its own,
// same "caller passes an already-shaped value" convention every other
// repository function in this file already follows.
//
// Goes through a narrow RPC, not a plain `select` on `profiles` —
// this runs while the caller is still signed out (mid-signup, no
// session yet), and `profiles`' own read policy is scoped to
// `authenticated` only; a direct select here would just 401.
// is_username_available() (same migration) is a `security definer`
// function granted to `anon` that answers only this one yes/no
// question, never exposing any actual profile data to a signed-out
// caller.
export async function isUsernameAvailable(username) {
  const { data, error } = await supabase.rpc('is_username_available', {
    check_username: username,
  })
  if (error) throw error
  return data
}

// Updates the signed-in user's display name in *both* places it lives:
//   1. The `profiles` row itself — the record services/
//      friendsRepository.js's searchUsers/embedded-profile queries
//      actually read from, so a friend's search result or friends-list
//      entry reflects the change too. Already covered by the existing
//      "users can update their own profile" RLS policy from
//      0001_init.sql — no new policy or migration needed.
//   2. The auth session's own `user_metadata`, via
//      `supabase.auth.updateUser` — what the navbar avatar (and
//      everywhere else in the app that already reads
//      `auth.user.user_metadata.display_name`, see App.jsx) uses.
//      Writing only the `profiles` row would leave those readers
//      showing the stale name until the next sign-in; `updateUser`
//      fires a `USER_UPDATED` event through the exact same
//      `onAuthStateChange` listener useAuth.js already subscribes to
//      (the same mechanism that already keeps a session fresh across
//      sign-in/out and token refresh), so `auth.user` — and every
//      component reading it — updates immediately with no separate
//      callback/prop plumbing needed for that.
// Both writes happen together; either failing throws (the caller,
// EditProfile.jsx, surfaces that as a form error).
export async function updateDisplayName(userId, displayName) {
  const [profileResult, authResult] = await Promise.all([
    supabase.from('profiles').update({ display_name: displayName }).eq('id', userId),
    supabase.auth.updateUser({ data: { display_name: displayName } }),
  ])
  if (profileResult.error) throw profileResult.error
  if (authResult.error) throw authResult.error
}

// One canonical Storage path per user — see
// supabase/migrations/0009_profile_avatars.sql's own header comment on
// why: a fixed key means "replace" is a plain overwrite, never a
// second orphaned file, and it's exactly what that migration's RLS
// policies (`(storage.foldername(name))[1] = auth.uid()::text`) and
// delete_own_account()'s own cleanup both key off.
function avatarPath(userId) {
  return `${userId}/avatar.jpg`
}

// Uploads an already-compressed JPEG Blob (see utils/image.js's
// compressImageFile — this never receives a raw <input> File) to the
// caller's own avatar path, `{ upsert: true }` so replacing an
// existing photo is one call, not a separate delete-then-insert.
// Storage's own RLS (0009_profile_avatars.sql) independently refuses
// this for any path but the caller's own, regardless of what `userId`
// is passed — this never trusts the argument alone.
//
// The public URL Supabase Storage returns for a fixed key never
// changes across re-uploads, which would otherwise mean a browser
// happily serving a *stale cached image* forever after a "replace" —
// a `?v=<timestamp>` query param is appended before it's saved to
// `profiles.avatar_url`/auth so every existing avatar-rendering
// surface (Avatar.jsx's plain <img src>) reloads the fresh file
// automatically; Storage itself ignores the extra query string.
export async function uploadAvatar(userId, blob) {
  const path = avatarPath(userId)
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
  if (uploadError) throw uploadError

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatars').getPublicUrl(path)
  const avatarUrl = `${publicUrl}?v=${Date.now()}`

  const [profileResult, authResult] = await Promise.all([
    supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId),
    supabase.auth.updateUser({ data: { avatar_url: avatarUrl } }),
  ])
  if (profileResult.error) throw profileResult.error
  if (authResult.error) throw authResult.error

  return avatarUrl
}

// Removes the stored photo and clears `avatar_url` back to null (the
// existing Avatar.jsx/getInitials fallback path — same as an account
// that never uploaded one). Storage's own delete policy again refuses
// this for anyone but the caller. A failed Storage delete (e.g. the
// file was already gone) still clears the database fields — there's
// nothing useful to roll back to, and a missing file is exactly what
// "removed" should end up meaning either way.
export async function removeAvatar(userId) {
  await supabase.storage.from('avatars').remove([avatarPath(userId)])

  const [profileResult, authResult] = await Promise.all([
    supabase.from('profiles').update({ avatar_url: null }).eq('id', userId),
    supabase.auth.updateUser({ data: { avatar_url: null } }),
  ])
  if (profileResult.error) throw profileResult.error
  if (authResult.error) throw authResult.error
}

// Real account deletion — a genuine `auth.users` row removal, not just
// wiping the `profiles` row. The anon key this app runs on can never
// delete another table's-worth of `auth.users` directly (nor should
// it), so this calls a `security definer` Postgres function instead
// (see supabase/migrations/0008_collaboration_account_completeness.sql
// for `delete_own_account()` and the full cascade/ownership narrative)
// that only ever deletes the *caller's own* row — there is no
// parameter here or on the database side that could target anyone
// else. Every other table (profile, friendships, trip memberships,
// owned trips and everything under them, expense participation on
// other people's trips) is cleaned up automatically by that function's
// own cascading foreign keys — nothing further to orchestrate for
// those.
//
// The avatar file is a different story: an earlier version of this
// had `delete_own_account()` also `delete from storage.objects`
// directly in SQL, which turned out to be rejected outright by
// Supabase ("Direct deletion from storage tables is not allowed. Use
// the Storage API instead.") — Storage manages an actual backing blob
// alongside the metadata row, and a raw SQL delete would only remove
// the row, orphaning the real file, so Supabase blocks it categorically
// (see supabase/migrations/0010_fix_delete_own_account_storage.sql for
// the revert). So the avatar is removed here instead, through the
// proper client Storage API, *before* the RPC call below — while the
// caller is still authenticated and Storage's own RLS still recognizes
// them as the file's owner. `{ error }` from this remove() is
// deliberately not checked: a user with no avatar has nothing to
// remove (not an error worth failing account deletion over), and this
// must never block reaching the RPC call that actually deletes the
// account either way.
// The caller (App.jsx) still calls `auth.signOut()` afterward — this
// only removes the account server-side, it doesn't clear the client's
// own local session state.
export async function deleteOwnAccount(userId) {
  await supabase.storage.from('avatars').remove([avatarPath(userId)])

  const { error } = await supabase.rpc('delete_own_account')
  if (error) throw error
}

// Reads the signed-in user's own default-currency preference
// (0015_profile_default_currency.sql) — `null` for a user who's never
// set one, exactly what the column itself defaults to (no value is
// ever invented at the database level or here). Callers (App.jsx) are
// the ones that decide `null` means "fall back to USD", not this
// function — same division of concerns as every other repository in
// this app: this only ever shapes what Supabase actually returned.
export async function getDefaultCurrency(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('default_currency')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data?.default_currency ?? null
}

// Writes the signed-in user's default-currency preference — a single-
// column update on their own `profiles` row, already covered by the
// existing "users can update their own profile" RLS policy
// (0001_init.sql) with no new policy needed (see
// 0015_profile_default_currency.sql's own comment). Deliberately its
// own function rather than folded into updateDisplayName above: unlike
// display name/avatar, this has no `auth.user_metadata` mirror to keep
// in sync — nothing outside Settings/new-budget-or-expense defaulting
// ever reads it, so there's nothing else to update alongside it.
export async function updateDefaultCurrency(userId, currency) {
  const { error } = await supabase
    .from('profiles')
    .update({ default_currency: currency })
    .eq('id', userId)
  if (error) throw error
}
