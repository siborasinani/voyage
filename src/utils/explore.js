// Maps an Explore category (plural, e.g. "Restaurants") to the closest
// entry in the app's own ACTIVITY_CATEGORIES list, so a place saved
// from Explore fits the existing Saved Places data model exactly like
// one entered by hand.
const EXPLORE_TO_SAVED_CATEGORY = {
  Attractions: 'Attraction',
  Restaurants: 'Restaurant',
  Cafes: 'Cafe',
  Museums: 'Museum',
  Beaches: 'Beach',
  Nature: 'Nature',
  Shopping: 'Shopping',
  Nightlife: 'Nightlife',
}

// Filters a place list by destination (when given — the current
// Geoapify-backed results already come pre-scoped to one destination,
// so this is mostly a no-op there), category ("All" matches
// everything), and a free-text search against name, category,
// description, and address/location.
export function filterPlaces(places, { destination, category, searchTerm }) {
  const normalizedSearch = searchTerm.trim().toLowerCase()

  return places.filter((place) => {
    if (destination && place.destination !== destination) return false
    if (category && category !== 'All' && place.category !== category) return false

    if (normalizedSearch) {
      const haystack = [
        place.name,
        place.category,
        place.description,
        place.address,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (!haystack.includes(normalizedSearch)) return false
    }

    return true
  })
}

// Converts an Explore place (from Geoapify, already normalized — see
// services/geoapify.js) into the shape Saved Places already uses,
// tagging it with `sourcePlaceId` so it can be recognized as "already
// saved" if the user tries to save it to the same trip again. Only the
// normalized fields Voyage actually displays are kept — never the raw
// API response. `image`/`imageSource` (if the place had resolved one
// via Pexels by the time it was saved — see services/pexels.js) travel
// along too, so reopening this place later never needs a second photo
// search, and never mislabels a destination-level fallback as a photo
// of the specific place. `latitude`/`longitude` (Geoapify's own
// resolved coordinates for this exact place — see normalizePlace)
// travel along the same way now too, so Map v1 (TripMap.jsx) has real
// pins to show — previously these were silently dropped here, the
// single reason the app persisted zero coordinates anywhere despite
// Geoapify already supplying them. A manually-added place
// (AddPlace.jsx) never goes through this function, so it's unaffected
// and simply never has coordinates, by design.
export function toSavedPlace(place) {
  return {
    id: crypto.randomUUID(),
    sourcePlaceId: place.id,
    name: place.name,
    category: EXPLORE_TO_SAVED_CATEGORY[place.category] ?? 'Other',
    customCategory: '',
    location: place.address || place.destination,
    notes: place.description,
    image: place.image || '',
    imageSource: place.image ? place.imageSource || 'none' : 'none',
    latitude: place.latitude ?? null,
    longitude: place.longitude ?? null,
  }
}

export function isPlaceSavedToTrip(trip, place) {
  return (trip.savedPlaces ?? []).some(
    (savedPlace) => savedPlace.sourcePlaceId === place.id
  )
}

// Whether a place has been saved to at least one of the user's trips —
// used to switch a place's own Save button into a "Saved" state.
export function isPlaceSavedAnywhere(trips, place) {
  return trips.some((trip) => isPlaceSavedToTrip(trip, place))
}

// Normalizes a destination label to just its city, for comparing
// labels that may differ in exact text but name the same place — e.g.
// a recent search's full geocoded "Paris, Île-de-France, France" vs a
// trip's own free-typed "Paris, France" vs Explore's own short-form
// "Paris". Same first-segment/lowercase approach getCategoryRanks
// below (and services/pexels.js's own city key) already use inline for
// their own, unrelated purpose — this is a separate copy on purpose,
// so this display-only dedupe never touches that Pexels-ranking path.
export function normalizeCityKey(label) {
  return (label || '').split(',')[0].trim().toLowerCase()
}

// De-dupes a list of destination labels by normalized city (see
// normalizeCityKey above), keeping each label's original text (so a
// pill's displayed text is never rewritten) and preserving input
// order. `seen` is a Set the caller can pass in and reuse across
// several lists, in priority order — the first list filters out
// nothing (an empty Set), each list after that skips any city already
// claimed by an earlier, higher-priority list, so the same city is
// never shown twice across sections while still favoring whichever
// occurrence is more useful (see ExplorePage.jsx's suggestion rows).
export function dedupeDestinations(labels, seen = new Set()) {
  const result = []
  for (const label of labels) {
    const key = normalizeCityKey(label)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(label)
  }
  return result
}

// Groups `places` by (normalized city, Voyage category) — the exact
// same partition services/pexels.js's image pools are keyed by, since
// a Voyage category always maps to one fixed Pexels query keyword — and
// assigns each place a stable 0-based rank among its siblings in that
// group. Used to spread different pool photos across a category's
// cards (see PlaceCard.jsx/PlaceDetails.jsx passing this down to
// getPlaceImage) instead of each place picking a photo independently,
// which can collide two places onto the same image even when the pool
// has plenty of unused ones left.
//
// Ranked by each place's own *id*, not by its position in `places` —
// Geoapify's response order (and, before this existed, whichever card
// happened to lazy-load first) isn't guaranteed stable across a
// refresh or a re-fetch, but a place's id is, so sorting by it is what
// keeps "same place -> same rank -> same photo" true across a refresh
// and a revisit, not just within one render.
export function getCategoryRanks(places) {
  const groups = new Map()

  for (const place of places) {
    const city = (place.destination || '').split(',')[0].trim().toLowerCase()
    const key = `${city}|${place.category}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(place.id)
  }

  const ranks = new Map()
  for (const placeIds of groups.values()) {
    const sortedIds = [...placeIds].sort()
    sortedIds.forEach((id, index) => ranks.set(id, index))
  }
  return ranks
}
