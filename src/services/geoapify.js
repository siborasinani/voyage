// Thin wrapper around the Geoapify Geocoding, Autocomplete, and Places
// APIs. Kept as independent functions (geocodeCity / autocompleteCity /
// searchPlacesNearCity) — resolving a destination, suggesting one as
// the user types, and finding real places around a point are three
// separate concerns, so any one can be reused, swapped, or extended
// (e.g. a future Place Details lookup) independently of the others.
//
// The API key never appears in JSX/CSS or committed source: it's read
// once here from Vite's env (see .env.example) and nowhere else.

const GEOCODE_URL = 'https://api.geoapify.com/v1/geocode/search'
const AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete'
const PLACES_URL = 'https://api.geoapify.com/v2/places'

// Voyage's own category labels, mapped to the Geoapify place
// categories that best represent them. Geoapify's taxonomy is broader
// and more granular than Voyage's, so a Voyage category is often
// several Geoapify categories combined (e.g. bars + pubs + nightclubs
// -> Nightlife). Verified against Geoapify's live API for both a
// historic-center-heavy city (Rome) and a smaller one (Tirana) — see
// searchPlacesNearCity below for why *how* these are queried matters
// just as much as *which* categories are listed.
//
// "Hotels" isn't an active Explore filter yet (see EXPLORE_CATEGORIES
// in data/places.js) but is kept here ready to go — adding 'Hotels' to
// that list is all a future addition would need.
export const VOYAGE_TO_GEOAPIFY_CATEGORIES = {
  Attractions: ['tourism.attraction', 'tourism.sights'],
  Restaurants: ['catering.restaurant'],
  Cafes: ['catering.cafe'],
  Museums: ['entertainment.museum'],
  Beaches: ['beach'],
  Nature: ['natural', 'leisure.park'],
  Shopping: ['commercial.shopping_mall', 'commercial.marketplace'],
  Nightlife: ['adult.nightclub', 'catering.bar', 'catering.pub'],
  Hotels: ['accommodation.hotel'],
}

export class GeoapifyError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'GeoapifyError'
    this.code = code
  }
}

function getApiKey() {
  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY
  if (!apiKey) {
    throw new GeoapifyError(
      'Missing Geoapify API key — add VITE_GEOAPIFY_API_KEY to your local .env file.',
      'missing-api-key'
    )
  }
  return apiKey
}

async function getJson(url, { signal } = {}) {
  let response
  try {
    response = await fetch(url, { signal })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new GeoapifyError('Could not reach Geoapify.', 'network-error')
  }

  if (!response.ok) {
    throw new GeoapifyError(`Request failed (${response.status}).`, 'request-failed')
  }

  return response.json()
}

// Resolves free text (e.g. "Rome" or "Rome, Italy") to a display label
// and coordinates. Returns null if nothing matched (an unrecognized
// destination), rather than throwing — that's a normal, expected
// outcome the caller should show as its own empty state. Used for
// direct search submissions and the recommended-city / trip shortcuts,
// which only have a name, not coordinates.
export async function geocodeCity(query, { signal } = {}) {
  const apiKey = getApiKey()

  const url = new URL(GEOCODE_URL)
  url.searchParams.set('text', query)
  url.searchParams.set('type', 'city')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('apiKey', apiKey)

  const data = await getJson(url, { signal })
  const result = data.results?.[0]
  if (!result || typeof result.lat !== 'number' || typeof result.lon !== 'number') {
    return null
  }

  return {
    label: result.city || result.formatted || query,
    country: result.country || '',
    lat: result.lat,
    lon: result.lon,
  }
}

// Live city suggestions as the user types (the caller is responsible
// for debouncing and a minimum-length check — this just makes the
// request). Restricted to `result_type: 'city'` so a query like "Rom"
// suggests actual cities (Rome, Roman, …) rather than also surfacing
// city subdivisions Geoapify otherwise mixes in (e.g. "Municipio Roma
// I"). Each suggestion already carries coordinates, so selecting one
// never needs a separate geocoding call.
export async function autocompleteCity(query, { signal } = {}) {
  const apiKey = getApiKey()

  const url = new URL(AUTOCOMPLETE_URL)
  url.searchParams.set('text', query)
  url.searchParams.set('type', 'city')
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '5')
  url.searchParams.set('apiKey', apiKey)

  const data = await getJson(url, { signal })

  return (data.results ?? [])
    .filter(
      (result) =>
        result.result_type === 'city' &&
        typeof result.lat === 'number' &&
        typeof result.lon === 'number'
    )
    .map((result) => ({
      label: result.city || result.name || query,
      primaryText: result.city || result.name || query,
      secondaryText: [result.state, result.country].filter(Boolean).join(', '),
      country: result.country || '',
      lat: result.lat,
      lon: result.lon,
    }))
}

// Geoapify never lets a feature go unnamed in its response without a
// fallback — for an unnamed park, water body, or similar boundary-ish
// feature, `address_line1`/`formatted` fall back to the *enclosing
// administrative unit's* name (e.g. "Njësia Bashkiake Nr. 2", "Municipio
// Roma I"). Using that as the place's name is exactly how an
// administrative division ends up looking like a travel destination.
// The fix is structural, not name-matching: a feature only counts as a
// real POI if Geoapify gave it an actual name of its own.
function hasUsableName(properties) {
  return typeof properties.name === 'string' && properties.name.trim().length > 0
}

// Defensive — none of our own category queries request administrative
// boundaries, but if Geoapify ever tags a result as one anyway, this
// keeps it out based on its own category data rather than its name.
const NON_POI_CATEGORY_PREFIXES = ['administrative', 'populated_place', 'boundary']

