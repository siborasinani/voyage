// Minimal, dependency-free URL sync for Voyage's few top-level pages —
// no router library needed for a nav this small (and the project's
// established preference is not to add a new dependency without a
// clear need). Maps between the app's own page state and a real URL
// via the native History API, so refresh/back/forward all work
// naturally (see App.jsx's `navigate` + its `popstate` listener).
//
// Voyage's "page" is fully described by two things: `view` ('dashboard'
// | 'explore' | 'friends' | 'profile' | 'settings' | 'reset-password')
// and `selectedTripId` (a trip's id, or null) — a selected trip always
// takes priority over `view` when both are present, exactly as the
// render logic in App.jsx already treats them. 'settings' is reached
// only from Profile (see ProfilePage.jsx's own "Settings" action) —
// it's deliberately not a top-level navbar destination, but it's still
// a real, bookmarkable, refresh-safe URL like every other view here.
// 'reset-password' is reached only from the email Supabase's own
// `resetPasswordForEmail` sends (see useAuth.js's `redirectTo`) — never
// navigated to from inside the app itself, but it's a real URL for
// exactly the same reason: Supabase's client parses the recovery
// token out of *this* page's own URL fragment on arrival
// (`detectSessionInUrl: true`, services/supabase.js), so the path has
// to exist and resolve correctly on a cold load, not just via in-app
// navigation.

// Given the current page state, the URL that represents it.
export function getPathForState({ view, selectedTripId }) {
  if (selectedTripId) return `/trips/${encodeURIComponent(selectedTripId)}`
  if (view === 'explore') return '/explore'
  if (view === 'friends') return '/friends'
  if (view === 'profile') return '/profile'
  if (view === 'settings') return '/settings'
  if (view === 'reset-password') return '/reset-password'
  return '/'
}

// The inverse — given a URL, the page state it represents. Anything
// unrecognized falls back to the dashboard rather than a dead end.
//
// Deliberately does *not* check whether `selectedTripId` actually
// exists in the trips list — it used to (taking `trips` as a second
// argument), but that meant a hard refresh or Back/Forward navigation
// on a `/trips/:id` URL had to validate against whatever `trips` array
// happened to be available at that exact synchronous moment. For a
// signed-in user, the real trips list only becomes known after an
// async Supabase fetch (see App.jsx) — so validating here, at parse
// time, meant every Supabase trip looked "deleted" on a fresh page
// load, permanently bouncing the user to the dashboard before their
// trips had even loaded. `selectedTripId` is trusted optimistically
// now; App.jsx corrects it back to `null` (and the URL along with it)
// once the real trips list is actually known — see its own comment on
// that effect for why this is the safer place for that check.
export function parseLocation(pathname) {
  const tripMatch = pathname.match(/^\/trips\/([^/]+)\/?$/)
  if (tripMatch) {
    return { view: 'dashboard', selectedTripId: decodeURIComponent(tripMatch[1]) }
  }

  if (pathname === '/explore') {
    return { view: 'explore', selectedTripId: null }
  }

  if (pathname === '/friends') {
    return { view: 'friends', selectedTripId: null }
  }

  if (pathname === '/profile') {
    return { view: 'profile', selectedTripId: null }
  }

  if (pathname === '/settings') {
    return { view: 'settings', selectedTripId: null }
  }

  if (pathname === '/reset-password') {
    return { view: 'reset-password', selectedTripId: null }
  }

  return { view: 'dashboard', selectedTripId: null }
}
