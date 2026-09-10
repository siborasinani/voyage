import { useEffect, useRef, useState } from 'react'
import './App.css'
import AuthDialog from './components/AuthDialog'
import Avatar from './components/Avatar'
import ConfirmDialog from './components/ConfirmDialog'
import CreateTrip from './components/CreateTrip'
import DashboardFriendsSummary from './components/DashboardFriendsSummary'
import DashboardRecentActivity from './components/DashboardRecentActivity'
import ExplorePage from './components/ExplorePage'
import FriendsPage from './components/FriendsPage'
import NotificationBell from './components/NotificationBell'
import PopularDestinations from './components/PopularDestinations'
import ProfilePage from './components/ProfilePage'
import ResetPasswordPage from './components/ResetPasswordPage'
import SettingsPage from './components/SettingsPage'
import TripCard from './components/TripCard'
import TripPage from './components/TripPage'
import { isPlaceSavedToTrip, toSavedPlace } from './utils/explore'
import {
  createSupabaseActivity,
  createSupabaseExpense,
  createSupabasePackingItem,
  createSupabasePlace,
  createSupabaseTrip,
  deleteSupabaseActivity,
  deleteSupabaseExpense,
  deleteSupabasePackingItem,
  deleteSupabasePlace,
  deleteSupabaseTrip,
  getSupabaseTrips,
  updateSupabaseActivity,
  updateSupabaseBudget,
  updateSupabaseExpense,
  updateSupabasePackingItem,
  updateSupabaseTrip,
} from './services/tripsRepository'
import { getIncomingFriendRequests } from './services/friendsRepository'
import { getMyPendingInvitations } from './services/invitationsRepository'
import { getUnreadNotifications } from './services/notificationsRepository'
import { warmDestinationImageCache } from './services/pexels'
import {
  deleteOwnAccount,
  getDefaultCurrency,
  updateDefaultCurrency,
} from './services/profilesRepository'
import { isTripPast, isTripUpcoming } from './utils/itinerary'
import { getPathForState, parseLocation } from './utils/routing'
import { useAuth } from './utils/useAuth'

