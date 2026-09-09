// Thin wrapper around the Pexels Search API — the sole source of place
// photos in Voyage. Kept entirely separate from services/geoapify.js:
// Geoapify stays the source of truth for place data, and normalizePlace
// never depends on this file. A place with no Pexels result (or when
// this API key is missing) still renders fine via the existing
// no-image fallback — enrichment here is strictly optional.
//
// The API key never appears in JSX/CSS or committed source: it's read
// once here from Vite's env (see .env.example) and nowhere else.
//
// STRATEGY — city + category image pools, no per-place requests
// (rewritten again; this replaces an earlier design that gave every
// place its own background "specific search" — one extra Pexels
// request per unique place, ever. That was *reliable* (queues drained
// correctly, no card ever got stuck — confirmed via live diagnostics),
// but it made request volume scale with place count: a 48-place
// destination cost ~50-60 requests, and visiting several large
// destinations in one session reliably crossed Pexels' free-tier
// 200/hour limit by the 3rd or 4th city — confirmed live by
// reproducing that exact rate-limit condition.
//
// The fix is the one this file now implements: every place's image
// comes from a *shared* pool fetched once per (city, category) —
// e.g. one search for "Budapest cafes" serves every cafe in Budapest,
// not one search per cafe. A destination with ~48 places across, say,
// 8 represented categories now costs roughly 8 requests total, not 48.
// No per-place Pexels request happens by default. A "well-known
// landmark gets its own search" exception was considered and
// deliberately left out: doing it reliably needs either real landmark
// detection (heuristics prone to false positives/negatives) or an
// extra request to verify (defeats the point) — low API usage and
// reliability matter more here than that extra polish.
//
// Each place gets a *different* photo within its category's pool by
// deterministic rank, not independent hashing (see pickByRank) — every
// place sharing a (city, category) is assigned a stable position among
// its siblings (computed in utils/explore.js's getCategoryRanks, from
// the full place list, and threaded down through
// PlaceCard/PlaceDetails), so with N places and a pool of at least N
// photos, all N get distinct images — no collisions until the pool is
// actually exhausted. The pool itself is shuffled once, deterministically
// (seeded by its own city+category key), when first fetched, so which
// photo lands on rank 0 varies by pool rather than always being
// Pexels' single top-ranked result for every category everywhere.
//
// The queue safety architecture (createQueue below) is UNCHANGED from
// the version that fixed a real nested-queue deadlock (routing a pool
// fetch through the same queue whose slots were held by jobs awaiting
// it). That fix stands: only pool fetches are ever queued now — a
// place's own resolution is just "await its pool, then pick" (no
// network call of its own), so there is nothing left that could
// recursively enqueue into the same queue it's already occupying a
// slot in. This is what let the earlier place-level queue
// (`fallbackQueue`) be removed entirely rather than reworked — its
// entire purpose (bounding concurrent per-place network jobs) no
// longer applies when there are no more per-place network jobs.

const PEXELS_SEARCH_URL = 'https://api.pexels.com/v1/search'
const CACHE_STORAGE_KEY = 'voyage:pexels-image-cache'
const POOL_CACHE_LIMIT = 200 // soft cap so localStorage can't grow unbounded over long-term use

// Bumped whenever the cache's own shape *or contents' meaning* changes,
// so a cache written by an older version doesn't get misread — see
// loadPersistedCache below. v5 dropped the old per-place `places` field
// entirely (a place's image is a cheap, pure derivation from its
// cached pool). v6: IMAGE_POOL_SIZE grew (15 -> ~35) and pools are now
// shuffled once at fetch time (see deterministicShuffle) — an old v5
// pool has too few photos and the wrong (unshuffled) order for rank-
// based assignment to spread things out properly, so it's not reused.
// A version mismatch is a full, immediate reset, not a migration —
// touches ONLY this one localStorage key; trips/Saved Places/etc. are
// separate keys and are never read or written here.
const CACHE_VERSION = 6

