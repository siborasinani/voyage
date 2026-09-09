# Voyage — Project Context

This file exists so a future coding session (human or AI) can understand
the app without reading prior chat history. Keep it updated as the app
changes — it should always reflect what's actually in the code, not what
was originally planned.

## 1. Project purpose and product vision

Voyage is a personal trip-planning web app: create trips, build a
day-by-day itinerary with real place data, track a budget, and keep a
list of places you want to visit before committing them to a specific
day. It's a portfolio/demo project. It started 100% client-side with no
backend and no accounts; a Supabase-backed account system and database
have since been layered in (see §7a), and the backend migration is now
complete (§7a.12): **trip functionality is account-required, and
Supabase is the single source of truth for all trip data** — every
trip and everything nested under it lives in Supabase only, and a
signed-out session has no access to any of it. There is no
`localStorage` fallback or duplicate copy of trip data anywhere
anymore — an earlier, transitional "move my local trips to my account"
migration system existed while the app was moving off `localStorage`,
but it (and the `localStorage`-based trip storage it migrated *from*)
has since been removed entirely, once every account was expected to
already be on Supabase — see §7a.13. Explore is the one deliberate
exception and remains fully public, no account needed — see §7a.1 for
the exact signed-out CAN/CANNOT list. It's meant to feel like a
serious, polished, minimal travel product (comparisons made during
development: Uber-style restraint, not a
cluttered travel-blog aesthetic).

## 2. Tech stack

- **React 19** + **Vite** (`@vitejs/plugin-react`), plain JavaScript
  (no TypeScript).
- **No router library** — but real, URL-based navigation, hand-rolled
  on the native History API (`utils/routing.js` + `App.jsx`; see §4/§8a)
  rather than a `react-router`-style dependency, matching this
  project's preference not to add one without a clear need for
  something this small (three page shapes). `App.jsx` still owns the
  page state (`view`: `'dashboard' | 'explore'`, plus `selectedTripId`
  for trip detail) — it's just now synced with `window.location` in
  both directions, so refresh/Back/Forward all work like a real
  multi-page site instead of always landing on `/`.
- **No state management library** — all state lives in `App.jsx` and is
  passed down via props. No Context API in use.
- **No CSS framework** — one hand-written stylesheet, `src/App.css`,
  using CSS custom classes (no Tailwind/CSS-in-JS). `src/index.css` is
  leftover scaffold boilerplate and is **not imported anywhere** (the
  import was deliberately removed from `main.jsx` — it was silently
  capping the whole app to 1126px width and forcing centered text via a
  stray `#root` rule). Leave that import removed.
- **ESLint** configured (`eslint.config.js`) with `react-hooks` plugin —
  `npm run lint` should stay clean. Notably enforces
  `react-hooks/set-state-in-effect`, which is strict about synchronous
  `setState` inside `useEffect` bodies (see `DestinationSearch.jsx` for
  a documented, deliberate `eslint-disable-next-line` where the pattern
  is legitimate).
- **Geoapify** (Geocoding, Autocomplete, Places APIs) is the source of
  truth for place data; **Pexels** (Search API) optionally supplies
  place photos (see §7). Both fetched directly with `fetch()`, no SDK.
- **`@supabase/supabase-js`** — accounts + database backend foundation
  (see §7a). The one real SDK dependency in the project (Geoapify/Pexels
  above are plain `fetch()`); added deliberately for this rather than
  hand-rolling auth/session handling.
- No test framework is set up.

## 3. Current features implemented

- Create / Edit / Delete a trip (name, destination, start/end dates).
- Dashboard listing trips; empty states throughout.
- Trip Details page: itinerary, Saved Places, Budget sections.
- Dynamic itinerary: one day-card per calendar day of the trip,
  computed from start/end dates (not stored).
- Activities: add/edit/delete per day, with start/end time, category
  (+ custom category), notes; sorted chronologically; overlap warnings.
- Saved Places: save a place to a trip without committing it to a day;
  "Add to itinerary" flow lets you pick a day afterward.
- Budget: optional total budget (amount + currency incl. EUR/USD/GBP/
  ALL-Lek), expense list (name, amount, category, date, notes) scoped
  to the trip's date range, spend-vs-budget progress bar, per-category
  breakdown.
- Explore: search/browse **real places** via Geoapify (destination
  search with autocomplete, recommended cities, category filters,
  in-city place search, Place Details modal, Save to Trip).
- Persistent top navbar (desktop nav-links + mobile hamburger menu),
  active-state highlighting.
- **Accounts** (Supabase-backed, see §7a): sign up/in/out via the
  navbar's profile button. Trip functionality is account-required —
  every trip and everything nested under it (activities, saved places,
  budget, expenses) exists in Supabase only, viewable and editable only
  while signed in; Explore is the one exception and stays fully public.
  See §7a.1 for the exact signed-out CAN/CANNOT list.
- Supabase persistence for all trip data (trips, saved places,
  activities, budget, expenses), signed-in only — there is no
  signed-out trip persistence anymore (see §7a.12). Page/navigation
  state is separate and unaffected: it's carried in the URL itself
  (see §4/§8a), which is what makes it survive a refresh without
  needing any storage, signed in or out.

## 4. Component structure

```
App.jsx                  — top-level state owner, navbar, URL-synced page state (see §8a)
  CreateTrip.jsx          — modal, also used for Edit Trip (isEditing = Boolean(trip))
  TripPage.jsx            — Trip Details: header, SavedPlaces, itinerary, BudgetSection
    SavedPlaces.jsx
      AddPlace.jsx        — manual "add a place" modal (not Explore-sourced)
      ConfirmDialog.jsx   — generic reusable confirm/destructive dialog
    AddActivity.jsx       — add/edit activity modal (also accepts `prefill` from a saved place)
    ConfirmDialog.jsx     — delete-trip confirmation
    BudgetSection.jsx
      SetBudget.jsx
      AddExpense.jsx
      ConfirmDialog.jsx   — delete-expense confirmation
  ExplorePage.jsx         — destination search/select + place grid
    DestinationSearch.jsx — free-text + Geoapify autocomplete dropdown
    PlaceCard.jsx
    PlaceDetails.jsx      — modal
    SaveToTripDialog.jsx  — per-trip save/unsave checklist
  ChooseDayDialog.jsx     — "which day?" picker used by SavedPlaces → itinerary

Shared form widgets (custom, replace native browser controls):
  CategorySelect.jsx      — custom dropdown (activity categories, currency, expense categories)
  DatePicker.jsx          — custom calendar popover (trip dates, expense date)
  TimePicker.jsx          — custom time popover, 12h display / 24h "HH:mm" value (activity times)

Services/utils:
  services/geoapify.js    — all Geoapify API calls + category mapping + normalization
  services/pexels.js      — Pexels photo search + session cache, keyed by place id
  utils/routing.js        — page state <-> URL mapping (getPathForState / parseLocation), see §8a
  utils/storage.js        — localStorage load/save
  utils/itinerary.js      — date parsing/formatting, getTripDays()
  utils/activities.js     — activity sort/overlap/category-label helpers
  utils/explore.js        — Explore-specific place filtering + Saved-Places conversion + category-rank assignment (getCategoryRanks, see §7)
  utils/budget.js         — currency formatting, expense totals/breakdown
  utils/date.js           — DatePicker calendar-grid helpers
  utils/time.js           — TimePicker 12h/24h conversion helpers
  utils/useDebouncedValue.js — generic debounce hook
  data/places.js          — EXPLORE_CATEGORIES, RECOMMENDED_DESTINATIONS (UI constants only)
```

Every custom picker (`CategorySelect`, `DatePicker`, `TimePicker`,
`DestinationSearch`) follows the same interaction pattern: click-outside
closes it (`mousedown` listener on `document`), `Escape` closes it,
selecting a value closes it and commits immediately. New pickers should
follow this same pattern for consistency.

## 5. State / data model

All top-level state lives in `App.jsx`:

```js
trips: Trip[]              // signed-in user's trips, loaded from Supabase (§7a) — empty, always, signed out
selectedTripId: string|null
view: 'dashboard' | 'explore'
showCreateTrip, isEditingTrip: boolean  // control the CreateTrip modal
isMobileMenuOpen: boolean
```

### Trip object shape

```js
{
  id: string,                // crypto.randomUUID()
  name: string,
  destination: string,       // free text, e.g. "Rome, Italy" — NOT validated/normalized
  startDate: string,         // "YYYY-MM-DD"
  endDate: string,           // "YYYY-MM-DD"
  activities: {              // keyed by RELATIVE day number (1, 2, 3…), not calendar date
    [dayNumber: number]: Activity[]
  },
  savedPlaces: SavedPlace[],
  budget: { amount: number, currency: string } | null,
  expenses: Expense[],
}
```

**Important:** `activities` is keyed by day number relative to the
trip's start date, recomputed from `startDate`/`endDate` on every
render via `getTripDays()` — days are never stored as absolute dates.
This means editing a trip's dates (shifting or shortening/extending)
naturally keeps each activity attached to the same relative day; if the
trip is shortened, activities on now-nonexistent days simply stop
rendering (they are **not deleted** — extend the dates again and they
reappear). See `App.jsx`'s `handleUpdateTrip`.

### Activity object shape

```js
{
  id: string,
  name: string,
  startTime: string,   // "HH:mm" 24-hour
  endTime: string,      // "HH:mm" 24-hour
  category: string,     // one of ACTIVITY_CATEGORIES, or 'Custom'
  customCategory: string, // only set when category === 'Custom'
  notes: string,
}
```

Legacy note: activities created very early in development used a single
`time` field instead of `startTime`/`endTime`. Several utils
(`utils/activities.js`, `utils/itinerary.js`) still fall back to `.time`
if `.startTime`/`.endTime` are absent, for backward compatibility with
any such data sitting in a user's `localStorage`. New code should only
ever write `startTime`/`endTime`.

### SavedPlace object shape

```js
{
  id: string,
  sourcePlaceId: string | undefined, // set only if saved from Explore — see §12
  name: string,
  category: string,        // ACTIVITY_CATEGORIES value (mapped from Explore's plural categories)
  customCategory: string,
  location: string,        // address or destination text
  notes: string,           // description text
}
```

### Expense object shape

```js
{ id: string, name: string, amount: number, category: string, date: string /* YYYY-MM-DD */, notes: string }
```

### Normalized Explore place shape (not persisted directly — see §12)

```js
{
  id: string,          // Geoapify place_id, or a lat:lon:name fallback
  name: string,
  destination: string, // the resolved city label
  country: string,      // '' or the geocoded country — only used to build a Pexels query (see §7)
  category: string,    // one of EXPLORE_CATEGORIES (Attractions, Restaurants, …)
  address: string,
  description: string,
  image: string,         // '' until Pexels optionally resolves one (see §7, §16)
  imageSource: string,   // 'none' | 'city' | 'fallback' — what kind of photo `image` is (see §7; never place-specific by design now)
  latitude: number,
  longitude: number,
}
```

## 6. localStorage structure

- **`voyage:trips` — removed, actively deleted, no longer used.** This
  used to be the app's only trip storage, then (during the account-
  required transition) migration source material; as of §7a.13 that
  entire local-trip system was removed. `src/main.jsx` now runs a
  one-time `localStorage.removeItem('voyage:trips')` on every app load
  (wrapped in try/catch, same tolerance as everything else here) —
  specifically so old, no-longer-reachable local trip data (e.g. a trip
  since deleted from Supabase) can never resurface or be offered for
  migration again. There is no `utils/storage.js` anymore (deleted along
  with the rest of the local-trip system) and nothing in the app reads
  or writes this key for any purpose.
- **Supabase's own session storage** (a `sb-<project-ref>-auth-token`
  style key, managed entirely by `@supabase/supabase-js` itself — see
  §7a) — Voyage's code never reads or writes this directly, only
  through the `supabase.auth` API (`services/supabase.js`,
  `utils/useAuth.js`). This is what makes a signed-in session survive a
  refresh. Untouched by the `voyage:trips` cleanup above.
- **`voyage:pexels-image-cache`** (see `services/pexels.js`, §7) —
  `{ version, pools: { [cityAndCategoryKey]: string[] } }`. `pools` is
  the shared city+category photo pools — the *only* thing cached, since
  a given place's actual image is a cheap, deterministic derivation
  from its pool (see §7), not something separately stored per place.
  Capped at a few hundred entries. Read once at module load, rewritten
  on every newly-fetched pool. `version` (currently `6` — see §7) gates
  the whole blob — a mismatch means an immediate full reset (not a
  migration). Don't bump it without a reason. Unrelated to
  trips/Saved Places — purely so a destination's pools survive
  scrolling, a destination switch, and a page refresh instead of being
  re-fetched. Untouched by the `voyage:trips` cleanup above.
- No Voyage-specific localStorage keys hold trip data anymore. The only
  two Voyage-owned keys left are Supabase's own session key and
  `voyage:pexels-image-cache`, both above — everything trip-related now
  lives in Supabase exclusively (§7a). Both keys fail silently
  (try/catch) if localStorage is unavailable or full — never something
  that should take the app down.

## 7. Geoapify integration (place data) and Pexels integration (place photos)

Geoapify and Pexels are deliberately independent: Geoapify is the sole
source of truth for place data (name, category, location, address), and
`normalizePlace` never depends on Pexels in any way. Pexels only ever
*optionally* supplies a photo for an already-normalized place. If Pexels
is unavailable, misconfigured, or returns nothing useful, every place
still works — it just renders with Voyage's own no-image fallback.

**Geoapify** — `VITE_GEOAPIFY_API_KEY` (Vite-prefixed, read via
`import.meta.env.VITE_GEOAPIFY_API_KEY` in `services/geoapify.js` only).
Set it in a local `.env` (gitignored); `.env.example` documents it for
anyone cloning the repo. Free tier: 3,000 credits/day, billed per place
returned. All API logic is centralized in `src/services/geoapify.js`:
  - `geocodeCity(query)` — `/v1/geocode/search`, resolves free text to
    `{ label, country, lat, lon }` or `null`.
  - `autocompleteCity(query)` — `/v1/geocode/autocomplete`, filtered to
    `result_type === 'city'` (excludes sub-district noise like
    "Municipio Roma I"), returns
    `{ label, primaryText, secondaryText, country, lat, lon }[]`.
  - `searchPlacesNearCity({ lat, lon, voyageCategories, limitPerCategory })`
    — `/v2/places`. **Issues one request per Voyage category in
    parallel** (not one combined request) — this is deliberate: a single
    shared-limit combined request lets a dense category (Attractions in
    a historic center) crowd out sparse ones (Shopping, Nightlife)
    entirely, confirmed live for both Rome and Tirana. Default
    `limitPerCategory` is 8.
  - `normalizePlace(feature, voyageCategory, destinationLabel, destinationCountry)`
    — the single normalization function; the rest of the app never
    touches raw Geoapify properties. `country` (from geocoding) exists
    purely so the Pexels service below can build a more specific search
    query — nothing else in the app uses it. `image` starts `''` and
    `imageSource` starts `'none'` here — both are filled in separately
    (and optionally) by the Pexels service.
  - `VOYAGE_TO_GEOAPIFY_CATEGORIES` — the category mapping table (see
    §9). Includes an unused `Hotels` entry kept ready for when/if a
    Hotels filter is added to the UI.
  - **API key never appears** outside this one file (not in JSX, CSS, or
    any committed source).

**Pexels** — `VITE_PEXELS_API_KEY` (Vite-prefixed, read via
`import.meta.env.VITE_PEXELS_API_KEY` in `services/pexels.js` only, and
nowhere else). Set it in a local `.env` (gitignored); `.env.example`
documents it. Free tier: 200 requests/hour, 20,000/month. All logic is
in `src/services/pexels.js`.