function App() {
  const [showCreateTrip, setShowCreateTrip] = useState(false)
  const [isEditingTrip, setIsEditingTrip] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const mobileMenuRef = useRef(null)

  // Accounts are required for all trip functionality — see
  // utils/useAuth.js. A trip and everything nested under it (saved
  // places, activities, budget, expenses) exists in Supabase only —
  // Supabase is the single source of truth, with no localStorage
  // fallback or duplicate copy anywhere (see `visibleTrips` below, and
  // the trips-loading effect). Explore is the one exception — it stays
  // fully public, browsable with no account at all.
  const auth = useAuth()
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  // Which mode AuthDialog mounts into next time it opens — 'sign-in'
  // for every normal trigger (the profile button, requireAuth), or
  // 'recover' for the one path that needs to skip straight past "Forgot
  // password?" (ResetPasswordPage's own "Request a new link", for an
  // invalid/expired recovery link — see openAuthDialog below). AuthDialog
  // itself is only ever conditionally rendered (mounted fresh each time
  // it opens), so this only needs to be right at the moment it mounts,
  // not kept in sync afterward.
  const [authDialogMode, setAuthDialogMode] = useState('sign-in')
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState(null)

  // The navbar's one unified notification source — incoming friend
  // requests, incoming trip invitations, and unread informational
  // notifications (someone accepted/declined an invitation you sent —
  // see supabase/migrations/0012_trip_invitations_and_notifications.sql
  // for why only those two genuinely needed a persisted table, unlike
  // the first two, which stay purely derived from friendships/
  // trip_invitations' own pending rows). Replaces the old Friends-nav-
  // only badge (incomingRequestsCount) entirely — see NotificationBell.jsx
  // for the one popover rendering all three together, so there is
  // exactly one notification badge in the app, not two competing ones.
  // Fetched fresh whenever the signed-in user changes, and kept in
  // sync live via `refreshNotifications` passed down to both
  // NotificationBell (after its own accept/decline actions) and
  // FriendsPage (after its own accept/decline/cancel actions) — no
  // realtime subscription, matching "do not introduce ... realtime
  // infrastructure yet".
  const [notificationSummary, setNotificationSummary] = useState({
    friendRequests: [],
    tripInvitations: [],
    notifications: [],
  })

  const refreshNotifications = async () => {
    if (!auth.user) {
      setNotificationSummary({ friendRequests: [], tripInvitations: [], notifications: [] })
      return
    }
    try {
      const [friendRequests, tripInvitations, notifications] = await Promise.all([
        getIncomingFriendRequests(auth.user.id),
        getMyPendingInvitations(auth.user.id),
        getUnreadNotifications(auth.user.id),
      ])
      setNotificationSummary({ friendRequests, tripInvitations, notifications })
    } catch {
      // A failed refresh just leaves the badge/popover as whatever it
      // was — never worth its own error state for a small nav
      // indicator; any action taken *from* the popover still surfaces
      // its own error there (see NotificationBell.jsx).
    }
  }

  useEffect(() => {
    // Legitimate initial-load pattern — same established precedent as
    // PlaceCard.jsx/DestinationSearch.jsx's own effect-driven fetches
    // (see FriendsPage.jsx's loadAll effect for the identical
    // reasoning): there's no user event to hang the initial fetch off
    // of instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshNotifications()
    // Keyed on the user's id, not `auth.user` itself — same reasoning
    // as the trips-loading effect above (a token refresh hands back a
    // new user object for the same signed-in user; that shouldn't
    // re-fetch this).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id])

  // The signed-in user's own default-currency preference
  // (services/profilesRepository.js's getDefaultCurrency,
  // 0015_profile_default_currency.sql) — `null` for "not signed in",
  // "never set one", or "the read itself failed"; every one of those
  // is handled identically everywhere this is used: fall back to USD
  // (see SettingsPage.jsx's own selector and BudgetSection.jsx's/
  // SetBudget.jsx's own `?? defaultCurrency ?? 'USD'` fallback chains).
  // Kept here, not fetched separately by SettingsPage, specifically so
  // a change made in Settings is immediately visible to a brand-new
  // budget/expense on the Trip Detail page with no refresh needed —
  // both read from this one piece of state.
  const [defaultCurrency, setDefaultCurrency] = useState(null)

  useEffect(() => {
    if (!auth.user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDefaultCurrency(null)
      return
    }
    let cancelled = false
    getDefaultCurrency(auth.user.id)
      .then((currency) => {
        if (!cancelled) setDefaultCurrency(currency)
      })
      .catch(() => {
        // A failed read just leaves this null — every reader already
        // treats null as "use USD", so this fails safe into exactly
        // the same fallback a brand-new user with no preference yet
        // gets, never a broken Settings page or a blocked budget/
        // expense form.
        if (!cancelled) setDefaultCurrency(null)
      })
    return () => {
      cancelled = true
    }
    // Keyed on the user's id, not `auth.user` itself — same reasoning
    // as the trips-loading/notifications effects above (a token
    // refresh hands back a new user object for the same signed-in
    // user; that shouldn't re-fetch this).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id])

  // Persists a new default-currency choice (SettingsPage.jsx's own
  // selector) and, only once that actually succeeds, updates the local
  // state every other reader shares — so a save failure never leaves
  // the rest of the app believing a preference was set that Supabase
  // never actually stored (see SettingsPage.jsx's own comment on how
  // it uses this return value to keep its UI honest).
  const handleUpdateDefaultCurrency = async (currency) => {
    if (!auth.user) return { success: false }
    try {
      await updateDefaultCurrency(auth.user.id, currency)
      setDefaultCurrency(currency)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Real account deletion (see services/profilesRepository.js's
  // deleteOwnAccount / supabase/migrations/0008_collaboration_account_
  // completeness.sql's delete_own_account() for the actual cascade).
  // Signs out afterward — `{ scope: 'local' }` rather than
  // useAuth.js's normal default, see its own comment on `signOut` for
  // why: the account no longer exists server-side by this point, so
  // this only needs to clear local session state, not hit the network
  // to invalidate a session that's already moot. No extra navigate()
  // call needed either: the existing signed-out gating on every view
  // (dashboard/friends/profile/a selected trip) already takes over the
  // instant auth.user goes null, exactly as it already does for a
  // normal sign-out.
  const handleDeleteAccount = async () => {
    setDeleteAccountError(null)
    try {
      await deleteOwnAccount(auth.user.id)
      await auth.signOut({ scope: 'local' })
      setShowDeleteAccountConfirm(false)
    } catch (error) {
      setDeleteAccountError(error.message)
      setShowDeleteAccountConfirm(false)
    }
  }

  // The one auth gate for every *action* that creates or modifies
  // personal trip data (create/edit/delete a trip, activities,
  // expenses, budget, saved places) — Explore/browsing never calls
  // this. Threaded down as a single prop to whichever component owns
  // the button that starts each action (TripPage, BudgetSection,
  // ExplorePage), rather than duplicating the `if (!user)` check in
  // each of them: they just call `requireAuth(() => actuallyDoIt())`
  // instead of calling their state-setter directly.
  //
  // *Viewing* trip data is gated separately, not through this function
  // — there's no explicit action to intercept, since a signed-out
  // session simply never has any trip data available to render in the
  // first place (see `visibleTrips` below).
  // The one place AuthDialog is actually opened from — always resets
  // `authDialogMode` alongside `showAuthDialog`, so a mode picked for
  // one visit (recover) can never silently leak into the next, unrelated
  // one (e.g. a normal sign-in triggered by requireAuth right after).
  const openAuthDialog = (mode = 'sign-in') => {
    setAuthDialogMode(mode)
    setShowAuthDialog(true)
  }

  const requireAuth = (action) => {
    if (!auth.user) {
      openAuthDialog()
      return
    }
    action()
  }

  // Starts empty, always — trips only ever come from Supabase now (see
  // the loading effect below), and there's no signed-in-or-not
  // ambiguity to resolve synchronously at mount the way there used to
  // be: a signed-out session simply has no trips to show.
  const [trips, setTrips] = useState([])
  // Starts `true`, not `false`: it only ever flips false once the trips
  // effect below has actually run at least once for the current auth
  // state (signed in or out) — starting false left a narrow window,
  // right as `auth.isLoadingSession` first resolves, where this was
  // still stale-false *and* `trips` was still empty before the real
  // fetch had even started — long enough for the trip-existence check
  // effect to see both "not loading" and "not found" at once and
  // wrongly treat a real, not-yet-loaded Supabase trip as deleted.
  const [isLoadingTrips, setIsLoadingTrips] = useState(true)

  // The single place `trips` gets (re)loaded: Supabase for a signed-in
  // user, empty otherwise — trip data is account-required now, so a
  // signed-out session has nothing to load. Extracted as a named,
  // cancellation-aware function (rather than only inline in the effect
  // below) so accepting a trip invitation — which grants access to a
  // trip that wasn't in `trips` a moment ago — can also call it
  // directly afterward, not just wait for a full page reload. Returns
  // the cleanup/cancel function, same shape an effect body would.
  const loadTrips = () => {
    let cancelled = false

    if (auth.user) {
      setIsLoadingTrips(true)
      getSupabaseTrips(auth.user.id)
        .then((supabaseTrips) => {
          if (!cancelled) setTrips(supabaseTrips)
        })
        .catch((error) => {
          console.error('Failed to load trips from Supabase', error)
          if (!cancelled) setTrips([])
        })
        .finally(() => {
          if (!cancelled) setIsLoadingTrips(false)
        })
    } else {
      setTrips([])
      setIsLoadingTrips(false)
    }

    return () => {
      cancelled = true
    }
  }

  // Waits for auth's own initial session check first, so a page load
  // that's actually already signed in doesn't briefly flash an empty
  // list before switching to the real (Supabase) list a moment later.
  useEffect(() => {
    if (auth.isLoadingSession) return undefined
    // eslint-disable-next-line react-hooks/set-state-in-effect
    return loadTrips()
    // Keyed on the user's id (a stable primitive), not `auth.user`
    // itself — Supabase hands back a new session/user object on every
    // token refresh even for the same signed-in user, and that
    // shouldn't re-fetch the trip list each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id, auth.isLoadingSession])

  // `view` ('dashboard' | 'explore') and `selectedTripId` (below a
  // selected trip takes priority over either) together describe
  // Voyage's current "page" — kept as one object, initialized from the
  // real URL (see utils/routing.js), so a refresh lands back on
  // whatever page the user was on instead of always resetting to Home.
  const [{ view, selectedTripId }, setPage] = useState(() =>
    parseLocation(window.location.pathname)
  )

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined

    const handleClickOutside = (event) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        setIsMobileMenuOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMobileMenuOpen])

  // The one place page state ever changes: updates the state driving
  // the render AND pushes a matching URL, so the browser's own history
  // gains a real entry — this (plus the popstate listener below) is
  // what makes Back/Forward navigate between Voyage's pages instead of
  // just refresh preserving whichever one you're already on.
  const navigate = (nextPage) => {
    setPage(nextPage)
    const path = getPathForState(nextPage)
    if (path !== window.location.pathname) {
      window.history.pushState(null, '', path)
    }
  }

  // Shared by the desktop links and the mobile menu items, so both
  // navigate identically and the mobile menu always closes afterward.
  const goToDashboard = () => {
    navigate({ view: 'dashboard', selectedTripId: null })
    setIsMobileMenuOpen(false)
  }

  const goToExplore = () => {
    navigate({ view: 'explore', selectedTripId: null })
    setIsMobileMenuOpen(false)
  }

  const goToFriends = () => {
    navigate({ view: 'friends', selectedTripId: null })
    setIsMobileMenuOpen(false)
  }

  const goToProfile = () => {
    navigate({ view: 'profile', selectedTripId: null })
    setIsMobileMenuOpen(false)
  }

  // Reached only from Profile's own "Settings" action (see
  // ProfilePage.jsx) — deliberately not a top-level nav destination, so
  // this has no mobile-menu entry to close, unlike the four `goTo*`
  // functions above. Still a real, bookmarkable, refresh-safe URL like
  // every other view (see utils/routing.js).
  const goToSettings = () => {
    navigate({ view: 'settings', selectedTripId: null })
  }

  // A city a "Popular destinations" card (see PopularDestinations.jsx)
  // was clicked for — threaded down to ExplorePage as `initialDestination`
  // so it can search that city itself on mount, instead of just
  // landing on Explore's empty selection screen. Not part of routing
  // state (utils/routing.js) — it's a one-shot UI hint, cleared the
  // moment ExplorePage consumes it, same as `showCreateTrip` and the
  // other transient modal/UI state below.
  const [pendingExploreDestination, setPendingExploreDestination] = useState(null)

  const goToExploreWithDestination = (destination) => {
    setPendingExploreDestination(destination)
    goToExplore()
  }

  // Reacts to the browser's own Back/Forward (and any other history
  // navigation) — the URL has already changed by the time this fires,
  // so this only ever needs to re-derive page state from it, never to
  // push a new entry itself (that would fight with the browser's own
  // navigation instead of following it).
  useEffect(() => {
    const handlePopState = () => {
      setPage(parseLocation(window.location.pathname))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // A `/trips/:id` URL is trusted optimistically by parseLocation (see
  // its own comment on why) — this is what actually validates it, once
  // there's a real trips list to validate against rather than whatever
  // was available at the exact synchronous moment the page loaded.
  // Waits for both the initial session check *and* (if signed in) the
  // Supabase trips fetch to settle first: correcting this too early,
  // same as the old parseLocation check did, would treat every
  // Supabase trip as "doesn't exist" before it had even loaded,
  // permanently bouncing the user to the dashboard on every refresh of
  // a trip page. Once loading has genuinely settled, a `selectedTripId`
  // that still isn't in `trips` really doesn't exist (deleted, or a bad
  // link) and is cleared here — same outcome parseLocation used to
  // produce, just correctly timed now.
  //
  // Signed-out is its own, immediate case rather than waiting on
  // `trips` to empty out: trip data is account-required, so a
  // `/trips/:id` URL hit while signed out is never valid regardless of
  // what `trips` happens to hold at this exact instant (e.g. the
  // moment right after sign-out, before the loading effect above has
  // had a chance to clear it — see `visibleTrips`'s own comment on that
  // same race). Checking `auth.user` directly here closes it in one
  // step instead of waiting on `trips` to catch up.
  useEffect(() => {
    if (auth.isLoadingSession || isLoadingTrips) return
    if (!selectedTripId) return
    if (auth.user?.id && trips.some((trip) => trip.id === selectedTripId)) return
    // Correcting page state to match reality (an id the URL asked for
    // turned out not to exist, or isn't visible to a signed-out
    // session), not deriving new state from a prop/state change — same
    // category as the popstate listener above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage({ view: 'dashboard', selectedTripId: null })
  }, [trips, selectedTripId, auth.user?.id, auth.isLoadingSession, isLoadingTrips])

  // Safety net, not the primary sync mechanism: if page state and the
  // URL ever disagree — including right after the effect above clears
  // a stale `selectedTripId` — corrects the address bar to match what's
  // actually shown. A `replaceState`, not `navigate`'s `pushState`:
  // this is a correction, not a navigation the user asked for, so it
  // shouldn't add a Back-able history entry.
  useEffect(() => {
    const path = getPathForState({ view, selectedTripId })
    if (path !== window.location.pathname) {
      window.history.replaceState(null, '', path)
    }
  }, [view, selectedTripId])

  // There's no signed-out persistence here — every trip mutation
  // requires being signed in (each handler below starts with
  // `if (!auth.user) return`), and Supabase is the only place trip data
  // is ever read from or written to. `localStorage` plays no role in
  // trip data at all anymore (see main.jsx for the one-time cleanup of
  // the old `voyage:trips` key left over from before this was true).
  //
  // `trips` itself is only ever safe to read while actually signed in.
  // The loading effect above keeps it correct on every real auth
  // transition, but it runs *after* the render where `auth.user` first
  // goes from a user to `null` (e.g. right after sign-out) — for that
  // one render, `trips` can still be the previous session's Supabase
  // data. Gating the value itself, not just trusting its eventual
  // content, closes that race categorically: every render usage below
  // goes through `visibleTrips`, never raw `trips`, directly.
  const visibleTrips = auth.user ? trips : []

  // Upcoming vs Past is purely a display-time split of the same
  // Supabase-backed `trips` — see utils/itinerary.js's isTripUpcoming/
  // isTripPast (end date is the source of truth, today counts as
  // Upcoming). Nothing is deleted, archived, or written back; a past
  // trip is still fully present in `trips`/`visibleTrips` and still
  // fully functional (itinerary, saved places, budget, expenses) once
  // opened — this split only changes which of the two dashboard lists
  // a trip's card renders in.
  const upcomingTrips = visibleTrips.filter(isTripUpcoming)
  const pastTrips = visibleTrips.filter(isTripPast)

  // "Your Trips" vs "Shared With You" — a pure display-time split of
  // the same already-loaded `upcomingTrips`, exactly like Upcoming vs
  // Past itself: ownership (`trip.ownerId`, from tripsRepository.js's
  // own fromRow) never changes which list a trip is *in*, only which
  // dashboard section its card renders in. Past trips are deliberately
  // NOT split the same way — they stay one combined, chronological
  // list (unchanged from before this milestone); a shared past trip's
  // own card still shows its role/owner caption inline (see the
  // Past Trips section below), it just isn't pulled into a separate
  // section the way upcoming ones are, so the dashboard doesn't grow a
  // fourth trip section for what's normally a short list anyway.
  const ownedUpcomingTrips = upcomingTrips.filter((trip) => trip.ownerId === auth.user?.id)
  const sharedUpcomingTrips = upcomingTrips.filter((trip) => trip.ownerId !== auth.user?.id)

  // `display_name` is whatever was stored at sign-up (see AuthDialog.jsx
  // /useAuth.js's signUp) — already present on the session's own user
  // object (`user_metadata`), no separate profile fetch needed. Older
  // accounts, or a name that somehow didn't reach the session, simply
  // have no metadata here — the returning-user greeting below falls
  // back to a name-less "Welcome back" rather than depending on it.
  const firstName = (auth.user?.user_metadata?.display_name || '').trim().split(/\s+/)[0] || ''

  const selectedTrip = visibleTrips.find((trip) => trip.id === selectedTripId) ?? null

  // Reachable only while signed in (requireAuth gates every trigger
  // that leads here — see the "Create a trip" buttons above) — trips
  // themselves are Supabase-backed now (see services/tripsRepository.js),
  // so this is the one thing here that's actually async. The `if
  // (!auth.user)` is a defensive backstop, not the real gate: it
  // shouldn't be reachable, but this avoids ever calling Supabase with
  // no signed-in user if it somehow is.
  const handleCreateTrip = async (tripData) => {
    if (!auth.user) return
    try {
      const newTrip = await createSupabaseTrip(auth.user.id, tripData)
      setTrips((currentTrips) => [...currentTrips, newTrip])
      setShowCreateTrip(false)

      // Fire-and-forget: warms Pexels' destination-image pool for this
      // trip so its own TripCard can show a real photo without this
      // destination ever needing a separate Explore visit first (see
      // pexels.js's warmDestinationImageCache) — never awaited here,
      // so a slow/failed/rate-limited Pexels request can never delay
      // or roll back a trip that's already successfully created; the
      // .catch is defensive only (warmDestinationImageCache itself
      // never rejects). TripCard's own getCachedDestinationImage
      // lookup is synchronous and only ever runs at render time, so it
      // can't pick up a pool that finishes warming *after* this trip's
      // card already rendered with nothing cached yet — the harmless
      // `setTrips` touch below (same trips, new array reference) is
      // just enough to re-render that one card once the pool is
      // ready, without a second fetch/poll of anything.
      warmDestinationImageCache(newTrip.destination)
        .catch(() => {})
        .finally(() => {
          setTrips((currentTrips) => [...currentTrips])
        })
    } catch (error) {
      console.error('Failed to create trip', error)
    }
  }

  // Merges the edited fields into the existing trip, keeping its id and
  // activities intact. Activities are keyed by day number (Day 1, Day 2,
  // …) rather than an absolute calendar date, so shifting the trip's
  // dates naturally keeps each activity on the same relative day. If the
  // new range is shorter, the trailing days' activities simply aren't
  // shown — they aren't deleted, and reappear if the dates are extended
  // again later. Only name/destination/start/end date actually round-
  // trip through Supabase here (see updateSupabaseTrip) — budget has
  // its own dedicated round-trip (see handleSetBudget), and
  // activities/savedPlaces/expenses are merged back in locally from
  // the existing in-memory trip, same as before.
  const handleUpdateTrip = async (tripId, tripData) => {
    if (!auth.user) return
    try {
      const updatedTrip = await updateSupabaseTrip(tripId, tripData)
      // Only the fields Supabase actually manages — updatedTrip's own
      // activities/savedPlaces/expenses are always empty (see
      // tripsRepository.js's fromRow), and its budget is whatever the
      // row already had (untouched by this update, see toFields) —
      // spreading the whole object would wipe out what the in-memory
      // trip already had for those instead of leaving them alone.
      setTrips((currentTrips) =>
        currentTrips.map((trip) =>
          trip.id === tripId
            ? {
                ...trip,
                name: updatedTrip.name,
                destination: updatedTrip.destination,
                startDate: updatedTrip.startDate,
                endDate: updatedTrip.endDate,
              }
            : trip
        )
      )
      setIsEditingTrip(false)
    } catch (error) {
      console.error('Failed to update trip', error)
    }
  }

  // Reachable only while signed in (requireAuth gates every trigger
  // that leads here) — activities are Supabase-backed now, so the
  // object actually stored in state is the one Supabase hands back
  // (its real row id), not the client-generated one AddActivity.jsx
  // built.
  const handleAddActivity = async (tripId, dayNumber, activity) => {
    if (!auth.user) return
    try {
      const savedActivity = await createSupabaseActivity(tripId, dayNumber, activity)
      setTrips((currentTrips) =>
        currentTrips.map((trip) => {
          if (trip.id !== tripId) return trip

          const activities = trip.activities ?? {}
          const dayActivities = activities[dayNumber] ?? []

          return {
            ...trip,
            activities: {
              ...activities,
              [dayNumber]: [...dayActivities, savedActivity],
            },
          }
        })
      )
    } catch (error) {
      console.error('Failed to add activity', error)
    }
  }

  const handleUpdateActivity = async (tripId, dayNumber, updatedActivity) => {
    if (!auth.user) return
    try {
      const savedActivity = await updateSupabaseActivity(updatedActivity.id, updatedActivity)
      setTrips((currentTrips) =>
        currentTrips.map((trip) => {
          if (trip.id !== tripId) return trip

          const activities = trip.activities ?? {}
          const dayActivities = activities[dayNumber] ?? []

          return {
            ...trip,
            activities: {
              ...activities,
              [dayNumber]: dayActivities.map((activity) =>
                activity.id === savedActivity.id ? savedActivity : activity
              ),
            },
          }
        })
      )
    } catch (error) {
      console.error('Failed to update activity', error)
    }
  }

  // Saved places live on the trip separately from `activities` — adding
  // one to a day never removes it from here, since "add to itinerary"
  // just creates a new activity from its details. Reachable only while
  // signed in (requireAuth gates the "+ Add place" button) — saved
  // places are Supabase-backed now, so the object actually stored in
  // state is the one Supabase hands back (its real row id), not the
  // client-generated one AddPlace.jsx built.
  const handleAddPlace = async (tripId, place) => {
    if (!auth.user) return
    try {
      const savedPlace = await createSupabasePlace(tripId, place)
      setTrips((currentTrips) =>
        currentTrips.map((trip) =>
          trip.id === tripId
            ? { ...trip, savedPlaces: [...(trip.savedPlaces ?? []), savedPlace] }
            : trip
        )
      )
    } catch (error) {
      console.error('Failed to add place', error)
    }
  }

  // Saving a place discovered on the Explore page reuses the exact same
  // Saved Places table as manually-added places — it's just converted
  // to that shape first (toSavedPlace), and skipped if that trip
  // already has it (tracked via `sourcePlaceId`).
  // Toggles a mock place's saved state for one trip: adds it (converted
  // to the shared Saved Places shape) if it isn't there yet, or removes
  // it if it already is — so the same action in the UI can both save
  // and un-save without ever creating a duplicate.
  const handleToggleExplorePlace = async (tripId, place) => {
    if (!auth.user) return
    const trip = trips.find((currentTrip) => currentTrip.id === tripId)
    if (!trip) return

    try {
      if (isPlaceSavedToTrip(trip, place)) {
        const existing = (trip.savedPlaces ?? []).find(
          (savedPlace) => savedPlace.sourcePlaceId === place.id
        )
        if (!existing) return
        await deleteSupabasePlace(existing.id)
        setTrips((currentTrips) =>
          currentTrips.map((currentTrip) =>
            currentTrip.id === tripId
              ? {
                  ...currentTrip,
                  savedPlaces: (currentTrip.savedPlaces ?? []).filter(
                    (savedPlace) => savedPlace.id !== existing.id
                  ),
                }
              : currentTrip
          )
        )
      } else {
        const savedPlace = await createSupabasePlace(tripId, toSavedPlace(place))
        setTrips((currentTrips) =>
          currentTrips.map((currentTrip) =>
            currentTrip.id === tripId
              ? { ...currentTrip, savedPlaces: [...(currentTrip.savedPlaces ?? []), savedPlace] }
              : currentTrip
          )
        )
      }
    } catch (error) {
      console.error('Failed to toggle saved place', error)
    }
  }

  const handleDeletePlace = async (tripId, placeId) => {
    if (!auth.user) return
    try {
      await deleteSupabasePlace(placeId)
      setTrips((currentTrips) =>
        currentTrips.map((trip) =>
          trip.id === tripId
            ? {
                ...trip,
                savedPlaces: (trip.savedPlaces ?? []).filter(
                  (place) => place.id !== placeId
                ),
              }
            : trip
        )
      )
    } catch (error) {
      console.error('Failed to delete place', error)
    }
  }

  // Packing items — same shape as the Saved Places handlers right
  // above (Supabase-backed, no localStorage fallback, reachable only
  // while signed in since requireAuth already gates every trigger that
  // leads here). `trip.packingItems` is a flat array, same as
  // `trip.savedPlaces` — no day-grouping the way `activities` needs.
  const handleAddPackingItem = async (tripId, item) => {
    if (!auth.user) return
    try {
      const savedItem = await createSupabasePackingItem(tripId, item)
      setTrips((currentTrips) =>
        currentTrips.map((trip) =>
          trip.id === tripId
            ? { ...trip, packingItems: [...(trip.packingItems ?? []), savedItem] }
            : trip
        )
      )
    } catch (error) {
      console.error('Failed to add packing item', error)
    }
  }

  // Toggles one item's `completed` state — sends the full current item
  // (with `completed` flipped) through the same general-purpose
  // updateSupabasePackingItem update, same "send the whole object"
  // approach handleUpdateActivity already uses for updateSupabaseActivity.
  const handleTogglePackingItem = async (tripId, item) => {
    if (!auth.user) return
    try {
      const savedItem = await updateSupabasePackingItem(item.id, {
        ...item,
        completed: !item.completed,
      })
      setTrips((currentTrips) =>
        currentTrips.map((trip) =>
          trip.id === tripId
            ? {
                ...trip,
                packingItems: (trip.packingItems ?? []).map((packingItem) =>
                  packingItem.id === savedItem.id ? savedItem : packingItem
                ),
              }
            : trip
        )
      )
    } catch (error) {
      console.error('Failed to toggle packing item', error)
    }
  }

  const handleDeletePackingItem = async (tripId, itemId) => {
    if (!auth.user) return
    try {
      await deleteSupabasePackingItem(itemId)
      setTrips((currentTrips) =>
        currentTrips.map((trip) =>
          trip.id === tripId
            ? {
                ...trip,
                packingItems: (trip.packingItems ?? []).filter(
                  (item) => item.id !== itemId
                ),
              }
            : trip
        )
      )
    } catch (error) {
      console.error('Failed to delete packing item', error)
    }
  }

  // Reachable only while signed in (requireAuth gates every trigger
  // that leads here) — persists straight to Supabase (see
  // updateSupabaseBudget) and stores back whatever it returns.
  const handleSetBudget = async (tripId, budget) => {
    if (!auth.user) return
    try {
      const savedBudget = await updateSupabaseBudget(tripId, auth.user.id, budget)
      setTrips((currentTrips) =>
        currentTrips.map((trip) =>
          trip.id === tripId ? { ...trip, budget: savedBudget } : trip
        )
      )
    } catch (error) {
      console.error('Failed to set budget', error)
    }
  }

  // Reachable only while signed in (requireAuth gates every trigger
  // that leads here) — persists straight to Supabase (see
  // createSupabaseExpense) and stores back whatever it returns — its
  // real row id, not AddExpense.jsx's client-generated one — same
  // pattern as handleAddActivity.
  // `participantProfilesById` only ever appears on a *shared* expense
  // (see AddExpense.jsx's Personal/Shared toggle) — BudgetSection.jsx
  // already fetched trip members to populate the Paid by/Participants
  // pickers, so it's passed along here purely so the newly-saved
  // expense's payer/participant names are ready immediately, with no
  // extra fetch. Pulled off before persisting: it's UI-picker data, not
  // a real expense field, and never part of trip state itself.
  const handleAddExpense = async (tripId, expense) => {
    if (!auth.user) return
    try {
      const { participantProfilesById, ...expenseFields } = expense
      const savedExpense = await createSupabaseExpense(
        tripId,
        expenseFields,
        participantProfilesById
      )
      setTrips((currentTrips) =>
        currentTrips.map((trip) =>
          trip.id === tripId
            ? { ...trip, expenses: [...(trip.expenses ?? []), savedExpense] }
            : trip
        )
      )
    } catch (error) {
      console.error('Failed to add expense', error)
    }
  }

  const handleUpdateExpense = async (tripId, updatedExpense) => {
    if (!auth.user) return
    try {
      const { participantProfilesById, ...expenseFields } = updatedExpense
      const savedExpense = await updateSupabaseExpense(
        expenseFields.id,
        expenseFields,
        participantProfilesById
      )
      setTrips((currentTrips) =>
        currentTrips.map((trip) =>
          trip.id === tripId
            ? {
                ...trip,
                expenses: (trip.expenses ?? []).map((expense) =>
                  expense.id === savedExpense.id ? savedExpense : expense
                ),
              }
            : trip
        )
      )
    } catch (error) {
      console.error('Failed to update expense', error)
    }
  }

  const handleDeleteExpense = async (tripId, expenseId) => {
    if (!auth.user) return
    try {
      await deleteSupabaseExpense(expenseId)
      setTrips((currentTrips) =>
        currentTrips.map((trip) =>
          trip.id === tripId
            ? {
                ...trip,
                expenses: (trip.expenses ?? []).filter(
                  (expense) => expense.id !== expenseId
                ),
              }
            : trip
        )
      )
    } catch (error) {
      console.error('Failed to delete expense', error)
    }
  }

  const handleDeleteTrip = async (tripId) => {
    if (!auth.user) return
    try {
      await deleteSupabaseTrip(tripId)
      setTrips((currentTrips) => currentTrips.filter((trip) => trip.id !== tripId))
      navigate({ view: 'dashboard', selectedTripId: null })
    } catch (error) {
      console.error('Failed to delete trip', error)
    }
  }

  const handleDeleteActivity = async (tripId, dayNumber, activityId) => {
    if (!auth.user) return
    try {
      await deleteSupabaseActivity(activityId)
      setTrips((currentTrips) =>
        currentTrips.map((trip) => {
          if (trip.id !== tripId) return trip

          const activities = trip.activities ?? {}
          const dayActivities = activities[dayNumber] ?? []

          return {
            ...trip,
            activities: {
              ...activities,
              [dayNumber]: dayActivities.filter(
                (activity) => activity.id !== activityId
              ),
            },
          }
        })
      )
    } catch (error) {
      console.error('Failed to delete activity', error)
    }
  }

  return (
    <div className="app">
      <header className="navbar">
        <a
          className="logo"
          href="/"
          onClick={(event) => {
            event.preventDefault()
            goToDashboard()
          }}
        >
          Voyage
        </a>

        <nav className="nav-links">
          <a
            href="/"
            className={view === 'dashboard' ? 'is-active' : ''}
            onClick={(event) => {
              event.preventDefault()
              goToDashboard()
            }}
          >
            My Trips
          </a>
          <a
            href="/"
            className={view === 'explore' ? 'is-active' : ''}
            onClick={(event) => {
              event.preventDefault()
              goToExplore()
            }}
          >
            Explore
          </a>
          <a
            href="/"
            className={view === 'friends' ? 'is-active' : ''}
            onClick={(event) => {
              event.preventDefault()
              goToFriends()
            }}
          >
            Friends
          </a>
        </nav>

        {/* The account cluster — hamburger (mobile only), notification
            bell, profile avatar — grouped in one flex container so they
            read as one "account controls" unit on the navbar's right
            edge (tight, consistent gap) instead of getting spread out
            individually by .navbar's own space-between. */}
        <div className="nav-account">
          <div className="mobile-nav" ref={mobileMenuRef}>
            <button
              type="button"
              className="mobile-menu-button"
              aria-haspopup="true"
              aria-expanded={isMobileMenuOpen}
              aria-label="Open navigation menu"
              onClick={() => setIsMobileMenuOpen((open) => !open)}
            >
              <span className="mobile-menu-icon" aria-hidden="true" />
            </button>

            {isMobileMenuOpen && (
              <div className="mobile-menu-panel" role="menu">
                <a
                  href="/"
                  role="menuitem"
                  className={
                    'mobile-menu-item' + (view === 'dashboard' ? ' is-active' : '')
                  }
                  onClick={(event) => {
                    event.preventDefault()
                    goToDashboard()
                  }}
                >
                  My Trips
                </a>
                <a
                  href="/"
                  role="menuitem"
                  className={
                    'mobile-menu-item' + (view === 'explore' ? ' is-active' : '')
                  }
                  onClick={(event) => {
                    event.preventDefault()
                    goToExplore()
                  }}
                >
                  Explore
                </a>
                <a
                  href="/"
                  role="menuitem"
                  className={
                    'mobile-menu-item' + (view === 'friends' ? ' is-active' : '')
                  }
                  onClick={(event) => {
                    event.preventDefault()
                    goToFriends()
                  }}
                >
                  Friends
                </a>
              </div>
            )}
          </div>

          {auth.user && (
            <NotificationBell
              currentUserId={auth.user.id}
              summary={notificationSummary}
              onRefresh={refreshNotifications}
              onTripAccepted={loadTrips}
              onGoToFriends={goToFriends}
            />
          )}

          {/* Signed-out only — Sign In already has its own entry point
              (the profile circle right below, title="Sign in"), but
              Sign Up previously had none of its own anywhere: the only
              way to reach it was opening that same circle (which opens
              AuthDialog in sign-in mode) and then noticing its own
              small "Don't have an account? Sign up" toggle at the
              bottom. This reuses the exact same AuthDialog/openAuthDialog
              plumbing — just calling it with 'sign-up' instead of the
              default — so there's still exactly one auth dialog, one
              signup form, nothing new to keep in sync. */}
          {!auth.user && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => openAuthDialog('sign-up')}
            >
              Sign up
            </button>
          )}

          <button
            className={
              'profile-button' + (view === 'profile' ? ' is-active' : '')
            }
            onClick={() => (auth.user ? goToProfile() : openAuthDialog())}
            title={auth.user ? 'Account' : 'Sign in'}
          >
            {auth.user ? (
              <Avatar
                avatarUrl={auth.user.user_metadata?.avatar_url}
                displayName={auth.user.user_metadata?.display_name}
                fallback={auth.user.email.charAt(0).toUpperCase()}
                className="profile-button-avatar"
              />
            ) : (
              // Signed-out fallback — "V" for Voyage, not a "sign in"
              // initial (there's no user to take an initial from yet).
              // Same plain-text-in-button rendering as before; the
              // Avatar component above is still only ever used for a
              // real signed-in user.
              'V'
            )}
          </button>
        </div>
      </header>

      {selectedTrip ? (
        <TripPage
          trip={selectedTrip}
          isOwner={selectedTrip.ownerId === auth.user?.id}
          currentUserId={auth.user?.id}
          requireAuth={requireAuth}
          defaultCurrency={defaultCurrency}
          onBack={() => navigate({ view: 'dashboard', selectedTripId: null })}
          onEditTrip={() => setIsEditingTrip(true)}
          onDeleteTrip={() => handleDeleteTrip(selectedTrip.id)}
          onAddPlace={(place) => handleAddPlace(selectedTrip.id, place)}
          onDeletePlace={(placeId) => handleDeletePlace(selectedTrip.id, placeId)}
          onAddPackingItem={(item) => handleAddPackingItem(selectedTrip.id, item)}
          onTogglePackingItem={(item) => handleTogglePackingItem(selectedTrip.id, item)}
          onDeletePackingItem={(itemId) => handleDeletePackingItem(selectedTrip.id, itemId)}
          onSetBudget={(budget) => handleSetBudget(selectedTrip.id, budget)}
          onAddExpense={(expense) => handleAddExpense(selectedTrip.id, expense)}
          onUpdateExpense={(expense) =>
            handleUpdateExpense(selectedTrip.id, expense)
          }
          onDeleteExpense={(expenseId) =>
            handleDeleteExpense(selectedTrip.id, expenseId)
          }
          onAddActivity={(dayNumber, activity) =>
            handleAddActivity(selectedTrip.id, dayNumber, activity)
          }
          onUpdateActivity={(dayNumber, activity) =>
            handleUpdateActivity(selectedTrip.id, dayNumber, activity)
          }
          onDeleteActivity={(dayNumber, activityId) =>
            handleDeleteActivity(selectedTrip.id, dayNumber, activityId)
          }
        />
      ) : view === 'explore' ? (
        <ExplorePage
          trips={visibleTrips}
          requireAuth={requireAuth}
          onToggleTrip={handleToggleExplorePlace}
          onCreateTrip={() => requireAuth(() => setShowCreateTrip(true))}
          initialDestination={pendingExploreDestination}
          onInitialDestinationHandled={() => setPendingExploreDestination(null)}
        />
      ) : view === 'friends' ? (
        // Friends has no public/signed-out content the way Explore
        // does — unlike ExplorePage, this doesn't thread requireAuth
        // down to gate individual actions; the whole page is auth-only,
        // gated here exactly like the dashboard's own "Sign in to see
        // your trips" card (same empty-state markup, same
        // requireAuth-driven AuthDialog trigger), rather than a hard
        // redirect if a signed-out visitor somehow lands on /friends.
        auth.user ? (
          <FriendsPage
            currentUserId={auth.user.id}
            onNotificationsChanged={refreshNotifications}
          />
        ) : (
          <main className="friends-page">
            <section className="friends-header">
              <p className="eyebrow">FRIENDS</p>
              <h1>Friends</h1>
            </section>

            <div className="empty-state">
              <div className="empty-icon">☺</div>
              <h3>Sign in to see your friends</h3>
              <p>
                Connecting with other travelers is tied to your account
                — sign in (or create one) to add and manage friends.
              </p>
              <button
                className="primary-button"
                onClick={() => requireAuth(() => {})}
              >
                Sign in
              </button>
            </div>
          </main>
        )
      ) : view === 'profile' ? (
        // Same auth-only gating as Friends above — the whole page, not
        // individual actions, so no requireAuth threaded down into
        // ProfilePage itself.
        auth.user ? (
          <ProfilePage
            currentUser={auth.user}
            onGoToFriends={goToFriends}
            onGoToSettings={goToSettings}
            onSignOutClick={() => setShowSignOutConfirm(true)}
          />
        ) : (
          <main className="profile-page">
            <section className="profile-header">
              <p className="eyebrow">ACCOUNT</p>
              <h1>Profile</h1>
            </section>

            <div className="empty-state">
              <div className="empty-icon">☺</div>
              <h3>Sign in to see your account</h3>
              <p>
                Your profile is tied to your account — sign in (or
                create one) to view and manage it.
              </p>
              <button
                className="primary-button"
                onClick={() => requireAuth(() => {})}
              >
                Sign in
              </button>
            </div>
          </main>
        )
      ) : view === 'settings' ? (
        // Same auth-only gating as Profile/Friends above — Settings is
        // reached only from Profile's own "Settings" action, but still
        // a real URL (a refresh, a direct link, or Back/Forward can all
        // land here directly), so a signed-out visitor gets the same
        // inline sign-in gate every other account-only page already
        // has, not a redirect.
        auth.user ? (
          <SettingsPage
            currentUser={auth.user}
            onBack={goToProfile}
            onVerifyCurrentPassword={auth.signIn}
            onUpdatePassword={auth.updatePassword}
            authError={auth.authError}
            onClearAuthError={auth.clearAuthError}
            defaultCurrency={defaultCurrency}
            onUpdateDefaultCurrency={handleUpdateDefaultCurrency}
            onSignOutClick={() => setShowSignOutConfirm(true)}
            onDeleteAccountClick={() => {
              setDeleteAccountError(null)
              setShowDeleteAccountConfirm(true)
            }}
            deleteAccountError={deleteAccountError}
          />
        ) : (
          <main className="profile-page">
            <section className="profile-header">
              <p className="eyebrow">SETTINGS</p>
              <h1>Settings</h1>
            </section>

            <div className="empty-state">
              <div className="empty-icon">☺</div>
              <h3>Sign in to see your settings</h3>
              <p>
                Account settings are tied to your account — sign in (or
                create one) to view and manage them.
              </p>
              <button
                className="primary-button"
                onClick={() => requireAuth(() => {})}
              >
                Sign in
              </button>
            </div>
          </main>
        )
      ) : view === 'reset-password' ? (
        // Not auth-gated the same way as every view above — there's no
        // "sign in to see this" empty state here, because this page
        // isn't for an already-known signed-in/out state at all: it's
        // reached only via a one-time recovery link, and its own
        // internal status (checking/ready/invalid/success — see
        // ResetPasswordPage.jsx) is what actually decides what renders,
        // driven by `auth.isPasswordRecovery`, not `auth.user`.
        <ResetPasswordPage
          isLoadingSession={auth.isLoadingSession}
          isPasswordRecovery={auth.isPasswordRecovery}
          authError={auth.authError}
          onUpdatePassword={auth.updatePassword}
          onClearAuthError={auth.clearAuthError}
          onGoToDashboard={goToDashboard}
          onRequestNewLink={() => {
            goToDashboard()
            openAuthDialog('recover')
          }}
        />
      ) : (
        <main>
          {/* Three distinct states: a signed-out visitor keeps the full
              marketing hero (Explore stays public regardless); a signed-in
              user with no trips yet gets a lighter, still-welcoming intro
              that leads straight into creating one; a signed-in user who
              already has trips gets a compact returning-user header
              instead — no marketing pitch, since it's no longer a first
              impression, and their trips (below) are the priority.
              `isLoadingTrips` gates this so a returning user's first paint
              never briefly flashes the empty-state copy before their
              trips are actually known. */}
          {!auth.user ? (
            <section className="hero">
              <p className="eyebrow">PLAN BETTER. TRAVEL BETTER.</p>

              <h1>
                Your next adventure,
                <br />
                beautifully planned.
              </h1>

              <p className="hero-text">
                Organize your destinations, itinerary and activities
                in one simple place.
              </p>

              <button
                className="primary-button"
                onClick={() => requireAuth(() => setShowCreateTrip(true))}
              >
                Create a trip
              </button>

              {/* A short, concrete answer to "what does this actually
                  do" — grounded in the three real areas of the app
                  (Explore, the itinerary, Budget), not generic
                  marketing copy. Text-only, reusing the existing
                  eyebrow/section-label style rather than a new one. */}
              <div className="hero-highlights">
                <div>
                  <p className="section-label">EXPLORE</p>
                  <p>Discover real places to visit in any city.</p>
                </div>
                <div>
                  <p className="section-label">PLAN</p>
                  <p>Build a day-by-day itinerary for every trip.</p>
                </div>
                <div>
                  <p className="section-label">TRACK</p>
                  <p>Keep your budget and expenses in one place.</p>
                </div>
              </div>
            </section>
          ) : isLoadingTrips ? null : visibleTrips.length === 0 ? (
            // No CTA button here — the empty state directly below (in
            // trips-section) already carries the "Create your first
            // trip" action, so this stays a lighter, purely-welcoming
            // intro rather than a second, redundant button.
            <section className="hero hero-welcome">
              <p className="eyebrow">WELCOME TO VOYAGE</p>

              <h1>Let's plan your first trip.</h1>

              <p className="hero-text">
                Add a destination, build your itinerary, and keep
                everything — places, activities and budget — in one place.
              </p>
            </section>
          ) : (
            <section className="returning-header">
              <div>
                <p className="section-label">DASHBOARD</p>
                <h2>{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h2>
                <p className="returning-header-text">
                  Ready for your next adventure?
                </p>
              </div>

              <button
                className="primary-button"
                onClick={() => requireAuth(() => setShowCreateTrip(true))}
              >
                Create a trip
              </button>
            </section>
          )}

          {/* Signed-out only — a signed-in dashboard (with or without
              trips yet) stays trip-focused; this is what gives a
              first-time visitor some visual depth and a concrete sense
              of what Explore actually offers before they sign in. */}
          {!auth.user && (
            <section className="destinations-section">
              <div className="section-heading">
                <div>
                  <p className="section-label">POPULAR DESTINATIONS</p>
                  <h2>Where travelers are headed</h2>
                </div>
              </div>

              <PopularDestinations onSelectDestination={goToExploreWithDestination} />
            </section>
          )}

          <section className="trips-section">
            <div className="section-heading">
              <div>
                <p className="section-label">YOUR TRIPS</p>
                <h2>Upcoming adventures</h2>
              </div>

              {/* Same navigation as the "My Trips" nav link — this is
                  the real trips view (there's no separate, longer trip
                  list to page to), so this used to be mislabeled onto
                  the "Create a trip" trigger above. It's a same-page
                  navigation today since this section only ever renders
                  on the dashboard itself, but it's still the correct,
                  real destination if that ever changes. */}
              <button className="secondary-button" onClick={goToDashboard}>
                View all
              </button>
            </div>

            {isLoadingTrips ? (
              <div className="empty-state is-loading">
                <h3>Loading your trips…</h3>
              </div>
            ) : visibleTrips.length === 0 ? (
              <>
                <div className="empty-state">
                  <div className="empty-icon">✈</div>

                  {auth.user ? (
                    <>
                      <h3>No trips yet</h3>

                      <p>
                        Start planning your next adventure and it will
                        appear here.
                      </p>

                      <button
                        className="primary-button"
                        onClick={() => requireAuth(() => setShowCreateTrip(true))}
                      >
                        Create your first trip
                      </button>
                    </>
                  ) : (
                    <>
                      <h3>Sign in to see your trips</h3>

                      <p>
                        Trip planning is tied to your account — sign in
                        (or create one) to view, create, and manage your
                        trips.
                      </p>

                      <button
                        className="primary-button"
                        onClick={() => requireAuth(() => setShowCreateTrip(true))}
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </div>

                {/* Only for a signed-in user with no trips yet — gives
                    the empty state something concrete to do besides
                    "Create your first trip", without touching the
                    signed-out empty state's own copy/behavior above. */}
                {auth.user && (
                  <div className="destinations-suggestion">
                    <p className="section-label">NOT SURE WHERE TO START?</p>
                    <PopularDestinations onSelectDestination={goToExploreWithDestination} />
                  </div>
                )}
              </>
            ) : ownedUpcomingTrips.length === 0 ? (
              // Reachable only signed in (visibleTrips is empty for a
              // signed-out visitor, caught by the branch above) — this
              // user has trips (owned-past, and/or shared ones showing
              // in their own section below), just none upcoming that
              // they own, so "No trips yet" would be inaccurate; their
              // trip history is still one scroll away in Past Trips
              // below.
              <>
                <div className="empty-state">
                  <div className="empty-icon">✈</div>

                  <h3>No upcoming trips</h3>

                  <p>
                    Your next adventure will show up here once you plan
                    one — your past trips are saved further down.
                  </p>

                  <button
                    className="primary-button"
                    onClick={() => requireAuth(() => setShowCreateTrip(true))}
                  >
                    Create a trip
                  </button>
                </div>

                <div className="destinations-suggestion">
                  <p className="section-label">NOT SURE WHERE TO START?</p>
                  <PopularDestinations onSelectDestination={goToExploreWithDestination} />
                </div>
              </>
            ) : (
              <div className="trip-list">
                {ownedUpcomingTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    onView={() => navigate({ view: 'dashboard', selectedTripId: trip.id })}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Only rendered once there's actually at least one shared
              trip — never an empty section. Reuses TripCard.jsx's own
              role/ownerName props (the same OWNER/EDITOR/VIEWER pill
              language TripPeopleSection.jsx's People list already
              established) rather than a second card component. */}
          {auth.user && sharedUpcomingTrips.length > 0 && (
            <section className="trips-section shared-trips-section">
              <div className="section-heading">
                <div>
                  <p className="section-label">SHARED WITH YOU</p>
                  <h2>Trips your friends have invited you to</h2>
                </div>
              </div>

              <div className="trip-list">
                {sharedUpcomingTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    role={trip.myRole}
                    ownerName={trip.ownerName}
                    onView={() => navigate({ view: 'dashboard', selectedTripId: trip.id })}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Only signed in, and only once there's at least one — a
              user with none yet never sees an empty "Past Trips"
              section cluttering the dashboard. Trip data itself is
              untouched: a past trip stays fully in Supabase, fully
              openable, with its itinerary/saved places/budget/expenses
              all intact — this only changes which list its card
              renders in. Owned and shared past trips stay one combined
              list here (unchanged from before) rather than splitting
              into a fourth section — a shared past trip's own card
              still shows its role/owner caption inline, just within
              the same list. */}
          {auth.user && pastTrips.length > 0 && (
            <section className="trips-section past-trips-section">
              <div className="section-heading">
                <div>
                  <p className="section-label">PAST TRIPS</p>
                  <h2>Where you've been</h2>
                </div>
              </div>

              <div className="trip-list">
                {pastTrips.map((trip) => {
                  const isShared = trip.ownerId !== auth.user?.id
                  return (
                    <TripCard
                      key={trip.id}
                      trip={trip}
                      isPast
                      role={isShared ? trip.myRole : undefined}
                      ownerName={isShared ? trip.ownerName : undefined}
                      onView={() => navigate({ view: 'dashboard', selectedTripId: trip.id })}
                    />
                  )
                })}
              </div>
            </section>
          )}

          {auth.user && (
            <DashboardFriendsSummary
              currentUserId={auth.user.id}
              onGoToFriends={goToFriends}
            />
          )}

          {auth.user && <DashboardRecentActivity currentUserId={auth.user.id} />}
        </main>
      )}

      {(showCreateTrip || isEditingTrip) && (
        <CreateTrip
          trip={isEditingTrip ? selectedTrip : undefined}
          trips={visibleTrips}
          onClose={() => {
            setShowCreateTrip(false)
            setIsEditingTrip(false)
          }}
          onSave={(tripData) => {
            if (isEditingTrip && selectedTrip) {
              handleUpdateTrip(selectedTrip.id, tripData)
            } else {
              handleCreateTrip(tripData)
            }
          }}
        />
      )}

      {showAuthDialog && (
        <AuthDialog
          initialMode={authDialogMode}
          isSupabaseConfigured={auth.isSupabaseConfigured}
          authError={auth.authError}
          onClose={() => {
            setShowAuthDialog(false)
            auth.clearAuthError()
          }}
          onSignIn={auth.signIn}
          onSignUp={auth.signUp}
          onResetPassword={auth.resetPasswordForEmail}
        />
      )}

      {showSignOutConfirm && (
        <ConfirmDialog
          title="Sign out?"
          message={`Signed in as ${auth.user?.email}. Your trips stay safely in your account — sign back in anytime to see them again.`}
          confirmLabel="Sign out"
          onConfirm={async () => {
            await auth.signOut()
            setShowSignOutConfirm(false)
          }}
          onCancel={() => setShowSignOutConfirm(false)}
        />
      )}

      {showDeleteAccountConfirm && (
        <ConfirmDialog
          title="Delete your account?"
          message={`This permanently deletes your Voyage account (${auth.user?.email}), your profile, and your friendships. Any trips you own — including their itinerary, saved places, and expenses — are deleted too, and any collaborators lose access to them. Trips you were only a collaborator on are unaffected for their owners. This can't be undone.`}
          confirmLabel="Delete account"
          destructive
          onConfirm={handleDeleteAccount}
          onCancel={() => setShowDeleteAccountConfirm(false)}
        />
      )}
    </div>
  )
}

export default App