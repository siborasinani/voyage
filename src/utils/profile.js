// Small, shared profile-display helper — pulled out of App.jsx (where
// it started as the navbar avatar's own private helper) so the Friends
// UI can show the exact same two-letter-initials avatar treatment for
// other users, without a second copy of this logic or a real
// Profile/Account feature (not part of this milestone).
//
// Two-letter initials from a display name (e.g. "Ada Lovelace" ->
// "AL", first + last word so a middle name doesn't change the result)
// — a single word falls back to just its own initial, and no name at
// all falls back to whatever the caller passes as `fallback` (the
// navbar passes the signed-in user's own email initial; the Friends UI
// — which never has another user's email, and shouldn't try to show
// one — passes a plain neutral placeholder instead).
export function getInitials(displayName, fallback = '?') {
  const words = (displayName || '').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase()
  }
  if (words.length === 1) {
    return words[0][0].toUpperCase()
  }
  return fallback
}

// Username rules (see supabase/migrations/0018_profile_usernames.sql)
// — Voyage had no existing username convention before this, so these
// are deliberately simple, sensible product defaults: letters,
// numbers, and underscores only, no spaces, 3-20 characters. Display
// name (free text, not unique) is completely unaffected by any of
// this.
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

// Trims and lowercases — the app only ever stores/compares this
// canonical form (see 0018's own comment on why that means a plain
// unique index, not a case-insensitive one, is enough at the database
// level). Called on every read of a raw `<input>` value before it's
// validated, compared, or sent anywhere — "Sibora" and "sibora" must
// resolve to the exact same stored value for the unique index to ever
// see them as a conflict at all.
export function normalizeUsername(raw) {
  return (raw || '').trim().toLowerCase()
}

// Returns a friendly validation message, or '' when the (already-
// normalized) username is valid — same "empty string means no error"
// convention every other inline validator in this app already uses
// (see AddPlace.jsx/AddPackingItem.jsx's own nameError state).
export function getUsernameError(rawUsername) {
  const username = normalizeUsername(rawUsername)
  if (!username) return 'Enter a username.'
  if (!USERNAME_PATTERN.test(username)) {
    return 'Username must be 3-20 characters: letters, numbers, and underscores only.'
  }
  return ''
}