// Temporary development diagnostics — dev-only (import.meta.env.DEV is
// statically replaced at build time, so this compiles out of
// production entirely) and never passed the API key, only whether one
// is present.
const DEV = import.meta.env.DEV
function devLog(event, data) {
  if (!DEV) return
  console.debug(`[pexels] ${event}`, data)
}

const NO_IMAGE = { url: null, source: 'none' }

function loadPersistedCache() {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY)
    if (!raw) return { pools: new Map(), wasReset: false }
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== CACHE_VERSION) {
      devLog('cache-reset', { reason: parsed ? 'version-mismatch' : 'malformed', previousVersion: parsed?.version })
      return { pools: new Map(), wasReset: true }
    }
    return { pools: new Map(Object.entries(parsed.pools ?? {})), wasReset: false }
  } catch {
    return { pools: new Map(), wasReset: true }
  }
}

// Pool cache: "<city>|<categoryKeyword>" -> string[] of photo URLs —
// the shared pools themselves. Only ever populated with a *genuine*
// outcome (Pexels actually responded, whether or not it had photos) —
// never a transient failure — so a pool can't get permanently stuck
// empty just because one request happened to fail or time out.
// Persisted to localStorage (see persistCache) so it survives a full
// page refresh, a destination switch, and scrolling — not just
// remounts within the same render.
const { pools: poolCache, wasReset } = loadPersistedCache()
// A version mismatch (or corrupted JSON) means the cache above already
// starts empty — but the stale JSON blob itself would otherwise linger
// in localStorage, unwritten, until the next successful pool fetch
// happens to trigger a fresh persistCache() call. Overwrite it
// immediately instead.
if (wasReset) persistCache()

// Dedupes concurrent lookups for the same pool — several places in the
// same city/category all becoming visible at once share one request
// chain instead of firing several.
const poolInFlight = new Map()

// Best-effort — a full/disabled localStorage should never break image
// loading, it just means results won't survive a refresh this time.
// Caps how many pools are kept (oldest first, by insertion order) so
// this can't grow without bound over a long, many-destination session.
function persistCache() {
  try {
    const pools = Object.fromEntries([...poolCache.entries()].slice(-POOL_CACHE_LIMIT))
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify({ version: CACHE_VERSION, pools }))
  } catch {
    // Ignore — persistence is a nice-to-have, not something that should
    // ever take image loading down.
  }
}

function getApiKey() {
  return import.meta.env.VITE_PEXELS_API_KEY
}