function isNonPoiCategory(category) {
  return NON_POI_CATEGORY_PREFIXES.some(
    (prefix) => category === prefix || category.startsWith(`${prefix}.`)
  )
}

function isRealPlace(properties) {
  if (!hasUsableName(properties)) return false
  const categories = properties.categories ?? []
  if (categories.length > 0 && categories.every(isNonPoiCategory)) return false
  return true
}

async function searchCategoryNearCity(
  voyageCategory,
  geoapifyCategories,
  { lat, lon, radiusMeters, limit, signal }
) {
  const apiKey = getApiKey()

  const url = new URL(PLACES_URL)
  url.searchParams.set('categories', geoapifyCategories.join(','))
  url.searchParams.set('filter', `circle:${lon},${lat},${radiusMeters}`)
  url.searchParams.set('bias', `proximity:${lon},${lat}`)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('apiKey', apiKey)

  const data = await getJson(url, { signal })
  return (data.features ?? [])
    .filter((feature) => isRealPlace(feature.properties ?? {}))
    .map((feature) => ({ feature, voyageCategory }))
}

// ~50m — close enough that two results this near each other sharing a
// name are almost certainly the same real-world place returned twice
// under different OSM ids (seen live: a monument tagged as both a node
// and a way), not two distinct places that happen to share a name.
const DUPLICATE_PROXIMITY_DEGREES = 0.0005

function isNearDuplicate(feature, seenPropertiesList) {
  const properties = feature.properties
  const name = properties.name.trim().toLowerCase()

  return seenPropertiesList.some((seenProperties) => {
    if (seenProperties.name.trim().toLowerCase() !== name) return false
    return (
      Math.abs(seenProperties.lat - properties.lat) < DUPLICATE_PROXIMITY_DEGREES &&
      Math.abs(seenProperties.lon - properties.lon) < DUPLICATE_PROXIMITY_DEGREES
    )
  })
}

// Finds real POIs around a geocoded point — one request per Voyage
// category, run in parallel, rather than one combined request sharing
// a single limit. That distinction matters: verified live that a
// shared-limit combined request lets a dense category (e.g. Attractions
// in a historic city center) crowd out sparser ones (Shopping,
// Nightlife) *entirely*, even when the city clearly has places in them
// — which is exactly the bug this fixes. Filtering by category or
// searching within the destination still happens client-side afterward
// and issues no further requests.
export async function searchPlacesNearCity({
  lat,
  lon,
  voyageCategories,
  limitPerCategory = 8,
  radiusMeters = 12000,
  signal,
}) {
  const categoriesToFetch = voyageCategories ?? Object.keys(VOYAGE_TO_GEOAPIFY_CATEGORIES)

  const resultsByCategory = await Promise.all(
    categoriesToFetch.map((voyageCategory) =>
      searchCategoryNearCity(voyageCategory, VOYAGE_TO_GEOAPIFY_CATEGORIES[voyageCategory], {
        lat,
        lon,
        radiusMeters,
        limit: limitPerCategory,
        signal,
      })
    )
  )

  // Two layers of dedupe, in the original fetch order (Attractions,
  // Restaurants, … per EXPLORE_CATEGORIES), keeping the first occurrence
  // so ordering is preserved: first by place_id (a place can satisfy
  // more than one Voyage category's query, e.g. a restaurant that's
  // also tagged as a bar), then by same-name-and-near-identical-location
  // (Geoapify/OSM occasionally returns the same real place twice under
  // different ids — place_id alone won't catch that).
  const seenPlaceIds = new Set()
  const seenProperties = []
  const merged = []

  for (const categoryResults of resultsByCategory) {
    for (const result of categoryResults) {
      const properties = result.feature.properties ?? {}
      const placeId = properties.place_id

      if (placeId && seenPlaceIds.has(placeId)) continue
      if (isNearDuplicate(result.feature, seenProperties)) continue

      if (placeId) seenPlaceIds.add(placeId)
      seenProperties.push(properties)
      merged.push(result)
    }
  }

  return merged
}

// Converts one Geoapify Places GeoJSON feature into Voyage's own place
// shape, so the rest of the app never touches the raw API response.
// `voyageCategory` comes from which category's request found this
// place (see searchPlacesNearCity) — no separate inference needed.
// `feature` is only ever one that passed isRealPlace() above, so
// `properties.name` is guaranteed present — no address-line fallback
// for the name (that fallback is exactly what caused administrative
// unit names to show up as place names in the first place).
// `destinationCountry` (from geocodeCity/autocompleteCity) is optional
// context, used only by the Pexels service (see services/pexels.js) to
// build a more specific search query — normalization itself never
// depends on Pexels.
// Geoapify's core Places API doesn't return photos, so `image` starts
// blank for every place, and `imageSource` starts `'none'` — the UI
// renders a compact neutral fallback for that case instead of a broken
// image or an empty block. Both are optional by design: they're filled
// in separately (and optionally) by the Pexels service once a card
// actually needs one, and everything still works if that enrichment
// fails or is unavailable.
export function normalizePlace(feature, voyageCategory, destinationLabel, destinationCountry) {
  const properties = feature.properties ?? {}

  return {
    id: properties.place_id ?? `${properties.lon}:${properties.lat}:${properties.name}`,
    name: properties.name,
    destination: destinationLabel,
    country: destinationCountry || '',
    category: voyageCategory,
    description: properties.address_line2 || '',
    address: properties.formatted || properties.address_line1 || '',
    image: '',
    // What kind of image `image` is, once resolved (see services/pexels.js):
    // 'place' (specific to this place), 'city'/'fallback' (a destination or
    // category-level photo, not of this place itself), or 'none' (no image).
    imageSource: 'none',
    latitude: properties.lat,
    longitude: properties.lon,
  }
}