**Architecture — city+category image pools, no per-place requests
(rewritten again; this is the important part to understand before
touching this file again).** An earlier version gave every place its
own background "specific search" — reliable (queues drained correctly,
no card ever got stuck — confirmed via live diagnostics), but request
volume scaled with place count: a 48-place destination cost ~50-60
requests, and visiting several large destinations in one session
reliably crossed Pexels' free-tier 200/hour limit by the 3rd or 4th
city (confirmed live by reproducing that exact condition). The fix:
every place's image comes from a *shared* pool fetched once per
`(city, category)` — one search for `"Budapest cafe coffee"` serves
every cafe in Budapest, not one search per cafe. A destination with
~48 places across, say, 8 represented categories now costs roughly 8
requests total, not 48-60 — confirmed live: exactly 8 requests per
destination across a Rome → Stockholm → Budapest → London → Paris
sequence (40 total for all five, vs. what would have been ~250-300
under the old design), every destination fully imaged, zero requests
needed again on a later revisit or a full page refresh.
  - **No more per-place search, deliberately** — including no
    "well-known landmark gets its own search" exception. That was
    considered and left out on purpose: doing it reliably needs either
    real landmark detection (heuristics prone to false positives/
    negatives) or an extra request to verify a place is one (defeats
    the point of reducing requests). Low API usage and reliability
    matter more here than that extra polish — if it's ever revisited,
    it must not reintroduce a per-place request as the default path.
  - **Query keywords per category** (`CATEGORY_QUERY_KEYWORDS`), tuned
    for genuinely relevant travel imagery rather than plain city
    scenery: `Attractions` → `"landmarks travel"`, `Restaurants` →
    `"restaurant food"`, `Cafes` → `"cafe coffee"`, `Museums` →
    `"museum architecture"`, `Nightlife` → `"nightlife city"`,
    `Shopping` → `"shopping street"`, `Beaches` → `"beach"`, `Nature` →
    `"nature outdoors"`, `Hotels` → `"hotel"` — appended to the city
    name (`"<city> <keyword>"`) to form the pool query. If a category
    pool comes up empty (or every request for it fails), falls back
    once more to a plain `"<city> travel"` pool before giving up —
    confirmed live: a category pool forced to 429 correctly fell back
    to the travel pool, still 100% imaged, zero stuck.
  - **Group-based deterministic assignment, not a request** (rewritten
    once more — a real, confirmed repetition, since fixed): each place
    used to pick its pool photo independently, via
    `hashString(place.id) % pool.length` — a stable function of the
    place alone, but with no visibility into which *other* places
    shared its pool, so two (or more) places could easily hash onto the
    same index even with plenty of the pool's other photos never used —
    confirmed live in a Paris screenshot (the same Sacré-Cœur photo on
    several different attraction cards). Fixed with
    `pickByRank(pool, categoryRank)` — `pool[categoryRank %
    pool.length]`, where `categoryRank` is this place's stable 0-based
    position among every place sharing its exact (city, category) —
    computed by `getCategoryRanks(places)` in `utils/explore.js`, from
    the *full*, unfiltered place list (see below for why), and passed
    down `ExplorePage.jsx` → `PlaceCard.jsx`/`PlaceDetails.jsx` →
    `getPlaceImage(place, categoryRank)`. With N places and a pool of
    at least N photos, ranks 0..N-1 land on distinct pool indices
    0..N-1 — guaranteed no repeats, not just statistically unlikely
    ones — and only once N exceeds the pool size do ranks start
    wrapping back onto an already-used photo (necessary reuse, never
    gratuitous). `getCategoryRanks` ranks by each place's own *id*
    (sorted), not by array/discovery order — Geoapify's response order
    and lazy-load/scroll order aren't guaranteed stable, but id-sorting
    is, which is what keeps "same place → same rank → same photo"
    true across a refresh and a revisit. Computed from the *full*
    `places` list, not the search/category-filtered `visiblePlaces` —
    otherwise a place's rank (and therefore its assigned photo) could
    shift depending on transient UI state like the search box's
    contents, which must never affect a stable assignment. If no rank
    is available (an edge case with no current caller), `pickByRank`
    falls back to the old per-place hash — still deterministic, just
    without the group-wide guarantee. The rare destination-wide
    "travel" fallback tier (below) still uses the old hash directly —
    its "group" (whichever categories happen to fail) isn't knowable in
    advance, and it's hit rarely enough that the extra plumbing isn't
    worth it. `IMAGE_POOL_SIZE` bumped 15 → 35 alongside this — more
    requested photos per pool costs nothing extra (still one request
    per pool either way) and gives rank-based assignment far more room
    before any category needs to reuse a photo. The pool itself is
    shuffled once, deterministically (seeded by its own city+category
    key — `deterministicShuffle`, mulberry32), right when it's fetched
    (not at pick time), so which photo lands on rank 0 varies by pool
    rather than every category everywhere opening with Pexels' single
    top-ranked result — confirmed live (a mock exposing each photo's
    original, unshuffled Pexels position) that rank 0 mapped to
    original index 31, not 0. Confirmed live end-to-end: a 40-place
    category against a 35-photo pool got exactly 35 unique images (the
    true maximum); two smaller categories (6 and 8 places) against the
    same-size pool got 6/6 and 8/8 unique; request count for all three
    categories combined stayed at exactly 3 (unchanged — this is purely
    a smarter *assignment*, not a change to request volume); a full
    page refresh reproduced every one of 54 assignments identically,
    with zero new requests.
  - **One queue, not three** — `poolQueue`
    (`createQueue('pool', 4, 10000)`) is now the *only* queue: a
    place's own resolution is just "await its pool, then pick" (no
    network call of its own), so there's nothing left that could
    recursively enqueue into the same queue it's already occupying a
    slot in. This is what let the previous place-level queue
    (`fallbackQueue`, which used to hold one job per place, each of
    which awaited a pool fetch) be *removed* rather than reworked —
    its entire purpose (bounding concurrent per-place network jobs)
    stopped applying once there were no more per-place network jobs to
    bound. `createQueue` itself (the actual safety mechanism —
    finally-based slot release, per-job timeout, `cancelPending`) is
    untouched from the version that fixed a real, confirmed deadlock
    from routing a pool fetch through the same queue whose slots were
    held by the place jobs awaiting it (see the `git`/prior-session
    history if resurrecting a per-place queue is ever considered —
    that mistake is exactly what made cards silently stop progressing
    partway through a destination).
  - **Timeouts**: `REQUEST_TIMEOUT_MS` (8s) aborts each individual
    `fetch()` via `AbortController` — a hung request becomes an
    ordinary `failed: true` outcome rather than hanging forever.
    `poolQueue`'s own job-level timeout (`POOL_JOB_TIMEOUT_MS`, 10s) is
    a second, independent ceiling at the queue level itself. A job
    settling via either timeout always *resolves* (never rejects) as
    `inconclusive: true`, so it's never cached as a false permanent
    failure — the next lookup for that pool tries again.
  - **Failure vs. genuine empty result**: a request that fails outright
    (network error, timeout, non-2xx status *including a 429 rate
    limit*, unparsable body) is tracked separately (`inconclusive`)
    from one that succeeded but had nothing to offer. Only the latter
    is ever cached permanently.
  - **Caching — pools only, no separate per-place cache**: `poolCache`,
    `"<city>|<categoryKeyword>"` → `string[]`, persisted to
    `localStorage` (see §6) so a pool survives scrolling, a destination
    switch, and a full page refresh. There's deliberately no separate
    per-place result cache anymore (an earlier `resultCache` was
    removed) — since a place's image is a cheap, pure derivation from
    its (already-cached) pool, caching it again per place added a
    whole extra bookkeeping layer for no real benefit. `poolInFlight`
    (a `Map` of in-flight pool-fetch promises) dedupes concurrent
    callers needing the same pool — several places in the same
    category becoming visible at once, or a card and an already-open
    Place Details view — into one request chain.
  - **Cache versioning / reset**: `CACHE_VERSION` (currently `6`) gates
    the whole persisted blob — a mismatch (or corrupted JSON) means a
    full, immediate reset (written back right away, not just held in
    memory until the next unrelated write), never a field-by-field
    migration. Touches **only** the `voyage:pexels-image-cache` key.
    Version history: v2 (missing-key results wrongly cached as
    permanent), v3 (no request timeout yet), v4 (the fallback-first +
    background-upgrade rewrite — `places` + `pools`), v5 (`places`
    dropped entirely, `pools` is the whole cache), v6 (`IMAGE_POOL_SIZE`
    15 → 35, and pools are now shuffled once at fetch time — an old v5
    pool has too few photos and the wrong order for rank-based
    assignment, so it's not reused).
  - **Per-destination request-volume logging** (point of this rewrite,
    so it's directly verifiable): every dispatched request increments
    a counter (`destinationRequestCount`); `cancelPendingLookups()`
    (called on every destination change) logs
    `devLog('destination-request-summary', { totalRequests })` and
    resets it to 0. Confirmed live: exactly 8 per destination for a
    48-place, 8-category test city (one request per category actually
    represented, matching the target in this rewrite's brief), 2 when
    a category pool failed and correctly fell back to the travel pool.
  - **Temporary diagnostics**: `devLog(event, data)`, gated on
    `import.meta.env.DEV` (compiles out of production entirely), covers
    the queue (`request-queued`/`request-started-from-queue`/
    `queue-slot-freed`/`queue-job-timeout`), `cache-hit`/`-miss`/
    `resolved`/`cache-reset`, `destination-changed`, and
    `destination-request-summary` above — never logs the key itself,
    only whether one is present (`hasApiKey`). `PlaceCard.jsx` has a
    parallel, separate `devLog` (prefixed `[explore-lazy]`, same
    dev-only gating) for `card-observed`/`card-entered-viewport`. Safe
    to leave (dev-only), but remove the calls (or either whole block) if
    they're no longer needed for active debugging.
  - **`getDiagnosticsSnapshot()`** (exported, dev-only-exposed as
    `window.__pexelsDiagnostics()`) — a read-only snapshot of
    `poolQueue`'s `{active, pending}`, `poolCache`/`poolInFlight` sizes,
    and the current `destinationRequestCount`. `PlaceCard.jsx` has a
    matching `window.__exploreObservedCount` for how many cards
    currently have a live (not-yet-triggered) `IntersectionObserver` —
    both were built to investigate a real "images get increasingly
    incomplete by the 3rd/4th destination" report and confirmed, at the
    time, that nothing in the queue/cache/observer layer was
    accumulating; the actual cause then was Pexels rate limiting driven
    by per-place request volume — this rewrite is the fix for that root
    cause, not just a diagnosis.
  - **Where it's called, and lazy-loading**: `PlaceCard.jsx` gates its
    lookup on a per-card `IntersectionObserver` (`rootMargin: '400px
    0px'`, a head start before a card is actually on-screen) rather
    than firing unconditionally on mount — each card owns its own
    observer instance (never one shared/global observer that could get
    disconnected for everyone after the first batch), unobserved
    immediately once triggered, cleaned up via its own effect's unmount
    (destination or category change). `PlaceDetails.jsx` still fetches
    unconditionally on mount (no viewport concept applies to a modal
    that's already fully visible by definition), but shares the same
    pool cache, so opening a place whose card already resolved (or is
    still resolving) its category's pool costs zero extra requests.
    Either component calling `onImageEnriched?.(placeId, image,
    source)` lets `ExplorePage.jsx`'s `handleImageEnriched` patch that
    place's `image` **and** `imageSource` into the live `places` state
    and any matching cached destination, so every other instance with
    the same id (grid card, details view, destination cache) picks it
    up too.
  - **Destination-change cancellation**: `cancelPendingLookups()`
    (called from `ExplorePage.jsx` — both `loadDestination` branches,
    right after the new destination is confirmed real, and
    `changeDestination`) drops every not-yet-started job in
    `poolQueue`, resolving each as inconclusive immediately — the cards
    that requested them have already unmounted. Already-*running* jobs
    (at most `MAX_CONCURRENT_POOL_LOOKUPS` of them) are left to finish
    naturally, already bounded by the timeouts above, so this is a
    small, bounded handover delay, never a permanently "busy" queue.
  - **Never fabricating specificity**: `imageSource` exists precisely so
    the UI itself knows the difference — `PlaceCard.jsx`/
    `PlaceDetails.jsx` render a small "Budapest"-style badge
    (`.place-image-source-badge`) over an image whose source is `'city'`
    or `'fallback'` — which, since there's no more place-specific
    search, is now *every* image with a source at all (`'none'` is the
    only other possibility). A destination photo is a reasonable,
    acknowledged visual fallback — it's just never allowed to read as
    if it depicted the specific business, so the badge always shows
    honestly rather than only sometimes.
  - **Persistence into Saved Places**: `utils/explore.js`'s
    `toSavedPlace` copies both `place.image` and `place.imageSource`
    onto the saved-place object, so if a place already had a resolved
    image at the moment it was saved to a trip, that URL (and its
    honest source) travels into `localStorage` too (Saved Places' own
    UI is currently text-only and doesn't render it, but it's there if
    a future feature needs it).
  - **Attribution**: a small "Photos from Pexels" link renders below
    the place grid whenever there are visible places (`.pexels-attribution`
    in `App.css`) — required by Pexels' API terms, kept deliberately
    quiet, and never implies Pexels is the source of the place data
    itself.
- **Failure/loading handling** (shared by both services' consumers):
  `PlaceCard.jsx` and `PlaceDetails.jsx` each track `isLoadingImage`
  (pulsing neutral box while a lookup is in flight) and `imageFailed`
  (set by the `<img>`'s `onError`, e.g. an expired or broken URL) —
  falling back to the same neutral gradient box (category label, no
  emoji, no broken-image icon) either way. That fallback is sized
  identically to the real-photo area in the same context (160px card /
  260px details) so the grid never jumps around depending on which
  cards have images or are still loading one.

## 7a. Supabase integration (accounts + trips backend foundation)

Added as a foundation for future multi-user collaboration (shared
trips, editor/viewer roles, shared expenses, realtime), built
incrementally and additively — every milestone kept the signed-out,
`localStorage`-only experience completely intact. Five milestones done
so far:

1. **Accounts foundation** — Supabase client, `useAuth`, sign in/up/out
   UI, schema + RLS created (no trip data moved yet, nothing gated).
2. **Authentication gating** — creating/modifying trips, activities,
   expenses, budget, and saved places requires being signed in.
3. **Trips migration** — the trip list itself (id/name/destination/
   dates/budget) moved to Supabase for a signed-in user.
4. **Saved places migration** — same treatment for saved places.
5. **Activities migration** — same treatment for the itinerary.

See §7a.10 for exactly what's next.

### 7a.1 Authentication

- **Client** (`src/services/supabase.js`): the one place
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are read (see
  `.env.example`), matching how `services/geoapify.js`/`services/pexels.js`
  each own their one API key. `supabase` is `null` (not a thrown error)
  when those env vars are missing, so a fresh clone without Supabase
  configured still runs every other feature normally — the auth UI just
  shows a "not set up" message instead. **Only the anon/public key ever
  belongs here — the service_role key must never appear anywhere in
  `src/`** (it bypasses Row Level Security and has no legitimate
  frontend use).
- **Auth state** (`src/utils/useAuth.js`): a plain hook (no Context
  provider — consistent with the app's "all state in `App.jsx`, passed
  down via props" convention), called once in `App.jsx`. Exposes
  `user`/`session`/`isLoadingSession`, `signUp`/`signIn`/`signOut`
  (each returns `{ success, data? }` — `data.session` is what a caller
  uses to tell "already have a session" apart from "signed up, but this
  project requires confirming by email first"), and `authError`.
  Session persistence across a refresh is Supabase's own default
  (`persistSession`/`autoRefreshToken`, spelled out explicitly in
  `services/supabase.js`) — it reads the session back out of its own
  `localStorage` key (see §6) on load, and `useAuth`'s
  `onAuthStateChange` listener reflects that into React state.
- **UI** (`src/components/AuthDialog.jsx`): sign in/up, one form + a
  mode toggle, following `CreateTrip.jsx`'s existing modal/form
  conventions rather than introducing a new pattern; reuses the
  existing generic `ConfirmDialog.jsx` for the sign-out confirmation.
  Both wired to the navbar's `.profile-button` in `App.jsx` (previously
  a static, unwired "S" placeholder) — signed out shows "S" and opens
  `AuthDialog`; signed in shows the first letter of the user's email
  and opens the sign-out confirmation instead.
- **Auth gating** — two separate mechanisms, for two separate concerns
  (see §7a.12 for the audit that made this split explicit):
  - **Actions** — `App.jsx` defines one `requireAuth(action)`: signed
    out, opens `AuthDialog`; signed in, runs `action`. Passed down as a
    single `requireAuth` prop (to `TripPage`, `BudgetSection`,
    `ExplorePage`) rather than each component importing `useAuth` and
    duplicating the check — they just call `requireAuth(() =>
    actuallyDoIt())` at each button that creates or modifies personal
    data.
  - **Viewing trip data** — not gated through `requireAuth` (there's no
    button click to intercept); instead, trip data is account-required
    at the source: `App.jsx`'s `visibleTrips = auth.user ? trips : []`
    is the single value every trip-rendering path reads (dashboard's
    trip list, `selectedTrip`, `ExplorePage`'s `trips` prop) — a
    signed-out session simply has nothing to render. `localStorage`
    isn't even a factor anymore, on top of that (§7a.13): there's no
    trip data left in it to render in the first place.
  - **Signed-out users CAN**: browse Explore fully (search, filter,
    view Place Details).
  - **Signed-out users CANNOT**: view the dashboard's trip list; open
    any trip's detail page (itinerary, saved places, budget, expenses)
    — a direct `/trips/:id` hit (URL bar, bookmark, browser history)
    redirects to the dashboard with no trip data ever rendered, not
    even momentarily; create, edit, or delete a trip; add/edit/delete
    an activity, saved place, or expense; set/edit a budget. Attempting
    any mutation opens `AuthDialog` instead of performing the action.
  - Signed-in, every one of those actions and views works normally,
    with no other change to the UI.

### 7a.2 Database schema & relationships

`supabase/migrations/*.sql`, numbered, each run once by hand in the
Supabase dashboard's SQL Editor, in order (no migration CLI/tool wired
up — see §7a.9's constraint on how a *new* one gets added). `trips` is
the hub; everything else hangs off it via `trip_id`.

- **`profiles`** — one row per `auth.users` row (`id` = the auth user's
  own id), auto-created on sign-up via an `on_auth_user_created`
  trigger (`handle_new_user()`). `display_name`/`avatar_url`.
- **`trips`** — `id`, `owner_id` (→ `auth.users`), `name`,
  `destination`, `start_date`, `end_date`, `budget_amount`/
  `budget_currency` (mirrors `trip.budget`'s `{ amount, currency }`,
  null until set), `created_at`/`updated_at`. Field names map directly
  onto the existing client-side Trip shape (§5). Also still has a
  `local_id` column (added by migration `0002`) — this was bookkeeping
  for a local-to-Supabase trip migration system that has since been
  removed entirely (§7a.13); the column is legacy/inert on any row that
  still has a value from before the removal, nothing reads or writes it
  anymore, and it was deliberately left in place rather than dropped
  (removing it wasn't necessary for the removal and would have meant an
  unrequested schema change).
- **`trip_members`** — `trip_id`, `user_id`, `role` (`owner`/`editor`/
  `viewer`). An `on_trip_created` trigger (`handle_new_trip()`)
  auto-adds the trip's owner here the moment a trip is inserted, so
  "the owner is always a member too" never needs special-casing
  anywhere else. This table is what every RLS policy below is scoped
  through. As of migration `0006` (§23), its INSERT/DELETE policies
  were tightened for trip sharing — see §23 for exactly what changed
  and why; no column/table change.
- **`saved_places`** — `trip_id`, `source_place_id` (Geoapify
  `place_id`, only set for an Explore-sourced place), `name`,
  `category`, `custom_category`, `location`, `notes`, `image`,
  `image_source`. Mirrors `trip.savedPlaces` (§5) field-for-field.
- **`activities`** — `trip_id`, `day_number` (the same relative day
  number `trip.activities` is keyed by client-side — never an absolute
  date), `name`, `start_time`, `end_time` (Postgres `time`, returned as
  `"HH:MM:SS"` — trimmed to `"HH:MM"` in `tripsRepository.js`),
  `category`, `custom_category`, `notes`, `created_at`/`updated_at`.
- **`expenses`** — `trip_id`, `name`, `amount`, `category`,
  `expense_date`, `notes`, `paid_by` (→ `auth.users`, nullable — `null`
  for a personal expense, set for a shared one; see §24). In full use
  since the original Expenses migration (§7a.5); `paid_by` specifically
  since §24.
- **`expense_participants`** — `expense_id`, `user_id`, `share_amount`.
  In use since §24 (shared expenses) — a row per participant on a
  shared expense; an expense with zero rows here is a personal one (no
  separate flag). Was schema-only, unused by any app code, before §24.
- **`trip_invitations`** — in full use since §29. Originally
  scaffolded in `0001_init.sql` for an email-based invite flow no app
  code ever wired up; §29 adapted it to a user-id-based (existing-
  friend) flow instead, leaving the original `invited_email` column
  and its now-`nullable` constraint intact for a hypothetical future
  feature rather than dropping it. `trip_id`, `invited_by`,
  `invited_user_id` (→ `auth.users`, added by §29), `role`
  (`editor`/`viewer`), `status` (`pending`/`accepted`/`declined`),
  `created_at`. This is now the sole path to becoming a non-owner
  `trip_members` row — see §29.
- **`notifications`** (migration `0012`, §29) — the one genuinely new
  table this project has added since Recent Activity's
  `activity_events` (§28). Scoped narrowly: only the two notification
  types with no natural "pending state" to derive from
  (`invitation_accepted`/`invitation_declined`) — friend-request and
  trip-invitation "you have something waiting" notices stay purely
  derived from `friendships`/`trip_invitations`' own pending rows, zero
  storage. See §29 for the full derived-vs-persisted reasoning.
- **`friendships`** (migration `0005`) — `requester_id`/`recipient_id`
  (→ `profiles`, not `auth.users` directly — see §21), `status`
  (`pending`/`accepted`/`declined`), `created_at`/`updated_at`.
  Completely independent of `trip_members`/`trip_invitations` — a
  friendship never involves, grants access to, or is scoped through any
  trip. See §21 for the full shape/RLS/repository/UI.

### 7a.3 Row Level Security model

Every table above has RLS enabled. Every policy is scoped through
`trip_members` — a user can only see or write a trip (or anything
hanging off it) if they have a `trip_members` row for it. **There is no
"any authenticated user can read/write every trip" policy anywhere.**
Read access covers every role (owner/editor/viewer); write access
(insert/update/delete) requires `owner` or `editor`; trip deletion is
`owner`-only.

Two `security definer` SQL functions do the actual checking:
`is_trip_member(trip_id)` and `trip_role(trip_id)`. This indirection is
required, not stylistic — a plain policy on `trip_members` that queries
`trip_members` itself to check membership causes Postgres's "infinite
recursion detected in policy" error; a `security definer` function
runs the lookup with the function owner's privileges, sidestepping
that, while still only ever answering a yes/no membership question
(never exposing raw rows).

`profiles` is the one deliberately open table: any signed-in user can
read any profile's name/avatar (needed to eventually show a trip
member's identity to their fellow members) — never trip data itself.

**RLS grants a role access *within* what it's already been given at
the table level — it does not grant that access itself.** This was the
source of a real, initially-confusing bug (see §7a.4, migration 0003):
a table can have perfectly correct RLS policies and still reject every
query with "permission denied" if the `authenticated` role was never
`GRANT`ed base table privileges. Keep this in mind before adding any
new table.

### 7a.4 Migrations applied so far

Each file's own header comments have the full narrative; this is the
one-line-each summary:

- **`0001_init.sql`** — base schema: all tables in §7a.2, RLS enabled
  and policies created on each, the two helper functions, the
  auto-membership and auto-profile triggers.
- **`0002_trips_local_id.sql`** — adds the `local_id` column and a
  unique index on `(owner_id, local_id)` to `trips`, for local-trip
  migration dedup. That migration system has since been removed
  entirely (§7a.13) — the column and index are legacy, left in place
  but no longer read or written by anything.
- **`0003_fix_trips_access.sql`** — **fix**: `0001` enabled RLS on
  every table but never `GRANT`ed the `authenticated` role table-level
  privileges at all, so every query failed with "permission denied for
  table trips" regardless of how correct the RLS policies were. Grants
  select/insert/update/delete on every table to `authenticated`. Also
  fixes the `local_id` unique index from `0002`: it was a *partial*
  index (`where local_id is not null`), which Postgres can't use as an
  `ON CONFLICT` target from a plain column-list — Supabase's
  `upsert(...).onConflict(...)` doesn't send the matching `WHERE`
  clause needed to infer a partial index. Replaced with a full
  (non-partial) unique index — functionally identical for this case,
  since standard SQL never treats `NULL = NULL` as a match in a UNIQUE
  constraint, so normally-created trips (`local_id` always null) still
  never collide with each other.
- **`0004_fix_trips_select_policy.sql`** — **fix**: a brand-new trip's
  own `INSERT ... RETURNING` (what `createSupabaseTrip`'s
  `.insert().select()` sends) failed RLS even though the INSERT
  policy's own `WITH CHECK (owner_id = auth.uid())` was independently
  confirmed true. Root cause: `RETURNING` implicitly also requires the
  table's *SELECT* policy to pass for the new row — and that policy
  was `using (is_trip_member(id))`, which only becomes true once the
  `on_trip_created` trigger has inserted the owner's `trip_members`
  row. That's an `AFTER INSERT` trigger, and its effect isn't visible
  yet to the same statement's own `RETURNING` clause. Fixed by adding
  `owner_id = auth.uid()` as a direct, immediate alternative in the
  SELECT policy — the owner can now see their own just-created trip
  without waiting on the trigger's side effect at all.

A related **app-code** (not SQL) bug, found while verifying saved
places survive a refresh, is documented in §8a rather than here: a
signed-in user refreshing on any `/trips/:id` page used to bounce to
the dashboard, because routing validated the URL's trip id against
`trips` before the async Supabase fetch had loaded it.

### 7a.5 Current persistence status

| Data | Signed-in | Signed-out |
|---|---|---|
| Trips (name/destination/dates) | **Supabase** — loads from, and every create/edit/delete writes to, `trips` | **No access** — not shown, not readable, not editable |
| Saved places | **Supabase** — `saved_places` table | **No access** |
| Activities | **Supabase** — `activities` table | **No access** |
| Budget | **Supabase** — `trips.budget_amount`/`budget_currency`, live create/edit | **No access** |
| Expenses | **Supabase** — `expenses` table, live create/edit/delete | **No access** |

Every nested trip data type is Supabase-backed for a signed-in user.
`handleAddExpense`/`handleUpdateExpense`/`handleDeleteExpense`
(`App.jsx`) call `createSupabaseExpense`/`updateSupabaseExpense`/
`deleteSupabaseExpense` (`tripsRepository.js`) and store back whatever
Supabase returns, same pattern as activities — a new expense's real id
is whatever the insert returns, not AddExpense.jsx's client-generated
one. Budget calculations (`utils/budget.js`'s `getTotalSpent`/
`getSpendingByCategory`/`sortExpensesByDate`) are untouched: they
operate on `trip.expenses` exactly as before.

**Signed-out is "no access," not "localStorage fallback"** — this was
a deliberate product decision (audited and enforced in §7a.12, then
taken further in §7a.13): trip functionality is account-required, so a
signed-out session has zero trip data available to show or edit, full
stop. There's no `localStorage` involved at all anymore, in any
capacity — see §6 and §7a.13.

### 7a.6 Local-to-Supabase migration — **removed**

This section used to document an explicit "Move my local trips to my
account" banner and `migrateLocalTripsToSupabase`, which one-time-
copied a signed-in user's leftover `localStorage` trips into Supabase.
That entire system — the banner/UI, the migration function, the
`local_id` comparison logic that drove the banner's visibility, and the
underlying local trip loading/persistence helpers it depended on — has
been removed completely. See §7a.13 for what was removed, why, and how
it was verified. Supabase is now the only source of truth for trip
data, with no local-to-Supabase migration path of any kind.

### 7a.7 Repository / data-access architecture

`src/services/tripsRepository.js` is the **one and only** place
`App.jsx` goes through for trips, saved places, activities, budget,
and expenses — components never call Supabase directly, and there is
no `localStorage` involvement for trip data anywhere in the app at all
(§7a.13). `utils/storage.js` (the old `loadTrips`/`saveTrips`
localStorage helpers) no longer exists — it was deleted along with the
rest of the local-trip system.

- `getSupabaseTrips()` — the signed-in read path. Fetches `trips`,
  `saved_places`, `activities`, and `expenses` in parallel
  (`Promise.all`, one request each — not one per trip), then groups
  the latter three onto each trip client-side (`saved_places` and
  `expenses` by `trip_id`; `activities` two levels deep, by `trip_id`
  then `day_number`) so the returned objects land exactly on the
  existing client-side Trip shape (§5) with no changes needed anywhere
  downstream.
- `createSupabaseTrip`/`updateSupabaseTrip`/`deleteSupabaseTrip`,
  `createSupabasePlace`/`deleteSupabasePlace`,
  `createSupabaseActivity`/`updateSupabaseActivity`/
  `deleteSupabaseActivity`, `updateSupabaseBudget`,
  `createSupabaseExpense`/`updateSupabaseExpense`/
  `deleteSupabaseExpense` — one function per mutation, each a thin
  wrapper around a single Supabase call plus a row↔client-shape mapping
  function (`fromRow`/`toFields`, `fromPlaceRow`/`toPlaceFields`,
  `fromActivityRow`/`toActivityFields`, `toBudgetFields`,
  `fromExpenseRow`/`toExpenseFields`). `updateSupabaseBudget`
  deliberately updates only `budget_amount`/`budget_currency` on the
  trip row (via `toBudgetFields`, kept separate from `toFields`) so it
  can never clobber the trip's name/destination/dates or vice versa —
  same reasoning as keeping each mutation its own function instead of
  one do-everything trip update.
- Row Level Security (§7a.3) already restricts every query to what the
  signed-in user is allowed to see — no query in this file adds an
  explicit `.eq('owner_id', ...)` filter for that; it's enforced at the
  database level, not trusted to app code.

Row↔client-shape mapping is direct and field-for-field in every case —
the tables were designed against the existing local shapes (§5) from
the start, so no data model changes were needed to add any of the four
migrations so far. Postgres's `time` columns come back as `"HH:MM:SS"`,
trimmed to the app's `"HH:MM"` convention in `fromActivityRow`;
`expense_date` is a plain `date` column, so it needs no such trimming —
PostgREST already returns it as the bare `"YYYY-MM-DD"` the client has
always used.

### 7a.8 Image architecture

Unrelated to and untouched by any of the above — see §7 for the full
detail (Geoapify place data + the current Pexels city+category pool
photo strategy). Summarized in §7a.8 only because it's a commonly
confused adjacent system: Geoapify/Pexels have **no Supabase
involvement at all** — they remain pure external-API integrations, and
none of the backend milestones above have touched `services/geoapify.js`,
`services/pexels.js`, or their queue/cache internals.

### 7a.9 Constraints specific to backend work

- **Never modify `.env` or existing API keys casually** — Geoapify/
  Pexels keys are unrelated to Supabase work and must never be touched
  while working on it; adding the two `VITE_SUPABASE_*` keys was the
  one deliberate addition, done once, in the accounts-foundation
  milestone.
- **No new dependencies without a clear, stated reason** —
  `@supabase/supabase-js` was the one exception (see §2), added
  deliberately rather than hand-rolling auth/session handling; don't
  add anything else the same way without equally clear justification.
- **Migrate one data type at a time** — each milestone (trips → saved
  places → activities → budget → expenses) was scoped to exactly one
  nested-data type, fully tested end-to-end, before starting the next
  (the closing audit, §7a.12, was itself scoped this same way — verify
  first, change only what's found broken). Keep this discipline for any
  future backend work too: don't combine unrelated changes into one pass.
- **Keep unrelated systems untouched during a backend milestone** —
  Explore, Geoapify, Pexels, routing (beyond the one confirmed-necessary
  fix in §8a), and whichever data types haven't been migrated yet
  should never be casually modified while working on the current one.
- **Any new SQL migration must be created as a numbered file in
  `supabase/migrations/` and shown to the user before it's run** —
  there is no migration CLI/tool wired up; migrations are applied by
  hand, one at a time, in the Supabase SQL Editor, only after the user
  has reviewed the file. Never assume a migration has been applied;
  wait for explicit confirmation before relying on it in live testing.

### 7a.10 Current milestone & roadmap

**Completed**: Trips → Saved Places → Activities → Budget → Expenses
(in that order, each its own milestone, each live-tested end-to-end
against the real Supabase project before being considered done). Every
nested trip data type is now Supabase-backed for a signed-in user —
this was the last data-type migration in the sequence. Neither budget
nor expenses needed new schema: `trips.budget_amount`/`budget_currency`
and the `expenses` table both already existed from `0001_init.sql`
(expenses deliberately does **not** use `expense_participants` or
`paid_by` — this milestone only preserves the app's existing
single-user expense behavior, not the future splitting feature those
support).

**Also completed**: the final backend persistence/consistency audit
(§7a.12) — including a product-requirement change discovered and
implemented during that audit: trip functionality is now
account-required (previously, signed-out browsing of local trips was
allowed; that has been deliberately removed, see §7a.12). Then, as a
follow-up architectural cleanup (§7a.13), the entire local-trip
migration system itself (the "Move my local trips to my account"
banner, `migrateLocalTripsToSupabase`, and the underlying local trip
storage it read from) was removed completely — Supabase is now the
*only* source of truth for trip data, not just the default one.

**Backend migration phase status: complete.** Every nested trip data
type is Supabase-backed for a signed-in user, there is no local trip
storage or migration path left at all, the audits found and fixed the
issues described in §7a.12/§7a.13, and no further backend data-type
migration work is planned. The recommended next step is UI/UX work,
not another backend milestone — see §7a.13's closing recommendation.

Sharing/collaboration UI (multiple members per trip, editor/viewer
roles in the UI, invitations) is explicitly **not** part of this
sequence — the schema (`trip_members`, `trip_invitations`) already
supports it, but no app code uses those roles/invitations yet beyond
auto-adding a trip's owner. Taking that on would be a new, separate,
explicitly-requested milestone, not a continuation of this one.

### 7a.11 Testing methodology

Every backend milestone so far was verified live against the real
Supabase project in a real browser (Playwright), not mocked — sign
up/in/out, migrate, refresh, sign out and back in, re-run migration,
create fresh data while signed in, all against the actual database.
Temporary test scripts (and, where needed, temporary SQL diagnostic
functions) were written per-milestone and deleted afterward — none are
committed to the repo. No automated test suite exists (see §16); this
is deliberate, ad hoc, manual-but-thorough verification, matching how
the rest of the app (Geoapify/Pexels behavior, routing) has always been
verified.

Key behaviors already confirmed live, across all five completed
milestones: sign-up creates a session (once email confirmation is
satisfied); sign-out/sign-in correctly switches between local and
Supabase data with no cross-contamination; a trip's saved places,
activities, budget, and expenses correctly survive a refresh and a
sign-out/sign-in cycle; editing a migrated trip's budget or expenses
persists and isn't reset by re-running migration; budget calculations
(Spent/Remaining/over-budget/per-category) stay correct against
Supabase-backed expenses, including immediately after add/edit/delete;
re-running the local-trip migration never creates a duplicate trip,
place, activity, or expense, and never overwrites an existing
Supabase budget or expense; a brand-new trip/place/activity/budget/
expense created while signed in persists correctly; Explore, Pexels
image loading, and routing are all unaffected by any of this.

(The "local trip"/"migration" references above are historical — they
describe what those specific, now-completed milestones tested at the
time. The local-trip migration system itself no longer exists — see
§7a.13.)

### 7a.12 Final backend persistence & consistency audit

A dedicated audit pass across everything §7a.1–7a.11 describe, run
after Expenses (the last data-type migration) was done. Its explicit
goal: confirm no accidental hybrid persistence remained for a signed-in
user, and — a **product-requirement change**, not just a check —
enforce that trip functionality is account-required: a signed-out
session must never create, view, or access any trip data, even
whatever's still sitting in `localStorage` from before trips were
account-required. Explore stays fully public either way.

**What the audit found and fixed** (all in `App.jsx` unless noted):

- **The core gap**: before this audit, only trip *mutations* were
  auth-gated (`requireAuth`) — *viewing* was not. `trips` state was
  still lazy-initialized from `localStorage` and repopulated from it on
  every signed-out render, so a signed-out session with old local trip
  data could browse the dashboard's trip list and open a
  `/trips/:id` page and see its full itinerary/saved places/budget/
  expenses, read-only. This matched the product's original "everything
  optional" design, but not the account-required model this audit was
  asked to enforce. Fixed by making `trips` start and stay empty for a
  signed-out session (`useState([])`; the trips-loading effect's
  signed-out branch is now `setTrips([])`, not `setTrips(getLocalTrips())`).
- **`visibleTrips = auth.user ? trips : []`**: every trip-rendering
  path (`selectedTrip`, the dashboard's trip list, `ExplorePage`'s
  `trips` prop) reads this, never raw `trips`, directly. This closes a
  narrower race the first fix alone didn't: `trips` is only corrected
  to the new auth state by an effect, which runs *after* the render
  where `auth.user` first changes (e.g. the render right after
  sign-out) — for that one render, raw `trips` can still hold the
  previous session's real Supabase data. Gating the value itself,
  synchronously, on every render, closes it categorically rather than
  relying on effect timing.
- **The existence-correction effect** (the one that redirects a stale
  `/trips/:id` back to the dashboard) now also bounces immediately
  whenever `!auth.user`, instead of only once `trips` itself had caught
  up to empty. Confirmed live: a direct hit on `/trips/:id` — a real,
  previously-local trip id or a nonexistent one — while signed out
  lands on `/` with no trip UI ever rendered, not even momentarily.
- **A real, reproducible data-loss risk**, found while working through
  the above: the local-persist effect (`if (!auth.user) persistLocalTrips(trips)`)
  would have started firing with `trips = []` the instant a signed-out
  session loaded — silently **wiping out** whatever was actually saved
  in `voyage:trips` the very first time this shipped. Removed
  entirely: with trip mutation already fully signed-in-only (every
  handler already started with `if (!auth.user) return`), there was no
  longer any legitimate signed-out write path left to persist.
- **Dead/dangerous code removed to match**: `handleSetBudget`/
  `handleAddExpense`/`handleUpdateExpense`/`handleDeleteExpense` still
  had a signed-out local-`setTrips` branch left over from before trips
  were account-required (unreachable via the UI even before this audit,
  since `requireAuth` already gated every trigger — but a real risk
  once the persist effect above was removed, since anything that did
  reach it would silently edit state that's never saved anywhere).
  Simplified to the same `if (!auth.user) return` pattern already used
  by every other mutation handler (trip/activity/place).
- **Stale/misleading copy fixed**: the sign-out confirmation dialog
  used to say "Your trips stay saved on this device either way" — no
  longer true (trips aren't device-scoped anymore); replaced with
  language about the account. The dashboard's empty trip-list state
  used to always say "No trips yet" regardless of auth state,
  implying an account with zero trips rather than no account at all;
  now conditional — "Sign in to see your trips" (signed out) vs.
  "No trips yet" (signed in, genuinely zero trips).
- **Verified, not changed** (checked, found already correct): RLS
  policies and grants correctly cover every currently-used operation
  on every table (§7a.2/§7a.3), no repository query bypasses RLS with
  an explicit ownership filter, no `service_role` key exists anywhere
  in `src/` or `.env`; failed Supabase mutations are logged
  (`console.error`) but not surfaced to the user and don't corrupt
  state (no optimistic updates exist anywhere, so a failure simply
  leaves `trips` unchanged) — a real but minor, pre-existing,
  app-wide UX gap (most modals close optimistically rather than only
  on success), not a data-consistency bug, and not fixed here to avoid
  scope creep into a general error-handling redesign.
- **One characteristic noted at the time, since resolved by removal**:
  `localStorage` being per-browser, not per-account, meant the "Move my
  local trips to my account" banner offered *whichever* account was
  currently signed in a chance to migrate whatever local trip data was
  on that device, regardless of who originally created it. Noted here
  as a product/UX consideration at the time, not a persistence bug —
  moot now that the entire local-trip migration system has since been
  removed (§7a.13).

**Files changed**: `src/App.jsx` (all of the above), `src/utils/useAuth.js`
(one stale comment — "accounts are entirely optional" — corrected to
describe the account-required model), `src/services/tripsRepository.js`
(comments only, describing `getLocalTrips`/`persistLocalTrips`'s
narrowed migration-only role). No schema/migration changes — nothing
here needed new SQL.

**Live-tested** (real Supabase project, real browser): every item in
this section's bullets above was verified directly, plus a full CRUD
regression (trip/activity/place/budget/expense create/edit/delete, all
surviving refresh, budget calculations staying correct throughout) and
a two-account isolation check (a second, brand-new signed-up account
sees zero trips and cannot reach the first account's trip by guessing
its id) — no data leaked across accounts, no stale-data flashes
observed, Explore/Pexels/Geoapify/routing all unaffected.

**Recommendation**: the backend persistence phase is complete. It is
safe to move to UI/UX work next. (A follow-up architectural cleanup did
happen after this audit — §7a.13 — but it was a removal of dead/no-
longer-wanted functionality, not a new feature or a reopening of this
phase.)

### 7a.13 Local-trip system removal

A follow-up architectural cleanup, requested after §7a.12's audit: the
account-required work in §7a.12 made trip data account-required for
*viewing*, but the local-to-Supabase migration system (§7a.6, in its
original form) was still fully intact underneath it — a signed-in
user's already-migrated local trips stayed in `localStorage`
indefinitely, and if a Supabase trip was later deleted, the old local
copy re-surfaced as an "eligible to migrate" offer again, since nothing
had ever removed it. Local storage was still a second, lingering
source of truth for trip data even though the UI no longer read it
directly for browsing. This milestone removed that system entirely,
rather than patching it further — decided as the simpler, more robust
fix over trying to make deleted-trip bookkeeping correct on the local
side too.

**What was removed**:
- The "Move my local trips to my account" banner/UI (`App.jsx`) —
  including its heading, description, success/error messaging, and the
  `.migration-banner` CSS (`App.css`).
- `migrationState` (`App.jsx` state) and `handleMigrateLocalTrips`.
- `migratedLocalIds`/`localTripsCount` — the `local_id` comparison
  logic that decided the banner's visibility (added in the prior
  milestone, §7a.10's changelog).
- `migrateLocalTripsToSupabase` (`tripsRepository.js`).
- `getLocalTrips`/`persistLocalTrips` and their underlying
  `utils/storage.js` (`loadTrips`/`saveTrips`) — that file was deleted
  outright, since nothing in the app used it for anything else.
- The `localId` field `tripsRepository.js`'s `fromRow` used to expose
  on every client-side Trip object, now unused.
- Every remaining signed-out trip-mutation branch — there weren't any
  left in the mutation handlers themselves (§7a.12 had already reduced
  every one of them to `if (!auth.user) return`), but this milestone is
  the point at which that became permanently true rather than just
  currently true, since the local storage those branches would have
  needed no longer exists to write to.

**What was deliberately kept**: the `trips.local_id` database column
and its unique index (added by migration `0002`) — dropping a column
is a schema change, and removing this *app-level* system didn't need
one. Any row that was migrated before this removal keeps whatever
`local_id` value it already had; nothing reads or writes that column
anymore, so it's inert, not actively wrong. No Supabase data (rows,
tables, or policies) was touched by this milestone at all.

**Old local data**: since `localStorage` is no longer read for
anything, an old, unmigrated `voyage:trips` entry would otherwise just
sit there forever, inert but still present. `src/main.jsx` now runs a
one-time `localStorage.removeItem('voyage:trips')` on every app load
(see §6) so that old data is actively discarded rather than left
dangling — this was an explicit, accepted decision: any local-only
trip that was never migrated before this milestone is now permanently
gone, since Supabase is the only source of truth going forward.

**Verified live** (real Supabase project, real browser, a browser
context seeded with an old local trip via `localStorage`): signed out,
that old local trip was invisible everywhere (no dashboard card, no
`.migration-banner` at all, and a direct hit on its old `/trips/:id`
URL redirected to `/` with nothing rendered); Explore worked normally
throughout; a fresh signed-up account showed zero trips and no
migration offer of any kind; creating a real Supabase trip persisted
through a refresh and a full sign-out/sign-in cycle; its activities,
saved places, budget, and expenses all round-tripped correctly through
a refresh; deleting that trip left it deleted after a refresh *and*
after signing out and back in, with no local copy ever reappearing to
offer it back; zero console or page errors throughout.

**Recommendation**: this closes out the backend cleanup work. Supabase
is now unambiguously the single source of truth for all trip data —
there is no remaining local trip storage, migration path, or hybrid
state to audit. Safe to move to UI/UX work.

## 8. Explore / destination / place-search behavior

- `ExplorePage.jsx` starts in an unselected state: destination search
  input + Recommended Destinations pills (`RECOMMENDED_DESTINATIONS` in
  `data/places.js`, currently `['Rome','Paris','Milan','London']`) +
  "Explore your trips" pills (derived from the user's own trip
  destinations) + an intro empty state.
- Destination resolution has two paths, both handled by one
  `loadDestination(input)` function:
  - **Autocomplete suggestion clicked** → already has `{label, lat, lon}`,
    skips geocoding entirely.
  - **Free text submitted** (Search button/Enter, a recommended-city
    pill, or a trip-destination pill) → geocoded via `geocodeCity`.
- Geocoding failure keeps the user on the selection screen (does not
  transition to a broken "Explore X" shell) — shows a friendly inline
  message instead.
- Only once geocoding succeeds does the view switch to the "Explore
  {city}" shell: place search input, category filter pills, and the
  place grid.
- **Caching:** results are cached per destination (lowercased query →
  `{label, places}`) in a `useRef` `Map` for the lifetime of the
  `ExplorePage` mount — revisiting an already-loaded destination makes
  zero new API calls. A `requestIdRef` guards against a stale slower
  request overwriting a newer one.
- **Category filter and in-city place search are 100% client-side**
  (`utils/explore.js`'s `filterPlaces`) — switching categories or
  typing in the place-search box never triggers another API call. The
  place-search input is debounced 300ms via `useDebouncedValue`.
- "Change destination" clears all destination/place state and returns
  to the selection screen.
- Error/loading states are plain `.empty-state` blocks with friendly
  copy (`ERROR_MESSAGES` in `ExplorePage.jsx`) — never raw HTTP
  status/stack traces.

## 8a. URL-based navigation (refresh/Back/Forward)

Voyage's "page" is fully described by two things, both owned by
`App.jsx`: `view` (`'dashboard' | 'explore'`) and `selectedTripId` (a
trip's id, or `null` — when set, `TripPage` renders regardless of
`view`, exactly as the render logic already treated it before this was
added). `utils/routing.js` maps between that and a URL:
  - `getPathForState({ view, selectedTripId })` → `'/'` (dashboard),
    `'/explore'`, or `'/trips/<id>'`.
  - `parseLocation(pathname)` → the inverse. **Takes only `pathname`**
    (no `trips` argument) — it used to also take `trips` and validate
    the id against it, but that had to be removed; see below.
- **No router library** — the native History API directly, via one
  `navigate(nextPage)` function in `App.jsx`: updates the page state
  *and* calls `history.pushState` with the matching path, so every
  navigation the user takes (nav links, the logo, "View trip", a trip's
  own Back button, deleting a trip) becomes a real, Back-able history
  entry. `goToDashboard`/`goToExplore` are thin wrappers around it that
  also close the mobile menu — same shared-by-desktop-and-mobile
  pattern as before.
- **`popstate` listener** (in `App.jsx`) is what makes the browser's own
  Back/Forward work: it re-derives page state from `window.location
  .pathname` (already changed by the browser by the time this fires) —
  it never calls `pushState` itself, only `navigate` does, so there's
  no feedback loop between the two.
- **Modals are not pages**: `showCreateTrip`/`isEditingTrip` (the
  Create/Edit Trip modal) stay plain local state, not reflected in the
  URL — refreshing while that modal is open closes it (lands on
  whatever page is behind it), which is the deliberate, common web
  convention for transient overlay UI, not an oversight.
- **Deep links need the host to serve `index.html` for any path** —
  true of any client-side-routed SPA. Vite's dev server and `vite
  preview` both already do this automatically (confirmed live: a
  direct `GET /explore` or `GET /trips/<id>` returns the app shell, not
  a 404) — but if this is ever deployed to a static host, that host's
  own config needs an SPA fallback/rewrite rule (e.g. Netlify's
  `_redirects`, Vercel's `rewrites`, an nginx `try_files` fallback) or
  a hard refresh on a deep link will 404 there even though the routing
  logic itself is correct.

### Why `parseLocation` no longer validates trip existence, and how a stale/deleted-trip URL is corrected instead

`parseLocation` originally took a second `trips` argument and checked
`trips.some(trip => trip.id === tripId)` right there, synchronously,
falling back to the dashboard if the id wasn't found — a reasonable
design when `trips` was always `localStorage` data, available
instantly. Once trips could be Supabase-backed (§7a), this broke: for
a signed-in user, the real trips list only becomes known after an
*async* Supabase fetch, so at the exact synchronous moment a hard
refresh (or Back/Forward) calls `parseLocation`, `trips` is still
whatever the lazy `useState` initializer or a stale render gave it —
never yet the real list. Every Supabase trip's URL looked "deleted" on
a fresh page load, permanently bouncing the user to the dashboard
before their trips had even loaded (found live while verifying saved
places survive a refresh).

**Fix, split across two files:**
- `utils/routing.js`'s `parseLocation(pathname)` now trusts a
  `/trips/:id` URL's id **optimistically**, unconditionally — no
  existence check at all, no `trips` argument.
- `App.jsx` has a dedicated effect that does the validation instead,
  once it's actually safe to: it waits for both `auth.isLoadingSession`
  and `isLoadingTrips` to be `false` (i.e. the real trips list — local
  or Supabase, whichever applies — has definitely finished loading),
  and only then checks whether `selectedTripId` is actually in `trips`;
  if not, it corrects page state to `{ view: 'dashboard',
  selectedTripId: null }`, which the existing URL-sync effect then
  reflects into the address bar via `replaceState`.
- A related, easy-to-reintroduce timing bug: `isLoadingTrips` must
  start as `true`, not `false`. Starting `false` left a narrow window,
  right as `auth.isLoadingSession` first resolved, where the new
  correction effect could see "not loading" and "trip not found"
  simultaneously — one render before the Supabase fetch had even
  started — reproducing the exact same premature-bounce bug. Both
  branches of the trips-loading effect (signed in *and* signed out)
  now explicitly set `isLoadingTrips` back to `false` once they've
  actually loaded something.

Net effect: a signed-in user refreshing on `/trips/:id` briefly keeps
showing that URL while trips load (no incorrect bounce), and only
*then* gets redirected to the dashboard if the trip genuinely doesn't
exist (deleted, or a bad link) — same eventual outcome as before, just
correctly timed against an async data source. Confirmed live: Explore
→ refresh stays on Explore; My Trips → refresh stays there; a
Supabase-backed trip's detail page → refresh stays on that trip and its
data (including saved places/activities) loads correctly; Back/Forward
walk the full history stack correctly; a direct/bookmarked load of
`/explore` or `/trips/<id>` lands there directly; an invalid trip id
still falls back to the dashboard and corrects the URL back to `/`.

## 9. Category mapping (Explore)

`EXPLORE_CATEGORIES` (`data/places.js`) is the user-facing list: `All,
Attractions, Restaurants, Cafes, Museums, Beaches, Nature, Shopping,
Nightlife`. `VOYAGE_TO_GEOAPIFY_CATEGORIES` (`services/geoapify.js`)
maps each to one or more real Geoapify categories, verified live
against both Rome and Tirana:

```js
Attractions: ['tourism.attraction', 'tourism.sights']
Restaurants: ['catering.restaurant']
Cafes: ['catering.cafe']
Museums: ['entertainment.museum']
Beaches: ['beach']
Nature: ['natural', 'leisure.park']
Shopping: ['commercial.shopping_mall', 'commercial.marketplace']
Nightlife: ['adult.nightclub', 'catering.bar', 'catering.pub']
Hotels: ['accommodation.hotel']   // not wired into EXPLORE_CATEGORIES yet
```

`adult.nightclub` (not `entertainment.nightclub`, which is an invalid
Geoapify category and returns HTTP 400) is correct for nightclubs — this
was a real, previously-shipped bug. If a category ever returns
suspiciously empty results for a city that should have them, check the
mapping against Geoapify's live category docs before assuming it's a
data-density issue.

**Place-quality filtering** (also in `services/geoapify.js`,
`searchCategoryNearCity`): a raw feature is only kept if
`isRealPlace(properties)` passes — requires a genuine
`properties.name` (Geoapify's fallback of using the enclosing
administrative unit's name, e.g. "Njësia Bashkiake Nr. 2", "Municipio
Roma I", for unnamed features was a real, previously-shipped bug —
fixed by never falling back to `address_line1` as a display name and
excluding unnamed features outright), plus a defensive check against
`administrative`/`populated_place`/`boundary`-only category tags.

**Deduplication** (`searchPlacesNearCity`): two layers, in fetch order
(so original ordering is preserved) — by `place_id` first, then by
same-name-and-near-identical-coordinates (~50m) to catch cases where
Geoapify/OSM returns the same real place twice under different ids.

**Images**: Geoapify's core Places API returns no photos, so
`place.image` always starts `''`. `PlaceCard.jsx`/`PlaceDetails.jsx`
each try a Pexels lookup (see §7) and, failing that (no result, a
failed request, or a failed `<img>` load), render a compact neutral
gradient fallback (`.place-explore-image-fallback` /
`.place-details-image-fallback` in `App.css`) sized identically to the
real-photo area in that context (160px card / 260px details) instead of
a full-height blank block or a broken `<img>`. Never invent a fake
image URL — only render an `<img>` when a real, resolved URL exists.

## 10. Activity and itinerary logic

- Itinerary days are **computed, not stored**: `getTripDays(startDate,
  endDate)` (`utils/itinerary.js`) returns one entry per calendar day,
  inclusive, using local-date arithmetic (`parseDateInput`/
  `getTodayInputValue` avoid the classic UTC off-by-one bug from
  `new Date("YYYY-MM-DD")`).
- Activities are matched to a day by **day number**, not date (see §5).
- Sorting: `sortActivitiesByTime` (`utils/activities.js`) sorts by
  `startTime` (stable sort — same-time activities keep relative order).
- Overlap detection: `getOverlappingActivityIds` — two activities
  overlap if `A.start < B.end && B.start < A.end`; overlapping
  activities get a subtle inline warning badge, but saving is never
  blocked.
- Add/Edit Activity is one component (`AddActivity.jsx`,
  `isEditing = Boolean(activity)`); it also accepts a `prefill` object
  (name/category/notes only, never times) when opened from a Saved
  Place via "Add to itinerary" — the user must still pick a time.

## 11. Date/time picker behavior

Both are fully custom (no native `<input type="date">`/`type="time">`
anywhere in the app) — see §4 for the shared interaction pattern.

- **DatePicker**: internal value is a plain `"YYYY-MM-DD"` string
  (same format trips already store) — swapping it in for the native
  input required no data-model changes. Displays as `"10 June 2026"`.
  Supports `min`/`max` (both inclusive) to disable out-of-range days
  directly via the native `disabled` attribute on each day button —
  not just a submit-time check. Popover position/size is computed in
  JS from the trigger's `getBoundingClientRect()` + viewport size, so
  it flips above the field and/or shrinks with internal scrolling
  rather than ever being clipped or overflowing the viewport.
- **TimePicker**: internal value is `"HH:mm"` 24-hour (sorting/overlap
  logic depends on plain string comparison working correctly); displays
  as `"2:30 PM"`. Minute options are 5-minute increments. Supports a
  `min` (24h string) to disable earlier times — used so End Time can
  never be chosen before Start Time.
- **Trip date rules** (`CreateTrip.jsx`): new trips can't start before
  today (`min` only applied when *not* editing); end date can't be
  before start date (enforced both by the picker's `min` and a
  submit-time fallback check). Editing an already-past trip is allowed.
- **Expense date rule** (`AddExpense.jsx`/`BudgetSection.jsx`): must be
  on or before the trip's `endDate` (`max` only — deliberately **no**
  lower bound, since travel expenses like flights/hotels are often paid
  before the trip starts).

## 12. Budget functionality

- Optional per-trip `budget: { amount, currency }`; currencies:
  EUR/USD/GBP/ALL (Albanian Lek — displayed as `"1,234 Lek"` since
  `Intl.NumberFormat` has no reliable Lek symbol at the `en-US` locale
  used everywhere; EUR/USD/GBP use real currency symbols via
  `Intl.NumberFormat`). See `utils/budget.js`'s `formatCurrencyAmount`.
- Expenses have their own category list, `EXPENSE_CATEGORIES` (Flights,
  Accommodation, Food, Transport, Activities, Shopping, Nightlife,
  Other) — **separate from** `ACTIVITY_CATEGORIES`/`EXPLORE_CATEGORIES`.
  Do not conflate the three category lists.
- Summary shows total budget, total spent, remaining (negative when
  over), a progress bar (capped visually at 100% width, with an
  "over budget by X" note when exceeded — never blocks adding more
  expenses), and a spend-by-category breakdown with small proportional
  bars.
- All calculation is derived on render from `trip.expenses` — nothing
  precomputed/cached.

## 13. Saved Places functionality

- Lives on the trip as `savedPlaces: SavedPlace[]`, entirely separate
  from `activities` — saving a place never touches the itinerary, and
  adding a saved place to a day (via "Add to itinerary") does **not**
  remove it from Saved Places.
- Two ways a place gets added:
  1. **Manually** via `AddPlace.jsx` (name/category/location/notes,
     free-form) — no `sourcePlaceId`.
  2. **From Explore** via `SaveToTripDialog.jsx` → `utils/explore.js`'s
     `toSavedPlace(place)`, which tags the result with
     `sourcePlaceId: place.id` (the Geoapify `place_id`) specifically so
     `isPlaceSavedToTrip`/`isPlaceSavedAnywhere` can detect "already
     saved" and the Explore card can show a "✓ Saved" state instead of
     "Save". `App.jsx`'s `handleToggleExplorePlace` toggles add/remove
     for one trip based on that check — no duplicates possible.
- `SaveToTripDialog` is a live checklist (not a pick-one-and-close
  list): every trip shows a filled/outlined circle indicating saved
  state, clicking toggles that trip immediately, and the dialog stays
  open until "Done" so multiple trips can be toggled in one visit.
- Explore's category strings (plural: "Restaurants") are converted to
  `ACTIVITY_CATEGORIES` singular form ("Restaurant") via
  `EXPLORE_TO_SAVED_CATEGORY` in `utils/activities.js` when saved, so a
  Saved Place looks identical whether it came from Explore or was typed
  in manually.

## 14. Current UX / design principles

- Minimalist, serious, "spacious," neutral palette — no bright accent
  colors anywhere, no emoji used for UI chrome (a couple of plain
  Unicode glyphs like `✈`/`＋`/`♡`/`✓` are used sparingly as small
  empty-state icons or status marks, not decoratively).
- Every custom form control (pickers, dropdowns) shares the same visual
  language: ~10px border radius on trigger fields, 12–14px on popovers,
  a neutral `box-shadow: 0 0 0 3px rgba(23,23,23,0.08)` focus ring
  (never browser-default blue), subtle `box-shadow`s on popovers,
  `#f0f0ed`/`#fafaf8`/`#171717` as the core neutral scale.
- Destructive actions (delete trip/activity/expense/place) always go
  through `ConfirmDialog.jsx`, never a native `confirm()`.
- Empty states are a first-class pattern (`.empty-state` class), used
  consistently for "nothing here yet," loading, and error copy — never
  a blank screen.
- Mobile: navbar collapses to a hamburger menu below 800px
  (`.mobile-nav` in `App.css`) containing the same nav items as desktop;
  category/filter pill rows scroll horizontally rather than wrapping
  awkwardly or overflowing the page.
- No raw technical error text (HTTP status codes, stack traces) is ever
  shown to the user — always a friendly, mapped message.

## 15. Important decisions and constraints

- **No router, no state library, no CSS framework** — these are
  deliberate simplicity choices for this project, not gaps to fill
  reflexively. Don't introduce one without being asked. (A backend
  *is* now being added, incrementally — see §7a — but that was
  explicitly requested; it doesn't loosen this rule for the other
  three.)
- **No new npm dependencies without a clear, explicitly-stated
  reason** — everything except `@supabase/supabase-js` (the one
  deliberate exception — see §2/§7a.9) is hand-rolled (custom pickers,
  debounce, etc.). Keep it that way unless explicitly asked to add
  something.
- **Backend work is scoped one data type at a time, and unrelated
  systems stay untouched while it's in progress** — see §7a.9 for the
  full set of constraints specific to Supabase/backend milestones
  (env vars, new SQL migrations, migration ordering).
- Activities/days are keyed by **relative day number**, not calendar
  date — this is intentional (see §5/§10); don't "fix" it to use
  absolute dates without understanding why it was designed this way.
- Geoapify API logic must stay centralized in `services/geoapify.js` —
  components should only ever see normalized place objects (§5),
  never raw Geoapify `properties`.
- Pexels API logic must stay centralized in `services/pexels.js`, kept
  independent of `services/geoapify.js` — normalization never depends
  on Pexels, and Pexels never mutates or replaces place data, only
  supplies `image` (§7).
- `src/index.css` is dead leftover scaffold code and must **stay
  unimported** from `main.jsx`.

## 16. Known issues / incomplete work

- Most obscure/small places (local bars, minor shops) will never get a
  `source: 'place'` image — Pexels genuinely has no photo taken at them,
  and §7's relevance check is designed to correctly reject a coincidental
  top result rather than accept it. They'll typically land on `'fallback'`
  or `'city'` instead (badged as such), or `'none'` if even those pools
  come up empty. This is expected, not a bug — the fallback treatment
  (badged or not) is a normal, common case by design, not an error state.
  Never invent placeholder image URLs (e.g. Unsplash/Picsum) for real
  places — only render an `<img>` when a real, resolved source exists.
- The `'place'`-tier relevance check (§7) is a heuristic — matching a
  significant name token against Pexels' own `alt` text — not a vision
  model verifying the photo's actual content. It's deliberately
  conservative (rejects on no textual evidence rather than guessing), so
  false negatives (a genuinely relevant photo rejected because its `alt`
  text happened not to mention the place) are possible and preferred
  over false positives.
- No automated tests exist for any of this — verification during
  development has been manual, live-API Playwright smoke checks run
  ad hoc (not committed anywhere), not a real test suite.
- Legacy `activity.time` (single field, pre-dating `startTime`/
  `endTime`) fallback code should probably be removed once confident no
  real user data still uses it — see §5.

## 17. Features planned for later (explicitly deferred, not forgotten)

- Google Maps / Places autocomplete widget, interactive map display.
- Real Geoapify Place Details API call for richer info (opening hours,
  etc. — photos are already covered via Pexels, see §7) —
  `normalizePlace`'s structure was deliberately kept simple so this can
  be layered in later without a redesign.
- Currency exchange-rate conversion for Budget (currently: whatever
  currency the user picks is just displayed as-is, no conversion).
- Collaborative/shared trips — **built**: §23 (collaborators from
  existing friends), §24 (shared expenses), §29 (invite/accept flow +
  notifications, superseding §23's immediate-add model). Still
  explicitly deferred within this area: realtime push for the
  notification badge/popover, a dedicated notifications page, and a
  notification/activity type for trip role changes (see §29's own
  "explicitly deferred" note for why).
- Booking integrations.
- Routing/directions, weather.
- Adding a "Hotels" filter to the visible Explore category list (the
  Geoapify mapping already exists and is ready — see §9).
- **Notable landmark ranking / dedicated landmark data source.**
  Geoapify's nearby Places API is proximity-oriented and does not
  provide a reliable popularity/fame ranking for globally iconic
  landmarks. Future versions of Voyage may use a dedicated
  notable-landmark data source or a curated landmark layer to ensure
  iconic attractions such as the Eiffel Tower, Colosseum, and Big Ben
  are surfaced appropriately without slowing normal Explore discovery
  or fetching excessively large place lists. (A supplementary-query
  approach — `heritage`/`building.tourism` categories, larger limits,
  wider radius/rect searches, proximity/bias variations — was tried and
  reverted: reaching a landmark buried deep in Geoapify's own
  proximity ordering meant either an unreasonably large Attractions
  result set or a slow/unreliable request, ~15-20s and occasionally
  outright failing, regardless of how the request was shaped. Explore
  currently uses plain proximity-based discovery only, with no
  landmark-specific logic — a famous landmark not being in the normal
  results is a known, accepted limitation for now, not a bug.)

## 18. UI/UX improvement phase (post-backend)

With the backend migration phase complete (§7a.13), work has shifted
to UI/UX. Two rounds so far — both scoped, code-reviewed-by-audit
changes to the existing design system, not a redesign.

**Round 1 — four small, targeted UX fixes:**
- **Validation styling**: every form (`CreateTrip`, `AuthDialog`,
  `AddExpense`, `AddPlace`, `AddActivity`, `SetBudget`) now sets
  `noValidate` on its `<form>`, so the browser's own native validation
  bubble/tooltip never appears. Every required field that previously
  relied purely on native validation now has a matching custom check +
  `.form-error` message (the app's existing muted-red error style,
  `#c0392b`) — fields that already had a custom check (amount fields,
  conditional custom-category fields) needed no new logic, just the
  `noValidate` to let that existing logic actually run.
- **Clock emoji removed** from `TimePicker.jsx`'s trigger button (and
  its now-unused `.time-picker-icon` CSS rule) — time selection itself
  unchanged.
- **Recent Searches on Explore**: `src/utils/recentSearches.js`, a
  small localStorage-backed utility (`voyage:recent-searches`, capped
  at 5, newest-first, case-insensitive dedup) — deliberately not part
  of the account-required trip-data model (§7a.13); this is a
  per-browser UI preference, same category as the Pexels image cache.
  Rendered in `ExplorePage.jsx` as a pill row above Recommended
  Destinations, same `.filter-pill`/`.filter-row` styling, hidden
  entirely when empty.
- **First/last name at sign-up**: `AuthDialog.jsx` shows First/Last
  name fields only in sign-up mode; `useAuth.js`'s `signUp` now accepts
  a `metadata` object passed through Supabase's `options.data`, which
  `handle_new_user()` (already existing, see §7a.2) reads into
  `profiles.display_name` as `"First Last"` — **no schema migration
  needed**, the trigger already supported this.

**UI/UX audit**: a full screen-by-screen audit (dashboard, trip cards,
Create Trip, trip detail, itinerary, saved places, budget, expenses,
Explore, auth dialogs, nav, mobile) was done in a real browser before
any Round 2 changes, published as a design-review artifact (not
committed to the repo — a one-time review document, not ongoing
reference material). Overall verdict: the existing token system
(near-black ink on off-white, restrained borders, Inter throughout) is
already correct for the "Uber-minimal, premium, not a generic travel
template" brief and was *not* changed — the main gap identified was
that only Explore actually spends the "travel imagery" the brief
allows (trip cards and Saved Places render places/trips as plain text
despite already having image data available in some cases), plus a
handful of concrete, scoped bugs. The audit's proposed roadmap, in
order: (1) date formatting, (2) fix "View all", (3) compact empty
itinerary days, (4) destination imagery on Trip Cards, (5) imagery on
Saved Places, (6) a returning-user dashboard state, (7) trip-page
section reorder (Itinerary before Saved Places), (8) a small polish
sweep. Items 4 onward are **not yet implemented** — see below for what
is.

**Round 2 — the first three roadmap items, implemented:**
- **Consistent date formatting**: Trip Card (`App.jsx`) and Trip Header
  (`TripPage.jsx`) both now render `formatDateLabel(startDate)` /
  `formatDateLabel(endDate)` instead of the raw `"YYYY-MM-DD"` strings
  they used to interpolate directly — `formatDateLabel` (`utils/date.js`)
  was already the app's established single-date formatter (already used
  by the expense list and by DatePicker's own selected-value display),
  so this is reuse, not a new format. Date storage/parsing untouched.
- **"View all" fixed**: the button next to "Upcoming adventures" used
  to open Create Trip (`setShowCreateTrip(true)`) — clearly mislabeled.
  It now calls `goToDashboard()`, the exact same handler the "My Trips"
  nav link uses. Since this button only ever renders while already on
  the dashboard, this is a same-page navigation today (still a real,
  correct destination, and it's the only "trips view" that exists) —
  not a dead click into the wrong modal anymore.
- **Compact empty itinerary days**: a day with no activities used to
  render a full-height empty-state block (`min-height: 220px`, icon
  circle, centered text) — the same treatment as a genuinely-empty
  *trip*, just repeated per day. It's now a single slim row (~55px),
  still the same `.empty-day` class, now a full-width `<button>` that
  opens the same Add Activity modal as the day header's own
  "+ Add activity" — so a multi-day trip with only one or two populated
  days no longer produces a long stack of near-identical placeholders
  (most noticeable on mobile). Populated days, day headings, activity
  ordering/editing/deleting, time ranges, and overlap warnings are all
  unchanged — only the empty-day branch changed. No new colors: reuses
  `#8c8c86`/`#fafaf8`/`#171717`, all already used elsewhere in
  `App.css`.

Both rounds were live-tested against the real Supabase project in a
real browser (signed in/out, desktop + mobile viewports, refresh,
browser Back/Forward where relevant) and verified with `npm run lint`
+ `npm run build`. Neither touched Explore, Pexels, Geoapify, Supabase
queries/schema, authentication logic, or routing beyond reusing the
existing `goToDashboard` navigation function.

**Round 3 — destination imagery on Trip Cards and Saved Places
(roadmap items 4–5), implemented:** a presentation-only change — no
new Pexels architecture, no new API requests from either surface.
- **`services/pexels.js`**: added one new read-only export,
  `getCachedDestinationImage(destination, seed)`. It never calls the
  network or touches the request queue — it only reads whatever's
  already sitting in the existing pool cache (`poolCache`, the same
  in-memory + `localStorage`-persisted structure Explore's category/
  "travel" pools already populate), preferring the broad "`<city>
  travel`" pool, falling back to any cached category pool for that
  city, and picking a photo via the same deterministic `pickFromPool`
  hash Explore's own fallback tier uses (seeded by trip id, so a given
  trip always shows the same photo). Returns `null` — not a fetch — for
  a destination this browser has never explored via Pexels.
- **Trip Cards (`App.jsx`)**: each card now shows an 84px thumbnail
  (56px on mobile) via a new `getTripCardImage(trip)` helper, in
  priority order: (1) the first saved place that already has an
  `image` (free — already stored on the trip via Supabase, see
  `toPlaceFields`/`fromPlaceRow`), else (2)
  `getCachedDestinationImage`, else (3) a plain neutral-gradient
  fallback block (`.trip-card-image-fallback`, same
  `linear-gradient(135deg, #f6f6f3, #eaeae6)` already used by Explore's
  own place-image fallback). No trip ever triggers a new Pexels
  request just to render its card.
- **Saved Places (`SavedPlaces.jsx`)**: each row now shows a 56px
  thumbnail using the place's own already-stored `image` (populated
  when it was saved from Explore), or the same neutral-gradient
  fallback when it has none (e.g. a place added manually via
  "+ Add place", which has no `image` field at all) — no lookup of any
  kind here, purely rendering data the trip already carries.
- **CSS (`App.css`)**: new `.trip-card-image`/`.trip-card-image-
  fallback`, `.place-item-image`/`.place-item-image-fallback` rules,
  reusing the app's existing radius (12px/10px), border, and neutral-
  gradient tokens — no new colors. `.trip-card` and `.place-item` got
  minor layout adjustments (flex gap/alignment) to fit the thumbnail
  without disturbing existing text hierarchy or the delete/edit/"Add
  to itinerary" controls; both got a `max-width: 600px` mobile rule
  keeping the thumbnail fixed-size and the rest of the row wrapping
  cleanly, so heights stay consistent whether or not a given card/row
  has a real photo.
- Live-tested end to end against Supabase: created a trip, saved two
  Explore places (both resolved real Pexels photos), added one manual
  place (no image), confirmed the Trip Card picked up the first saved
  place's photo, confirmed all three Saved Places rows rendered
  correctly (2 real photos + 1 fallback), refreshed and confirmed the
  same state persisted, checked both viewports (1440px, 390px — no
  horizontal overflow), and confirmed Explore's own cards were
  unaffected. Cleaned up via the UI and confirmed via a direct
  Supabase query that no trip data was left over. `npm run lint` and
  `npm run build` both pass.

**Round 4 — dashboard returning-user state (roadmap item 6),
implemented:** the dashboard's top section (`App.jsx`) now renders one
of three states instead of always showing the same marketing hero:
- **Signed out** — unchanged: the full marketing hero
  ("Your next adventure, beautifully planned.").
- **Signed in, zero trips** — a new, lighter `.hero-welcome` variant
  (smaller heading via `.hero-welcome h1`, less vertical padding, no
  eyebrow-sized headline) with no CTA button of its own — the existing
  "No trips yet" empty state directly below (in `.trips-section`)
  already carries the "Create your first trip" action, so this stays a
  welcome, not a second competing button.
- **Signed in, 1+ trips** — the marketing hero is replaced entirely by
  a new compact `.returning-header`: a "DASHBOARD" label, a
  "Welcome back, {firstName}" heading (or plain "Welcome back" if no
  name is available), "Ready for your next adventure?" subtext, and a
  "Create a trip" button — mirroring the same label + heading + right-
  aligned action layout `.section-heading` already uses elsewhere
  rather than inventing a new pattern. Because this replaces the tall
  hero rather than sitting above it, "Upcoming adventures" and the
  user's trips naturally land much higher on the page — no separate
  reordering logic was needed for that.
- The first name comes from `auth.user.user_metadata.display_name`
  (already on the session object from sign-up — see Round 1 above and
  `useAuth.js`), split to its first word — no new profile fetch, no
  schema change. An account with no stored name (or metadata that
  didn't reach the session) falls back to a plain "Welcome back",
  never blocking on it.
- Which of the three states to show is gated on `isLoadingTrips` too
  (renders nothing extra until trips are actually known) — otherwise a
  returning user's first paint could briefly flash the zero-trips
  copy before their real trips arrive.
- New CSS only: `.hero-welcome`, `.returning-header`,
  `.returning-header h2`, `.returning-header-text`, plus mobile
  (≤800px) rules stacking the header and widening its button to full
  width — all reusing existing colors (`#707070`, `#171717`, etc.),
  radii, and the existing `.primary-button`/`.section-label` classes;
  no new color system.
- Live-tested all three states plus every transition end to end
  against Supabase: signed-out hero, signed-in zero-trips welcome,
  created a trip and confirmed the returning-user header + correct
  name + trips prioritized, "View all" still opens My Trips, refresh
  preserved the returning-user state, sign-out immediately reverted to
  the marketing hero, signing back in restored the returning-user
  state, and mobile (390px) showed no horizontal overflow. Cleaned up
  via the UI and confirmed via a direct Supabase query that no trip
  data was left over. `npm run lint` and `npm run build` both pass.

**Round 5 — Trip Detail page section reorder (roadmap item 7),
implemented:** a pure JSX-order change in `TripPage.jsx` — the
Itinerary section (`<section className="itinerary-section">`) now
renders before `<SavedPlaces>`, so the page order is Trip header →
Itinerary → Saved Places → Budget → Expenses (Budget and Expenses
remain the two headings inside the one existing `<BudgetSection>`,
unchanged). No component was changed internally — `SavedPlaces.jsx`,
the itinerary/day-card markup, and `BudgetSection.jsx` are byte-
identical to before, only their position in `TripPage.jsx` moved.
No CSS changed either: `.itinerary-section` and `.saved-places-section`
both already used the same `padding-top: 48px`, so the spacing is
order-independent and the stylesheet output is unchanged (confirmed —
`npm run build`'s CSS bundle hash didn't change).
Live-tested against Supabase with a trip containing multiple
activities (across several days), multiple saved places, a budget, and
multiple expenses: confirmed the new section order both on an empty
trip and once fully populated, confirmed it survives a refresh,
confirmed activity edit/delete and saved-place delete still work,
confirmed budget/expense figures still render correctly, and confirmed
mobile (390px) keeps the same order with no horizontal overflow.
Cleaned up via the UI and confirmed via a direct Supabase query that
no trip data was left over. `npm run lint` and `npm run build` both
pass.

**Round 6 — final polish sweep (roadmap item 8), implemented:**
- **Avatar initials** (`App.jsx`): the profile-button circle now shows
  two-letter initials derived from `auth.user.user_metadata.display_name`
  (first + last word, e.g. "Ada Lovelace" -> "AL") via a new
  `getProfileInitials(displayName, email)` helper, instead of always
  just the first letter of the email. Falls back to a single initial
  for a one-word name, and to the original email-initial (or "S" when
  signed out) when there's no display name at all — e.g. an account
  created before Round 1 added first/last name collection. No CSS
  changed (two letters fit the existing 38px circle at the existing
  14px font-size fine).
- **Explore duplicate-pill de-dupe** (`utils/explore.js`,
  `ExplorePage.jsx`): the same city could appear as a pill in more than
  one of Recent Searches / Explore Your Trips / Recommended
  Destinations at once. Added `normalizeCityKey` (city before the
  first comma, lowercased) and `dedupeDestinations(labels, seen)` to
  `utils/explore.js`; `ExplorePage.jsx` now runs all three lists
  through the same `seen` Set in priority order — Recent Searches
  first, then the user's own trip destinations, then Recommended
  Destinations last — so a city already shown in a higher-priority row
  is silently skipped in a lower one, rather than repeated. All three
  sections/rows still exist and render normally when they have
  content (Recommended Destinations is now also hidden, not just
  emptied, on the rare case every one of its 4 entries is already
  claimed elsewhere — matching how the trip-shortcuts row already
  behaved). Recent-search storage/ordering (`recentSearches.js`) and
  the actual geocode/search flow behind every pill are untouched.
- **Expense date format**: reviewed and confirmed already correct —
  `BudgetSection.jsx`'s `expense-date` already renders via the same
  `formatDateLabel` used by the Trip Header, Trip Card, and DatePicker
  (visually confirmed side-by-side: trip header
  "26 September 2026 → 28 September 2026" vs. expense
  "26 September 2026"). No third date format was ever in play here, so
  no code change was made for this item — changing already-correct
  code would have been an unrequested/unnecessary edit.
- Live-tested against Supabase: two-word, single-word, and no-display-
  name avatar states (the latter two via the account's own
  `auth.updateUser` metadata call, then restored back to "Voyage
  Tester" afterward); Explore dedupe with a real trip destination
  (Rome) colliding with Recommended Destinations, then a real search
  (Milan) colliding with Recommended too — confirmed zero duplicate
  pills across all three rows, confirmed the surviving recent-search
  pill still navigates correctly, and confirmed re-searching an
  existing recent search still moves it to the front; expense date
  format verified visually; mobile (390px) checked on both the trip
  page and Explore with no horizontal overflow. `npm run lint` and
  `npm run build` both pass, and the built CSS bundle hash is
  unchanged (no CSS was touched by any of the three items).

**Next**: none — this was the last item (8) on the approved UI/UX
audit roadmap (§ above). No further UI/UX work is currently planned;
future work should come from a new, explicit request.

## 19. Micro-interaction + homepage refinement phase

A new, explicitly-scoped phase after §18's roadmap completed — two
parts: (A) a broad micro-interactions pass across existing interactive
elements, (B) a homepage/dashboard content refinement. Neither touched
Supabase, auth, tripsRepository, Geoapify, Pexels fetching/caching,
routing, or the trip data model — confirmed by an unchanged
`services/`/`utils/date.js`/`utils/itinerary.js` and no new network
calls anywhere (verified live, see below).

**A. Micro-interactions (`App.css`, plus one class-name-only tweak
each in `App.jsx`/`ExplorePage.jsx`)** — all additive CSS; no existing
selector's layout/color/spacing changed, only transition/animation/
hover/active/focus-visible properties added:
- **Global safety net**: a single `@media (prefers-reduced-motion:
  reduce)` block at the top of `App.css` collapses every animation/
  transition duration to ~0 app-wide — verified live (Playwright
  `reducedMotion: 'reduce'` context) that `main`'s animation duration
  drops from `0.2s` to effectively `0s` under it, with no per-rule
  special-casing needed anywhere else.
- **Buttons** (`.primary-button`/`.secondary-button`/
  `.destructive-button`/`.filter-pill`/`.save-status-button`): a quick
  `:active` press (`scale(0.96–0.98)`), a `:disabled` dimmed state
  (opacity 0.6, `cursor: not-allowed` — applies wherever `disabled` is
  already used, e.g. AuthDialog's submit button during sign-in/up; no
  new `disabled` usage was added anywhere), and a consistent
  `:focus-visible` ring (`box-shadow`, matching the existing form-input
  focus-ring pattern) added to every button/pill/link that didn't
  already have one (nav links, close buttons, edit/delete-activity
  buttons — the latter two classes are shared by Activities, Saved
  Places, *and* Expenses' own edit/delete controls, so one change
  covered all three).
- **Cards**: `.trip-card` and `.place-explore-card` both get a subtle
  hover lift (`translateY(-2px)` + a soft neutral shadow + slightly
  darker border) — a full click isn't implied (only their internal
  buttons are actually clickable), just an honest "this row is
  interactive" cue. `.place-explore-card`'s photo also gets a gentle
  `scale(1.04)` zoom on card hover, clipped by the card's own existing
  `overflow: hidden`.
- **List rows** (`.activity-item`/`.place-item`/`.expense-item`): a
  quiet background tint on hover (`#fafaf8`, the same off-white already
  used by `.empty-day:hover` and every modal input — no new color).
- **Save confirmation**: `.save-status-button.is-saved` plays a one-
  shot `scale(1 → 1.06 → 1)` pop the moment a place is saved (the class
  only appears once actually saved — see PlaceCard.jsx/
  PlaceDetails.jsx — so this can't replay on its own).
- **Modals/dialogs**: `.modal-overlay` fades in and `.modal` fades +
  scales up on mount (`overlay-fade-in`/`modal-pop-in`) — applies
  automatically to every dialog in the app (CreateTrip, AddActivity,
  AddPlace, AddExpense, SetBudget, AuthDialog, ConfirmDialog,
  ChooseDayDialog, SaveToTripDialog, PlaceDetails) since they all share
  these two classes; zero JS/component changes needed. Exit is left
  instant (no fade-out) — a deliberate scope decision: a smooth close
  needs a shared "delay unmount until the transition finishes" pattern
  repeated across ~10 independently-rendered dialogs, which is real
  functional surface area for a purely-cosmetic gain, so it was left
  out rather than touching every dialog's close-handling logic.
- **Dropdowns/popovers** (`.mobile-menu-panel`, `.category-select-menu`,
  `.time-picker-popover`, `.date-picker-popover`,
  `.destination-search-suggestions`): the same quiet `popover-in`
  fade+slide-down entrance across all five.
- **Loading states**: `.empty-state.is-loading` reuses the *existing*
  `place-image-fallback-pulse` keyframe (previously only used for an
  unresolved Pexels image) for "Loading your trips…" (`App.jsx`) and
  Explore's "Finding {city}…"/"Finding places…" states
  (`ExplorePage.jsx`) — a one-line class addition in each, no new
  keyframe.
- **Empty states**: `.empty-state` itself gets a quiet `fade-in-up`
  entrance — applies everywhere it's used (Saved Places, Budget,
  Expenses, My Trips) with no JS changes.
- **Navigation transitions**: a single `main { animation: fade-in
  0.2s ease; }` rule — since the dashboard's own `<main>`,
  `TripPage.jsx`'s `.trip-page`, and `ExplorePage.jsx`'s
  `.explore-page` are all `<main>` elements only ever rendered
  conditionally in `App.jsx`, switching between My Trips / a trip /
  Explore always mounts a fresh one, so this alone covers every real
  view change with no router/JS involvement (confirmed the CSS
  animation-duration is genuinely present via Playwright).
- Explicitly **not** done: fade-out-before-removal for deleted list
  items (activities/places/expenses/trips) — would require delaying
  each delete handler's actual state update until a CSS transition
  finishes, touching real state-update timing in `App.jsx`/
  `TripPage.jsx`/`BudgetSection.jsx` for every delete path, which is a
  functional change, not a cosmetic one — left out per "do not change
  functionality just to make animations possible."

**B. Homepage / dashboard refinement (`App.jsx`, `App.css`, new
`components/PopularDestinations.jsx`, small addition to
`ExplorePage.jsx`)**:
- **New `PopularDestinations.jsx`**: a small reusable component
  rendering Explore's own `RECOMMENDED_DESTINATIONS` list
  (`data/places.js` — Rome, Paris, Milan, London, unchanged) as compact
  cards, image on top / name below, deliberately mirroring
  `.place-explore-card`'s established visual language (radius, border,
  fallback gradient) under new, separate class names
  (`.destination-card` etc.) rather than sharing Explore's own classes
  — keeps this homepage-only component decoupled from Explore's actual
  card so a future Explore-specific change can't accidentally affect
  it, or vice versa. Each card's image comes from the same read-only,
  no-network `getCachedDestinationImage` Trip Cards already use (see
  §18 Round 3) — a city already explored in this browser shows its
  real cached photo; one that hasn't shows the same neutral gradient
  fallback Explore itself uses. No new Pexels request is ever fired
  from the homepage.
  - **Bug fix — London card (post-launch)**: reported as a blank image
    area on the London card while Rome/Paris/Milan loaded correctly.
    Two rounds:
    1. First pass added an `onError`-based fallback recovery (each
       card became its own small `DestinationCard` subcomponent —
       still true, kept below — with local `imageFailed` state, the
       same pattern `PlaceCard.jsx` already uses). This didn't fix it,
       because that wasn't the actual failure mode.
    2. Live DOM inspection (real `getComputedStyle`/`naturalWidth`/
       `currentSrc` checks in a real browser, not assumption) found
       the true cause: searching "London" in Explore resolves via
       Geoapify to **"Greater London"**, so every Pexels pool for it
       gets cached under `greater london|...` keys — real photos,
       confirmed present in the cache. But `RECOMMENDED_DESTINATIONS`
       says `'London'`, and `getCachedDestinationImage`'s lookup only
       matched an *exact* `london|...` key prefix, so it always
       returned `null` for a real, already-cached destination — the
       fallback gradient was rendering correctly the whole time (not
       broken), just permanently instead of a real photo that was
       sitting right there in the cache.
    - **Fix**: `getCachedDestinationImage` (`services/pexels.js`)
      gained one more, lower-priority matching tier — after its
      existing exact-prefix checks find nothing, it now also accepts a
      cached pool whose own city name contains the target city as a
      whole word (`"greater london"` contains `"london"`), not a blind
      substring match that could accidentally match an unrelated city.
      This is a general fix for any city Geoapify resolves to a longer
      administrative name, not a London-specific hardcode. Still a
      pure, read-only cache lookup — no Pexels fetching/queueing
      logic touched, no new request on any path (confirmed live: zero
      `api.pexels.com` calls from the homepage on load or refresh,
      only the expected `images.pexels.com` loads for the photos
      actually being displayed).
    - The `DestinationCard` subcomponent's `onError` recovery from the
      first pass stays in place too — a real, separate failure mode
      (a cached URL that later 404s) it still correctly guards
      against, verified live with a deliberately-broken cached URL.
- **Signed-out homepage**: the existing hero (headline/subtext/CTA) is
  unchanged; two new, concise additions follow it: (1) `.hero-
  highlights`, a plain 3-column text strip ("EXPLORE" / "PLAN" /
  "TRACK", one line each, grounded in the app's three real areas —
  Explore, itinerary, Budget — not generic marketing copy), reusing
  the existing `.section-label` eyebrow style; (2) a new "Popular
  destinations" section (matching the app's existing `.section-heading`
  pattern exactly, same as "Your Trips") rendering `<PopularDestinations
  />`. Clicking a destination card navigates to Explore *and* auto-
  searches that city (see below) — verified live: clicking "Rome"
  landed on "Explore Rome" with results, not just Explore's empty
  shell.
- **Signed-in, zero trips**: the existing `.hero-welcome` intro and the
  existing "No trips yet" empty state (icon, copy, "Create your first
  trip" button) are both unchanged. A new `.destinations-suggestion`
  block ("NOT SURE WHERE TO START?" + `<PopularDestinations />`) was
  added as a *sibling* directly below the empty-state card, not nested
  inside it — so every other reuse of the shared `.empty-state` class
  (Saved Places, Budget, Expenses) is completely unaffected.
- **Signed-in, with trips**: deliberately untouched — the §18 Round 4
  returning-user header and trip list remain exactly as they were, no
  marketing content added, matching "prioritize trips, no unnecessary
  marketing content."
- **Deep-link mechanism** (`App.jsx` + `ExplorePage.jsx`): a new
  `pendingExploreDestination` state and `goToExploreWithDestination(
  city)` helper in `App.jsx` (not part of URL/routing state — a one-
  shot UI hint, same treatment as `showCreateTrip` and friends), passed
  to `<ExplorePage>` as `initialDestination`/
  `onInitialDestinationHandled`. `ExplorePage.jsx` calls its own
  existing `loadDestination` once on mount if a destination was passed,
  then clears it via the handler — since `<ExplorePage>` is only ever
  conditionally rendered by `App.jsx`, every navigation into Explore is
  a fresh mount, so this fires exactly once per click and never
  replays on a plain "Explore" nav-link visit.
- Live-tested end to end: all three homepage states (screenshotted,
  desktop 1440px + mobile 390px, no horizontal overflow on any);
  keyboard-only navigation reaching a destination card via Tab and
  activating it with Enter (confirmed a real, non-instant
  `:focus-visible` ring — an earlier zero-looking reading turned out to
  be a test artifact of reading computed style mid-transition, not a
  real bug, confirmed by re-checking after the transition settled);
  `prefers-reduced-motion` (confirmed real vs. ~0 durations, see
  above); trip creation, edit, and delete (including the destructive
  ConfirmDialog) still work with the new modal entrance animation in
  place; a full save/unsave round-trip in Explore (confirmed the
  `is-saved` class and its pop animation); trip-card and place-item
  hover states (confirmed via computed-style diffs, not just visual
  inspection). Cleaned up via the UI and confirmed via a direct
  Supabase query that no trip data was left over. `npm run lint` and
  `npm run build` both pass.

## 20. Trip lifecycle: Upcoming vs. Past trips

Trips now automatically split into two dashboard sections based on
`endDate` — no schema change, no backend/Supabase involvement at all.
This is purely a display-time classification of the same data every
other feature already reads.

**Classification** (`utils/itinerary.js`): `isTripUpcoming(trip)` /
`isTripPast(trip)` — a trip is Upcoming if its `endDate` is today or
later, Past if it's before today (today itself always counts as
Upcoming). Compared as plain `"YYYY-MM-DD"` strings against
`getTodayInputValue()` (that format already sorts chronologically as
text, sidestepping timezone/Date-object edge cases entirely) — no new
date-parsing path. A trip with a missing or malformed `endDate` (a
regex shape-checks it first) safely defaults to Upcoming rather than
vanishing from the list or throwing — in practice every trip has a
valid one already, since `CreateTrip.jsx` requires it before a trip
can even be saved; this is only a defensive fallback.

**Nothing is deleted, archived, or written back.** A past trip stays
exactly as present in Supabase and in the app's own `trips` state as
before — `App.jsx` computes `upcomingTrips`/`pastTrips` as two
`.filter()`s over the same `visibleTrips` array purely for rendering;
opening a past trip (`TripPage.jsx`, completely untouched) shows its
full itinerary, saved places, budget, and expenses exactly as before,
still fully editable (verified live by adding an activity to a past
trip).

**Dashboard**: the existing "YOUR TRIPS / Upcoming adventures" section
now renders `upcomingTrips` instead of all `visibleTrips` — a signed-in
user with trips but none upcoming gets an adjusted, accurate empty
state ("No upcoming trips" instead of "No trips yet", still pointing
at "your past trips are saved further down") rather than the
first-time-user copy. A new section renders only when
`auth.user && pastTrips.length > 0` (so a user with zero past trips
never sees an empty "Past Trips" section) — same `.trips-section`
class plus a `.past-trips-section` modifier for slightly more top
spacing, "PAST TRIPS" / "Where you've been" heading matching the
existing `.section-heading` pattern exactly, no "View all" button
(nothing to page to). Signed-out and zero-trip states are unaffected —
verified live that `.past-trips-section` and every `.trip-card` are
completely absent when signed out.

**`TripCard.jsx`** (new component) — the trip-card JSX and its
`getTripCardImage` helper (Pexels-cache-only, no new requests — see §18
Round 3) were extracted out of `App.jsx` into their own reusable
component, since it's now rendered from two places (Upcoming and Past
lists) instead of one. Takes an `isPast` prop: adds a small "PAST TRIP"
pill (`.trip-card-status`, the same uppercase-pill language as
`.place-category`/`.activity-category`/`.expense-category`, just a
touch smaller/quieter) next to the destination label, and gives the
card a slightly receded resting opacity (`.trip-card.is-past`,
`opacity: 0.82`) that returns to full opacity on hover/focus — quieter
at rest, never disabled, every control (including "View trip") stays
fully functional throughout.

Live-tested against Supabase: an upcoming trip, a trip ending exactly
today (confirmed classified as Upcoming, not Past), a past trip
(created normally, then backdated via the real "Edit trip" UI flow —
editing an already-past trip has always been allowed, unlike creating
one), and all three together — confirmed correct section membership,
correct DOM order (Upcoming before Past), the "PAST TRIP" badge only
on past cards, a past trip's itinerary/saved places/budget all present
and its itinerary still editable, correct classification surviving a
refresh, no horizontal overflow on mobile (390px), and a completely
trip-free, section-free view when signed out. Cleaned up via the UI
and confirmed via a direct Supabase query that no trip data was left
over. `npm run lint` and `npm run build` both pass.

## 21. Friends system (foundation — no trip sharing yet)

The first piece of Voyage's collaboration phase: users can find each
other, send/accept/decline friend requests, and manage an accepted
friends list. Deliberately scoped to *only* this — no trip sharing,
shared expenses, activity feed, or dashboard integration yet (all
explicitly deferred to a later step).

### Schema (`supabase/migrations/0005_friendships.sql`)

One new table, `friendships`, added independently of `trip_members`/
`trip_invitations` (§7a.2's pre-existing, still-unused trip-
collaboration scaffolding) — a friendship is never a form of trip
membership and never grants access to a trip; this migration doesn't
reference either of those tables.

One row per relationship (not two): `requester_id`/`recipient_id`
reference `public.profiles` (not `auth.users` directly) via explicitly
named foreign keys (`friendships_requester_id_fkey`/
`friendships_recipient_id_fkey`) — functionally identical to
referencing `auth.users` (a profile row is 1:1 and guaranteed to exist
for every account via `handle_new_user`), but this is what lets
`services/friendsRepository.js` embed the *other* person's
`display_name`/`avatar_url` in one PostgREST query
(`requester:profiles!friendships_requester_id_fkey(...)`) instead of a
second manual lookup per row. `status` is `pending` / `accepted` /
`declined`.

Two constraints do the real safety work, enforced by Postgres itself:
- `friendships_no_self_check` — a user can never request themself.
- `friendships_unique_active_pair` — a **partial** unique index on the
  *normalized* pair (`least`/`greatest` of the two user ids), scoped to
  `status in ('pending', 'accepted')`. Normalizing means A→B and B→A
  collide on the same index entry, so at most one active relationship
  can exist between any two users regardless of who initiated — this
  is what actually prevents a duplicate/duplicated-in-reverse request
  at the database level, not just app-level checking. It's partial so a
  past **declined** row doesn't permanently block a fresh request
  between the same two people later (declining sets `status` to
  `'declined'` and keeps the row — see the repository below — rather
  than deleting it).

RLS: either side of a relationship can `select` it; only the requester
can `insert` (as themself, never forged); only the *recipient* can
`update` (accept/decline are both just a status change); either side
can `delete` (withdrawing your own pending request, or either party
ending an accepted friendship — see "Remove friend" below). Explicit
`grant select, insert, update, delete ... to authenticated` included —
0003_fix_trips_access.sql already discovered the hard way that RLS
alone doesn't grant table access.

### Repository (`services/friendsRepository.js`)

Follows `tripsRepository.js`'s exact conventions (`fromRow`-style
mappers, `export async function`, throws on error, no raw Supabase
calls in any component). `searchUsers(query, currentUserId)` reads
`profiles` directly (`ilike` on `display_name`, excludes self) — no new
RLS needed, `profiles` was already fully readable by any authenticated
user since `0001_init.sql`.

`sendFriendRequest` checks for an existing relationship *before*
inserting, so every product rule is enforced here (not just hoped-for
from the UI already disabling the right button):
- already friends → friendly error, no duplicate row.
- I already have a pending request out to them → friendly error (also
  independently guaranteed by the partial unique index).
- **they already sent me a pending request** → accepts theirs instead
  of creating a redundant second row. This is the concrete answer to
  "handle the case where the other user already sent you a request."

`acceptFriendRequest`/`declineFriendRequest` are both just a `status`
update (RLS restricts the update to the recipient — not re-checked
client-side, same trust-RLS approach `tripsRepository.js` already takes
throughout). `removeFriend` is a real `delete`, not a status change —
there's no "removed" status in the schema. Deleting (or declining, or
any other friendships mutation) only ever touches the one
`friendships` row: it cannot cascade into, and has no relationship
with, `trips`/`trip_members`/`activities`/`expenses`/`saved_places` —
verified live (see below) by removing a friend and confirming the
trip's own itinerary/saved places/budget were completely untouched.

### UI (`components/FriendsPage.jsx`)

One new view, wired into the existing three-page nav pattern
(`utils/routing.js` gained `'friends'` alongside `'dashboard'`/
`'explore'`, mapped to `/friends` the same way `/explore` already is;
a third "Friends" link added next to "My Trips"/"Explore" in both the
desktop nav and the mobile menu). Stacked sections, matching the Trip
Page's own established pattern rather than introducing tabs (nothing
in the app uses a tab pattern anywhere): **Find people** (search, "+
Add friend" per result, cross-referenced against the already-loaded
friends/incoming/outgoing lists so a result correctly shows "Friends" /
"Request sent" / "Sent you a request" instead of always offering
"Add") → **Incoming Requests** (Accept / Decline, only rendered when
non-empty) → **Sent Requests** (read-only "Pending" pill, only
rendered when non-empty — no cancel action; not in this milestone's
scope) → **Friends** (the accepted list, empty-state matching
`SavedPlaces.jsx`'s icon+heading+description pattern, "×" remove button
matching the existing `delete-activity-button` treatment). Removing a
friend goes through the same `ConfirmDialog` component every other
destructive action in the app already uses.

Only ever rendered while signed in — `App.jsx` checks `auth.user`
itself for `view === 'friends'` and shows a plain auth-gated empty
state (identical markup/pattern to the dashboard's own "Sign in to see
your trips" card, "Sign in" button opening `AuthDialog` via the
existing `requireAuth` helper) instead of `FriendsPage` for a
signed-out visitor — no `requireAuth` plumbing inside `FriendsPage`
itself, since the whole page (not just individual actions) is
auth-only.

**New shared primitive**: `utils/profile.js`'s `getInitials(displayName,
fallback)` — pulled out of `App.jsx`'s navbar-avatar-only private
helper (was `getProfileInitials`) so the Friends UI's own circular
avatars (`.friend-avatar`, visually identical to `.profile-button`)
could reuse the exact same two-letter-initials logic instead of a
second copy. The navbar's own behavior is unchanged (still falls back
to the signed-in user's email initial); the Friends UI, which never has
another user's email, passes a neutral `'?'` fallback instead. This is
the "very small shared UI primitive" the milestone brief allowed for —
no real Profile/Account page exists or was added.

### Live-tested with two real accounts (A and B), end to end

Search excludes the searching user themself; A finds B, sends a
request (search result correctly swaps to a "Request sent" pill, no
duplicate-send possible); B sees it under Incoming Requests and
accepts; **both sides** immediately show each other under Friends, and
this survives a refresh on both accounts. Searching for an existing
friend shows "Friends" with no Add button (no duplicate request
possible). A real trip was created for A, then the A↔B friendship was
removed from A's side — the trip's own card count, header, and
itinerary/saved-places/budget sections were all confirmed completely
unaffected, and B independently stopped seeing A as a friend too (the
removal is symmetric, since it's one shared row, not two). A fresh
request could be sent again immediately after the removal (the partial
unique index only blocks *active* relationships) — sent, then
**declined** by B this time, confirmed to clear both sides' pending
state without becoming friends, and a fresh request could be sent
again after the decline too (the declined row doesn't block, as
designed). RLS isolation was verified with **direct Supabase client
calls, not just the UI**: B attempting to `insert` a row with
`requester_id` set to A's id (forging a request on A's behalf) was
rejected by RLS; a direct self-request insert was rejected by the
table's own check constraint. Signed-out `/friends` shows only the
sign-in gate (confirmed zero Friends content renders, and clicking
"Sign in" correctly opens `AuthDialog`). Mobile (390px) checked with no
horizontal overflow, including with search results open. Console/page
errors were clean on every real run — a handful of transient `PGRST303
"JWT issued at future"` / 400s appeared on isolated runs, the same
sandbox clock-skew artifact already documented elsewhere in this file,
self-resolved on retry, and never blocked or corrupted anything. All
test data (trips and friendship rows) was cleaned up and confirmed
removed via direct Supabase queries afterward. `npm run lint` and
`npm run build` both pass.

**Explicitly not built in this milestone** (per the approved scope):
trip sharing, shared expenses/expense-splitting, an activity feed, or
any Friends/Recent-Activity content on the home dashboard. `Sent
Requests` has no cancel/withdraw action yet either — display-only,
since it wasn't in the requested repository surface.

**Re-verification note (after the later Trip sharing and Shared
Expenses milestones):** a follow-up task asked for an "Incoming
Friend Requests UI," describing it as missing. Inspection of
`FriendsPage.jsx` found the Incoming Requests section, `handleAccept`/
`handleDecline`, and their `getIncomingFriendRequests` /
`acceptFriendRequest` / `declineFriendRequest` repository calls
already fully implemented exactly as described above — this section
was in fact part of the original Friends milestone, not missing. No
code was changed. To be certain rather than assume, the full scenario
was independently re-tested live with three real accounts (A and C
each sending B a request, both showing correctly under "Incoming
Requests" with correct name/initials, Accept removing A's row and
adding A to Friends immediately with no refresh, Decline removing C's
row without adding C to Friends, both outcomes persisting after a
page reload, duplicate-request protection and re-request-after-decline
both still working, mobile at 390px, and the signed-out gate) — every
check passed with zero console/page errors, and `npm run lint` /
`npm run build` both passed on the unmodified code.

## 22. Profile / Account page

A proper account area for a signed-in user — view their profile,
edit their display name, and jump to Friends. No schema change at
all: reads and writes the exact same `profiles` table §7a.2/§21
already use, via one new small repository file. Distinct from Friends
(§21) — no friendship/request UI lives here, just a summary + link.

### Repository (`services/profilesRepository.js`)

One function, `updateDisplayName(userId, displayName)`, writing to
**two** places at once (`Promise.all`, both awaited, either failing
throws):
1. The `profiles` row itself — already covered by 0001_init.sql's
   existing "users can update their own profile" RLS policy, no new
   policy/migration needed. This is what `services/
   friendsRepository.js`'s `searchUsers`/embedded-profile queries read
   from, so a display-name change shows up in Friends too.
2. The auth session's own `user_metadata`, via
   `supabase.auth.updateUser({ data: { display_name } })` — what the
   navbar avatar (and every other existing `auth.user.user_metadata
   .display_name` reader in the app) reads from. This is the one
   genuinely load-bearing design choice here: writing only the
   `profiles` row would leave the navbar/session showing the *old*
   name until the next sign-in, since nothing re-syncs `auth.users`
   metadata from a `profiles` update. Calling `updateUser` instead
   fires a `USER_UPDATED` event through the exact `onAuthStateChange`
   listener `useAuth.js` already subscribes to (the same mechanism
   that already keeps a session fresh across sign-in/out and token
   refresh) — so `auth.user`, and therefore the navbar avatar and
   `ProfilePage`'s own header (both just read straight from it), update
   **immediately, with zero extra callback/prop plumbing** — confirmed
   live: the navbar avatar's initials changed the instant the edit
   modal closed, with no page reload.

`friendsRepository.js` also gained one new function for this feature:
`getFriendsCount(currentUserId)` — a `{ count: 'exact', head: true }`
query (a HEAD request; Postgres computes the count, no row data is
transferred), reusing `getFriends`'s exact same filter shape but
without fetching/mapping the full embedded-profile rows that endpoint
returns. This is the "efficiently available" friends count the Profile
summary shows.

### UI (`components/ProfilePage.jsx`, `components/EditProfile.jsx`)

`ProfilePage` is a compact, narrower (680px, centered) page — a
deliberate departure from Trips/Explore/Friends' wide 1200px layout,
since this is a single-column account page, not a list view — but
built entirely from Voyage's existing pieces: `.section-heading`/
`.section-label` for every sub-heading (Account information / Friends
/ Account actions, exactly like every other page's own sections), a
bordered-card row list for the two account fields (display name,
email — read-only text, no edit-in-place), and a tappable row
(`.profile-friends-link`, the same visual family as
`.choose-day-option`) for "View your N friends →" that navigates to
`/friends`. No new visual language anywhere, no illustrations, no
gradients.

`EditProfile` is a small modal — same modal-overlay/modal/form
shape as `SetBudget.jsx` (the app's other one-field edit form), not a
new pattern: one `noValidate` form, one `displayName` input pre-filled
with the current value, blocks an empty submission with the existing
`.form-error` treatment, `disabled` + "Saving…" on the submit button
while in flight (reusing the `:disabled` button styling from §19's
micro-interactions pass), and a `.form-error` surfaced if the save
itself fails. No separate "Saved!" banner — this app has no toast/
notification system anywhere (every other edit form, AddPlace/
AddExpense/etc., already just closes on success) — closing the modal
while the new name is already visible everywhere else *is* the success
state, made possible by the reactive session update above.

Email is displayed but never editable through this feature — matches
"do not implement email changing yet."

### Navigation (`App.jsx`, `utils/routing.js`)

New `view: 'profile'` → `/profile`, added the same way `'friends'` was
in §21 (`getPathForState`/`parseLocation`, a `goToProfile()` helper).
**No new nav-links entry** — per the approved scope, the existing
circular avatar (`.profile-button`) is now Profile's entry point
instead of immediately opening the sign-out confirm: clicking it while
signed in navigates to `/profile` (only "Sign out" now opens that
confirm dialog, moved onto the Profile page itself as one of its two
Account actions, using the exact same `ConfirmDialog` and
`showSignOutConfirm` state as before — just triggered from a different
place). Clicking it while signed out still opens `AuthDialog`,
unchanged. A small `.profile-button.is-active` ring appears while on
`/profile`, the same wayfinding role `.is-active` already plays on the
My Trips/Explore/Friends text links, since the avatar has no separate
text label to underline. My Trips/Explore/Friends' own nav entries are
completely unchanged.

Signed-out gating matches Friends' own pattern exactly: `App.jsx`
checks `auth.user` for `view === 'profile'` and renders a plain
auth-gated empty state (identical shape to Friends'/the dashboard's
own "Sign in to see your X" cards) instead of `ProfilePage` — no
`requireAuth` plumbing inside `ProfilePage` itself, since the whole
page (not individual actions) is auth-only.

### Live-tested with a real account, end to end

Opened Profile via the avatar (URL became `/profile`, avatar showed
its active ring); header showed the correct name, email, and "VT"
initials, matching the account info card below it exactly. Edited the
display name via the modal (pre-filled with the current value,
confirmed blank-name validation blocks submission with a clear error);
after saving, the page header updated immediately **and so did the
navbar avatar's initials, with no reload** — confirmed by reading the
navbar DOM right after the modal closed. Refreshed and confirmed the
new name persisted in both places. The Friends summary correctly read
"View your 0 friends" (a real, live count via `getFriendsCount`, not a
placeholder); clicking it navigated to `/friends` and back to
`/profile` cleanly. Signed out from the Profile page's own "Sign out"
button (same confirm dialog/message as before); `/profile` while
signed out showed only the sign-in gate (confirmed zero account-info
content rendered), and clicking "Sign in" opened the existing
`AuthDialog`. Mobile (390px) checked with no horizontal overflow,
action buttons stacking vertically. Zero console/page errors across
the full run. The test account's display name was restored to its
prior value afterward. `npm run lint` and `npm run build` both pass.

**Explicitly not built** (per the approved scope): trip sharing,
shared expenses, activity feed, social dashboard, profile photos/
uploads, email changing, password changing.

## 23. Trip sharing — collaborators from existing friends

Voyage's first real collaboration feature: a trip owner can add an
existing accepted friend to one of their trips as a collaborator. No
new table — reuses `trip_members` (scaffolded in `0001_init.sql` for
exactly this, never exercised by any app code until now) and
`friendships` (§21). Explicitly not built yet: email invitations,
invitation links, public sharing, accept/decline flows, a viewer role,
shared expenses, or any activity feed/notifications.

**Superseded by §29**: the immediate-add flow this section describes
(`addTripCollaborator` inserting a `trip_members` row directly) was
retired at the database level in §29 — sharing a trip now sends an
invitation the friend must accept before any `trip_members` row is
created. The RLS/repository/UI details below are kept as historical
record of how `trip_members`/`are_friends` were first established;
§29 documents what replaced the insert path itself.

### Schema (`supabase/migrations/0006_trip_sharing.sql`)

No new table or column — this migration only tightens two existing
`trip_members` RLS policies (plus one new helper function), because
the database, not the frontend, has to enforce this feature's product
rules:

- **New function `are_friends(_user_a, _user_b)`** — same
  security-definer pattern as `is_trip_member`/`trip_role` right above
  it in `0001_init.sql`. Checks the `friendships` table for an
  `accepted` row between the two ids, either direction.
- **INSERT policy replaced** — the original (`trip_role(trip_id) =
  'owner'`) only checked that the caller owned the trip; it never
  mattered before because nothing inserted through it. Now also
  requires `are_friends(auth.uid(), user_id)`. This is what makes
  "only existing accepted friends can be added" and "the owner cannot
  add themselves" real database constraints, not app-level trust — a
  self-friendship is structurally impossible (§21's
  `friendships_no_self_check`), so an owner can never satisfy this
  check for their own id.
- **DELETE policy replaced** — the original let an owner delete *any*
  row on their own trip, including their own `'owner'` row. Now both
  branches (`owner removing someone` / `member leaving`) exclude
  `role = 'owner'`, so an owner can remove a collaborator but can never
  remove themselves, and "a member can leave" only ever applies to a
  non-owner.
- **Nothing else changed.** `trips`/`activities`/`saved_places`/
  `expenses`'s existing `trip_role(trip_id) in ('owner', 'editor')`
  policies (already in `0001_init.sql`) mean an editor added this way
  automatically gets full existing trip functionality — view, edit
  trip fields, manage activities/saved places/expenses/budget — with
  *zero* further backend changes. `trip_members`'s SELECT policy and
  the UPDATE (role-change) policy were already correct/unused and are
  untouched.

### Repository (`services/tripsRepository.js`)

Three new functions, following the file's existing conventions
exactly (`fromRow`-style mapper, throws on error):
- **`getTripMembers(tripId)`** — fetches `trip_members` rows, then a
  second query for the matching `profiles` (`.in('id', userIds)`), and
  joins them client-side. Not a new pattern: this is the exact same
  two-query-then-join approach `getSupabaseTrips` already uses for
  `saved_places`/`activities`/`expenses`. (`trip_members.user_id`
  references `auth.users`, not `profiles`, directly — unlike
  `friendships`, which deliberately points at `profiles` for
  embedding, see §21 — so there's no FK PostgREST can auto-embed
  here.)
- **`addTripCollaborator(tripId, userId)`** — inserts a `role:
  'editor'` row; friendship/ownership are never re-checked here, only
  by `0006`'s own RLS.
- **`removeTripMember(memberId)`** — a real delete of one
  `trip_members` row. Cannot cascade into, and has no relationship
  with, `friendships` — removing a collaborator never touches the
  friendship, same guarantee `friendsRepository.js`'s `removeFriend`
  already documents in the other direction.

Also added: `ownerId` on the client Trip shape (`fromRow`) — the one
new field that isn't pure display data. `App.jsx` compares it against
the signed-in user's id to compute `isOwner`, passed down to
`TripPage.jsx`, which uses it to hide the owner-only "Delete trip"
button and the People section's Add/Remove controls for a
collaborator — RLS already refuses those for a non-owner regardless;
this only avoids showing a control that would just fail.

### UI (`components/TripPeopleSection.jsx`, `components/AddTripFriends.jsx`)

A new **PEOPLE** section on the Trip Detail page, inserted right after
the trip header (existing section order — header → Itinerary → Saved
Places → Budget/Expenses — is otherwise unchanged). Owner shown first
with an "OWNER" pill, collaborators below with an "EDITOR" pill and
(owner-only) a "×" remove button — reusing `.friend-list`/
`.friend-item`/`.friend-identity`/`.friend-avatar`/`.friend-name`/
`.friend-status-pill` **verbatim** from the Friends page (§21), not a
parallel style: this is genuinely the same "list of people" UI, so
direct class-sharing was the smaller, more consistent choice here
(unlike, say, the homepage's destination cards, which were
deliberately decoupled from Explore's own for different reasons — see
§19). Only `.trip-people-section`'s own spacing is new CSS.

**`AddTripFriends`** is the "Share with friends" modal opened by
"+ Add friends" (owner-only) — same stays-open-with-a-"Done"-button
pattern as `SaveToTripDialog.jsx`, not a new one, so an owner can add
several friends in one sitting. Lists accepted friends (via
`friendsRepository.js`'s existing `getFriends`) filtered to exclude
anyone already on the trip; each add immediately removes that friend
from the list and appends them to the People section — no refresh,
using the friend's already-in-hand display info rather than a second
round trip. An empty eligible list (no friends at all, or all friends
already added) shows the same icon+heading+description empty-state
shape used everywhere else in the app.

Removal goes through the same `ConfirmDialog` every other destructive
action already uses ("...won't affect your friendship" in the
message, matching the guarantee above).

### Live-tested with three real accounts (A, B, C), end to end

A created a trip and saw the PEOPLE section with themselves as OWNER,
"+ Add friends" and "Delete trip" both visible. Added B via the modal
(B correctly excluded from the eligible list the moment they were
added — confirmed by reading the modal's own rendered text, not just
a locator count, after an earlier check was thrown off by an unrelated
background DOM element sharing the same `.friend-item` class); B
appeared as an EDITOR in A's People list **immediately, no refresh**.
B opened the shared trip directly by URL: saw the correct trip name,
the People section (read-only for them — no remove button on
themselves), and **no** "Delete trip" or "+ Add friends" (both
correctly owner-only); the trip also appeared in B's own dashboard
trip list with zero changes to `getSupabaseTrips`, purely from RLS
already scoping it that way. B (as editor) successfully added a real
activity to the shared trip, confirming full existing trip
functionality works with zero extra permission-plumbing. Refresh
preserved A's view of the membership. Added C too (multiple
collaborators: People list showed all three rows correctly, owner +
2 editors); with both friends already added, the modal correctly
showed the "no friends available to add" empty state.

**Security enforced at the database, not just the UI** — verified with
direct Supabase client calls, deliberately bypassing the app entirely:
B inserting an arbitrary third-party user into A's trip → rejected by
RLS. B re-inserting themselves → rejected. B deleting A's owner row →
silently affected 0 rows (RLS makes the row invisible to the delete,
not an explicit error — confirmed by re-querying: the owner row was
still there). **A attempting to delete their own owner row** (an
isolated, freshly-created trip, checked in complete isolation) →
also 0 rows affected, owner row confirmed still present — the "owner
can never remove themselves" rule holds even for the owner's own
direct API call, not just the UI hiding the button. A attempting to
add themselves as a collaborator → rejected (`are_friends` correctly
fails for a self-pair). A re-adding B via a direct API call while B
was already a member → rejected by the existing `unique(trip_id,
user_id)` constraint.

A removed B via the People section's UI (confirm dialog showed the
"won't affect your friendship" message); B lost access immediately —
gone from B's own dashboard trip list, and visiting the old trip URL
directly showed no trip content at all. B and A were confirmed **still
friends** afterward on the Friends page — the friendship was
completely unaffected by the trip removal, in either direction.
Signed-out: visiting a trip URL showed no trip content, same as
before this feature (unchanged, no new gating logic needed). Mobile
(390px) checked with no horizontal overflow. Console/page errors were
clean for B throughout; A saw the same isolated `PGRST303` clock-skew
artifact already documented elsewhere in this file, unrelated to this
feature and self-resolving. All test trips were deleted and the A–B/
A–C friendships confirmed left intact (2 `accepted` rows) via a direct
Supabase query afterward. `npm run lint` and `npm run build` both
pass.

## 24. Shared expenses — equal-split collaborative expenses

Voyage's second collaboration feature after trip sharing (§23): a trip
owner or editor can record an expense as *shared*, specifying who paid
and who participated, with each participant's equal share calculated
automatically. No new table or column — `expenses.paid_by` and
`expense_participants` were both already scaffolded in `0001_init.sql`
and are structurally sufficient as-is.

### The personal/shared distinction

Deliberately **not** a new column or flag. An expense with zero
`expense_participants` rows is personal; one with one or more is
shared. Every expense created before this feature has zero participant
rows, so every one of them reads as personal automatically — no data
migration, and nothing about an existing personal expense's row
changes at all. Converting an existing expense between personal and
shared (via `AddExpense.jsx`'s Personal/Shared toggle, on either
create or edit) is symmetric: switching to Shared adds participant
rows, switching back to Personal removes them — same underlying
mechanism either way (see `writeExpenseParticipants` below).

### Schema (`supabase/migrations/0007_shared_expenses.sql`)

No new table/column/function of substance — reuses the existing
`is_trip_member` helper (`0001_init.sql`) to tighten two WITH CHECK
clauses, so the database (not just the create/edit form only ever
offering trip members as choices) enforces "only trip members can
participate in or be paid by a shared expense":
- `expense_participants`'s manage policy now also requires
  `is_trip_member(e.trip_id, user_id)` — a share can never be recorded
  for someone who isn't (or is no longer) on the trip.
- `expenses`'s manage policy now also requires `paid_by is null or
  is_trip_member(trip_id, paid_by)` — a personal expense (`paid_by`
  always null) is completely unaffected; only a shared expense's payer
  is constrained to genuinely be a trip member.

Deleting a shared expense needed zero new code: `expense_participants
.expense_id` already had `on delete cascade` to `expenses.id` from
`0001_init.sql`, so removing the expense row removes its participant
rows atomically at the database level.

### Splitting and balances (`utils/budget.js`)

- **`splitAmountEqually(amount, participantCount)`** — works entirely
  in integer cents (never summing floating-point currency amounts,
  which is what actually produces totals like 99.99 instead of
  100.00). Everyone gets the same base share
  (`floor(totalCents / count)`); any leftover cents from that division
  go one each to the first few participants in array order — e.g.
  €100.00 split 3 ways is `[33.34, 33.33, 33.33]`, summing to exactly
  €100.00. Deterministic (same input order -> same shares), documented
  in the code itself as the "rounding approach."
- **`calculateSharedExpenseBalances(expenses)`** — per person,
  `paid` (sum of every shared expense they were the payer on) minus
  `owed` (sum of their own share across every shared expense they
  participated in) = `net`. A personal expense never contributes.
- **`summarizeSettlements(balances)`** — a standard greedy debt-
  simplification ("Alex owes Sibora €60") purely for **display** — it
  never moves, records, or persists any payment; explicitly not a
  settlement action.

### Repository (`services/tripsRepository.js`)

`fromExpenseRow`/`toExpenseFields`/`getSupabaseTrips` extended (not
replaced) to also carry `paidBy`/`payerName`/`participants` — the
latter two resolved via the same two-query-then-join approach already
used for `saved_places`/`activities`/trip_members
(`expense_participants.user_id` references `auth.users`, not
`profiles`, directly, so there's no FK PostgREST can auto-embed).
`createSupabaseExpense`/`updateSupabaseExpense` both route through one
new shared helper, `writeExpenseParticipants` — deletes whatever
participant rows exist for that expense, then (only if
`participantIds` is non-empty) inserts freshly recalculated shares.
This single code path is what makes "editing amount or participants
recalculates shares" and "no orphaned participant rows" true by
construction rather than needing three separate cases: a personal
expense has nothing to delete/insert (true no-op, unchanged from
before this feature); a new shared expense inserts its first shares; 
editing an existing shared expense's amount/participants always fully
replaces the old shares rather than diffing them. Not wrapped in a
database transaction (Supabase's client API has no multi-statement
transaction primitive, and nothing else in this repository uses one
either) — a documented, accepted limitation for this first version.

### UI

`AddExpense.jsx` gained a Personal/Shared toggle (the same `.filter-
pill` "pick one" pattern Explore's category filters already use) —
hidden entirely on a trip with fewer than two members, since sharing
with nobody isn't a real choice. When Shared: a "Paid by" picker
(`CategorySelect`, defaulting to the signed-in user) and a Participants
multi-select reusing `SaveToTripDialog.jsx`'s exact toggle-row pattern
(`.save-trip-option`/`.save-trip-indicator`/`.save-trip-name`) with
each row showing its own live computed share as it's selected — this
*is* the "live split preview," always accurate regardless of rounding,
rather than a single "€X each" that would be misleading when shares
differ by a cent. Payer is tracked by display name, matching
`CategorySelect`'s flat-string-options shape rather than a new id-aware
picker — an accepted, documented limitation for trip groups where two
members happen to share the exact same display name.

`BudgetSection.jsx` now fetches trip members itself (independent of
`TripPeopleSection.jsx`'s own identical-looking fetch — see the "real
bug" note below) to populate those pickers, shows a "SHARED" pill +
"Paid by X · split N ways — [name amount, ...]" line on shared expense
rows (a personal row is visually byte-for-byte unchanged), and a new
Balances sub-section (shown only when at least one shared expense
exists) — each person's net balance (existing near-black for positive/
settled, the same `#b3261e` already used for "over budget" for
negative — no new colors), plus the settlement summary lines.

### Two real bugs found and fixed during live testing

1. **Stale trip members.** `BudgetSection.jsx` originally fetched trip
   members once on mount only. Since it and `TripPeopleSection.jsx`
   are two independent, un-synced pieces of state, adding a
   collaborator via the People section and then immediately opening
   "+ Add expense" — with no page refresh in between — showed the
   Personal/Shared toggle as unavailable, because `BudgetSection`'s own
   copy of the membership list was still whatever it was when the
   trip page first mounted. Fixed by re-fetching trip members every
   time the Add/Edit Expense modal is about to open, not just once.
2. **A modal taller than the viewport became partially unreachable on
   mobile.** `.modal-overlay`/`.modal` (used by every dialog in the
   app) had no scroll handling at all — fine for shorter forms, but
   the expanded shared-expense form is tall enough to exceed a real
   phone's viewport. Adding `overflow-y: auto` alone hit a well-known
   CSS flexbox quirk: `align-items: center` combined with `overflow:
   auto` can make content overflowing the *start* edge (here, the
   modal's own header/close button) unreachable by scroll even though
   the end/bottom scrolls fine. Fixed with the standard, robust
   pattern instead — `margin: auto 0` on `.modal` rather than
   `align-items: center` on `.modal-overlay` — which centers a modal
   that fits and remains fully scrollable in both directions for one
   that doesn't. This is a general fix benefiting every dialog in the
   app, not shared-expense-specific, and a short modal (e.g. Edit
   trip) was confirmed to still read as centered on desktop afterward.

### Live-tested with three real accounts (A owner, B and C editors) and a real shared trip

A created a personal expense (toggle correctly hidden until
collaborators existed, then correctly present; no SHARED pill, exactly
as before this feature) and two shared ones: a 2-participant €100
dinner (correct $50.00/$50.00 shares) and a 3-participant €100 taxi —
confirming the rounding requirement exactly: **$33.34 + $33.33 +
$33.33, summing to exactly $100.00**. Balances matched a hand
calculation exactly (Voyage Tester +$116.66, Bella Traveler −$83.33,
Carla Explorer −$33.33), with a correct settlement summary. Changed
the dinner's payer (A→B), removed a participant from the taxi (3→2,
correctly recalculated to $50/$50), and changed the taxi's amount
(€100→€45, correctly recalculated to $22.50/$22.50) — balances updated
correctly after each edit, verified against hand calculations again.
Deleted the shared dinner expense (participant rows removed via
cascade); the personal expense remained completely untouched
throughout. Refresh preserved every expense, the updated amount, the
deletion, and the recalculated balances exactly. B (editor) opened the
trip, saw the existing shared expense, and successfully created their
own shared expense — full existing expense permissions extending to
shared ones with zero extra plumbing, confirmed live. C was then
removed as a collaborator: lost the trip from their dashboard and got
bounced on direct URL visit with zero expense data leaked, while
remaining friends with A — friendship completely unaffected by the
membership change. **Security enforced at the database, verified with
direct Supabase calls bypassing the UI**: the now-removed non-member C
could see zero expense rows for the trip via a direct query; A
attempting to add C as an expense participant, or to set C as a
payer, were both rejected by RLS (the new `is_trip_member` checks);
C attempting to insert an expense into a trip they're not a member of
was rejected too. Mobile (390px) checked — including confirming the
tall shared-expense form's submit and close buttons are both reachable
after the modal-scroll fix above. Console errors were clean throughout
for both accounts. All test trips were deleted and the friendships
confirmed intact afterward via a direct Supabase query. `npm run lint`
and `npm run build` both pass.

**Explicitly not built** (per the approved scope): custom/percentage
splits, settlement/payment transfers, any payment processing, expense
notifications, activity feed, recent activity, social dashboard, email
invitations, public trip links.

## 25. Collaboration + Account completeness pass

One combined pass closing out six specific gaps in Friends/Trip
sharing/Account, inspected against the existing schema/RLS/
repositories/components first per the task's own rule, so each is
reported here as what already existed vs. what was actually missing.

### 1. Trip collaborator roles — Viewer vs. Editor

`trip_members.role` already allowed `'viewer'` at the schema level
(0001_init.sql's own check constraint), and — this is the one genuine
surprise of the whole pass — every mutation-granting RLS policy on
`trips`/`activities`/`saved_places`/`expenses`/`expense_participants`
already required `trip_role(trip_id) in ('owner', 'editor')`. **A
viewer was already correctly blocked from mutating anything at the
database level** the moment one could exist; no RLS fix was needed for
that part. What was missing: nothing ever *created* a `'viewer'` row
(`addTripCollaborator` always hardcoded `'editor'`), the existing
"owners can change member roles" UPDATE policy never actually
constrained what an owner could change a role *to* or *from* (an owner
could previously have flipped their own row off `'owner'`, or promoted
a collaborator to `'owner'`), and no UI anywhere hid editor-only
controls from a viewer.

Schema (`0008_collaboration_account_completeness.sql`): tightened the
trip_members INSERT policy to also require `role in ('editor',
'viewer')`, and rewrote the UPDATE policy so its USING clause excludes
any row whose *current* role is `'owner'` (that row can never be
targeted) and its WITH CHECK requires the *new* role to be `'editor'`
or `'viewer'` — between the two, the owner can never be changed away
from owner and no second owner can ever be created, at the database
level.

Repository (`tripsRepository.js`): `addTripCollaborator(tripId,
userId, role = 'editor')` now takes a role; new
`updateTripMemberRole(memberId, role)`; new `getMyTripRole(tripId,
userId)` — the signed-in user's own role on one trip, used purely for
UI gating (RLS enforces the real restriction regardless).

UI: `AddTripFriends.jsx` gained a per-friend Editor/Viewer role toggle
(`.role-toggle`/`.role-pill` — visually derived from
`.friend-status-pill`'s resting state plus `.filter-pill`'s active
state, not a new pill design) with a one-line explanation ("Editors can
add and edit... Viewers can only look") above the friend list, default
Editor. `TripPeopleSection.jsx`'s collaborator rows show the same
toggle for the owner (changing an existing collaborator's role live)
and a plain, dynamic `EDITOR`/`VIEWER` status pill for anyone else.
`TripPage.jsx` gained a `canEdit` value (`isOwner ||
myRole === 'editor'`, fetched once via `getMyTripRole` — skipped
entirely for the owner, who already knows `canEdit` is true for free)
now gating: the Edit trip button, itinerary Add/Edit/Delete controls,
and (via a new `canEdit` prop) `SavedPlaces`'s Add/Delete/Add-to-
itinerary controls and `BudgetSection`'s Set/Edit budget and
Add/Edit/Delete expense controls. A viewer keeps full read access to
every section — only the mutating buttons disappear.

### 2. Cancel a pending sent request

Already fully supported by `0005_friendships.sql`'s existing "either
side can delete a friendship" policy — a pending request and an
accepted friendship are both just rows in the same table, and deleting
either was already allowed for either party. Nothing missing at the
data layer. Added: `cancelFriendRequest` (a thin, clearly-named wrapper
around the existing `removeFriend`) and a Cancel button next to each
Sent Requests row (reusing `.edit-activity-button`, same visual weight
as Decline). Never reachable on an already-resolved request, since
`getOutgoingFriendRequests` only ever returns pending ones.

### 3. Remove a friend

Already fully implemented and working from the original Friends
milestone (confirmed by inspection, not changed).

### 4. Incoming-request nav badge

New `getIncomingFriendRequestsCount` (a `{ count: 'exact', head: true
}` query, same shape as the existing `getFriendsCount`). `App.jsx`
fetches it once per signed-in user change and keeps it live within a
session via a callback (`onIncomingCountChange`) `FriendsPage.jsx`
already calls after every `loadAll()` with the fresh incoming list's
own length — no extra query for that half, and no realtime
subscription anywhere. Renders as a small dark circular `.nav-badge`
after "Friends" in both the desktop nav and the mobile menu item, never
rendered at all at 0 or while signed out.

**Re-verification note (after the later Profile-photo work touched
`App.jsx` and the navbar again):** a follow-up task asked for exactly
this — a Friends nav badge for pending incoming requests — describing
it as new work. Inspection confirmed it was already fully built here.
No code was changed; independently re-tested live with three fresh
accounts (since the earlier A/B/C had since been deleted per the
account-cleanup decision in this same section): badge shows the
correct count before ever opening Friends, disappears immediately on
Accept and on Decline, stays numerically correct with two simultaneous
incoming requests, persists across a refresh, disappears on sign-out
and returns with the correct count on sign-in, and is clean on mobile
(390px, no overflow) — zero console errors, `npm run lint` and
`npm run build` both pass.

### 5. Fake/mock users

The codebase itself had zero hardcoded/mock/seeded user data anywhere
— confirmed by a full search; every friend/collaborator list reads
exclusively from `profiles`, itself only ever populated by the real
`handle_new_user` signup trigger. Nothing to change in code. A live
scan of the actual `profiles` table, however, turned up 39 rows — only
a handful of which were real, active accounts, the rest genuine
orphaned test signups accumulated across this whole project's testing
history (`voyage-rls-test-...`, `voyage-places-debug-...`, five
separate `Ada Lovelace` rows from a script that never customized the
sign-up name, etc.) — real Supabase accounts, not code-level fake data,
but real enough to clutter Friends search. Per your explicit direction,
these were removed with a one-time script
(`supabase/cleanup_test_accounts.sql` — not a numbered migration, since
there's nothing here to replay on a fresh database), keeping only your
own account (`siboraa22@gmail.com`) and the one you asked to keep by
name (`ada lovi`). **This also removed the three accounts this whole
project's testing history had reused as "A/B/C"** (`voyage-imagery-
test`/`voyage-friend-b`/`voyage-friend-c`) — a deliberate, explicit
choice you made after I flagged the consequence; any future live
testing round will need fresh accounts created from scratch. Verified
directly afterward: `profiles` holds exactly the two intended rows,
nothing more, nothing orphaned.

**Follow-up cleanup (a later, separate request):** live testing across
several subsequent milestones (Profile photos, its own UX fix, the
Friends nav badge re-verification) inevitably left more throwaway
signups behind (`Profile FixTester` ×2, `Profile Fixed` ×2, `Debug
Saved`, `Normal SignOut`, one throwaway verification account) — plus
one genuinely new account, `chuck bass`, that hadn't been created by
any of this project's own test scripts and was kept as the third
intended real account. `supabase/cleanup_test_accounts.sql` was
rewritten with an explicit, stable-id keep-list (not display names —
they're user-editable and not unique) for all three:
`sibora`/`ada lovi`/`chuck bass`. Running its Step 2a (best-effort
Storage cleanup of leftover avatar files) surfaced a real, previously-
unverified fact about this project's own architecture: Supabase
enforces "no direct SQL DELETE on `storage.objects`" via a **table-
level trigger** (`storage.protect_delete()`), not something tied to
running inside a `security definer` function specifically — confirming
0010_fix_delete_own_account_storage.sql's fix (moving avatar cleanup
to the client-side Storage API) was the only viable approach, from
any calling context. Step 2a was skipped as expected; Step 2b (the
actual `auth.users` deletion) ran cleanly. Verified directly
afterward: `profiles` holds exactly the three intended rows; Friends
search in the real browser for `s`/`a`/`c` returns only correct
substring matches among the three (`sibora`+`chuck bass` for "s",
all three for "a", `chuck bass` alone for "c") with zero console
errors; every throwaway verification account used to check this was
itself deleted immediately after, leaving the database at exactly
three real accounts. No application code was changed — this was
purely a data cleanup, exactly as scoped.

### 6. Delete account

A real `auth.users` deletion, not just a `profiles` wipe. `auth.users`
already cascaded correctly into almost the entire graph by design
(`profiles`→`friendships`, `trips.owner_id`→everything under a trip,
`trip_members.user_id`, `expense_participants.user_id`, all `on delete
cascade` from 0001_init.sql/0005_friendships.sql onward) — the two
gaps, `expenses.paid_by` and `trip_invitations.invited_by`, had no
`ON DELETE` behavior at all (defaulting to `NO ACTION`), which would
have made deleting a user who ever paid for a shared expense on *any*
trip — including one they don't own — fail outright with a foreign key
violation. Fixed in the same migration by making both `SET NULL`
instead (found and altered via a dynamic `pg_constraint` lookup, not a
guessed constraint name).

**Ownership decision** (documented explicitly, not invented ad hoc):
when an account that owns trips is deleted, those trips — and
everything hanging off them, including any collaborators' access —
are deleted too, via the schema's *existing*, already-live
`trips.owner_id ... on delete cascade`. This isn't new behavior; it's
the original ownership model (a trip has exactly one owner, ownership
is never transferable, a collaborator only ever has access, never a
copy) applied to its logical conclusion, and it never touches any
*other* user's own trips or data — only the deleted owner's own trips,
and a departing collaborator's own membership/participation rows on
someone else's trip (exactly like removing a friend/collaborator
already only ever removes the one relationship row).

New `delete_own_account()` — a `security definer` Postgres function
that only ever runs `delete from auth.users where id = auth.uid()`,
takes no parameters, and so has no way to target anyone but the caller.
`profilesRepository.js`'s `deleteOwnAccount()` calls it via
`supabase.rpc()`; `App.jsx`'s `handleDeleteAccount` calls that, then
`auth.signOut()` — no extra navigation reset needed, the existing
signed-out gating on every view (dashboard/friends/profile/a selected
trip) already takes over the instant `auth.user` goes null, same as a
normal sign-out. UI: a new "DANGER ZONE" section on `ProfilePage.jsx`,
visually separated in its own red-tinted bordered card
(`.profile-danger-card`), a `destructive-button` "Delete account", and
a `ConfirmDialog` (mirroring the existing Sign Out one) spelling out
the exact consequences before acting.

### Live-tested, in four passes, with real accounts against the real Supabase project

**Friend requests + badge**: A sent B a request; B's nav badge showed
"1" on the dashboard *before* ever opening `/friends` (the mount-level
count fetch); Incoming showed the correct name/initials; Accept
removed it from Incoming and added A to Friends immediately on both
sides, no refresh; the badge disappeared immediately; Remove Friend
updated both sides. **Cancellation**: sent, cancelled from Sent
Requests, disappeared immediately, B never saw it in Incoming, B's
badge was never bumped by a cancelled request, a fresh request could
be sent again afterward. Zero console errors throughout.

**Trip roles**: a Viewer added to a shared trip could open it and read
every section (header, itinerary, saved places, budget) but saw zero
editor-only controls; **direct Supabase calls bypassing the UI**
confirmed RLS blocks a viewer's insert into activities/saved_places/
expenses and a trip update outright. Flipping Viewer→Editor gave real
capability immediately — verified by actually having that account add
a saved place, not just checking a button appeared. Flipping back to
Viewer hid the controls again and re-blocked direct mutation, while
read access to the place added while an editor was preserved. Owner
removed the collaborator: they lost the trip immediately; the
friendship stayed `accepted`. (Two apparent failures during this pass
turned out to be test-script issues, not app bugs, and are recorded
here for the same reason earlier false-alarms were: a `.update()` with
no matching row under RLS returns no error at all in PostgREST —
verifying the actual persisted value, not the call's `error`, was the
fix; and a place/expense add "failing silently" was really a skipped
required `CategorySelect` field in the test script, not a real
submission problem.)

**Delete account**: created one dedicated new account, gave it a
friendship, a fully-populated owned trip, and editor access to another
trip where it paid for a shared expense split with the owner. Deleted
it via the new Danger Zone. Afterward: sign-in fails via both the UI
and a direct API call ("Invalid login credentials"); `profiles`,
`friendships`, `trip_members`, its owned trip, and its
`expense_participants` row are all gone with zero orphans found by
direct query; the *other* trip stayed completely untouched, still
owned by its real owner; the shared expense on it survived with
`paid_by` now `null` (confirming the FK fix) and only the real owner's
own participant row remaining.

**Cross-cutting**: signed-out `/friends` and `/profile` both still
correctly show only the sign-in gate, no badge, no Danger Zone; mobile
at 390px had no horizontal overflow anywhere in any of the above.
`npm run lint` and `npm run build` both pass clean throughout.

**Explicitly not built** (per the approved scope): a new collaborator
role, push notifications, realtime subscriptions, a Recent Activity/
social dashboard, messaging, blocking, email invitations, public
trip links, payment settlement.

## 26. Profile photo + editable display name

Optional profile photos, plus a real fix to display-name editing's own
visibility. Built in two passes — the second correcting two UX
problems the first pass's own live-testing never caught, and two real
backend bugs a later, deeper test then found — documented together
here as the one final, correct picture rather than two separate
churns.

### Schema — Supabase Storage, not a new table

`profiles.avatar_url` already existed (0001_init.sql) and was already
read by every repository embedding a profile
(friendsRepository.js's fromProfileRow, tripsRepository.js's
fromMemberRow) — it was just never populated or rendered. Three
migrations:

- **0009_profile_avatars.sql** — a new `avatars` Storage bucket
  (public read, matching `profiles`' own existing openness for
  display_name/avatar_url; write/delete restricted by RLS to
  `(storage.foldername(name))[1] = auth.uid()::text`, i.e. each user's
  own `{user_id}/avatar.jpg` — one canonical path per user, so
  "replace" is always a plain upsert, never a second orphaned file).
- **0010_fix_delete_own_account_storage.sql** — reverts a mistake
  0009 itself made (see "Two real bugs" below).

### Repository (`profilesRepository.js`)

`uploadAvatar(userId, blob)` — uploads an already-compressed JPEG
Blob to `{userId}/avatar.jpg` (`upsert: true`), then writes the
resulting URL — with a `?v=<timestamp>` cache-busting suffix, since a
fixed Storage key's public URL never changes across re-uploads and
would otherwise leave browsers serving a stale cached image forever
after a "replace" — to both `profiles.avatar_url` and
`auth.updateUser({ data: { avatar_url } })`, the same dual-write
`updateDisplayName` already established (RLS-covered, reactive
everywhere via the existing `onAuthStateChange` mechanism, no new
plumbing). `removeAvatar(userId)` mirrors it, clearing both back to
null. `deleteOwnAccount(userId)` now also removes the caller's avatar
file via the real Storage API before calling the `delete_own_account()`
RPC (see "Two real bugs").

### New shared presentation: `Avatar.jsx`

One component, `<Avatar avatarUrl displayName fallback className />`,
renders either an `<img>` (photo) or the existing `getInitials` span —
used everywhere a person's avatar already appeared (navbar,
FriendsPage's four lists, TripPeopleSection, AddTripFriends,
ProfilePage), each call site keeping its own existing sizing class
(`.friend-avatar`, `.profile-header-avatar`, a new
`.profile-button-avatar` for the navbar) unchanged — no per-screen
duplication of the "photo or initials" branch.

### `utils/image.js` — client-side validation + compression

`validateAvatarFile` rejects anything but JPEG/PNG/WEBP/GIF or over
8MB, with a plain message, before any decoding happens.
`compressImageFile` resizes (never upscales) to a 512px longest edge
and re-encodes as JPEG at 0.85 quality via an off-DOM `<canvas>` — no
new dependency, no image editor/cropper — so every uploaded avatar is
small and in one predictable format regardless of what went in.

### UI — one unified Edit profile modal, not two disconnected flows

The first pass built photo editing as a second, separate flow: a
"Change photo"/"Remove photo" link pair directly on the Profile
header's avatar, opening its own standalone preview modal
(`EditProfilePhoto.jsx`) — completely disconnected from the existing
"Edit profile" button/modal, which still only handled the display
name. Live-testing that pass reported two problems that turned out to
be the *same* root cause:

1. **The display name didn't read as editable.** There was an "Edit
   profile" button in Account Actions, but nothing next to the
   Display Name value itself signaled it could be changed.
2. **"The photo preview isn't appearing."** It technically was, in
   the separate photo modal — but reported against the "Edit Profile"
   flow specifically, because that's where a user editing their
   profile would naturally look for it, and found nothing photo-
   related there at all.

Fixed by consolidating: `EditProfile.jsx` now owns both display name
*and* photo in one form. `ProfilePage.jsx`'s header avatar went back
to being purely decorative; the "Your details" card's Display Name
row gained a small `Edit` button beside its value (reusing
`.edit-activity-button` — the same "Edit" button already used
throughout Voyage for activities/expenses/places, not a new style),
opening the one modal, which now also autofocuses the display-name
field on open. `EditProfilePhoto.jsx` was deleted — fully absorbed.

Inside the modal, photo state is **local and pending until Save** —
choosing a file or pressing Remove touches neither Storage nor
`profiles` at all; `selectedFile` (a newly chosen File) and
`removePhoto` (a pending "clear it" intent) together decide what the
modal's own live preview shows (the new file's `URL.createObjectURL`,
initials, or the actually-saved photo), computed via `useMemo` keyed
on `selectedFile` — not inside an effect that would call setState —
with a cleanup-only effect revoking the previous object URL each time
it changes, so nothing leaks. Re-selecting a file swaps the preview
immediately; Remove clears any selection *and* stages removal; an
invalid or oversized file leaves whatever was already staged
completely untouched, with its own error message. Cancel (the
modal's × button) never touches Storage or `profiles` — the local
state just unmounts, which is what "restores the saved photo" means:
the saved photo itself was never written to. Save applies the name
change, then — only if something was actually chosen or staged for
removal — the photo change, then closes; both are reflected
everywhere reactively (navbar, this page's own header) the same way a
name-only change always has been.

### Two real bugs found live-testing the fix (both now corrected)

1. **`delete_own_account()` was completely broken for any account
   with a saved avatar.** 0009 had it also `delete from
   storage.objects` directly in SQL before deleting the caller's
   `auth.users` row — Supabase rejects this outright ("Direct
   deletion from storage tables is not allowed. Use the Storage API
   instead."), since Storage manages a real backing blob alongside
   that metadata row and a raw SQL delete would only remove the row,
   orphaning the file. Because that statement ran first in the same
   function body, the error aborted the whole function — the
   `auth.users` delete was never reached at all for exactly the
   accounts most likely to exercise this path. Fixed by moving the
   avatar removal to the client, through the real Storage API,
   *before* calling the RPC (services/profilesRepository.js's
   `deleteOwnAccount(userId)`) — while the caller is still
   authenticated and Storage's own RLS still recognizes them as the
   file's owner — and 0010 reverts the SQL function itself back to
   exactly what 0008 originally had.
2. **A cosmetic, unavoidable console 403 after deleting an account.**
   `auth.signOut()`'s own network call (`POST /auth/v1/logout`) 403s
   afterward, since the account it would revoke a session for no
   longer exists — confirmed this happens even with `{ scope: 'local'
   }` (still a network call, Supabase's logout endpoint validates the
   user regardless of scope), and a browser's own "Failed to load
   resource" console line for a completed non-2xx response can't be
   suppressed by application code either way. `useAuth.js`'s `signOut`
   now accepts an optional `options` param, and `handleDeleteAccount`
   passes `{ scope: 'local' }` — the semantically correct choice
   (there's nothing server-side left to globally revoke) even though
   it doesn't eliminate the console line. Functionally harmless either
   way: the client's local session state clears correctly regardless,
   confirmed by the UI reaching the signed-out state every time. Not
   chased further — this is a platform-level artifact of "delete an
   account, then immediately try to log its own session out
   server-side," not an app bug, and is recorded here for the same
   reason the pre-existing JWT-clock-skew artifact already is
   elsewhere in this file: so it's never mistaken for a regression
   later.

### Live-tested end to end, twice (once per pass), with real accounts

First pass (photo upload, replace, remove, immediate updates, cross-
screen avatars, invalid/oversized rejection, mobile) all passed
functionally but surfaced the two UX complaints above. Second pass, on
the consolidated modal: Edit button visible and functional beside
Display Name; opening the modal focuses and prefills the name field;
selecting a photo shows its live local preview immediately (no wait
for upload); re-selecting swaps it again; an invalid file (wrong type)
and an oversized file (9MB) are both rejected with a clear message,
each time leaving the previously staged valid preview completely
untouched; Remove reverts the preview to initials before any save;
Cancel discards everything — verified directly against the database,
`avatar_url` stayed null and the display name stayed unchanged;
reopening, choosing a photo, changing the name, and Save updated the
Profile header and navbar avatar immediately, with the name change
visible with zero refresh; a refresh preserved both; removing the
saved photo and saving again returned initials everywhere, confirmed
against the database. A dedicated account with a saved avatar was then
deleted through the real Danger Zone flow: sign-in fails afterward
(both via the UI and a direct API call), the Storage file is
genuinely gone (confirmed via a direct `list()` call), and — the one
known artifact — the console shows the single expected 403 documented
above, nothing else. Mobile at 390px had no horizontal overflow either
pass. `npm run lint` and `npm run build` both pass clean.

**Explicitly not built** (per the approved scope): an image
editor/cropper, email changes, password changes, a public profile
page, avatar galleries/history.

## 27. Profile photo interactions + validated trip destinations + trip date overlap warning

Three independent improvements in one pass — an avatar viewer/click
model shared across every screen that already showed one, a real
destination picker replacing free-text trip destinations, and a
non-blocking overlap warning for trip dates. Inspected first (per the
task's own rule): Avatar.jsx, ProfilePage.jsx, EditProfile.jsx,
CreateTrip.jsx, geoapify.js/DestinationSearch.jsx, and
utils/itinerary.js — nothing here was rebuilt that already existed.

### 1A. Profile photo preview before saving

Already fully correct from §26's own fix — `EditProfile.jsx`'s
`useMemo`-derived local object URL, cancel-discards, invalid-file-
leaves-previous-selection-untouched behavior needed no changes here.
Re-verified live rather than assumed.

### 1B. Editing your own photo from the Profile page

`ProfilePage.jsx`'s header `Avatar` gained an `onClick` opening the
same existing `EditProfile` modal the Display Name row's own Edit
button already opens — not a second edit surface, just a second,
more discoverable way into the one that already existed. Works
whether you have a photo (click to change/remove) or not (click to
add one for the first time).

### 1C. Viewing another user's photo

New shared contract on `Avatar.jsx`: an optional `onClick` prop turns
the rendered `<img>`/initials `<span>` into a real `<button>` (a new
`.avatar-button` class resets browser button chrome and adds a quiet
hover/focus ring — no color or size change, so an avatar never reads
as a louder control than it is); omitted, Avatar renders exactly as
before. The *decision* of when to pass it stays with each caller, not
Avatar itself:
- `ProfilePage.jsx` always passes it (your own avatar; opens
  EditProfile regardless of whether a photo exists yet).
- `FriendsPage.jsx` (all four avatar lists), `TripPeopleSection.jsx`
  (owner + collaborator rows), and `AddTripFriends.jsx` only pass it
  when `avatarUrl` is already truthy — an initials-only avatar for
  someone else stays a plain, non-interactive `<span>`, satisfying
  "clicking an initials-only avatar should do nothing" structurally
  (there's no button there to click at all) rather than via a runtime
  no-op check.

New `AvatarViewer.jsx` — a compact, view-only lightbox (280px, `min()`-
capped to the viewport on mobile), reusing the existing `.modal-
overlay` backdrop and `modal-pop-in` animation but at a fraction of
`.modal`'s own size, with just a close button, the photo, and the
person's name. No edit affordance at all — editing only ever exists
for your own photo, via the existing EditProfile flow.

### 2. Validated, suggestion-based trip destinations

New `TripDestinationField.jsx`, reusing `services/geoapify.js`'s
existing `autocompleteCity` and the same debounce pattern
`DestinationSearch.jsx` (Explore's own search bar) already
established — not a second Geoapify integration, and
`DestinationSearch.jsx`/Explore's own "search whatever I typed"
behavior was left completely untouched, per the task's own
instruction. The shape is deliberately different from
DestinationSearch, though: a plain labeled form field matching Trip
name/every other CreateTrip field, not a search-bar-with-button — and,
the actual point of it, **there is no free-text-submit path at all.**

The field never decides whether the form can submit — it only reports
up to `CreateTrip.jsx` via two callbacks: `onSelect(label)` fires with
a composed `"City, Country"` string the moment a real suggestion is
chosen; `onInvalidate()` fires the instant the visible text stops
matching the most recently confirmed label (typing after picking one,
or after the trip's existing destination while editing). `CreateTrip.jsx`
keeps the confirmed label as its own state (`destination`, not read
from the input's raw FormData value) and blocks submission with an
inline `.form-error` — the same existing custom error styling as
every other CreateTrip field, no native browser validation — whenever
it's null. Editing an existing trip starts already-valid (its current
destination counts as confirmed without needing to re-pick), matching
how every other CreateTrip field already behaves on edit.

No schema change: `trips.destination` was already a plain text
column, and stays one — the composed `"City, Country"` string is all
that's ever written there, same shape free text used to produce. The
existing lazy, pool-cached Pexels image lookup
(`getCachedDestinationImage`, keyed off `trip.destination`'s own first
comma-segment) needed no changes either: since the stored string is
now always a real, well-formed city name rather than arbitrary typed
text, "the trip image is based on the selected real destination" is
satisfied by construction, not a new eager fetch — reusing the
existing architecture exactly as instructed.

### 3. Trip date overlap warning

New `dateRangesOverlap`/`findOverlappingTrips` in `utils/itinerary.js`
— pure `"YYYY-MM-DD"` string comparison (`startA <= endB && startB <=
endA`), the same convention `isTripUpcoming` already established in
this file specifically to sidestep timezone/Date-object edge cases
entirely; no new date-parsing path introduced. `CreateTrip.jsx` now
accepts an optional `trips` prop — `App.jsx` passes its own existing
`visibleTrips` (already RLS-scoped to every trip the signed-in user
can see, owned or shared, with zero query changes needed for that) —
and computes `overlappingTrips` fresh on every render via `useMemo`,
excluding the trip being edited itself. Purely informational: rendered
as a new `.trip-date-overlap-warning` block (the same amber palette as
the itinerary's own existing `.activity-overlap-warning` pill for a
same-day activity clash — the same underlying idea, just a block
instead of an inline pill since this can name more than one trip),
never gates the submit button, exactly matching "Voyage should still
allow overlapping trips, just warn about them." Names each overlapping
trip and its date range (`formatDateLabel`, already used identically
in the trip header) rather than just saying "you have a conflict."

### Live-tested in three passes with real, disposable accounts

**Destination + overlap**: typing pure nonsense and submitting was
blocked with the exact inline error; typing "Rom" surfaced real
suggestions (Rome, Roman) and selecting one filled the field with
"Rome, Italy"; typing a real prefix ("Pari") without ever selecting a
suggestion was still blocked on submit, confirming the invalidate-on-
divergence logic actually works, not just the initial-empty case.
Created one trip (Rome, no prior trips to overlap with — no warning,
correctly). A second, overlapping trip showed *"Date overlap — These
dates overlap with your trip "Random Test Trip" (2 October 2026 – 11
October 2026)."* and was still created successfully on submit. A
third, non-overlapping trip showed no warning. Trip cards afterward
displayed the correctly composed "City, Country" destinations for all
three.

**Avatars**: clicking your own Profile avatar opened EditProfile;
selecting then re-selecting a different photo updated the local
preview each time (confirmed via distinct `blob:` URLs); Cancel left
`profiles.avatar_url` `null` in the database, confirmed by direct
query; a real Save updated the Profile header and navbar avatar
immediately. A second account (friended, with its own uploaded photo)
was viewable from the Friends list: clicking their avatar opened
AvatarViewer showing the right photo and name; a third, photo-less
account's row rendered as a plain `<span>` with no `.avatar-button` at
all, and a forced click predictably opened nothing.

**Shared trips + mobile**: A owned a trip, added B as a collaborator;
B's own dashboard correctly showed the shared trip (existing RLS/
`visibleTrips`, unchanged); B creating their own overlapping trip
correctly saw the warning naming *A's* shared trip by name and dates —
confirming the overlap check draws from every trip visible to the
signed-in user, not just ones they own. Mobile at 390px: the
destination suggestions dropdown, the overlap warning, and
AvatarViewer all rendered with zero horizontal overflow.

Zero console errors across all three passes. `npm run lint` and
`npm run build` both pass clean. Every test account created for this
milestone (seven total, across the three passes) was self-deleted via
the real account-deletion flow afterward; a final direct query
confirmed `profiles` still holds exactly the three real accounts from
§25/§26's cleanup — none of this testing touched them.

**Explicitly not built** (per the approved scope): any change to
Explore's own destination search, a schema change for trip
destinations (lat/lon are resolved but never persisted — only the
composed label string is, unchanged from before), blocking overlap
creation, a new notification/realtime system, or any redesign of the
navbar/Profile/CreateTrip layout beyond the specific interactions
asked for.

## 28. Dashboard — Shared Trips, Friends & Recent Activity

The signed-in dashboard's first real "fuller and more alive" pass:
owned vs. shared trips as separate sections, a compact Friends
summary, and a genuinely truthful Recent Activity feed. Inspected
first: App.jsx's whole dashboard render tree, TripCard.jsx,
tripsRepository.js's getSupabaseTrips, friendsRepository.js, and every
table's actual columns (see §3 below) before deciding anything needed
to change or be added.

### 1. Your Trips vs. Shared With You

A pure display-time split of the same already-loaded trip list — no
new query, no change to what counts as Upcoming vs. Past.
`tripsRepository.js`'s `getSupabaseTrips(currentUserId)` (now takes
the signed-in user's id, purely to pick out *which* of a trip's
several `trip_members` rows is "my own" role — every row was already
independently RLS-scoped) additionally fetches `trip_members` in the
same parallel batch as saved_places/activities/expenses, merges every
member's user id into the same profiles-resolution query already
running for expense payers/participants (no second profiles query),
and returns two new fields per trip: `myRole` and `ownerName`.
`App.jsx` splits the existing `upcomingTrips` list by
`trip.ownerId === auth.user.id` into `ownedUpcomingTrips` (renders in
the existing "YOUR TRIPS" section, unchanged empty-states just
re-keyed to this narrower list) and `sharedUpcomingTrips` (a new
"SHARED WITH YOU" section, rendered only when non-empty). Past trips
deliberately stay one combined list (unchanged) rather than splitting
into a fourth section — a shared past trip's own card still shows its
role/owner caption inline.

`TripCard.jsx` gained two optional props, `role`/`ownerName` — a
small pill (reusing `.friend-status-pill` verbatim, the exact same
OWNER/EDITOR/VIEWER language TripPeopleSection.jsx's People list
already uses) and a quiet "Owned by X" caption, both omitted entirely
for a trip the viewer owns. One `:last-of-type` CSS selector that
implicitly assumed the dates line was always a card's last paragraph
was replaced with an explicit `.trip-card-dates` class before adding
the new caption, so it wouldn't silently break the moment that stopped
being true.

### 2. Friends summary

New `DashboardFriendsSummary.jsx` — reuses `friendsRepository.js`'s
existing `getFriends` (the same call FriendsPage.jsx's own list
already makes, not a second friends query) and `Avatar.jsx`. Shows the
first 4 friends as tappable "avatar + name" chips (`.dashboard-friend-
chip`, wrapping via flex-wrap on mobile) plus a quiet "+N" for the
rest, always navigating to `/friends` — no accept/decline/remove
affordance belongs on the dashboard. Empty state ("Plan better
together.") only when the user genuinely has zero friends.

### 3. Recent Activity — what's derivable vs. what needed a new table

Checked directly before writing any migration: `trips`/`activities`/
`expenses` already have `created_at` *and* `updated_at`;
`trip_members`/`saved_places`/`expense_participants` only have
`created_at`. The blocking gap wasn't timestamps, though — it was that
*none* of activities/saved_places/expenses records who performed the
write. A shared trip can be edited by its owner or any editor, and
nothing on those rows says which one actually did it; attributing
"Chuck added Dinner" from them alone would mean guessing, which this
milestone was explicit about never doing. Two tables were the
exception: `trip_members` (only a trip's owner can ever insert a
non-owner row — 0006/0008's own RLS) and `friendships` (only a
request's recipient can ever flip status to `'accepted'` — 0005's own
RLS) both have a database-*enforced* actor, not a guessed one.

Conclusion: two of the five requested event types were already
reliably derivable; three weren't. Per this milestone's own fallback
instruction, the smallest clean addition — not three new
near-identical `created_by` columns, each still needing something to
turn a raw insert into a readable feed row — is one new table,
**`activity_events`** (migration `0011_activity_feed.sql`), populated
*exclusively* by `security definer` triggers on the real write paths
(activities/saved_places insert, expenses insert when `paid_by` is
set — i.e. genuinely shared, trip_members insert excluding the
owner's own auto-created row, friendships' pending→accepted
transition). Every trigger uses `auth.uid()` at the moment of the real
write as the actor — never a column like `paid_by` (who a shared
expense says paid, which a trip's owner/editor can set to any fellow
member, not necessarily themself) — so the actor is always
database-verified, never inferred. **No app code ever inserts into
this table** — there is no INSERT/UPDATE/DELETE grant to
`authenticated` at all, only SELECT, so fabricating an event is
structurally impossible from the client, not just discouraged.
Nothing is backfilled: history only starts existing from the moment
the migration ran.

Columns: `trip_id` (null only for `friend_added`), `actor_id`
(always set), `subject_user_id` (the "someone else" side, when there
is one — the newly-added collaborator for `trip_shared`, the other
side of a new friendship for `friend_added` — used only for display
copy, never for authorization), `event_type`, a small truthful
`summary` snapshot captured at event time (an activity/place/expense's
name, or a trip's name for `trip_shared`) rather than a live reference
re-resolved on every read — deliberately not a foreign key to the
activities/saved_places/expenses row itself, so a later rename or
delete of that row never silently changes or erases a real "this
happened" record.

**RLS/privacy — one policy covers every event type**: a trip-scoped
event (`trip_id is not null`) is visible to exactly the trip's
*current* members via the same `is_trip_member(trip_id)` every other
trip-related table's RLS already uses — automatically excluding
anyone removed since (their access to that trip's whole activity
history disappears the same instant their `trip_members` row does,
with zero separate logic needed) and automatically including a new
member for the trip's past activity too. A non-trip event (`friend_
added`) is visible only to the two people actually in it
(`auth.uid() in (actor_id, subject_user_id)`). Nobody else can ever
see a row.

`services/activityRepository.js`'s `getRecentActivity(currentUserId,
limit=10)` reads `activity_events` ordered `created_at desc`, embeds
`trips(name)` directly (a normal FK to a public table, unlike actor_id/
subject_user_id which reference `auth.users` and need the same
two-query-then-join pattern every other repository in this app already
uses for exactly that reason), and shapes `actorName`/`subjectName` to
read "You"/"you" for the signed-in user's own side of an event.
`DashboardRecentActivity.jsx` builds the actual sentence per
`event_type` from that already-resolved data (never pre-formatted
server-side) and renders relative times via a new
`formatRelativeTime` in `utils/date.js` ("Just now" / "N minutes/hours
ago" / "Yesterday" / "N days ago", falling back to the existing
`formatDateLabel` past a week). Capped at 10 rows; a polished "Nothing
new yet." empty state when there's genuinely none.

### Live-tested with real, disposable accounts

Two owner/editor/friend accounts plus a third friend with no trip
access. Owner's dashboard: both trips under YOUR TRIPS, no duplicate
SHARED WITH YOU (an owner never sees their own trip as "shared").
Collaborator's dashboard: the shared trip appeared under SHARED WITH
YOU with the correct `EDITOR` pill and "Owned by Dash OwnerA" caption.
Friends summary showed the right chips for accounts with 1 and 2
friends, and the correct empty state for zero. The collaborator then
added a real activity, a real saved place, and a real shared expense
to the shared trip — all six resulting `activity_events` rows
(2 friend_added, 1 trip_shared, activity_added, place_added,
expense_added) had the exactly correct actor, trip, and summary,
confirmed both via direct query and by reading the owner's own
dashboard feed, newest-first: *"Dash EditorB added a shared expense to
Paris Weekend" → "...saved Eiffel Tower..." → "...added Dinner..." →
"You shared Paris Weekend with Dash EditorB" → both friend_added
lines*. The uninvolved third friend's dashboard showed only their own
friend_added event — zero trip activity leaked — confirmed both in
the UI and by a **direct Supabase query bypassing the UI entirely**
(0 rows returned for the trip they weren't a member of). A direct
attempt to insert a fabricated event was rejected outright:
`permission denied for table activity_events`. Removing the
collaborator from the trip was then confirmed, via another direct
query, to immediately drop their access to that trip's entire activity
history (4 rows → 0), and their own dashboard's SHARED WITH YOU
section and activity feed updated to match with no other change.
Activity and Friends both persisted correctly across a real page
refresh and a full sign-out/sign-in cycle. Mobile at 390px: friend
chips wrap, activity rows stack (description above, relative time
below) instead of clipping, trip cards use their existing responsive
behavior unchanged. Zero console errors throughout. `npm run lint` and
`npm run build` both pass clean.

**Explicitly not built** (per the approved scope): notifications,
trip invitations, comments, chat, realtime updates to the feed (a
refresh is required to see new activity from someone else — matching
"do not add realtime subscriptions yet"), editing/deleting activity
events, and any activity type beyond the five listed (e.g. role
changes — `trip_members` has no `updated_at` at all, so a role change
has no reliable timestamp to attribute either, the same gap that
justified `activity_events` in the first place; adding one wasn't
asked for and was left alone).

## 29. Trip invitations + unified notifications

Replaced §23's immediate-add sharing flow with a real invite/accept
model, and added Voyage's first persistent, cross-device notification
system. Inspected first, per this project's own discipline: the
existing `trip_invitations` table (schema-only since `0001_init.sql`,
scaffolded for an email-based flow no app code had ever wired up),
`trip_members`/`friendships`/`are_friends`/`is_trip_member`/
`trip_role` from §21/§23, and `activity_events` from §28 — before
writing any migration, to reuse rather than duplicate.

### Why a new migration was necessary

Sharing a trip could no longer be a single RLS-checked INSERT (§23) —
an invite/accept/decline model needs a pending state a second party
acts on, atomic accept semantics (create the membership *and* mark the
invitation resolved together, never one without the other), and a way
to notify the invitee. None of that existed yet, so two migrations
were added: **`0012_trip_invitations_and_notifications.sql`** (the
core feature) and **`0013_fix_invitee_trip_preview.sql`** (a real bug
found live-testing, below).

### How invitations work

`trip_invitations` reused, not duplicated — `invited_email` (the old,
never-used column) made nullable rather than dropped, and a new
`invited_user_id` (→ `auth.users`) column added for the real,
existing-friend flow this feature actually needed. A partial unique
index, `trip_invitations_unique_pending` on `(trip_id,
invited_user_id) where status = 'pending'`, is what makes duplicate
pending invitations for the same person/trip a database-level
impossibility — the same pattern §21's `friendships_unique_active_pair`
already established for friendships.

- **Send** — owner-only INSERT policy: `trip_role(trip_id) = 'owner'
  and invited_by = auth.uid() and are_friends(auth.uid(),
  invited_user_id) and role in ('editor', 'viewer')`. The explicit
  `invited_by = auth.uid()` check (added before this migration was
  ever shown to the user, not a testing fix) exists specifically so an
  owner can't forge a different `invited_by`, which would misdirect
  the eventual accept/decline notification to the wrong person.
  `AddTripFriends.jsx` (renamed from its §23 add-flow: button copy
  "Invite", modal title "Invite friends") calls
  `invitationsRepository.js`'s `inviteToTrip`, filtered against both
  the trip's existing members and anyone already invited-and-pending.
- **Accept** — a `security definer` function,
  `accept_trip_invitation(p_invitation_id)`, the same atomic-write
  pattern this project already uses for `handle_new_trip`/
  `delete_own_account`/the `activity_events` triggers. Row-locks the
  invitation (`select ... for update`), checks `invited_user_id =
  auth.uid() and status = 'pending'` explicitly in the function body
  (security-definer bypasses RLS, so these checks can't be left to RLS
  alone), inserts the real `trip_members` row (`on conflict (trip_id,
  user_id) do nothing`, so a double-click can't error), and updates the
  invitation to `'accepted'` — both writes happen together or not at
  all. `NotificationBell.jsx`'s Accept button calls this via
  `invitationsRepository.js`'s `acceptTripInvitation`.
- **Decline** — a plain UPDATE, RLS-checked directly (`invited_user_id
  = auth.uid() and status = 'pending'`, with-check `status =
  'declined'`) — no membership row is ever created, so no
  security-definer function is needed for this direction.
- **Cancel** — owner-only DELETE (`trip_role(trip_id) = 'owner' and
  status = 'pending'`) from `TripPeopleSection.jsx`'s new "Pending
  Invitations" sub-list (owner-only, role + PENDING pill, Cancel
  button). A cancelled invitation is a deleted row, so
  `accept_trip_invitation` correctly finds nothing and refuses
  ("Invitation not found") — cancellation and un-acceptability are the
  same fact, not two things kept in sync separately.
- **Re-inviting after decline/cancellation** just works — the unique
  index only constrains `pending` rows, so a fresh INSERT is
  unconstrained once the old row is `declined` or gone.
- **The old immediate-add path is retired at the database level, not
  just the UI** — §23's `trip_members` INSERT policy
  ("owners can add friends as collaborators") was dropped with **no
  replacement policy at all**. The only remaining way a non-owner
  `trip_members` row can ever be created is through
  `accept_trip_invitation`, which bypasses RLS entirely by running as
  its owning role — so a raw client INSERT attempt is now structurally
  refused, not just discouraged by a missing button.

### How notifications work

A "derived vs. persisted" split, applied deliberately per this
milestone's own instruction not to create storage where existing data
already answers the question:

- **Purely derived, zero new storage**: "you have a friend request
  waiting" and "you have a trip invitation waiting" are read directly
  off `friendships`/`trip_invitations`' own pending rows —
  `invitationsRepository.js`'s `getMyPendingInvitations` and the
  existing `friendsRepository.js` incoming-requests query. There is no
  "friend request notification" row anywhere; the pending friendship
  row *is* the notification.
- **Genuinely needed persisted storage**: "Ada accepted your
  invitation" / "Ada declined your invitation" have no natural
  "pending" state — the underlying fact (the invitation's resolved
  status) is permanently true from the moment it happens, but the
  *notification about it* is a one-time, dismissible thing. That's the
  one new table, `notifications` (`recipient_id`, `actor_id`,
  `trip_id`, `type` check in `('invitation_accepted',
  'invitation_declined')`, a snapshot `summary` — the trip's name at
  notification time, same reasoning as `activity_events.summary`, so a
  later trip rename/deletion never corrupts an already-delivered
  notification — `is_read`, `created_at`). Populated *exclusively* by a
  new `security definer` trigger, `log_invitation_response` (AFTER
  UPDATE on `trip_invitations`, fires only on the transition into
  `accepted`/`declined`). **No INSERT or DELETE grant to
  `authenticated` at all** — only SELECT (own rows) and UPDATE (own
  rows, to mark read) — the same "fabrication is structurally
  impossible" pattern already established for `activity_events`.
- `notificationsRepository.js`'s `getUnreadNotifications`/
  `getUnreadNotificationsCount`/`markNotificationsRead` follow the same
  two-query-then-join pattern (`actor_id` references `auth.users`, not
  `profiles`, so can't be PostgREST-embedded) already used throughout
  this project.

### The notification bell (UI)

One notification surface, replacing the old Friends-nav badge
entirely — not two competing systems. `NotificationBell.jsx`, mounted
in `App.jsx`'s navbar between the mobile-nav toggle and the profile
button (signed-in only): a bell icon button with a badge count
(`friendRequests.length + tripInvitations.length + notifications.length`,
the same `.nav-badge` class the old Friends badge used, just no longer
Friends-specific), opening a `.notification-popover` on click
(click-outside and Escape both close it, same pattern every existing
picker in this app already follows). Trip-invitation rows show
inviter avatar/name, trip name, an uppercase ROLE pill, and
Accept/Decline buttons; friend-request rows show the requester and
Accept/Decline; informational rows ("Ada accepted your invitation to
Paris Weekend") show relative time via the existing
`formatRelativeTime`. All three reuse existing classes
(`.friend-avatar`, `.friend-status-pill`, `.secondary-button`,
`.edit-activity-button`) rather than introducing new ones. A "View
Friends →" footer link stays for anything the popover doesn't cover.
Opening the popover marks the informational notifications read
(`markNotificationsRead`, background call, and locally zeroes them out
of the badge count immediately — a failure there just means they still
count next time, never worth its own error state).

State lives in `App.jsx` (`notificationSummary` +
`refreshNotifications`), not owned internally by the bell — the same
"lifted, not local" pattern §28 established for
`incomingRequestsCount`, now generalized so `FriendsPage.jsx`'s own
accept/decline/cancel actions (a different screen) can also trigger a
refresh of the same shared badge (`onNotificationsChanged`, renamed
from §28's `onIncomingCountChange`). Accepting a trip invitation also
triggers `loadTrips()` (extracted as a reusable function from what was
previously an inline effect body) so the newly-accepted trip appears
immediately, no refresh needed.

### Recent Activity — one truthful addition, one corrected attribution

Accepting a trip invitation **can** appear in Recent Activity
truthfully and securely, using the exact architecture §28 already
built: `trip_members` insert already has a database-enforced actor
(only `accept_trip_invitation`, running as the invitee via
`auth.uid()`, can create a non-owner row now). A new trigger,
`log_trip_joined` (AFTER INSERT on `trip_members` WHEN `role <>
'owner'`), records `"Ada joined Paris Weekend"` — a real,
membership-creation-time event.

This surfaced a genuine, self-caught bug in §28's own
`log_trip_shared` trigger: it assumed only a trip's *owner* could ever
insert a non-owner `trip_members` row (true under §23's immediate-add
model), so it fired *at membership-creation time* with the owner as
actor. Once acceptance became invitee-driven, that assumption became
false — the invitee, not the owner, is who creates that row now.
Fixed by splitting one trigger into two individually-accurate ones
rather than patching one to cover two different actors and two
different real-world moments: `log_trip_invitation_sent` (AFTER INSERT
on `trip_invitations`, fires at *invite-send* time, actor = the
provably-owner inviter — `"You invited Ada to Paris Weekend"`) and the
new `log_trip_joined` above (fires at *accept* time, actor = the
provably-invitee joiner). `DashboardRecentActivity.jsx`'s
`trip_shared` copy was reworded to match ("invited", not "shared
with", since acceptance is no longer immediate) and a new
`trip_joined` case added. Notifications and Recent Activity stay
architecturally distinct, per this milestone's own instruction:
notifications are personal and directed (a bell only its recipient
ever sees); Recent Activity is shared collaboration history visible to
every current trip member.

### Security / RLS — summary

Every rule from the task's own security list is enforced at the
database, not just hidden in the UI: only an owner can INSERT/DELETE a
trip's invitations (RLS); only an accepted friend can be the
`invited_user_id` (`are_friends` in the INSERT policy's WITH CHECK); a
user has zero trip access before accepting (no membership row exists
until `accept_trip_invitation` runs, and that function itself checks
`invited_user_id = auth.uid()`, so nobody can accept on someone else's
behalf); a cancelled (deleted) invitation cannot be accepted (nothing
for the function to find and lock); `notifications` has no INSERT/
DELETE grant at all, so a notification can never be fabricated by a
client, only ever written by the `log_invitation_response` trigger
firing off a real, already-RLS-verified status transition; every
`notifications`/`trip_invitations` SELECT policy scopes to the
authenticated caller's own id, so an uninvolved user querying either
table for someone else's rows gets zero results back, confirmed
directly against the API, not assumed from the UI.

### Two real bugs found live-testing (and how they were found/fixed)

1. **Invitee's notification popover showed no trip name.**
   `getMyPendingInvitations`'s embedded `trip:trips(name)` PostgREST
   join silently returned null for the invitee — a discovery that
   generalizes beyond this feature: **a PostgREST embedded join is
   subject to the *joined* table's own RLS, independent of whether the
   outer row is visible.** `trips`' only SELECT policy
   (`is_trip_member(id)`) doesn't cover someone who's only been
   invited, not yet a member. Fixed with
   `0013_fix_invitee_trip_preview.sql` — one additive SELECT policy
   letting a pending invitee preview a trip's row (name/destination/
   dates/budget only — itinerary, places, expenses, and people stay
   exactly as restricted, in their own separately-RLS'd tables).
2. **Fixing bug 1 leaked a not-yet-accepted trip into the invitee's own
   dashboard.** The new 0013 policy, while correctly fixing the embed,
   also made the unrelated `getSupabaseTrips`'s broad `select('*')`
   return that trip row for the invitee before acceptance — a second
   generalizable lesson: **a narrow RLS policy added for one reader's
   one legitimate need can leak into any other, unrelated query
   against the same table**, and the fix belongs in the *consuming
   code*, not by walking back the (correct, necessary) RLS policy.
   Fixed with an explicit `.filter()` in `tripsRepository.js`'s
   `getSupabaseTrips`, requiring an actual `trip_members` row for the
   current user before a trip is included in the returned list —
   "visible to me" (RLS) and "I'm actually a member" (product
   semantics) are different questions, and only the app layer knows
   which one `getSupabaseTrips`'s caller actually needs.

Both were caught before being declared done, diagnosed from first
principles (how PostgREST embeds interact with RLS), and fixed at the
layer that actually owned the problem.

### Live-tested with four real, disposable accounts (A, B, C, D)

Two full Playwright passes against the real Supabase project. **Part
1**: invite as viewer (correct role, no access before accepting, full
access after), invite as editor, decline (no access, no membership,
re-inviteable), friend-request and trip-invitation notifications
rendering correctly with working Accept/Decline, badge counts updating
with no page refresh, the two real bugs above found and fixed,
`trip_joined`/reworded `trip_shared` both appearing correctly in
Recent Activity. **Part 2**: re-invite after decline (works); duplicate
pending invitation (blocked — `trip_invitations_unique_pending`
constraint violation, direct API); non-friend invite (blocked, RLS,
direct API); non-owner (an accepted viewer) sending an invitation
(blocked, RLS, direct API); accepting a just-cancelled invitation
(blocked — `"Invitation not found."`); the trip owner attempting to
accept an invitation addressed to someone else (blocked —
`"This invitation is not yours to accept."`), immediately followed by
confirming the correct invitee still could; an uninvolved fourth
account directly querying another user's invitations or notifications
(0 rows both times, RLS-scoped); a direct attempt to fabricate a
notification row (blocked — `"permission denied for table
notifications"`); UI persistence of the popover's informational
notification and the activity feed across a plain refresh and a full
sign-out/sign-in cycle; mobile at 390px across the dashboard, the open
notification popover, and the trip page's pending-invitations list —
all measured `scrollWidth === 390`, no horizontal overflow, and
visually confirmed via screenshots to match Voyage's existing design
language (same bell-adjacent button sizing as the profile button, same
pill/card/typography conventions, no new colors or icons introduced).
Zero unresolved console errors throughout either pass (only the
pre-existing, already-documented `PGRST303` JWT-clock-skew sandbox
artifact). `npm run lint` and `npm run build` both re-confirmed clean
on the final code state. All four disposable accounts and the one test
trip were fully cleaned up via the app's own real deletion paths
(`delete_own_account()`), verified via direct queries; the three real
accounts (Sibora, Ada Lovi, Chuck Bass) were never referenced by any
test script and are structurally unreachable by `delete_own_account()`
regardless (it takes no parameters and hardcodes `where id =
auth.uid()`).

### Files changed

- **New**: `supabase/migrations/0012_trip_invitations_and_notifications.sql`,
  `supabase/migrations/0013_fix_invitee_trip_preview.sql`,
  `src/services/invitationsRepository.js`,
  `src/services/notificationsRepository.js`,
  `src/components/NotificationBell.jsx`.
- **Modified**: `src/services/tripsRepository.js` (removed
  `addTripCollaborator`; added the membership `.filter()` fixing bug
  2 above), `src/components/AddTripFriends.jsx` (invite flow),
  `src/components/TripPeopleSection.jsx` (Pending Invitations
  sub-list), `src/components/DashboardRecentActivity.jsx` (reworded
  `trip_shared`, added `trip_joined`), `src/components/FriendsPage.jsx`
  (`onNotificationsChanged` prop rename), `src/App.jsx`
  (`notificationSummary`/`refreshNotifications`, `<NotificationBell>`
  mounted, old Friends-nav `.nav-badge`s removed, `loadTrips()`
  extracted), `src/App.css` (`.notification-*` block, `.trip-people-
  pending`).

### Explicitly deferred (not forgotten)

No realtime push for the badge or popover — a signed-in session picks
up new notifications/invitations on its own next load or an explicit
action-triggered `refreshNotifications()` call, not instantly the
moment another user acts (matching this whole project's consistent
"no realtime subscriptions yet" stance, §28 included). No dedicated
notifications page — the popover covers every case the spec asked for,
and adding a second surface would be exactly the "two competing
systems" this milestone was explicitly told to avoid. No notification
type for trip role changes, for the same reason §28 already documented
for `activity_events`: `trip_members` still has no reliable timestamp
for a role change to attribute one to.

## 30. Trip Page hierarchy fix — "Trip spent" honesty (My Budget vs. Group Spending)

A follow-up UI/UX pass, explicitly scoped to the relationship between
My Budget, Group Spending, shared/personal expenses, and Balances — the
§18 audit's own roadmap had already been fully worked through (all 8
items), so this wasn't a continuation of an old backlog; it came from
inspecting the current code fresh, per this pass's own instructions not
to assume anything from before §24/0014.

**What was found.** §24/0014 (`0014_personal_trip_budgets.sql`) already
made a trip's budget genuinely personal — one `trip_member_budgets` row
per (trip, user), private to its owner regardless of role — specifically
so "My Budget" would stop being "a fake label on shared data" (that
migration's own words). `BudgetSection.jsx`/`TripPage.jsx` already carry
that framing through consistently elsewhere: distinct section labels
("MY BUDGET" vs "GROUP SPENDING"), a private per-user budget row, and
Balances deliberately kept subordinate to Group Spending rather than a
peer section (both already in place before this pass, not touched here).
But one thing was left unreconciled: **inside "My Budget," the "Spent"
stat (and therefore "Remaining," the progress bar, and the per-category
breakdown) was computed from `trip.expenses` — every expense on the
whole trip, personal and shared, logged by any collaborator — not
anything scoped to the signed-in user.** A user with a $200 personal
budget could see "Spent: $2,000 / Remaining: -$1,800 — Over budget," a
figure describing their travel companions' spending, under a heading
that's explicitly private and their own. This worked directly against
the product direction this pass was given: "My Budget" read as tracking
group activity, not feeling separate from it.

**Why this wasn't "fixed" by scoping Spent to the user instead.** The
`expenses` table (`0001_init.sql`) has no column identifying who logged
a *personal* expense — `paid_by` is only ever set for a shared expense
(always `null` on a personal one, see `AddExpense.jsx`). There's
currently no reliable way to compute "expenses this specific person
logged" from data that exists. Doing that properly would need a schema
change (e.g. a `created_by` column on `expenses`) — flagged here, not
implemented, per this pass's own instruction to stop and explain rather
than make a schema change unprompted. It would also be a second, larger
change than the hierarchy/terminology problem this pass was scoped to.

**The fix implemented — labeling honesty, zero calculation change.**
`BudgetSection.jsx`: the stat labeled "Spent" is now labeled **"Trip
spent"**, and one new caption renders directly beneath the three stats
(above the progress bar), shown only in the populated-budget state:
*"Measured against the trip's total spending below, not just yours."*
The number itself is byte-for-byte the same `totalSpent` value as
before (`getTotalSpent(expenses)`, still every expense on the trip) —
this is a presentation-only change. No calculation, permission, or
schema code was touched; Balances/settlements markup and logic are
untouched entirely. New CSS: `.budget-scope-note` (`App.css`), reusing
the existing 13px/`#707070` muted-caption scale already used by
`.expense-date`/`.expense-split-info` — no new colors, radii, or
components.

**What was deliberately left unchanged, and why.** `AddExpense.jsx`'s
Personal/Shared toggle (same wording as always) was inspected too: a
"Personal" expense is only "not split with anyone" — it's still visible
trip-wide under Group Spending to every collaborator with view access,
same as a shared one (the `expenses` table has no per-viewer visibility
concept at all). This is a real, separate terminology nuance (arguably
"Personal" invites a private/"just mine" reading it doesn't have), but
it's a different, smaller-radius problem than the one this pass
targeted, and fixing both in one pass risked diluting either fix — left
as a noted, not-yet-addressed finding for a future pass, not silently
patched in.

**Live-tested** with a fresh disposable Supabase account (Playwright,
headless Chromium, real signed-up user, no pre-seeded data): a trip with
no expenses/no budget (empty states unchanged, no caption renders,
matching the code — the caption only exists inside the populated-budget
branch); set a $500 personal budget, added two expenses (Museum tickets
$120/Activities, Hotel deposit $550/Accommodation) pushing it into the
over-budget state — confirmed "Trip spent $670.00," "Remaining -$170.00"
in red, "Over budget by $170.00," the new caption rendering cleanly
between the stats and the progress bar, and the category breakdown all
correct and unchanged in behavior; confirmed at 1440px and at mobile
390px (`scrollWidth === clientWidth === 390`, caption wraps to two
lines cleanly, no overflow); refreshed the page and confirmed the
budget, expenses, over-budget state, and caption all persisted
identically; zero console errors across every stage. Balances/settlement
UI wasn't independently re-tested with a second collaborator this pass
— the diff never touches that code path (confirmed by inspection), so
this was treated as a lower-risk, code-reviewed no-op for that area
rather than re-running the full multi-account matrix §24 already
covered. Cleaned up via the app's own UI: the test trip was deleted,
then the disposable account itself was deleted via its own "Delete
account" flow (confirmed back at the signed-out state, zero leftover
data). `npm run lint` and `npm run build` both pass.

### Files changed

- **Modified**: `src/components/BudgetSection.jsx` ("Spent" ->
  "Trip spent" label; new explanatory `<p className="budget-scope-note">`
  under the budget-stats row), `src/App.css` (`.budget-scope-note`
  rule).
- **Nothing else** — no schema, no repository/query, no calculation
  (`utils/budget.js` untouched), no permission-gating code, no other
  component.

### Explicitly deferred (not forgotten)

**True per-user "what I actually spent" tracking** — would require a
schema change (attributing each expense, or at least each personal one,
to the collaborator who logged it) plus a UI decision about how it reads
next to a shared expense's own participant/payer breakdown. Flagged for
a future pass, not started here. **The Personal/Shared expense-toggle
wording** noted above — a related but separate, smaller finding, also
left for a future pass rather than bundled into this one.

## 31. Personal/Shared expense toggle — "Personal" doesn't mean private

Direct follow-up to §30's own deferred item: the Personal/Shared
expense-toggle wording, audited and fixed on its own.

**The audit question.** Does a normal user clearly understand what
"Personal" and "Shared" mean on the Add Expense toggle
(`AddExpense.jsx`)? Read against the real data model rather than
assumption:

- A shared expense has `expense_participants` rows, feeds
  `calculateSharedExpenseBalances`/Balances, and its row shows a
  "SHARED" pill plus the full "Paid by X · split N ways — …" breakdown
  in Group Spending — well-instrumented already, not touched here.
- A personal expense is exactly "zero participant rows" — not a
  separate flag, not a separate visibility rule. The `expenses` table
  (`0001_init.sql`) has no `created_by`/owner column at all; RLS's
  "members can view expenses" policy is scoped by `trip_id` only. A
  personal expense is visible to **every** collaborator with view
  access the moment it's saved — identical visibility to a shared one —
  and (per §30) it still counts toward "Trip spent" for everyone too.
- Nothing in the modal or the expense list ever said this. The toggle
  sits on the very same page as "My Budget," which — since §24/0014 —
  *is* genuinely private per person. A user reading "Personal" right
  next to a real "private to you" feature has every reason to assume
  the same meaning applies here. It doesn't, and the schema can't back
  that assumption up (confirmed live below: a viewer who never touched
  a "Personal" expense could see it in full, immediately).

**The fix — one honest, conditional line, no relabeling.** A comment/
caption was added directly under the toggle in `AddExpense.jsx`, shown
only while **Personal** is the selected option (hidden the instant
Shared is chosen, where the participant picker + live split preview
already make the mechanics self-evident — a second explanation there
would be redundant, not clarifying):

> Personal just means the cost isn't split with anyone — it's still
> visible to everyone on this trip.

No claim of privacy anywhere in the copy — it says the opposite,
honestly. The "Personal"/"Shared" labels themselves, the toggle's
`.filter-pill` mechanics, `isShared`/`canShare` logic, and every
downstream save/split/balance/RLS path are all byte-for-byte unchanged.
New CSS: `.expense-type-hint` (`App.css`) — same 13px/`#707070`/`-8px`
margin-top treatment already established by `.expense-split-preview`
right below it in the same file, given its own class rather than reused
verbatim (same "visually identical on purpose, a different concept"
precedent as `.expense-shared-pill` vs `.friend-status-pill`).

**What was deliberately not done, and why:**
- **No "PERSONAL" pill added to the Group Spending list** to mirror the
  existing "SHARED" one. The list's asymmetry (a pill only on the
  non-default case) is a standard, low-risk convention, and the actual
  confusion this pass targeted lives entirely at the moment of
  *choosing* Personal in the modal, not at read time in the list —
  adding a pill there would be new UI for a problem the caption already
  solves, not a fix for a remaining gap.
- **No copy change to Balances.** Each shared expense row already
  states "Paid by X · split N ways," which is what feeds Balances —
  adding a second explanation next to Balances itself would duplicate
  that, not clarify anything new.
- **No schema change.** True per-user attribution of a personal expense
  (so it *could* eventually be made genuinely private, or counted
  separately from a private "my spending" figure) would need a
  `created_by` column on `expenses` — the same gap §30 already
  identified and deferred. Nothing about this pass's fix needed it: the
  fix is describing the *existing, true* visibility rule honestly, not
  inventing a new one, so no schema change was required or made.

**Live-tested** end-to-end against a real Supabase project with three
disposable accounts (Playwright, headless Chromium) — an owner (A) and
two invited collaborators, B as editor and C as viewer (via the real
friend-request → trip-invitation → accept flow, §21/§29):
- **Solo trip (1 member):** the toggle and hint are both entirely
  absent (`canShare` false) — confirmed 0/0 in the DOM; a lone traveler
  never sees a distinction that doesn't yet apply to them.
- **2+ members, Personal selected (the default):** toggle and hint both
  render; hint text confirmed verbatim in the DOM.
- **Shared selected:** hint count confirmed 0 — no redundant text once
  the participant picker/live split preview are visible.
- Added one personal expense (Souvenirs, $45), one 2-participant shared
  expense (Dinner for two, $100 → $50.00/$50.00), and one 3-participant
  shared expense (Group taxi, $100 → $33.34/$33.33/$33.33) — the exact
  same rounding rule §24 documented, unchanged. Final Balances matched
  a hand calculation exactly (Owner +$116.66, B −$83.33, C −$33.33,
  settlement lines "B owes Owner $83.33"/"C owes Owner $33.33"); "Trip
  spent" totaled $245.00 (45+100+100), matching §30's own framing.
- **B (editor)** saw the identical hint, added their own personal
  expense (Coffee run, $12) successfully, and has their own,
  completely separate, empty "My Budget" (confirming §24/0014's
  per-user privacy is unaffected by any of this).
- **C (viewer):** no "+ Add expense" button, no Edit/delete controls
  anywhere — but the full expense list, including B's "Coffee run"
  (which C never touched), and the full Balances section, all rendered
  correctly. This is the fix's own claim demonstrated directly: a
  "Personal" expense really is visible to a collaborator who wasn't
  its author.
- Desktop (1440px) and mobile (390px, modal open in both Personal and
  Shared states, and the full populated page) all measured
  `scrollWidth === clientWidth === 390` — no horizontal overflow; the
  hint wraps cleanly to two lines on mobile.
- Refresh persistence confirmed (reloaded before re-opening the modal
  on mobile — all three expenses, the SHARED pills, and the split
  breakdowns survived intact).
- Zero console errors across every stage for all three accounts.
- Cleaned up via the app's own UI: the trip was deleted by its owner,
  then all three disposable accounts were deleted via their own
  "Delete account" flow, confirmed back at the signed-out state.
`npm run lint` and `npm run build` both pass.

### Files changed

- **Modified**: `src/components/AddExpense.jsx` (one new conditional
  `<p className="expense-type-hint">`, shown only while Personal is
  selected and 2+ trip members exist), `src/App.css`
  (`.expense-type-hint` rule).
- **Nothing else** — no schema, no repository/query, no calculation
  (`utils/budget.js` untouched), no permission-gating code, no change
  to the expense list's rendering, Balances, or settlements.

### Explicitly deferred (not forgotten)

Same schema gap §30 already named: `expenses` has no `created_by`
column, so there's still no way to build genuine per-user expense
ownership/privacy (or true "what did I personally spend" tracking) —
that would be a real, larger schema change, not something either of
these two passes needed or made. A "PERSONAL" pill symmetric to
"SHARED" in the Group Spending list, and any richer visibility copy in
Balances, were both considered and intentionally left out as
unnecessary for the confusion actually found (see above) — not ruled
out for a future pass if a different, real gap is found there later.

## 32. Tap-target audit — invisible hit-area expansion for compact action buttons

A UI/accessibility-only pass across the two shared small-action button
classes, `.edit-activity-button`/`.delete-activity-button` — no backend,
Supabase, schema, RLS, repository, permission, or functional change of
any kind.

**The audit.** Grepped every consumer of the two classes: activity
edit/delete (`TripPage.jsx`), saved-place edit/"Add to itinerary"+delete
(`SavedPlaces.jsx`), expense edit/delete (`BudgetSection.jsx`), the
Profile page's display-name Edit (`ProfilePage.jsx`), Friends page's
incoming-request Decline + sent-request Cancel + Remove-friend
(`FriendsPage.jsx`), the notification bell's trip-invitation/friend-
request Decline (`NotificationBell.jsx`), and Trip People's pending-
invitation Cancel + collaborator Remove (`TripPeopleSection.jsx`). Nine
consumers across seven components — genuinely global, not confined to
activities despite the class names' origin.

**Measured, not estimated** (Playwright `boundingBox()` against a real
signed-in trip with real data — an activity, a saved place, an expense,
a pending friend request, an invited collaborator — at 1440px and
390px): every one of these buttons rendered **~25-26px tall** regardless
of context, text length, or viewport — "Edit" 39×25, the "×" glyph
28×26, "Cancel" 55×25, "Add to itinerary" 109×25 — identical on mobile
and desktop, since none of this CSS had a responsive variant. One
accidental exception surfaced during measurement: in the notification
bell, Decline measured **47px tall** — not because of anything about
Decline itself, but because `.notification-item-actions` has no
`align-items` override (flexbox defaults to `stretch`), so Decline was
silently inheriting its 47px-tall sibling Accept (`.secondary-button`)
button's height by accident. The exact same class rendered at 25px on
the Friends page, where `.friend-actions` explicitly sets
`align-items: center`. This was itself useful evidence: a taller box
around this same plain-text label doesn't look wrong or broken (visibly
confirmed in a screenshot) — it just isn't given anywhere else.

**Genuinely global, not context-specific** — same ~25px height in
every one of the nine consumers, confirming this isn't one under-
styled screen but the shared base rule itself.

**Why padding-based enlargement was rejected.** These two classes have
no visible background or border at rest (`border: none; background:
none`) — the "visible size" is only ever the text/glyph, so naively
increasing `padding` would grow real layout box that participates in
`align-items: flex-start` rows (`.activity-item`, `.expense-item`) whose
overall row height is otherwise driven by short, single-line content —
a compact activity/expense row with no notes could grow taller purely
to fit an enlarged button column, which is exactly the "damage the
compact layout" outcome ruled out up front. Rows driven by an avatar
or thumbnail (`.friend-item` at 38px, `.place-item` at 56px) or by
generous padding (`.expense-item` 20px, `.notification-item` still
comfortably clears it once its own multi-line content is counted) had
headroom, but not every row type did, so no single padding value would
have been safe everywhere.

**The fix — an invisible expanded hit area, zero visual change.**
Added to both classes: `position: relative`, plus a shared
`::after { content:''; position:absolute; inset:-9px -4px }`. Since
absolutely-positioned pseudo-elements are removed from normal flow,
this cannot change any row's height or width anywhere, in any context —
it only enlarges the *clickable* region behind the same, byte-for-byte
unchanged visible label. The two inset numbers were sized directly from
the measurements above, not guessed:
- **-9px vertical** is safe against the tightest real padding these
  buttons sit inside (`.notification-item`'s 12px), leaving a 3px
  buffer before ever reaching the row above/below.
- **-4px horizontal** is exactly half of these buttons' own container
  gap, which was bumped `4px -> 8px` alongside this fix
  (`.activity-actions`, `.place-actions`, `.expense-actions`,
  `.friend-actions`; `.notification-item-actions` was already 8px, left
  alone) — so two adjacent expanded targets (Edit+Delete, or a
  role-toggle pill + Remove) meet exactly edge-to-edge rather than
  overlapping. A tap resolves to one control, never an ambiguous
  double-hit between a safe and a destructive action next to each
  other. The extra 4px of visible gap between two small text labels is
  the only pixel-visible change in this entire pass — confirmed
  negligible in every screenshot taken.
- Net effective hit box: "Edit" 39×25 -> ~47×43; "×" 28×26 -> ~36×44;
  "Cancel" 55×25 -> ~63×43 — landing right at the ~44px touch-target
  guideline on the axis that mattered (height, the actual bottleneck)
  without moving the visible label at all.

**Verified live, not just computed**, against a real Supabase project
with two disposable accounts (owner + an invited collaborator/friend):
- `getComputedStyle(el, '::after')` confirmed the exact `-9px -4px`
  inset landed on every button checked, on both viewports, while each
  button's own `boundingBox()` stayed byte-identical to the pre-fix
  measurements (39×25, 28×26, 55×25, 28×26) — proof the visible size
  genuinely never changed.
- **Functional click tests**, not just size checks: clicking 6px above
  the visible top edge of an activity's "Edit" button (well outside its
  real 25px box) opened the Edit Activity modal. Clicking 6px above an
  expense's "×" (inside its own expanded zone, 8px away from its
  "Edit" sibling) opened the "Delete this expense?" confirm, not the
  Edit modal. Clicking 6px above a trip collaborator's "×" Remove
  button (8px away from its Editor/Viewer role-toggle sibling) opened
  "Remove this collaborator?", not a role change — confirming the
  boundary math holds for a destructive action sitting directly next
  to a non-destructive one, the one case this design was most
  deliberately built to protect. A boundary-line click placed exactly
  between Edit and Delete's zones triggered neither (no accidental
  delete — re-checked the activity still existed afterward) rather
  than resolving ambiguously to the wrong one.
- Desktop (1440px) and mobile (390px) screenshots across every
  consumer — activity row with a long name, a saved place with a long
  name, an expense row, the People section with an owner + a role-
  toggle-bearing collaborator, a pending invitation row (role pill +
  PENDING pill + Cancel), the Friends page (incoming/sent/accepted) —
  all visually indistinguishable from before the fix, no text overlap,
  no horizontal overflow (`scrollWidth === clientWidth` at both
  widths throughout).
- Focus rings unaffected (`:focus-visible`'s `box-shadow` is on the
  real button box, never the invisible pseudo-element) and destructive
  styling untouched (`.delete-activity-button:hover` still turns
  `#c0392b`, unchanged).
- Cleaned up via the app's own UI: the test trip was deleted, then both
  disposable accounts via their own "Delete account" flow, confirmed
  back at the signed-out state.
`npm run lint` and `npm run build` both pass; the built CSS bundle is
the only output that changed (no JS diff at all — no `.jsx` file was
touched anywhere in this pass).

### Files changed

- **Modified**: `src/App.css` only — `.edit-activity-button`/
  `.delete-activity-button` (`position: relative` + the new
  `::after` hit-area rule), and the `gap` value in
  `.activity-actions`/`.place-actions`/`.expense-actions`/
  `.friend-actions` (`4px -> 8px`).
- **Nothing else** — zero `.jsx` changes (no component needed touching:
  every consumer already used one of these two shared classes, so
  fixing the base rule fixed all nine call sites at once), no schema,
  no repository, no permission logic, no `.secondary-button`/
  `.role-pill`/`.filter-pill` (out of this pass's scope — not named in
  the audit brief, and not exhibiting the same problem to the same
  degree).

### Explicitly deferred (not forgotten)

The notification bell's accidental `align-items: stretch` (Decline
inheriting Accept's height) was left exactly as-is — it's a harmless,
already-generously-sized accident, not a bug worth "fixing" into
something smaller, and touching it wasn't necessary for this pass's own
goal. `.role-pill` (Editor/Viewer, 21px tall) and `.filter-pill` share
the same general "compact pill" concern but were never named in this
audit's scope and would be a separate, explicitly-scoped pass if ever
taken on.

## 33. Settings (Profile/Account page) audit

A full screen-by-screen audit of Voyage's "Settings" area — there's no
page literally named that; it's `ProfilePage.jsx` (`/profile`, the
navbar avatar's destination) plus its `EditProfile.jsx` modal, exactly
what §22/§25/§26/§27 already describe. Inspected fresh rather than
assumed, per this pass's own instructions: page structure, the edit-
profile flow (name + photo), navigation/back behavior, every button/
control/destructive action, spacing/typography/consistency with the
rest of Voyage, keyboard focus order, loading/empty/success/error/
validation states, and mobile (390px) — with two real accounts' worth
of live testing (photo upload/remove, long display names, empty-name
and invalid-photo-file validation errors, sign-out and delete-account
confirms, a full keyboard tab-through).

**Verdict: this page was already in good shape.** Most of what was
checked held up exactly as documented in §22/§25/§26/§27 — auto-focus
on the name field, live local photo preview before Save, Cancel
genuinely discarding unsaved changes, the reactive navbar-avatar update
with zero refresh, RLS/permission boundaries untouched and correctly
irrelevant here (Settings only ever touches the signed-in user's own
row), full keyboard reachability with a visible focus ring on every
control in tab order, and no horizontal overflow anywhere at 390px.
Two small, genuine, demonstrable issues were found and fixed — nothing
else in this page was touched.

**1. "Delete account" didn't go full-width on mobile like every other
primary action on the same page.** `.profile-actions` (Edit profile +
Sign out) already had a `@media (max-width: 600px) { flex-direction:
column }` rule — combined with flexbox's own default `align-items:
stretch`, this already made both buttons comfortable, full-width mobile
targets. `.profile-danger-card`'s "Delete account" button sits in its
own card, outside that flex row, so it never inherited the same
treatment: measured at exactly 137px wide inside its own 350px-wide
card on a 390px viewport — a small, left-aligned button floating in an
otherwise full-width red card, and the one visibly awkward exception on
a page where every other primary action already got the full-width
treatment. It's also the single most consequential action on the page,
so it was the one button that most needed to *not* be the smallest
target. Fixed with one small, scoped mobile rule mirroring the existing
pattern exactly: `@media (max-width: 600px) { .profile-danger-card
.destructive-button { width: 100%; } }`. Confirmed live: 137px wide
(unchanged) at 1440px, ~300px (the card's full available width) at
390px, no horizontal overflow, visually matching Edit profile/Sign
out's own mobile treatment exactly.

**2. Dead CSS from a deleted component.** `.avatar-preview`/
`.avatar-preview-image` (plus their own mobile media-query override)
were still sitting in `App.css`, explicitly commented "Profile photo
preview (EditProfilePhoto.jsx)" — but `EditProfilePhoto.jsx` was
deleted during §26's consolidation into the one `EditProfile.jsx` modal
("fully absorbed," that section's own words). Confirmed via a full
grep: zero `.jsx` references to either class anywhere in `src/`. Purely
orphaned rules shipping in the CSS bundle for a component that no
longer exists — removed entirely. `EditProfile.jsx`'s actual current
photo preview (the `Avatar` component + `.edit-profile-avatar-row`) is
unrelated and was not touched.

**Investigated and deliberately left alone (real behavior, not a bug):**
- **Stale validation errors don't clear as you type** — triggering the
  empty-name error, then typing a valid name without resubmitting,
  leaves "Enter a display name." visible until the next Save attempt.
  Confirmed this is `EditProfile.jsx`'s exact existing behavior
  (`nameError` is only ever set/cleared inside `handleSubmit`, never in
  the input's `onChange`) — and confirmed it's not a Settings-specific
  bug: every other form in the app (`AddExpense.jsx`, `CreateTrip.jsx`,
  etc.) validates and clears errors the same way, only on submit.
  "Fixing" this in `EditProfile.jsx` alone would have made Settings
  *inconsistent* with the rest of Voyage, the opposite of this pass's
  own goal — left alone as the app's established, consistent pattern,
  not a Settings defect.
- **The Danger Zone card's inline warning text and the delete-confirm
  dialog's text both describe the same consequences.** Not treated as
  redundant: the card is a shorter, always-visible summary; the confirm
  dialog is deliberately more detailed (names the account's email
  inline, spells out the collaborator-access and "your other trips are
  unaffected" nuances) and appears once, right at the point of an
  irreversible commit — a standard, intentional "summary, then a fuller
  warning right before you commit" pattern, not duplicated UI.
- **The modal's live avatar preview shows a single generic initial
  while the name field is empty** (mid-edit, before a new name is
  typed) — this is `getInitials(displayName, fallback)` correctly
  falling back to the email-derived `avatarFallback` for a blank name,
  exactly as designed; it self-corrects the instant a name is typed and
  never reaches a saved state (validation blocks an empty submit). Not
  a bug, and "fixing" it would make the live preview *less* accurate,
  not more.
- **The touch-target sizing of the Display Name row's "Edit" button**
  — already covered by §32's shared `.edit-activity-button` fix,
  applied automatically here with zero changes needed in this pass; not
  revisited or re-touched, per this task's own explicit instruction.

**Live-tested** end to end with two disposable Supabase accounts: full
keyboard tab-through (logo → nav links → bell → profile avatar → header
avatar → Display Name Edit → Friends link → Edit profile — every stop
visibly focus-ringed, correct order); opened Edit Profile, confirmed
auto-focus, triggered and observed the empty-name and invalid-photo-
type errors independently; uploaded a real photo (live local preview,
"Remove photo" appearing only once something is either staged or
already saved, Save applying it immediately to both the modal-adjacent
header and the navbar avatar with zero refresh); removed it again and
confirmed reversion to initials, verified against a reload; set a very
long display name and confirmed it wraps cleanly in both the header and
the info row on a 390px viewport with no overflow and no overlap with
the Edit button; Sign out and Delete account confirm dialogs both
checked on desktop and mobile; zero console errors across every stage.
Test account deleted afterward via the page's own Danger Zone flow,
confirmed back at the signed-out gate. `npm run lint` and `npm run
build` both pass; the built CSS bundle shrank slightly (dead-code
removal), the only other change was the one new small media-query rule.

### Files changed

- **Modified**: `src/App.css` only — added
  `.profile-danger-card .destructive-button`'s mobile full-width rule;
  removed the orphaned `.avatar-preview`/`.avatar-preview-image` rules.
- **Nothing else** — zero `.jsx` changes, no schema, no repository, no
  permission logic, no `.edit-activity-button`/`.delete-activity-button`
  changes (§32's fix stands as-is), no other page/component touched.

### Explicitly deferred (not forgotten)

Nothing concrete surfaced beyond the two fixes above — this was a
clean audit, not one where several issues were found and only some
addressed. If a future pass wants email/password changing or an avatar
history, those remain explicitly out of scope per §22/§26's own
"explicitly not built" lists, unchanged by this pass.

## 34. Trip Detail page density/hierarchy audit

A screen-by-screen audit of the Trip Detail page (`TripPage.jsx` +
`TripPeopleSection.jsx`/`SavedPlaces.jsx`/`BudgetSection.jsx`) at
1440px and 390px — header, the in-page jump nav, People, Itinerary,
Saved Places, My Budget, Group Spending/Balances, and overall page
flow/whitespace. Not a redesign pass; §32's tap-target fix was
explicitly out of scope and untouched.

**Method.** Read every component and its CSS first, then verified
live rather than trusting that reading alone: a standalone HTML
harness (not committed — a throwaway audit tool) that links the real
`src/App.css` and reproduces each section's exact JSX output with
deliberately adversarial content (a very long trip name/destination, a
day with 5 activities including one long name/notes and a same-day
overlap, a collaborator and a pending invitee with long display names,
long saved-place names/addresses, a shared expense split 4 ways with
long payer/participant names, empty states for every section) —
screenshotted at both widths, plus an automated
`scrollWidth === clientWidth` check at each. Cross-checked against the
real running app (Playwright, a live disposable Supabase account, a
real 6-day trip) to confirm the harness's CSS-only predictions matched
actual React rendering and produced zero console errors.

**Verdict: the page's density and hierarchy are already correct** —
consistent `.section-heading`/card/spacing rhythm across every
section, the empty-day row (§ existing itinerary work) keeps a bare
trip compact, Balances' lighter sub-list treatment under Group
Spending reads correctly as a *result* of the expenses above it rather
than a competing section, the budget-scope note already makes "My
Budget" being personal-yet-measured-against-everyone's-spending
explicit rather than confusing, and the jump nav's 5 pills wrap
cleanly to two rows at 390px with no overflow and no scroll needed.
One genuine, reproducible bug was found and fixed — everything else
was verified and left alone.

**The bug: long display names silently clipped (no ellipsis, no wrap)
in every `.friend-item` row on mobile.** `.friend-name` is deliberately
`white-space: nowrap` + `overflow: hidden` + `text-overflow: ellipsis`
so a long name truncates with "…" rather than wrapping and breaking
the row's single-line rhythm — and this works correctly at any width
≥600px, where `.friend-item`'s own row width constrains it. But the
existing `@media (max-width: 600px)` rule switches `.friend-item` to
`flex-direction: column` with `align-items: flex-start` — flex-start
means every child is sized shrink-to-fit rather than stretched to the
row's width. Every child *except* `.friend-identity` already had an
explicit `align-self` override in that same media query
(`.friend-actions`/`.friend-status-pill`/`.role-toggle` all get
`align-self: flex-end`) — `.friend-identity` was the one left at the
shrink-to-fit default, so on mobile it simply grew as wide as the
unwrapped name needed, with the excess silently clipped by
`.friend-list`'s own `overflow: hidden` (its rounded-corner rule) —
no ellipsis, no page-level horizontal scroll (confirmed live via the
`scrollWidth`/`clientWidth` check, which is exactly why this went
unnoticed by that check alone), just a name that visually vanished
mid-word past the card's right edge. Reproduced in the real app too
(Playwright, a real account with a long first/last name, 390px
viewport) — same clipping, confirmed before the fix and confirmed gone
after it.

Genuinely global: `.friend-item`/`.friend-identity`/`.friend-name` are
one shared component used by TripPeopleSection.jsx (owner/collaborator
rows **and** the Pending Invitations sub-list — both explicitly in
this audit's People-section scope), FriendsPage.jsx (search results,
incoming/sent/accepted), and AddTripFriends.jsx's own invite list — the
same root cause, same fix, same media query, not three separate bugs.

**The fix — one property, in the exact spot its siblings already
established the pattern for.** Added `.friend-identity { align-self:
stretch; }` to the same `@media (max-width: 600px)` block, right next
to the `align-self: flex-end` overrides already there for its
siblings. This doesn't add new CSS machinery — `.friend-name`'s
ellipsis rule already existed; this just gives it the width
constraint it needs to actually engage, the same way the row already
works above 600px. No visual change for a name that already fits
(confirmed live — "Cho" and "Alexandra Longname-Petrescu" render
identically before/after); a name too long for the row now shows
"Bartholomew Alexander Featherst…" instead of running off the edge.
Desktop (>600px) is untouched — the media query itself is the only
scope, confirmed via a byte-for-byte identical 1440px screenshot
before/after.

**Verified**: harness screenshots at 1440px and 390px before and after
the fix (long names, 5-activity day with overlap warning, long saved
places, over-budget state, a 4-way shared-expense split, empty states
for every section) — no horizontal overflow at either width
(`scrollWidth === clientWidth` both before and after, at both
widths), no text overlap anywhere, the fix visibly resolves the one
bug with zero effect elsewhere. Live-tested against the real app with
a disposable Supabase account (a real trip, a long-named owner row) —
zero console errors, the same ellipsis truncation confirmed in actual
React-rendered output at 390px, confirmed absent (full name, no
truncation) at 1440px. `npm run lint` and `npm run build` both pass;
only the CSS bundle size changed (one added rule + its explanatory
comment).

### Files changed

- **Modified**: `src/App.css` only — the one new `.friend-identity`
  rule described above, inside the existing `.friend-item` mobile
  media query.
- **Nothing else** — zero `.jsx` changes (the bug and its fix are both
  pure CSS; every consumer already renders the same shared markup), no
  schema, no repository, no permission logic, no routing.

### Explicitly deferred (not forgotten)

Every other section audited (trip header, jump nav, Itinerary,
Saved Places, My Budget, Group Spending, Balances) held up under the
same adversarial-content testing with no changes needed — not listed
here as "found but skipped," genuinely verified clean. §32's tap-target
fix was out of this pass's scope per this task's own instruction and
was not revisited.

One process note for whoever picks up live-Supabase-account testing
next: this pass's own throwaway Playwright scripts left 3-4 disposable
`voyage.audit.*@mailinator.com` test accounts behind in the project's
Supabase instance — their generated emails were never logged before
the accounts were created, so they couldn't be signed back into for
cleanup via the app's own "Delete account" flow (the same flow every
other pass has used successfully, see e.g. §32/§33's own cleanup
notes). Each is an empty, harmless account (any trip it briefly owned
was already deleted in the same run) — no trip data, saved places,
activities, or expenses were left behind, only the auth/profile row
itself. If they matter, remove them via the Supabase dashboard's
Authentication → Users, filtering by "voyage.audit". Print/save
generated test credentials *before* creating an account, not after, to
avoid repeating this.

## 35. Final UI/UX audit sweep — audit phase closed

A last, deliberately bounded pass across every major user-facing flow
(Dashboard signed-in/out, mobile nav, Auth dialog, Explore + Place
Details, Friends, Profile, Notifications, and a Trip Detail spot-check)
at 1440px and 390px, specifically to decide whether the UI/UX audit
work (§30-§34 and everything they built on) is actually done, not to
keep finding smaller and smaller things to polish.

**Verdict: no genuine issues found. No code was changed in this pass.**
Every flow checked held up: empty/loading/error states render
correctly and never get stuck, no horizontal overflow or text overlap
at either width, the mobile hamburger menu and Explore's destination
search/results/Place Details modal all work cleanly on both viewports,
Auth dialog validation is clear, sign-up/sign-in toggle correctly,
Friends/Profile/Notifications empty states all read well, and a fresh
Trip Detail page (People/Itinerary/Places/My Budget/Group Spending)
matches everything §30-§34 already established — §34's
`.friend-identity` fix confirmed still in effect, nothing regressed.

Two things were noticed and deliberately **not** turned into fixes:
- **No `.modal-overlay` dialog (CreateTrip, AddActivity, AddExpense,
  AuthDialog, ConfirmDialog, etc.) closes on Escape or a backdrop
  click** — only its own × or Cancel/Done button does. This is
  consistent across every single modal in the app with zero
  exceptions, which reads as a deliberate choice (most of these hold
  form input mid-edit, where an accidental Escape or stray click
  discarding it would be worse than the missing convenience) rather
  than an oversight — an accidental gap would likely be inconsistent
  across components, not uniform. Left alone: "fixing" it would mean
  adding new interaction behavior to every modal in the app at once,
  which is a real scope expansion, not a bug fix, and this pass's own
  brief was explicit about not doing that.
- **A one-time Supabase `PGRST303 "JWT issued at future"` error**
  surfaced in the browser console immediately after one test sign-up,
  transiently failing that one trips load (the dashboard briefly
  showed "Loading your trips…", then resolved normally on the very
  next navigation with no further errors for the rest of that session,
  and the account's later trip-create/delete/account-delete all worked
  normally). This is Supabase Auth/PostgREST clock-skew, not Voyage
  application code — it didn't reproduce across roughly a dozen other
  live sign-ups across this and the prior session's testing, and there
  is nothing in `src/` for this project to fix.

`npm run lint` and `npm run build` both pass (unchanged from before
this pass, since nothing was edited).

**This closes the UI/UX audit phase.** §30 through this section cover
dashboard, trip cards, itinerary, saved places, budget, shared
expenses, friends, trip people/invitations, notifications, profile/
settings, action-button tap targets, and Trip Detail density/
hierarchy — every major screen in the app — each verified live, not
just read. Further UI work should be scoped as its own explicitly-
requested pass if a real product change surfaces a new need, not a
continuation of this sequence. The recommended next step is product
features, not more UI/UX auditing.

## 36. Settings — Phase 1 (page foundation + account-action reorganization)

The first step of the new Settings product phase (planned, not
implemented, in a prior planning-only pass): a real `/settings` page
now exists, and Sign out/Delete account moved there from Profile.
Deliberately narrow scope — no password functionality, no default
currency, no notification/privacy/theme/language settings; those are
explicitly later phases of the same plan, not part of this one.

**New page**: `SettingsPage.jsx` — a compact, three-section page
(ACCOUNT: read-only email; ACCOUNT ACTIONS: Sign out; DANGER ZONE:
Delete account), reached only from Profile's own "Settings" action, not
a top-level navbar destination. It introduces zero new CSS — every
class it renders with (`.profile-page`, `.profile-header`,
`.profile-info-section`/`-card`/`-row`/`-label`/`-value`,
`.profile-actions-section`/`.profile-actions`, `.profile-danger-
section`/`-card`, `.back-button`, `.section-heading`) is reused
verbatim from Profile/TripPage's existing rules — this page is a new
arrangement of already-existing Voyage patterns, not a new design
system. `onSignOutClick`/`onDeleteAccountClick`/`deleteAccountError`
are the *exact* props/handlers `ProfilePage.jsx` used to receive from
`App.jsx` (`setShowSignOutConfirm(true)` /
`{ setDeleteAccountError(null); setShowDeleteAccountConfirm(true) }`),
simply rewired to this component — the real behavior (the
`ConfirmDialog`s, `auth.signOut()`, `deleteOwnAccount()`'s RPC + Storage
cleanup) all still live in `App.jsx`/`services/profilesRepository.js`,
completely untouched.

**Routing** (`utils/routing.js`): `view` gained a fifth value,
`'settings'` — `getPathForState`/`parseLocation` both extended the same
way every prior view was (`/settings` ↔ `{ view: 'settings' }`), no new
pattern. `App.jsx` gained one new `goToSettings()` (mirrors
`goToProfile()`, minus the mobile-menu-close line, since Settings has
no mobile-menu entry) and a `view === 'settings'` render branch,
positioned exactly like the existing `view === 'profile'`/`'friends'`
branches: `auth.user ? <SettingsPage .../> : <the same inline
"Sign in to see your X" gate every other account-only page already
has>`. A signed-out visitor hitting `/settings` directly (a bookmark, a
refresh, Back/Forward) gets that same inline gate, never a crash or a
redirect — confirmed live. Once they sign in from that gate, the page
resolves to the real `SettingsPage` immediately, no extra navigation
needed, same reactive mechanism Profile/Friends already relied on.

**Entry point**: Profile's existing "Account Actions" row used to be
[Edit profile] [Sign out] — Sign out moved out, and a [Settings] button
took its exact place (same `.secondary-button`, same row, same mobile
stacking behavior) rather than adding a new section or link style.
Understated on purpose — it reads as "just another account action," not
a promoted destination, matching the plan's own "not a top-level nav
item" direction.

**What actually moved**: Sign out and Delete account, verbatim — same
`ConfirmDialog` titles/messages/confirm labels, same handlers, same
RPC. `ProfilePage.jsx` lost both (and the props that fed them:
`onSignOutClick`, `onDeleteAccountClick`, `deleteAccountError`) and
gained one prop, `onGoToSettings`. Nothing else on Profile changed —
avatar, display name (+ Edit), email, Friends count/link, and the
`EditProfile` modal flow are all byte-for-byte the same JSX as before.

**Verified live** (Playwright, disposable Supabase accounts, both
1440px and 390px): signed-out direct hit on `/settings` → correct
inline gate; sign up while already on `/settings` → resolves straight
to the real page with no redirect; Profile → Settings → Back to profile
round trip; a hard refresh on `/settings` while signed in → same page,
same content, no flash of the wrong state; Sign out from Settings →
same confirm dialog, same outcome, lands back on the (now signed-out)
Settings gate rather than anywhere else — matching Sign out's existing,
unchanged "no redirect" behavior from before this move; Delete account
from Settings → same confirm dialog, real deletion confirmed (a second
sign-in attempt with the same credentials fails, `profile-button` reads
`S`); no horizontal overflow at either width with a realistic-length
email. `npm run lint` and `npm run build` both pass.

**Found, not fixed (pre-existing, out of scope for this step)**: an
unusually long email address (the kind Playwright's auto-generated test
accounts happen to produce, e.g.
`voyage.settings.1788876794138@mailinator.com`) overflows
`.profile-header-identity` on Profile at 390px (genuine page-level
horizontal overflow — that rule has no `min-width: 0` on its text
column) and is silently clipped with no ellipsis inside
`.profile-info-card`/`.profile-info-value` on both Profile and (by
inherited reuse) the new Settings page — the exact same *class* of bug
§34 found and fixed for `.friend-name`, just never fixed for these
`profile-info`/`profile-header` rules, which don't use the same
`white-space: nowrap` + `text-overflow: ellipsis` treatment at all.
Confirmed via code inspection that neither rule was touched by this
pass (only `ProfilePage.jsx`'s Sign out button and Danger Zone section
were removed) — genuinely pre-existing, not introduced here. Left
unfixed deliberately: this step's own scope was the page/routing/move,
not a CSS robustness pass, and "Do not redesign Profile... beyond what
is necessary" was explicit. Worth a small, scoped follow-up if it
matters (most real emails are short enough never to hit it) —
same shape of fix as §34's, most likely: `overflow-wrap: anywhere` (or
similar) on `.profile-header-email`/`.profile-info-value`, and
`min-width: 0` on `.profile-header-identity` so it can shrink instead
of pushing the page wider.

**Also observed, not new**: the same transient Supabase
`PGRST303 "JWT issued at future"` console message §35 already
documented as environmental clock-skew, unrelated to any app code,
reappeared during this pass's live testing (one sign-up out of several)
— consistent with §35's own conclusion, not a regression from this
work.

### Files changed

- **Added**: `src/components/SettingsPage.jsx`.
- **Modified**: `src/utils/routing.js` (`'settings'` view + `/settings`
  path, both directions), `src/App.jsx` (`goToSettings`, the
  `view === 'settings'` render branch, `ProfilePage`'s trimmed props),
  `src/components/ProfilePage.jsx` (removed Sign out button + the
  entire Danger Zone section and their props; added the `Settings`
  button in the same slot).
- **Nothing else** — no CSS file touched (zero new rules), no schema,
  no RLS, no repository changes, no change to `delete_own_account()` or
  `deleteOwnAccount()`'s Storage cleanup, no change to auth logic.

### Explicitly deferred (per this phase's own scope, not forgotten)

Password change/reset, default currency, and any notification/privacy/
theme/language settings — all named in the approved plan as later
phases, none started here. Settings currently contains exactly the
three sections the plan specified for Phase 1, nothing more.

## 37. Settings — Phase 2 (Forgot / Reset Password)

Real password recovery, entirely through Supabase Auth's own built-in
mechanism — `resetPasswordForEmail` + a recovery redirect + `updateUser
({ password })`. No email provider, no Edge Function, no new table, no
migration, no RLS change: everything here is client code plus Supabase
Auth's existing, already-configured recovery flow.

**How it works, end to end.** Sign-in mode's Password field gained a
small "Forgot password?" link (sign-up mode never shows it) that
switches `AuthDialog` into a third mode, `'recover'`, alongside the
existing `'sign-in'`/`'sign-up'` — same modal, same form conventions,
not a second dialog. Submitting an email there calls
`auth.resetPasswordForEmail(email)` (`useAuth.js`), which wraps
`supabase.auth.resetPasswordForEmail(email, { redirectTo:
'<origin>/reset-password' })` through the same `runAuthAction` helper
sign-in/sign-up already use. The UI always shows one generic message —
"If an account exists for that email, we've sent a password reset
link" — regardless of whether the address is a real account, because
Supabase's own `resetPasswordForEmail` already never reveals that
either way; the UI just doesn't undo that guarantee. Confirmed live: a
real account's email and a made-up one produced byte-identical UI
responses.

Clicking the real email link lands on the new `/reset-password` route.
Supabase's client (already configured with `detectSessionInUrl: true`,
`services/supabase.js` — nothing new needed there) parses the recovery
token out of the URL itself and fires a `PASSWORD_RECOVERY` event
through the same `onAuthStateChange` listener `useAuth.js` already had;
that listener now also sets a new `isPasswordRecovery` flag. This flag
— never `Boolean(user)` — is what `ResetPasswordPage.jsx` trusts,
because a valid recovery link *does* establish a genuine, otherwise-
ordinary session (that's what lets `updateUser` succeed at all), which
would make an already-signed-in user who simply typed `/reset-password`
in look identical to a real recovery visit if `user` alone were the
check. A short (400ms) grace-period timer absorbs the small, expected
gap between `isLoadingSession` resolving and the async `PASSWORD_
RECOVERY` event actually arriving, so a genuinely valid link is never
mis-shown as invalid for one render. The page has four states —
checking / ready (the new-password form) / invalid / success — all
inside one reused `.modal`-styled card (see below), never a separate
error page. Submitting the form validates required/match/length
client-side, then calls `auth.updatePassword(newPassword)` (wraps
`supabase.auth.updateUser({ password })`, same `runAuthAction`/
`authError` pattern as everything else). Success shows "Password
updated" + "Continue to your trips" (the recovery session is already a
real session at that point, confirmed live — no separate sign-in step
needed).

**Routing** (`utils/routing.js`): `view` gained a sixth value,
`'reset-password'`, extended exactly like every prior one — `/reset-
password` both directions. Unlike every other view, this one isn't
auth-gated with an `auth.user ? X : Y` split in `App.jsx` — there's no
"sign in to see this" state that makes sense here; the page's own
internal status (driven by `isPasswordRecovery`) is what actually
decides what renders, so it's rendered unconditionally whenever `view
=== 'reset-password'`.

**Invalid/expired links** — tested against two *real*, Supabase-issued
failure cases, not synthetic ones: (1) a token already consumed by an
earlier visit came back through the redirect as `#error=access_denied
&error_code=otp_expired`, and (2) `/reset-password` visited with no
token in the URL at all. Both correctly resolve to the same "Link
expired" state — clear explanation, a "Request a new link" button, no
blank/broken page, no console errors. That button navigates to the
dashboard and opens `AuthDialog` directly in recover mode (a new
`initialMode` prop, driven by a new `authDialogMode` piece of state in
`App.jsx` and one new `openAuthDialog(mode)` helper that every
`AuthDialog`-opening call site now goes through, replacing the old bare
`setShowAuthDialog(true)` calls) — one click into requesting a new link
instead of two.

**Visual pattern**: no new design system. `AuthDialog`'s recover mode
and "Forgot password?" reuse existing pieces verbatim —
`.auth-mode-toggle` for "Back to sign in", and `.profile-info-value-row`
(the exact row Profile's own Display Name/Edit already uses) for the
"Password" label + "Forgot password?" pairing. `ResetPasswordPage` is a
real standalone page, not a modal, but its card is still `.modal`
itself (header/form/label/input/`.form-error`/buttons all already
styled) — the only new CSS is layout: `.reset-password-page` (the same
`.profile-page` numbers every other Voyage page already uses) plus one
override so `.modal`'s own centering (tuned for a fixed-position
overlay) centers correctly in normal page flow instead.

**Security/privacy, verified live, not just read**: no password ever
appeared in any console message across the full test run; the rendered
page text was checked for both a JWT-shaped string and the literal
words "access_token" — neither ever appears (Supabase's own client
strips the token out of the visible URL after parsing it, confirmed —
the address bar reads a bare `#` right after landing, not the token);
the generic recovery-request message is provably identical for a real
vs. a fabricated email (see above).

**Verified live end to end** (Playwright, a disposable Supabase account,
a real `@mailinator.com` inbox actually read via Mailinator's own
public inbox — not mocked): sign-up → sign-out → "Forgot password?" →
generic success for both a real and a fake email → the real email
genuinely arrived from `noreply@mail.app.supabase.io` → followed the
actual link → landed on `/reset-password` in the `ready` state →
password-mismatch and too-short-password validation both correctly
blocked submission client-side → set a real new password → `success`
state → "Continue to your trips" → signed out → **old password
correctly rejected** ("Invalid login credentials") → **new password
correctly accepted**, real signed-in session confirmed (avatar
initials, not "S"). Also separately verified both real-world invalid-
link cases above. All of this at both 1440px and 390px — no horizontal
overflow at any state, any width. Existing sign-in, sign-up, sign-out,
Profile, and Settings (including Delete account) were exercised
repeatedly throughout this same testing and all continued to work
unchanged. `npm run lint` and `npm run build` both pass.

One test-harness note, not an app issue: the very first attempt to
extract the reset link scraped it via a regex over Mailinator's raw
message HTML, which picked up a stray trailing character and produced
a malformed URL — following that malformed link landed on `/` instead
of `/reset-password`, which briefly looked like a redirect
misconfiguration. It wasn't: Mailinator's own "LINKS" tab (a clean,
pre-parsed anchor list) gave the exact same link with no stray
character, and following *that* one landed correctly on `/reset-
password` every time afterward — confirming the Supabase dashboard's
redirect-URL allowlist for `http://localhost:5183/reset-password` is
already correctly configured. A production/preview origin's own exact
`/reset-password` URL will need the same one-time allowlist entry in
Supabase's Authentication → URL Configuration before this works there
— that's dashboard configuration, not something app code can set.

### Files changed

- **Added**: `src/components/ResetPasswordPage.jsx`.
- **Modified**: `src/components/AuthDialog.jsx` (the new `'recover'`
  mode, the "Forgot password?" link, `initialMode` prop),
  `src/utils/useAuth.js` (`isPasswordRecovery` state + the
  `PASSWORD_RECOVERY` event handling, `resetPasswordForEmail`,
  `updatePassword`), `src/utils/routing.js` (`'reset-password'` view +
  `/reset-password` path), `src/App.jsx` (`ResetPasswordPage` import
  and render branch, `authDialogMode` state + `openAuthDialog` helper,
  `AuthDialog`'s new props), `src/App.css` (`.reset-password-page` +
  one `.modal` margin override — the only new CSS in this pass).
- **Nothing else** — no migration, no schema, no RLS, no email
  provider/Edge Function, no change to email-change (still
  deliberately out of scope), no notification/privacy/theme/language
  settings, no change to `delete_own_account()`/Storage cleanup.

### Explicitly deferred (per this phase's own scope, not forgotten)

Everything §36 already deferred stays deferred — default currency,
notification/privacy/theme/language settings. Changing a *known*
password while already signed in (as opposed to recovering a forgotten
one) was not asked for and wasn't built — `updatePassword` exists in
`useAuth.js` and is ready for that if a future Settings phase wants it,
but nothing in Settings itself calls it yet.

## 38. Settings — Phase 3 (Change Password, signed-in)

The other half of `updatePassword` (`useAuth.js`, added in §37 for
recovery): a **Change password** section in Settings for a signed-in
user who already knows their current password, as opposed to §37's
"I forgot it" flow. No new auth abstraction — `onVerifyCurrentPassword`
is `auth.signIn` itself and `onUpdatePassword` is the exact same
`auth.updatePassword` §37 already added, both just wired to a new form.

**Why current-password verification, and how.** A live session alone
doesn't prove the person at the keyboard knows the account's *current*
password — an unattended, already-signed-in browser could otherwise let
anyone set a new one with zero proof of the old. The smallest correct
fix, and the one this uses: re-run `auth.signIn(email, currentPassword)`
— the exact same call a normal sign-in already makes — before ever
calling `updateUser`. A wrong current password fails that call with
Supabase's own "Invalid login credentials" (rendered through the same
shared `authError`/`.form-error` pattern every other auth form uses)
and `updatePassword` is never reached. Confirmed live: a failed
reauthentication attempt leaves the existing session completely intact
— `signInWithPassword` failing doesn't sign anyone out, it just doesn't
produce a new session, so the user's current one is untouched and they
stay signed in exactly as before the attempt. No new table, migration,
Edge Function, or password storage of any kind — this is Supabase
Auth's own existing mechanism, called twice in sequence instead of
once.

**Validation, client-side, in order**: current password present → new
password present → new password ≥ 6 characters (the same minimum
AuthDialog/ResetPasswordPage already assume, kept consistent rather
than inventing a different one here) → confirmation present → new
matches confirmation. Only once all five pass does the reauth call even
fire — a doomed submission never reaches the network.

**On success**: the form is reset (`formRef.current.reset()` — every
field genuinely empty afterward, confirmed live via `inputValue()`), a
quiet "Your password has been updated." line appears (reusing
`.confirm-dialog-message`'s existing quiet gray tone — Voyage has no
green "success" color anywhere and this doesn't invent one), the user
stays on `/settings` with no navigation of any kind, and they're still
signed in as themselves (confirmed live: avatar initials unchanged
before/after, no session interruption from the reauth step).

**Visual pattern — no new design system.** The form lives in its own
`.profile-info-card` (same bordered-white-card language every other
Settings/Profile card already uses), positioned between Account and
Account Actions under a new SECURITY label. Its actual field styling —
`.settings-password-form` — isn't a parallel copy of `.modal`'s
form/label/input/focus rules; those four existing rules were each
*extended* with one more selector so a form outside a `.modal` gets the
byte-identical look with zero duplicated declarations. The one genuinely
new declaration is `.settings-password-form { padding: 20px 24px; }` —
needed because a `.modal` already carries its own 32px card padding,
but this form sits directly in a bare, padding-less `.profile-info-card`
instead.

**Security, verified live, not just read**: every console message
across the full test run was checked for either literal password value
— never present, in any state, at any point (empty/mismatch/wrong-
current/success/sign-in-after). The two `HTTP 400` responses that did
appear (`/auth/v1/token?grant_type=password`) both correlated exactly
with a *deliberately* wrong password in the test itself (Supabase's own
correct rejection, not a bug) — confirmed by checking the request URL
each time.

**Verified live end to end** (Playwright, a disposable Supabase
account): opened Settings, confirmed the new section renders correctly
alongside the unchanged Account/Account Actions/Danger Zone sections →
empty submit → current-password-only → too-short new password →
mismatched confirmation → **wrong current password** (rejected, stayed
signed in) → **correct current password + valid new password**
(success message, form cleared, still `/settings`, still signed in) →
signed out → **old password now rejected** ("Invalid login
credentials") → **new password accepted**, real session confirmed
(avatar initials, not "S"). Both 1440px and 390px throughout, no
horizontal overflow at any state. Separately re-verified §37's full
forgot/reset-password flow end to end against a real `@mailinator.com`
inbox (sign up → sign out → request reset → real email arrived →
followed the link → `ready` → set a password → `success` → Continue to
your trips) — completely unaffected by this addition. Sign out and
Delete account (both already covered by §36, both untouched here) were
exercised repeatedly throughout and continue to work exactly as before.
`npm run lint` and `npm run build` both pass, output byte-identical to
the pre-testing build (nothing changed between builds).

### Files changed

- **Modified**: `src/components/SettingsPage.jsx` (the new Change
  password section + `handleChangePassword`), `src/App.jsx`
  (`onVerifyCurrentPassword={auth.signIn}`,
  `onUpdatePassword={auth.updatePassword}`, `authError`,
  `onClearAuthError` now also passed to `SettingsPage`), `src/App.css`
  (four existing `.modal` form/label/input/focus rules extended with a
  `.settings-password-form` selector, plus that one new padding rule).
- **Nothing else** — no change to `useAuth.js` (both functions it
  needed already existed from §37), no migration, no schema, no RLS,
  no Edge Function, no change to Sign out/Delete account's own props or
  behavior, no change to `/reset-password` or any of §37's own files.

### Explicitly deferred (per this phase's own scope, not forgotten)

Email change, 2FA, active-session/device management, notification
preferences, privacy settings, default currency, theme, language —
none of these were touched, per this phase's own explicit scope.

## 39. Settings — Phase 4 (Default Currency) — final planned Settings feature

The last item on the approved Settings plan: a per-user default
currency preference (Preferences > Default currency), used only as the
*initial* value for a brand-new personal budget (and, since expenses
have no currency of their own — see below — a trip's expense amounts
until one exists). **This closes the Settings feature set** — §36
through this section delivered exactly what was planned (page
foundation, forgot/reset password, change password, default currency);
no further Settings work is planned unless a genuinely new product need
surfaces.

### Schema

`supabase/migrations/0015_profile_default_currency.sql` — one column:
`alter table public.profiles add column if not exists default_currency
text;`. Nullable, no default forced at the database level (every
existing row reads back `null`, meaning "no preference set, fall back
to USD" — never a silently-invented value). No new table, no RLS
policy change, no new grant: `profiles`' two existing row-level
policies ("profiles are readable by authenticated users", `using
(true)`; "users can update their own profile", `using (auth.uid() =
id)`) are both column-agnostic and already cover it, and the existing
table-level grant (`0003_fix_trips_access.sql`) already includes
`update` for `authenticated`. **Run by the user directly in the
Supabase SQL Editor** (this project has no migration CLI — same
established process every prior migration followed) — verified live
afterward (see below), not assumed.

### Repository

`services/profilesRepository.js` gained exactly two functions, both
following the file's existing shape:
- `getDefaultCurrency(userId)` — reads the one column, returns the raw
  value (`null` if never set) — the *caller* decides null means "use
  USD", not this function, same division of concerns as every other
  repository export in this app.
- `updateDefaultCurrency(userId, currency)` — a single-column update on
  the caller's own row. Deliberately not folded into the existing
  `updateDisplayName` (which also mirrors into `auth.user_metadata`) —
  this preference has no such mirror; nothing outside Settings/budget-
  defaulting ever reads it.

No new repository file — both live in the existing one, per the task's
own instruction.

### Where the preference is loaded and how it flows

`App.jsx` owns one new piece of state, `defaultCurrency` (`null` until
loaded, or if the signed-in user has never set one, or if the read
itself failed — all three handled identically everywhere this is
read), fetched once per sign-in alongside `notificationSummary`. This
is the single source of truth passed down to *both* `SettingsPage`
(display/edit) and `TripPage` → `BudgetSection` (defaulting) — a change
made in Settings is visible to a brand-new budget/expense with no
refresh, because both read the same App.jsx state, not two independent
fetches. `handleUpdateDefaultCurrency(currency)` persists via the
repository and only updates this state *after* Supabase confirms the
write — the mechanism behind "never pretend it saved": `SettingsPage`
never optimistically overwrites the authoritative value, so a failed
save leaves the displayed value exactly where it already was, with an
error shown alongside it, with no separate "revert" step needed.

### Settings UI

A new PREFERENCES section between Change password and Account Actions,
one row inside a `.profile-info-card` (same card as the Email row) —
`CategorySelect` (Voyage's existing single-select component, no new
picker) with `CURRENCIES` imported as-is from `utils/budget.js` (the
exact list `SetBudget.jsx`'s own currency field already uses — not a
second list). Selecting a value saves immediately (no separate "Save"
button, matching this app's existing "pick one, it commits" pattern
already used by role-pill toggles and every other `CategorySelect`) and
shows a small, quiet "Saved." line reusing `.confirm-dialog-message`
(the exact same understated-confirmation style Phase 3's Change
password section already established — not a new success color; Voyage
has none). A failure shows `.form-error` instead, and the selector
itself simply never changes, since (see above) nothing was written to
the authoritative state to begin with. Two small CSS additions only:
`.category-select`'s existing global styling needed no changes at all
(it was already usable outside `.modal`); one rule gives it the same
6px label-to-control spacing every other `.profile-info-row` already
has, and two more scope `.form-error`/`.confirm-dialog-message`'s
margins to sit tightly under it in this one context, instead of their
`.modal`-tuned defaults. No new design system, no unrelated visual
change to Profile or Settings' other sections.

### How new-budget/new-expense defaulting actually works

The key fact that shapes this: **expenses have no `currency` column of
their own at all** (confirmed against the schema and `AddExpense.jsx`
— it only ever *receives* a `currency` prop for display formatting,
with no currency field/picker in the form itself). Every expense on a
trip is shown in whatever currency that trip's *personal budget*
currently uses — this was already true before this phase, just always
hardcoded to `'USD'` as the fallback. `BudgetSection.jsx`'s one
`currency` variable — `budget?.currency ?? defaultCurrency ?? 'USD'` —
governs both the existing expense list's display *and* what's passed
into a new Add/Edit Expense modal's live split-preview; `SetBudget.jsx`
uses the identical fallback chain for its own currency field's initial
value. Because `??` short-circuits the instant the first operand is
non-null, **the moment a trip has its own personal budget, that
budget's `currency` always wins outright — `defaultCurrency` is
consulted only when no personal budget exists yet for that trip**. This
is what makes "never replace an existing budget's stored currency" true
by construction, not by a separate special case: editing an existing
EUR budget always shows EUR in its own currency field regardless of
what the user's default is, confirmed live (see below).

### Confirmation that existing records are untouched

No expense or budget row's stored data is ever written by this phase
except through the exact same `onSetBudget`/`onAddExpense`/
`onUpdateExpense` paths that already existed — `defaultCurrency` only
ever supplies an *initial* value for a field the user can still change
before submitting, the same as `'USD'` always did. Confirmed live: an
existing EUR budget's amount/currency were unchanged, and its own
Edit-budget form still showed EUR, after the signed-in user's default
was changed to GBP in Settings — same for an existing expense's
displayed amount.

### Verified live, end to end (Playwright, real Supabase accounts, both 1440px and 390px)

- A fresh user: Settings loads, Default currency shows USD (no
  preference set), no console errors.
- Set to EUR → "Saved." shown → hard refresh → still EUR.
- A brand-new budget's own currency field: preselected EUR.
- A brand-new expense: amount renders with the € symbol.
- Default changed to GBP → the *already-existing* EUR budget's stat
  values and the *already-existing* expense's amount both still render
  in €, unchanged — and re-opening that budget's own Edit form still
  shows EUR in its currency field, never GBP.
- A second, brand-new trip created *after* the default changed to GBP:
  its own new budget correctly preselects GBP.
- **Two independent accounts**: User A set EUR; a fresh User B (no
  relation to A) loaded with the untouched USD fallback, confirming A's
  preference never leaked across accounts; User B then set their own
  currency to ALL (Lek) with zero effect on User A's still-EUR
  preference.
- **Sign-out/sign-in**: User A signed out (while User B's session had
  since set a different value), signed back in, and their own EUR
  preference was exactly as they'd left it — proving the preference is
  correctly scoped per-user through a real sign-out/sign-in cycle, not
  just held in memory for one session.
- Zero console errors attributable to Voyage across every run; no
  horizontal overflow at either viewport in any state.

### Migration / RLS verification

The migration was run by the user directly in the Supabase SQL Editor
per this project's established process (no CLI wired up — see
§7a.9). Applying it successfully, rather than just being assumed, was
confirmed by the very first live read afterward returning cleanly (no
"column does not exist" error) with the correct `null`-means-USD
fallback. RLS was verified *through real behavior*, not by inspecting
policy text alone: every read/write in every test above was scoped
to the signed-in user's own row and no other's, and the two-account
isolation test is itself a live proof that one user's session can
neither read nor silently affect another's `default_currency` — exactly
what the pre-existing, unmodified "users can update their own profile"
policy guarantees. No policy was touched by this migration, so by
construction nothing about existing RLS behavior changed for any other
column or table.

`npm run lint` and `npm run build` both pass — build output byte-
identical before and after the full live test run (nothing left
uncommitted or changed by testing itself).

### Files changed

- **Added**: `supabase/migrations/0015_profile_default_currency.sql`.
- **Modified**: `src/services/profilesRepository.js`
  (`getDefaultCurrency`, `updateDefaultCurrency`), `src/App.jsx`
  (`defaultCurrency` state + load effect, `handleUpdateDefaultCurrency`,
  both passed to `TripPage` and `SettingsPage`),
  `src/components/TripPage.jsx` (threads `defaultCurrency` through to
  `BudgetSection`), `src/components/BudgetSection.jsx` (`currency`'s
  new fallback chain, `defaultCurrency` passed to `SetBudget`),
  `src/components/SetBudget.jsx` (same fallback chain for its own
  initial currency), `src/components/SettingsPage.jsx` (the new
  Preferences section), `src/App.css` (three small additions described
  above).
- **Nothing else** — no new table, no RLS/grant change beyond the one
  new column, no change to `AddExpense.jsx` (it already only ever
  receives `currency` as a display prop — nothing to add there), no
  change to Sign out/Delete account/Change password/forgot-reset
  password, no notification/privacy/theme/language settings.

### Explicitly deferred (per this phase's own scope, not forgotten)

Nothing else was planned for Settings — this phase completes it.
Anything beyond default currency (notification preferences, privacy,
email change, 2FA, active sessions, public profiles, theme, language,
units) remains exactly as out-of-scope as every prior phase already
stated it was, per this task's own explicit "do not implement" list.

## 40. Calendar (.ics) export — first post-Settings product feature

The feature chosen after a product-strategy review (map/geographic
itinerary, calendar export, travel logistics, and trip-level
communication were all evaluated; calendar export won on being the one
candidate needing zero schema change, zero new dependency, and 100%
already-modeled data — see that review's own reasoning, not repeated
here). A one-way, read-only `.ics` export of a trip's itinerary —
Voyage stays the planning source of truth; this exports *into* a
calendar app, never syncs back.

**Where it lives**: an "Export calendar" button in `.trip-header-
actions`, first in the row (before Edit trip/Delete trip) — the one
button in that row available to *every* trip member, not just
canEdit/isOwner, since exporting is read-only. For a pure viewer, who
sees neither Edit nor Delete, this is the only thing ever in that row
— confirmed live, not just reasoned about (see below).

**Trip day → calendar date**: reuses `getTripDays(trip.startDate,
trip.endDate)` verbatim (no second date-math implementation) — each
activity's own `dayNumber` looks up that day's real `Date`, which
`combineDateAndTime` then merges with the activity's "HH:mm" time using
only local Date getters/setters on both sides, never a UTC round-trip.

**Start/end time handling**: `getStartTime`/`getEndTime`
(`utils/activities.js`) were exported (they already existed, just
module-private) so the calendar export reads a start/end time exactly
the same way the itinerary UI and the overlap-detector already do,
including the legacy single-`.time`-field fallback — no second,
possibly-drifting copy of that logic. An activity with no start time at
all (unreachable through `AddActivity.jsx`'s own required-field
validation today, only via malformed/legacy data) is silently excluded
from the export rather than emitted as an invalid `VEVENT` (`DTSTART`
is REQUIRED per RFC 5545). An activity with a start time but no end
time (same: not reachable through today's form, which requires both —
confirmed live, submitting with only a start time is refused with
"Select an end time.") gets `DTEND` set equal to `DTSTART` — an
explicit, valid, zero-duration event — rather than omitting `DTEND`
outright; both are legal, but an explicit `DTEND` is the one every
mainstream calendar client honors consistently, and it invents no
duration that isn't actually known.

**No LOCATION anywhere** — activities and saved places have no
address/coordinate data of any kind (confirmed against the schema
during the map-feature review this same session), so none is
fabricated here either.

**Timezone**: `DTSTART`/`DTEND` are RFC 5545 "floating" local times —
no trailing `Z`, no `TZID`. Voyage has never captured a timezone
anywhere in its data model (`TimePicker` stores a bare wall-clock
"HH:mm", nothing else) — inventing one at export time (the browser's
own zone, or UTC) would risk silently shifting every activity by
however many hours that guess was wrong by. A floating time is
rendered by every calendar client using whatever zone *that device* is
currently set to, with zero conversion on import — exactly matching how
"9:00 AM" already carries no timezone anywhere else in Voyage's own UI.
`DTSTAMP` (a different property — when the `.ics` entry was generated,
not when the activity happens) is the one genuinely real UTC instant in
the file, per spec.

**ICS correctness** (`utils/ics.js`, no new npm package — Blob,
`URL.createObjectURL`, `TextEncoder`, all standard browser APIs already
sufficient): proper `VCALENDAR`/`VEVENT` structure, `VERSION:2.0`,
`METHOD:PUBLISH`, a real `PRODID`; every event gets a stable
`UID = <activity's own real id>@voyage.app` (re-exporting the same trip
produces byte-identical UIDs, correct per spec — a re-import should
recognize the same event, not duplicate it); RFC 5545 TEXT escaping
(backslash first, then `;`/`,`/newline — quotes and apostrophes need no
escaping and are left untouched) and byte-aware line folding (75
*octets*, not characters — measured via `TextEncoder` and iterated by
Unicode code point via `for...of`, so a multi-byte character or a
surrogate pair, e.g. an emoji, is never split mid-character) are both
implemented directly, not approximated.

**Verified far beyond "the browser offered a download"**:
- A standalone Node test (`test-ics.mjs`, not part of the shipped app)
  called `buildTripCalendar` directly against synthetic fixtures
  covering every case in this task's own test list — multi-day, start+
  end, start-only, no-start, commas/semicolons/backslashes/quotes/
  Unicode/emoji in names and notes, embedded newlines, a 200+-character
  name forcing real line folding, an empty trip, a trip with activities
  but none timed, filename sanitization — every assertion passed, and
  the folded/escaped output was hand-verified byte-for-byte against the
  original text via a full unfold-and-unescape round trip.
- The same generated file was then parsed by **`node-ical`, a real,
  independent, widely-used ICS parser** (installed only into a
  throwaway scratch directory for this verification — never added to
  Voyage's own `package.json`) — it correctly parsed every event,
  date, and time, and every escaped special character/Unicode/emoji
  round-tripped exactly back to the original text, confirming real-
  world interoperability, not just "this project's own code agrees
  with itself."
- Full browser E2E (Playwright, a real Supabase account, real UI
  interaction — not just calling the utility function): signed up,
  created a 3-day trip with a deliberately long name, added activities
  across all three days (including one with commas/quotes/an em dash in
  its name) through the actual Add Activity form, clicked Export, and
  inspected the *actual downloaded file* — correct dates for all three
  days, correct times, correct escaping, zero console errors.
- **Permissions/read-only, proven with two real accounts**: an owner
  and a friend invited as **Viewer** (not editor) — the viewer saw
  Export calendar but neither Edit trip nor Delete trip; the viewer's
  own export genuinely contained the owner's activity; the owner's copy
  of the trip was confirmed unchanged afterward (same activity, still
  there) — this feature never writes anything, to any table, ever. A
  signed-out visit to the same trip URL landed on the dashboard with no
  Export button ever rendered and zero console errors, matching the
  app's own existing, untouched auth gating.
- Both 1440px and 390px, including the long-trip-name case: the header
  stays clean (buttons wrap under Voyage's existing
  `.trip-header-actions` flex-wrap, no new wrapping logic needed), no
  horizontal overflow, the post-export "Calendar file downloaded."
  confirmation sits quietly under the buttons via one new `flex-basis:
  100%` rule so it never crowds them on a wide viewport.
- The "nothing to export yet" case (a trip with zero timed activities)
  shows an inline explanation in the same quiet style, and — confirmed
  directly — never touches the DOM/triggers a download at all, since
  `buildTripCalendar` returns `eventCount: 0` before any file content
  is even downloaded.

`npm run lint` and `npm run build` both pass; build output byte-
identical before and after the full test run.

### Files changed

- **Added**: `src/utils/ics.js`.
- **Modified**: `src/utils/activities.js` (`getStartTime`/`getEndTime`
  exported, no logic change), `src/components/TripPage.jsx` (the Export
  calendar button, `exportStatus` state, `handleExportCalendar`),
  `src/App.css` (`.trip-export-status`, one small rule).
- **Nothing else** — no schema, no migration, no RLS, no new npm
  dependency, no change to `AddActivity.jsx`'s own validation, no
  change to Sign out/Delete account/Settings/any prior feature.

### Explicitly deferred (per this task's own scope, not forgotten)

Google Calendar OAuth/two-way sync, automatic/background sync, editing
calendar events from Voyage, reminders/notifications, recurring events,
map/location/geocoding, attachments, chat — none were built, per this
task's own explicit "do not implement" list. This is exactly, and only,
Voyage itinerary → `.ics` file.

## 41. Printable Itinerary

The second post-Settings feature (after §40's calendar export) — make a
trip's itinerary printable/saveable-as-PDF via the browser's own native
print dialog. No PDF library, no new route, no new markup duplicating
the itinerary: one button calling `window.print()`, and a single
`@media print` block in `App.css` that reuses the exact same DOM the
screen already renders.

**Where it lives**: "Print itinerary", right next to "Export calendar"
in `.trip-header-actions` — same unconditional placement/reasoning (see
§40): read-only, no Supabase call, available to a viewer, not gated
behind `canEdit`/`isOwner` the way Edit/Delete trip are. `handlePrint
Itinerary` is a one-line `window.print()` call; everything about what
actually ends up on paper is decided entirely by CSS.

**"Voyage branding" without duplicating any markup**: `.navbar` stays
in the DOM during print — only `.nav-links`/`.nav-account` (the
interactive nav links and the notification/profile cluster) are hidden
within it — so the one existing `.logo` "Voyage" text node becomes the
printed document's own quiet header for free, restyled (smaller, no
box shadow) rather than recreated as new markup anywhere.

**What's hidden**: the back link, the jump-nav pills, every action
button (including Print itinerary and Export calendar themselves —
they have no place on the printed page), People, Saved Places, My
Budget, Group Spending (`#trip-section-people`/`#trip-section-places`/
`.budget-section` — hiding these three wrapper elements takes their
entire subtrees with them, so this needed no changes inside
`TripPeopleSection.jsx`/`SavedPlaces.jsx`/`BudgetSection.jsx` at all),
each day-header's own "+ Add activity" button, each activity's Edit/×
actions, and the overlap-warning pill (not in this task's own "should
contain" list). Any open `.modal-overlay` is also hidden globally (not
trip-page-scoped) — printing via Ctrl+P with a modal open, bypassing
the now-hidden Print itinerary button entirely, should still never
capture a dialog mid-edit.

**Empty itinerary**: `.empty-day` already renders the same "No
activities planned yet." text for both the editable (button) and
static (viewer) cases — print just strips the button affordance and
hides `.empty-day-cta` ("+ Add activity"), leaving the same real
message Voyage already shows a viewer, never new copy.

**Day cards read as document sections, not screen cards**: no
background/border/radius in print (there's no grey page behind them to
contrast against on paper), just a plain top rule between one day and
the next — restyling only, the exact same day-card/activity-item/
activity-list markup underneath.

**Page breaks** (verified against a real, generated multi-page PDF —
see below, not assumed from the CSS alone): `.activity-item` gets
`break-inside: avoid` — an activity's own time/name/category/notes
never split across two pages. `.day-header` gets **both**
`break-after: avoid` (never end a page immediately after a day
heading) **and** `break-inside: avoid` — the first live PDF generated
during this pass caught a real bug `break-after` alone didn't
catch: a day's own "DAY 4" label and its date heading (two separate
elements inside one `.day-header`) landed on opposite sides of a page
break, since nothing stopped a break *inside* the heading itself, only
right after it. Deliberately *not* applied to the whole `.day-card` —
a day with many activities is allowed to flow across a page break
between individual (still-protected) activities rather than being
forced onto a single page or a fresh one as an all-or-nothing block,
which is exactly the "large unnecessary blank area" this task's own
brief asks to avoid.

**A second real bug found and fixed during PDF verification**: the
first generated PDF showed a stray light-grey highlight on one
unrelated activity row — traced to `.activity-item:hover`/`.empty-day:
hover`'s own screen-only tint (`background-color: #fafaf8`) actually
being honored by Chromium's print/PDF rendering pipeline based on
wherever the page's virtual cursor last was, which can land over an
arbitrary row purely because print reflows content to different
positions than the screen had. Fixed by explicitly forcing both
`background-color: transparent !important` under `@media print` —
confirmed fixed even in the deliberate worst case (cursor parked
directly over an activity row immediately before printing).

**Verified live — real print/PDF output, not just the CSS reasoned
about in isolation** (Playwright's `page.pdf()`, real Supabase
accounts, real activities added through the actual Add Activity form):
- A 3-day trip with 7 activities, commas/quotes/an em dash/a
  multi-line note in one activity, and a Japanese-Unicode note on
  another — the generated PDF's own extracted text confirmed correct
  destination, correct trip dates, correct day dates, correct
  chronological order, correct time ranges, every category, and both
  notes (including the Unicode one) intact and correctly wrapped — no
  clipped text anywhere.
- The two bugs above, both caught only by inspecting the *actual*
  rendered PDF, not by reading the CSS — fixed, then reconfirmed fixed
  against freshly-regenerated PDFs.
- A 10-day, 30-activity trip specifically to force real, multi-page
  output (3 pages) — every page break landed either cleanly between two
  complete days or, for a day split across a break, precisely between
  two individual (never-split) activities, with the day's own heading
  correctly kept together with its first activity every time.
- An empty trip (no activities at all): print output shows "No
  activities planned yet." for every day, no button/CTA text, no
  interactive affordance — confirmed both via screenshot and a real
  generated PDF.
- Signed-out access to a trip URL: redirected to the dashboard, Print
  itinerary never rendered, zero console errors — the existing,
  untouched app-wide auth gating.
- Screen UI at 1440px and 390px, before and after this change: existing
  Trip Detail is visually unaffected (Print itinerary sits beside
  Export calendar and wraps naturally via `.trip-header-actions`'
  already-existing `flex-wrap`, no new wrapping logic needed), no
  horizontal overflow, zero console errors.

`npm run lint` and `npm run build` both pass; build output byte-
identical before and after the full test run.

### Files changed

- **Modified**: `src/components/TripPage.jsx` (`handlePrintItinerary`,
  the Print itinerary button), `src/App.css` (one `@media print` block
  — the only CSS added).
- **Nothing else** — no new file, no schema, no migration, no RLS, no
  new npm dependency, no new route, no change to
  `TripPeopleSection.jsx`/`SavedPlaces.jsx`/`BudgetSection.jsx`, no
  change to §40's calendar export or any earlier feature.

### Explicitly deferred (per this task's own scope, not forgotten)

Everything on this task's own "do not implement" list — a PDF library,
a second route, a backend endpoint, stored/generated documents, new
tables/migrations/RLS, new external APIs — none were needed or built.
This is exactly, and only: one button, `window.print()`, and
`@media print` CSS reusing the existing itinerary markup as-is.

## 42. Map v1 — saved-places map (Explore-sourced coordinates only)

The third post-Settings feature, preceded by a dedicated read-only
architecture investigation (not written up as its own numbered
section — its conclusion is this section). That investigation's single
load-bearing finding: Voyage already resolves real coordinates twice
in memory (Geoapify's Explore place search via `normalizePlace` in
`services/geoapify.js`, and city-level geocoding for a trip's own
destination via `TripDestinationField.jsx`) but persisted **zero**
geographic coordinates anywhere — `toSavedPlace()` in `utils/explore.js`
silently dropped `latitude`/`longitude` the moment a place was saved,
and `saved_places`/`activities`/`trips` had no coordinate columns at
all. Map v1 is deliberately scoped to the smallest honest fix for
that: persist the coordinates Explore already resolves, and show only
those — never activities, never manual entries, never anything
geocoded after the fact.

**Scope, precisely**: a small map on a trip's Saved Places section
showing pins only for saved places that came from Explore (and
therefore already carry real Geoapify coordinates). A manually-added
place (`AddPlace.jsx` has no geocoding integration, by design, and
still doesn't) and any place saved before this migration existed both
simply have `latitude`/`longitude` of `null` — fully visible/editable
in the existing Saved Places list, just absent from the map. No
coordinates were added to `activities` or `trips`; no geocoding was
added anywhere; no backfill of old rows; no clustering, routes,
weather, search, or day/category filtering. This is intentionally not
a complete map feature — it is the first honest slice of one.

**Database**: `supabase/migrations/0016_saved_places_coordinates.sql`
adds two nullable columns to `saved_places` — `latitude numeric`,
`longitude numeric`. Additive only; both of `saved_places`' existing
RLS policies ("members can view saved places" / "owners and editors
can manage saved places") are row-level, not column-scoped, so neither
needed to change. Applied by the user directly in the Supabase SQL
Editor (this project's established process — no migration CLI, see
§7a.9) and confirmed applied via a real REST read against the live
database (see Testing below), not assumed.

**Coordinate flow, end to end**: Geoapify's Places API resolves
`latitude`/`longitude` on every Explore result (`normalizePlace`,
unchanged) → `toSavedPlace()` now carries `place.latitude`/
`place.longitude` forward instead of discarding them (previously the
one and only place this data was lost) → `tripsRepository.js`'s
`toPlaceFields`/`fromPlaceRow` map them to/from the new
`saved_places.latitude`/`longitude` columns, exactly like every other
field on that table, with `?? null` (not `?? ''`) since `null` is a
genuine, meaningful value here (no coordinates), not something to
paper over → `TripMap.jsx` receives the trip's `savedPlaces` array as
a prop (never fetches anything itself) and renders a pin for each
place with valid, finite `latitude`/`longitude`. A manually-added place
never has `latitude`/`longitude` on its object at all, so
`toPlaceFields`'s `??` resolves it to `null` the same way — one code
path, no special-casing between the two.

**`TripMap.jsx`** (new): plain Leaflet (not react-leaflet — this app
already avoids extra dependencies beyond what's needed, and Leaflet's
own imperative API is a natural fit for a `useRef`-owned map instance)
+ OpenStreetMap tiles. Fits/centers to all mapped pins via
`L.latLngBounds(...).fitBounds()` (capped at `maxZoom: 15` so two
near-identical coordinates never zoom in absurdly far); a single pin
uses a fixed street-level `setView` zoom instead, since `fitBounds` on
one point would otherwise zoom in as far as the map allows. Clicking a
marker opens a popup built as real DOM nodes (not an HTML string — no
XSS surface from a place name) showing the place's name and, when
present, its category (`getActivityCategoryLabel`, the same helper
Saved Places' own list already uses). Zero saved places, or saved
places but none with coordinates, both render the same compact
Voyage-style empty state (no icon, no heading — quieter than the
existing full `.empty-state` card, since it's a small aside inside a
section that may already have its own full empty state right below
it) instead of an empty Leaflet canvas. Leaflet init is wrapped in
try/catch — a failure there (not a missing tile image, which Leaflet
already handles gracefully on its own) falls back to a small "couldn't
be loaded" notice without taking down the rest of Saved Places. No
`canEdit`/`requireAuth` gating at all: this component has no mutating
action of any kind, so an owner, editor, and viewer who can already
see Saved Places see exactly the same map.

**Placement**: inside `SavedPlaces.jsx` itself, right after the
section heading and before the list/empty-state — `SAVED PLACES` /
`[map]` / `[places list]`, exactly the hierarchy asked for. Only
rendered once the trip has at least one saved place at all (a
brand-new trip with nothing saved yet already gets a full explanation
from the existing "No saved places yet" empty state right below;
stacking a second, smaller "nothing to map yet" notice on top of it
would just be noise). No new route, no new top-level page, no change
to trip navigation beyond that.

**Visual design**: same card language as the rest of the section
(white, `#dededb` border, 16px radius) so it reads as one more piece
of Saved Places, not a bolted-on widget. Fixed 320px height on
desktop, 220px under the existing 600px mobile breakpoint;
`overflow: hidden` keeps tiles clipped to the rounded corners. Only
Leaflet's own popup card styling was touched (radius + a restrained
shadow, matching Voyage's own visual language) — its default
zoom/attribution controls were left as-is, already small and
unobtrusive. Not sticky.

**Testing** (real Supabase-backed trips via Playwright, not assumed):
- A newly-saved Explore place (Rome, real Geoapify results) appears as
  a pin; a second saved place appears as a second pin — a direct
  Supabase REST read (using the signed-in user's own access token,
  bypassing the frontend entirely) confirmed both rows' `latitude`/
  `longitude` genuinely persisted in the database (e.g.
  `41.893321, 12.4829344`), not merely held in React state.
- A manually-added place in the same trip: visible in the Saved Places
  list, absent from the map, and its own REST row confirmed
  `latitude`/`longitude` both `null`.
- Clicking a marker's popup showed the correct place name and category.
- The map correctly fit/centered on both pins (verified via a real
  screenshot of real OpenStreetMap tiles).
- A second trip with only an old-style/manually-added place (no
  coordinates) rendered the compact empty state, no Leaflet canvas at
  all.
- A third trip with exactly one Explore-sourced saved place rendered
  exactly one pin at a sensible (not maximally-zoomed-out) zoom level.
- Owner, an invited editor, and an invited viewer (real friend-request
  → accept → trip-invite → accept flow, three separate accounts) all
  saw the identical map with both pins, zero console errors on any of
  the three sessions.
- Reloading the trip page preserved both pins (coordinates round-trip
  through Supabase correctly, not just kept in memory).
- The editor deleting the unmapped manual place still worked exactly
  as before, and left the map's two real pins untouched.
- Desktop 1440px and mobile 390px both screenshotted; at 390px,
  `document.documentElement.scrollWidth` exactly equaled
  `window.innerWidth` — no horizontal overflow.
- Zero console errors across every session/scenario above.

`npm run lint` and `npm run build` both pass.

### Files changed

- **New migration**: `supabase/migrations/0016_saved_places_
  coordinates.sql` — `saved_places.latitude`/`longitude`, both
  nullable.
- **New**: `src/components/TripMap.jsx`.
- **Modified**: `src/utils/explore.js` (`toSavedPlace()` now carries
  coordinates forward), `src/services/tripsRepository.js`
  (`fromPlaceRow`/`toPlaceFields` map the two new columns),
  `src/components/SavedPlaces.jsx` (renders `TripMap` when the trip has
  at least one saved place), `src/App.css` (`.trip-map`/`.trip-map-
  empty`/popup styling, plus one mobile-breakpoint height override).
- **New dependency**: `leaflet@1.9.4` (production dependency — map
  rendering only; no other dependency changed).
- **Nothing else** — no change to `AddPlace.jsx`, `AddActivity.jsx`,
  `activities`/`trips` schema, RLS policies, or any earlier feature.

### Explicitly deferred (per this task's own scope, not forgotten)

Coordinates on activities or trips, geocoding for manual places or
activities, address autocomplete on `AddActivity.jsx`, backfill/
re-geocoding of pre-existing rows, clustering, routes/directions,
weather, day/category map filtering, and in-map search — all
consciously out of scope for v1, all real candidates for a future Map
v2 once this honest first slice has been lived with.

## 43. Packing Checklist v1

The fourth post-Settings feature, again preceded by a dedicated read-
only architecture investigation (per §42's own precedent). That
investigation's conclusion: Voyage's trip-collaboration permission
model is already exactly one reusable shape — two `security definer`
helper functions (`is_trip_member(trip_id)`, `trip_role(trip_id)`,
both from `0001_init.sql`) and a two-policy pattern every trip-child
table (`activities`, `saved_places`, `expenses`) already copies
verbatim. Packing items needed nothing new: same table shape, same
RLS shape, same repository/handler shape as Saved Places, same
full-row-button toggle Voyage already uses elsewhere for "selected"
state (no native checkbox exists anywhere in this app).

**Database**: `supabase/migrations/0017_packing_items.sql` — a new
`packing_items` table (`id`, `trip_id`, `name`, `completed boolean
default false`, `created_at`, `updated_at`), an index on `trip_id`,
the existing `set_updated_at` trigger, and the exact two-policy shape
`activities`/`saved_places` already use ("members can view packing
items" / "owners and editors can manage packing items" `for all`).
**A real bug found and fixed during this pass**: the first version of
this migration created the table and RLS policies but omitted the
table-level `grant select, insert, update, delete on public.packing_
items to authenticated;` — this project's `authenticated` role has no
default table privileges (see `0003_fix_trips_access.sql`'s own header
comment; every table since has needed its own explicit grant, e.g.
`0005_friendships.sql`, `0014_personal_trip_budgets.sql`). Without it,
every query failed with a genuine `permission denied for table
packing_items` regardless of how correct the RLS policies were — a
table-level grant is Postgres's coarser, first gate; RLS only narrows
what a grant already allows, never substitutes for it. Fixed by adding
the grant to the same (fully idempotent) migration file and having it
re-run in full.

**Repository**: `services/tripsRepository.js` gained `fromPackingItem
Row`/`toPackingItemFields` and `createSupabasePackingItem`/`updateSup
abasePackingItem`/`deleteSupabasePackingItem` — same shape as the
saved-places functions right next to them. `packing_items` was added
to `getSupabaseTrips`'s existing batch `Promise.all` (not a new fetch
path) and grouped client-side into `packingItemsByTripId`, exactly
like `saved_places`; attached to each trip as `trip.packingItems`
(flat array, same as `savedPlaces` — no day-grouping the way
`activities` needs). `fromRow`'s own defaults gained `packingItems: []`
alongside `savedPlaces`/`activities`/`expenses`.

**App state**: `App.jsx` gained `handleAddPackingItem`/`handleToggle
PackingItem`/`handleDeletePackingItem`, same shape as the Saved Places
handlers immediately above them — `handleTogglePackingItem` sends the
full item back through `updateSupabasePackingItem` with `completed`
flipped (same "send the whole object" approach `handleUpdateActivity`
already uses), not a partial patch.

**Components**: `PackingList.jsx` (new) — the trip-level list, closest
visual reference Saved Places (`.place-list`'s white/border/16px-
radius card, `.place-item`'s row padding/border-bottom), simpler since
there's no image column. `AddPackingItem.jsx` (new) — the smallest
add-modal in the app: one field, same modal skeleton as `AddPlace.jsx`
(modal-overlay > modal, × close button as the only "Cancel" — none of
the existing add-modals have a separate Cancel button either), trims
and validates the name is non-empty before calling `onSave`.

**The toggle, precisely**: Voyage has no native `<input type=
"checkbox">` anywhere (confirmed by a full-repo search before
building this). The existing substitute — a full-row `<button aria-
pressed>` with a circular indicator (`.save-trip-indicator`, already
used by `SaveToTripDialog.jsx`'s save-to-trip rows and
`AddExpense.jsx`'s participant picker) — is reused verbatim, with one
new state added to that same indicator class (`.is-completed`, same
filled-black-circle treatment `.is-saved` already gets, just a
different name for a different meaning) rather than inventing a
second indicator style. A completed item's name gets `color: #9a9a95;
text-decoration: line-through` — clearly completed, never removed or
hidden. For a viewer, the identical markup renders as a plain,
non-interactive `<div>` (`.packing-item-toggle.is-readonly`) instead
of a `<button>` — same content and completed styling, but no
affordance implying an action that would just fail.

**Placement**: a new top-level jump-nav pill, "Packing", immediately
after "Itinerary" and before "Places" — `People → Itinerary → Packing
→ Places → My Budget → Group Spending`. Mechanically identical to
how every existing section is wired: one entry in `sectionNavItems`,
one id in the `IntersectionObserver`'s own `ids` array, one
`<div id="trip-section-packing">` wrapper — no change to the jump-nav
mechanism itself (`.filter-row`/`.filter-pill`, reused from Explore).

**Testing** (real Supabase-backed trip, three real accounts — owner,
an invited editor, an invited viewer via genuine friend-request →
accept → trip-invite → accept):
- Owner added 3 items (including one long name to test wrapping);
  reload preserved all 3.
- Toggling "Passport" set `aria-pressed="true"` and applied
  `.is-completed`; reload preserved it — and a direct Supabase REST
  read (the signed-in user's own token, bypassing the frontend)
  confirmed `completed: true` genuinely persisted in the database.
- The completed item stayed visible in the list the entire time —
  never auto-removed.
- Owner deleted an item; count dropped correctly.
- Editor could add, toggle, and delete an item — all three worked.
- Editor and viewer both saw the identical 2-item state, including
  "Passport" already showing completed — real shared collaborative
  state, not per-session.
- Viewer: no "+ Add item" button, zero delete buttons rendered, and
  the toggle rendered as a non-interactive `<div>` (0 `<button
  class="packing-item-toggle">` elements) — confirmed via DOM
  inspection, not just a screenshot.
- A direct, unauthorized `POST` to `packing_items` using the viewer's
  own access token (bypassing the UI entirely) was refused with a
  real HTTP 403 and `"new row violates row-level security policy for
  table packing_items"` — RLS itself is the actual authority, not
  just hidden buttons.
- Mobile 390px: `scrollWidth === innerWidth`, no horizontal overflow;
  the long item name wrapped correctly on both viewports.
- Every existing section (People, Itinerary, Places, My Budget, Group
  Spending) remained present and functional; nav pill order confirmed
  exactly `People, Itinerary, Packing, Places, My Budget, Group
  Spending`.
- Zero console errors across every session/scenario.

`npm run lint` and `npm run build` both pass.

### Files changed

- **New migration**: `supabase/migrations/0017_packing_items.sql`.
- **New**: `src/components/PackingList.jsx`,
  `src/components/AddPackingItem.jsx`.
- **Modified**: `src/services/tripsRepository.js` (packing-item
  mapping/CRUD, included in `getSupabaseTrips`'s batch fetch),
  `src/App.jsx` (three new handlers, three new `TripPage` props),
  `src/components/TripPage.jsx` (new nav pill, new section id, new
  `PackingList`/`AddPackingItem` mounts), `src/App.css` (`.packing-*`
  rules + one new `.save-trip-indicator.is-completed` state).
- **Nothing else** — no new dependency, no change to Map v1,
  Itinerary, Saved Places' own component, Budget, or Expenses.

### Explicitly deferred (per this task's own scope, not forgotten)

Categories, quantities, per-person ownership, templates, weather
integration, AI suggestions, shopping links, notifications, offline
support, drag-and-drop/reordering — all consciously out of scope for
v1, all real candidates for a future Packing Checklist v2.