function isValidImageUrl(url) {
  if (typeof url !== 'string' || !url) return false
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

// Bounded so a single stalled request can never hang forever. A hung
// `fetch()` (no response, no error, ever) would otherwise leave its
// queue job's promise unsettled permanently, which never frees its
// concurrency slot — enough of those stalls a queue's `while` loop for
// everything still waiting behind it, forever. 8s is generous for a
// single search request but still firmly bounded.
const REQUEST_TIMEOUT_MS = 8000

// How many photos to request per pool — one request either way (see
// getImagePool), so there's no API-usage cost to asking for more per
// request; a bigger pool just means more distinct photos are available
// for rank-based assignment to spread across a busy category's places
// (see pickByRank) before any repeats become necessary.
const IMAGE_POOL_SIZE = 35

// Counts actual dispatched requests since the last destination change
// (reset in cancelPendingLookups) — purely for the dev-only summary log
// below, to make request volume per destination directly verifiable.
let destinationRequestCount = 0

// Fetches one Pexels search. `failed` (network error, timeout, non-2xx
// response — including a 429 rate limit — or an unparsable body) is
// kept distinct from a legitimate empty `photos` array: a genuine
// "Pexels looked and found nothing" is a real, cacheable result; a
// failure to even complete the request is not, and must never be
// treated as one — and must never be left unresolved either.
async function fetchPexelsPhotos(query, perPage) {
  const apiKey = getApiKey()
  if (!apiKey) {
    devLog('request-skipped', { query, reason: 'no-api-key' })
    return { photos: [], failed: false }
  }
  if (!query) return { photos: [], failed: false }

  const url = new URL(PEXELS_SEARCH_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('per_page', String(perPage))

  destinationRequestCount += 1
  devLog('request-started', { query, perPage, destinationRequestCount })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response
  try {
    response = await fetch(url, { headers: { Authorization: apiKey }, signal: controller.signal })
  } catch (error) {
    const reason = controller.signal.aborted ? 'timeout' : 'network-error'
    devLog('request-failed', { query, reason, message: String(error) })
    return { photos: [], failed: true }
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    devLog('request-failed', { query, status: response.status }) // includes 429 rate-limit, 5xx, etc.
    return { photos: [], failed: true }
  }

  try {
    const data = await response.json()
    const photos = data.photos ?? []
    devLog('request-succeeded', { query, status: response.status, resultCount: photos.length })
    return { photos, failed: false }
  } catch (error) {
    devLog('request-failed', { query, reason: 'invalid-json', message: String(error) })
    return { photos: [], failed: true }
  }
}

// --- Request queue (unchanged from the version that fixed a real
// nested-queue deadlock — see the module comment above) --------------
function createQueue(name, maxConcurrent, jobTimeoutMs) {
  let active = 0
  const pending = []

  function runJobWithTimeout(run) {
    return new Promise((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        devLog('queue-job-timeout', {})
        resolve({ ...NO_IMAGE, inconclusive: true })
      }, jobTimeoutMs)

      run().then(
        (value) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(value)
        },
        (error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          devLog('queue-job-rejected', { message: String(error) })
          resolve({ ...NO_IMAGE, inconclusive: true })
        }
      )
    })
  }

  // A job completing — successfully, with a genuine failure, or via
  // runJobWithTimeout's own timeout above — always resolves (never
  // rejects) and always reaches this `.finally`, so a slot is
  // unconditionally freed and the next pending item started. No path
  // here can leave a slot permanently occupied or a queued promise
  // unsettled.
  function runNext() {
    while (active < maxConcurrent && pending.length > 0) {
      const { key, run, resolve } = pending.shift()
      active += 1
      devLog('request-started-from-queue', { queue: name, key, active, queueLength: pending.length })
      runJobWithTimeout(run)
        .then(resolve)
        .finally(() => {
          active -= 1
          devLog('queue-slot-freed', { queue: name, key, active, queueLength: pending.length })
          runNext()
        })
    }
  }

  function enqueue(key, run) {
    return new Promise((resolve) => {
      pending.push({ key, run, resolve })
      devLog('request-queued', { queue: name, key, queueLength: pending.length, active })
      runNext()
    })
  }

  // Drops every not-yet-started job, resolving each as inconclusive
  // immediately — used when the cards that requested them have already
  // unmounted (a destination change), so they don't keep occupying a
  // slot this queue's *new* work needs. Already-running jobs are left
  // to finish naturally — already bounded by jobTimeoutMs above, so
  // this is a small, bounded handover delay, never a permanently
  // "stuck" queue.
  function cancelPending() {
    const dropped = pending.splice(0, pending.length)
    for (const job of dropped) job.resolve({ ...NO_IMAGE, inconclusive: true })
    return dropped.length
  }

  return { enqueue, cancelPending, getStats: () => ({ active, pending: pending.length }) }
}

// Only one queue now — there is only one kind of network job left
// (a pool fetch). A place's own resolution never enqueues anything
// itself; it just awaits whichever pool fetch(es) it needs, each of
// which is deduped/queued here exactly once no matter how many places
// are waiting on it.
const MAX_CONCURRENT_POOL_LOOKUPS = 4
const POOL_JOB_TIMEOUT_MS = 10000
const poolQueue = createQueue('pool', MAX_CONCURRENT_POOL_LOOKUPS, POOL_JOB_TIMEOUT_MS)

