// Recent city/destination searches for Explore — a lightweight,
// per-browser UI convenience (which cities has this browser searched
// recently), not trip data. Deliberately kept in its own localStorage
// key, separate from anything trip-related (see PROJECT_CONTEXT.md §6
// — trip data has no localStorage involvement at all; this is the one
// deliberate, narrowly-scoped exception, matching how the Pexels image
// cache already has its own independent key).
const STORAGE_KEY = 'voyage:recent-searches'
const MAX_RECENT_SEARCHES = 5

// Returns the saved list, newest first. `[]` for anything missing,
// malformed, or if localStorage is unavailable — the app should never
// crash or misbehave because of what's sitting in storage.
export function getRecentSearches() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((entry) => typeof entry === 'string' && entry.trim())
      : []
  } catch {
    return []
  }
}

// Records `label` as the most recent search — moves it to the front if
// it's already in the list (case-insensitive, so "rome" and "Rome"
// count as the same city rather than producing two entries), and caps
// the list at MAX_RECENT_SEARCHES, dropping the oldest first. Failures
// (storage disabled, quota exceeded) are swallowed, same tolerance as
// every other localStorage write in this app — this is a nice-to-have,
// never something that should take the app down.
export function addRecentSearch(label) {
  const trimmed = (label || '').trim()
  if (!trimmed) return

  try {
    const withoutDuplicate = getRecentSearches().filter(
      (entry) => entry.toLowerCase() !== trimmed.toLowerCase()
    )
    const next = [trimmed, ...withoutDuplicate].slice(0, MAX_RECENT_SEARCHES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore — see comment above.
  }
}

// Removes exactly one saved search (ExplorePage.jsx's own small "×" on
// each Recent Searches pill) — every other entry keeps its existing
// order untouched, same case-insensitive matching addRecentSearch's
// own dedup already uses, so removing "Rome" removes it regardless of
// whatever casing it happened to be stored with. Same silent-failure
// tolerance as every other function here — a storage write that can't
// happen is never worth surfacing to the user over.
export function removeRecentSearch(label) {
  const target = (label || '').trim().toLowerCase()
  if (!target) return

  try {
    const next = getRecentSearches().filter((entry) => entry.toLowerCase() !== target)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore — see addRecentSearch's own comment above.
  }
}
