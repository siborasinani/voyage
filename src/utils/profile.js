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