// Called whenever the user moves to a different destination (see
// ExplorePage.jsx) — drops this queue's not-yet-started jobs (see
// createQueue's cancelPending above) and logs + resets the per-
// destination request counter, so request volume per destination is
// directly visible in dev tools.
export function cancelPendingLookups() {
  devLog('destination-request-summary', { totalRequests: destinationRequestCount })
  destinationRequestCount = 0
  const dropped = poolQueue.cancelPending()
  devLog('destination-changed', { droppedPool: dropped })
  return dropped
}

// A small, deterministic hash — used two ways below: to seed each
// pool's own shuffle, and (via pickFromPool) as a last-resort per-place
// fallback for the rare case a caller has no group rank to offer (see
// pickByRank). Not used for the main category-tier assignment anymore:
// independent per-place hashing can collide two places onto the same
// photo even with unused photos still sitting in the pool — exactly
// the repetition this was built to fix. See pickByRank/getCategoryRanks
// in utils/explore.js for the group-aware replacement.
function hashString(value) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function pickFromPool(pool, seed) {
  if (!pool || pool.length === 0) return null
  return pool[hashString(seed) % pool.length]
}

// Deterministic pseudo-random generator (mulberry32) — same numeric
// seed always produces the same sequence, so the same pool key always
// shuffles the same way.
function mulberry32(seed) {
  let state = seed | 0
  return function random() {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Shuffles once, deterministically, seeded by the pool's own city+
// category key — every session shuffles a given pool identically, so
// this only needs to run when a pool is freshly fetched (see
// getImagePool), not on every pick. Purely cosmetic (which photo lands
// on which rank), not load-bearing for correctness: pickByRank's
// collision-avoidance comes from unique ranks landing on unique
// indices regardless of the pool's order.
function deterministicShuffle(items, seedKey) {
  const random = mulberry32(hashString(seedKey))
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// The main category-tier assignment: `rank` is this place's stable
// position among every place sharing its (city, category) — see
// getCategoryRanks in utils/explore.js — so with N places and a pool of
// at least N photos, every one gets a distinct photo (rank 0..N-1 map
// to distinct pool indices 0..N-1); only once N exceeds the pool size
// do ranks start wrapping back onto an already-used photo. Falls back
// to the old per-place hash (pickFromPool) if no rank was supplied —
// still deterministic and stable, just without the group-wide
// collision avoidance — so a caller that doesn't have the full sibling
// group handy (there currently isn't one) still gets a sane result.
function pickByRank(pool, rank, fallbackSeed) {
  if (!pool || pool.length === 0) return null
  if (typeof rank === 'number' && Number.isFinite(rank)) {
    return pool[rank % pool.length]
  }
  return pickFromPool(pool, fallbackSeed)
}

// Fetches (once) and caches — in memory *and* persisted, see
// persistCache — a pool of `IMAGE_POOL_SIZE` destination-level photos
// for one "<city> <categoryKeyword>" query (e.g. "Budapest cafe
// coffee", or "Budapest travel" for the final, broadest tier — see
// CATEGORY_QUERY_KEYWORDS). Reused by every place in that city/category
// — never a fresh request per place. Only a genuinely successful
// response (even an empty one) is cached — a failed request is retried
// by the next place that needs this pool, rather than that failure
// being locked in for the rest of the session.
async function getImagePool(city, categoryKeyword) {
  const key = `${city.toLowerCase()}|${categoryKeyword}`
  if (poolCache.has(key)) return { photos: poolCache.get(key), inconclusive: false }
  if (poolInFlight.has(key)) return poolInFlight.get(key)

  const query = `${city} ${categoryKeyword}`
  const request = poolQueue
    .enqueue(key, () => fetchPexelsPhotos(query, IMAGE_POOL_SIZE))
    .then(({ photos, failed, inconclusive }) => {
      poolInFlight.delete(key)
      // A queue-job timeout resolves with the NO_IMAGE/inconclusive
      // shape (no `photos` field) rather than fetchPexelsPhotos's own
      // `{ photos, failed }` shape — normalize both here.
      const rawPhotos = photos ?? []
      const didFail = failed ?? inconclusive ?? false
      const urls = rawPhotos.map((photo) => photo.src?.large).filter(isValidImageUrl)
      // Shuffled once, here, at fetch time — not at pick time — seeded
      // by this pool's own key so it's identical every time this exact
      // pool is fetched, but varies from one city/category to the next
      // (see deterministicShuffle). The cached/persisted pool is this
      // already-shuffled order, so pickByRank never needs to shuffle.
      const shuffled = deterministicShuffle(urls, key)
      if (!didFail) {
        poolCache.set(key, shuffled)
        persistCache()
      }
      return { photos: shuffled, inconclusive: didFail }
    })

  poolInFlight.set(key, request)
  return request
}

// Search keywords per Voyage Explore category, tuned for genuinely
// relevant travel imagery rather than plain city scenery (e.g. an
// actual restaurant/food photo for Restaurants, not a random Budapest
// street). Appended to the city name to form the pool query — see
// getImagePool. 'travel' (used directly in computePlaceImage, not
// listed here) is the final, broadest tier if a category pool is empty.
const CATEGORY_QUERY_KEYWORDS = {
  Attractions: 'landmarks travel',
  Restaurants: 'restaurant food',
  Cafes: 'cafe coffee',
  Museums: 'museum architecture',
  Beaches: 'beach',
  Nature: 'nature outdoors',
  Shopping: 'shopping street',
  Nightlife: 'nightlife city',
  Hotels: 'hotel',
}

// The only resolution path now — no per-place network request. At most
// two sequential, *shared* pool fetches: "<city> <category>", then
// "<city> travel" if that came up empty. Both pools are cached/deduped
// across every place that needs them, so a whole destination costs
// roughly one request per category actually represented, plus at most
// one destination-wide fallback — not one request per place.
// `categoryRank` (this place's stable position among its (city,
// category) siblings — see getCategoryRanks in utils/explore.js) is
// what makes the category-tier assignment collision-free rather than
// each place picking independently; the travel/destination-wide
// fallback tier still uses the older per-place hash (pickFromPool) —
// that tier's "group" isn't knowable in advance (it's whichever
// categories happen to fail), and it's reached rarely enough that the
// extra plumbing isn't worth it.
async function computePlaceImage(place, categoryRank) {
  if (!getApiKey()) return { ...NO_IMAGE, inconclusive: true }

  const city = (place.destination || '').split(',')[0].trim()
  if (!city) return { ...NO_IMAGE, inconclusive: false }

  let inconclusive = false

  const categoryKeyword = CATEGORY_QUERY_KEYWORDS[place.category]
  if (categoryKeyword) {
    const categoryPool = await getImagePool(city, categoryKeyword)
    inconclusive = inconclusive || categoryPool.inconclusive
    const picked = pickByRank(categoryPool.photos, categoryRank, place.id)
    if (picked) return { url: picked, source: 'fallback', inconclusive: false }
  }

  const travelPool = await getImagePool(city, 'travel')
  inconclusive = inconclusive || travelPool.inconclusive
  const pickedTravel = pickFromPool(travelPool.photos, place.id)
  if (pickedTravel) return { url: pickedTravel, source: 'city', inconclusive: false }

  return { ...NO_IMAGE, inconclusive }
}

// Resolves to `{ url, source }` — `source` is `'fallback'` (this
// place's own category pool) or `'city'` (the broader destination-wide
// pool, only reached if the category pool was empty), or `'none'` if
// neither had anything (no API key, or both pools genuinely came up
// empty). Never a place-specific photo — see the module comment for
// why that was deliberately dropped. Never throws, so a caller can
// always fall back to Voyage's own no-image treatment.
//
// `categoryRank` (optional) is this place's stable position among its
// (city, category) siblings — see getCategoryRanks in utils/explore.js
// — and is what spreads different places across a category's pool
// instead of each one picking independently and risking a collision.
// Omitting it still works (falls back to the older per-place hash),
// just without that group-wide guarantee.
export async function getPlaceImage(place, categoryRank) {
  if (!place?.id) return NO_IMAGE

  try {
    // `inconclusive` only matters internally, between computePlaceImage
    // and getImagePool — the caller just gets the best answer available.
    // eslint-disable-next-line no-unused-vars
    const { inconclusive, ...result } = await computePlaceImage(place, categoryRank)
    devLog('resolved', {
      placeId: place.id,
      name: place.name,
      categoryRank,
      source: result.source,
      hasUrl: Boolean(result.url),
    })
    return result
  } catch {
    return NO_IMAGE
  }
}

// Read-only, synchronous — returns a photo URL from this destination's
// already-cached Pexels pools (see poolCache above), or null if nothing
// has been cached yet. Never issues a network request and never
// touches the queue — a destination not yet explored in this browser
// (or across page loads, via the persisted cache) simply returns null
// so the caller can fall back to its own no-image treatment. Used by
// Trip Cards on the dashboard, which — unlike Explore's PlaceCard —
// must never trigger a fresh Pexels request just to render a small
// photo alongside trip details; they only ever get a photo the user's
// own Explore browsing already paid for.
//
// Checks the broad "<city> travel" pool first (the closest thing to a
// generic destination photo), then falls back to whichever category
// pool for this city happens to already be cached. `seed` (e.g. a trip
// id) varies which photo within a pool is picked, via the same
// deterministic hash as the per-place fallback tier — so the same trip
// always resolves to the same photo, and two trips to the same city
// don't necessarily show identical photos.
export function getCachedDestinationImage(destination, seed) {
  const city = (destination || '').split(',')[0].trim().toLowerCase()
  if (!city) return null

  const travelKey = `${city}|travel`
  if (poolCache.has(travelKey)) {
    const picked = pickFromPool(poolCache.get(travelKey), seed || city)
    if (picked) return picked
  }

  for (const [key, pool] of poolCache) {
    if (!key.startsWith(`${city}|`)) continue
    const picked = pickFromPool(pool, seed || city)
    if (picked) return picked
  }

  // A city can genuinely be cached under a longer name than the one
  // being looked up here — Geoapify itself is the source of that name
  // (see geocodeCity/normalizePlace), and it doesn't always return the
  // plain city name a caller might reasonably use: searching "London"
  // resolves to (and every one of its pools gets cached under)
  // "Greater London", so a lookup for "london" would otherwise never
  // find photos that are genuinely sitting right there in the cache.
  // Matched as a whole word within the cached pool's own city name —
  // not a blind substring check, so it can't accidentally match an
  // unrelated city that merely contains these letters — and only once
  // the exact-name checks above have already failed.
  for (const [key, pool] of poolCache) {
    const poolCity = key.split('|')[0]
    if (poolCity === city) continue
    if (!poolCity.split(/\s+/).includes(city)) continue
    const picked = pickFromPool(pool, seed || city)
    if (picked) return picked
  }

  return null
}

// Read-only diagnostic snapshot — for verifying request volume and
// queue/cache behavior stay bounded across repeated destination
// changes in one session. Never mutates anything. Inspect via
// `window.__pexelsDiagnostics?.()` in devtools.
export function getDiagnosticsSnapshot() {
  return {
    poolQueue: poolQueue.getStats(),
    poolCacheSize: poolCache.size,
    poolInFlightSize: poolInFlight.size,
    destinationRequestCount,
  }
}

if (DEV && typeof window !== 'undefined') {
  window.__pexelsDiagnostics = getDiagnosticsSnapshot
}
