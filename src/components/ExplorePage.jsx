import { useEffect, useMemo, useRef, useState } from 'react'
import { EXPLORE_CATEGORIES, RECOMMENDED_DESTINATIONS } from '../data/places'
import {
  dedupeDestinations,
  filterPlaces,
  getCategoryRanks,
  isPlaceSavedAnywhere,
} from '../utils/explore'
import { useDebouncedValue } from '../utils/useDebouncedValue'
import { addRecentSearch, getRecentSearches } from '../utils/recentSearches'
import { geocodeCity, normalizePlace, searchPlacesNearCity } from '../services/geoapify'
import { cancelPendingLookups } from '../services/pexels'
import DestinationSearch from './DestinationSearch'
import PlaceCard from './PlaceCard'
import PlaceDetails from './PlaceDetails'
import SaveToTripDialog from './SaveToTripDialog'

// Friendly copy for each failure mode — never surfaces a raw HTTP
// status or fetch/network error message to the user.
const ERROR_MESSAGES = {
  'missing-api-key': {
    title: "Real place search isn't set up yet",
    message:
      'Add a Geoapify API key to your local .env file to search real places (see .env.example).',
  },
  'unknown-destination': {
    title: "We couldn't find that destination",
    message: 'Try a different spelling, or search a nearby city instead.',
  },
  'request-failed': {
    title: 'Something went wrong',
    message: "We couldn't load places just now. Please try again in a moment.",
  },
}

// Only the categories Explore actually exposes as filters get fetched —
// see VOYAGE_TO_GEOAPIFY_CATEGORIES in services/geoapify.js for the
// full mapping, which may define more than this (e.g. Hotels) ready
// for whenever they're added to EXPLORE_CATEGORIES.
const ACTIVE_CATEGORIES = EXPLORE_CATEGORIES.filter((category) => category !== 'All')

function ExplorePage({
  trips,
  requireAuth,
  onToggleTrip,
  onCreateTrip,
  initialDestination,
  onInitialDestinationHandled,
}) {
  // null until geocoding confirms a real destination — Explore starts
  // on the selection state (search + recommended cities) rather than
  // fetching, or switching views, before we actually know it resolved.
  const [destinationLabel, setDestinationLabel] = useState(null)
  const [places, setPlaces] = useState([])
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false)
  const [loadError, setLoadError] = useState(null)

  // Geocoding phase — tracked separately so a failed/unknown city keeps
  // the user on the destination-selection screen instead of jumping to
  // an "Explore X" shell for a place that was never actually resolved.
  const [pendingQuery, setPendingQuery] = useState('')
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState(null)

  const [category, setCategory] = useState('All')
  const [searchInput, setSearchInput] = useState('')
  const searchTerm = useDebouncedValue(searchInput, 300)

  const [selectedPlace, setSelectedPlace] = useState(null)
  const [placeToSave, setPlaceToSave] = useState(null)

  // A browser-local list of recently-searched cities (see
  // utils/recentSearches.js) — re-read into state (rather than read
  // fresh on every render) only so a new search actually triggers a
  // re-render of the pills below.
  const [recentSearches, setRecentSearches] = useState(() => getRecentSearches())

  // Caches results per destination (lowercased query -> { label, places })
  // so switching back to an already-loaded city, or re-rendering, never
  // re-issues a request. A ref, not state — updating it shouldn't itself
  // trigger a render.
  const destinationCacheRef = useRef(new Map())
  // Guards against a slower, stale request overwriting a newer one if
  // the user changes destination again before the first reply arrives.
  const requestIdRef = useRef(0)

  const rawTripDestinations = [
    ...new Set(trips.map((trip) => trip.destination).filter(Boolean)),
  ]

  // The same city can otherwise show up in all three suggestion rows
  // below (Recent Searches, Explore Your Trips, Recommended
  // Destinations) — de-duped here by normalized city (see
  // dedupeDestinations), each row keeping only the cities not already
  // claimed by a higher-priority row above it. Recent Searches goes
  // first (the most immediate, personal signal), then the user's own
  // trip destinations (an actual plan), then the generic recommended
  // list last. This only changes what's *displayed* — recent-search
  // storage/ordering (recentSearches.js) and the actual search/geocode
  // flow underneath every pill are untouched.
  const claimedDestinationKeys = new Set()
  const dedupedRecentSearches = dedupeDestinations(recentSearches, claimedDestinationKeys)
  const tripDestinations = dedupeDestinations(rawTripDestinations, claimedDestinationKeys)
  const dedupedRecommendedDestinations = dedupeDestinations(
    RECOMMENDED_DESTINATIONS,
    claimedDestinationKeys
  )

  // Each place's stable rank among its (city, category) siblings — see
  // getCategoryRanks — computed from the *full* `places` list (every
  // category, unfiltered by the search box), never just `visiblePlaces`
  // below, so a place's assigned photo can't shift depending on which
  // category filter or search text happens to be active. Recomputed
  // whenever `places` changes (a new destination's results arriving, or
  // an image resolving and getting lifted back into state via
  // handleImageEnriched) — cheap even then, since it only reads each
  // place's id/category/destination, never `image`, so the result is
  // identical either way.
  const categoryRanks = useMemo(() => getCategoryRanks(places), [places])

  // Patches one place's image (and its source — see services/pexels.js)
  // in both the currently-displayed list and any cached destination it
  // belongs to, once a card or Place Details finds one via Pexels (see
  // PlaceCard.jsx / PlaceDetails.jsx) — so every other place with the
  // same id (the matching card, or this destination's cache entry)
  // picks it up too, and it's still there if the user leaves and comes
  // back to this destination in the same session.
  const handleImageEnriched = (placeId, image, imageSource) => {
    const applyImage = (place) =>
      place.id === placeId ? { ...place, image, imageSource } : place

    setPlaces((currentPlaces) => currentPlaces.map(applyImage))

    for (const [cacheKey, cached] of destinationCacheRef.current) {
      if (cached.label !== destinationLabel) continue
      destinationCacheRef.current.set(cacheKey, {
        ...cached,
        places: cached.places.map(applyImage),
      })
    }
  }

  // Accepts either raw text (recommended cities, trip shortcuts, or a
  // direct search submission — needs geocoding) or an already-resolved
  // suggestion `{ label, lat, lon }` from autocomplete, which already
  // has coordinates and skips geocoding entirely.
  const loadDestination = async (input) => {
    const isResolved = typeof input === 'object' && input !== null
    const rawQuery = isResolved ? input.label : input.trim()
    if (!rawQuery) return

    const cacheKey = rawQuery.toLowerCase()
    const cached = destinationCacheRef.current.get(cacheKey)
    if (cached) {
      requestIdRef.current += 1
      // Drop any Pexels lookups still queued for whatever was showing
      // before — those cards are about to unmount, and letting their
      // lookups keep occupying the shared queue would only delay this
      // (possibly cached, so near-instant) destination's own images.
      cancelPendingLookups()
      setGeocodeError(null)
      setDestinationLabel(cached.label)
      setPlaces(cached.places)
      setLoadError(null)
      addRecentSearch(cached.label)
      setRecentSearches(getRecentSearches())
      return
    }

    const requestId = (requestIdRef.current += 1)

    let location
    if (isResolved) {
      location = {
        label: input.label,
        country: input.country || '',
        lat: input.lat,
        lon: input.lon,
      }
    } else {
      setPendingQuery(rawQuery)
      setIsGeocoding(true)
      setGeocodeError(null)

      try {
        location = await geocodeCity(rawQuery)
      } catch (error) {
        if (requestId !== requestIdRef.current) return
        setIsGeocoding(false)
        setGeocodeError(error.code === 'missing-api-key' ? 'missing-api-key' : 'request-failed')
        return
      }

      if (requestId !== requestIdRef.current) return
      setIsGeocoding(false)

      if (!location) {
        setGeocodeError('unknown-destination')
        return
      }
    }

    // The destination is confirmed real — now (and only now) switch to
    // the "Explore {city}" shell and load its places there. Only now is
    // it safe to drop stale Pexels lookups too: cancelling any earlier
    // (e.g. right after the geocode request started) risked dropping
    // still-relevant lookups for the *previous* destination's still-
    // displayed cards, if this new geocode attempt had failed instead.
    // Also the right moment to record it as a recent search: the city
    // itself is confirmed real here, regardless of whether the places
    // fetch just below happens to succeed or fail.
    cancelPendingLookups()
    setGeocodeError(null)
    setDestinationLabel(location.label)
    addRecentSearch(location.label)
    setRecentSearches(getRecentSearches())
    setIsLoadingPlaces(true)
    setLoadError(null)
    setPlaces([])

    try {
      const results = await searchPlacesNearCity({
        ...location,
        voyageCategories: ACTIVE_CATEGORIES,
      })
      if (requestId !== requestIdRef.current) return

      const normalizedPlaces = results.map(({ feature, voyageCategory }) =>
        normalizePlace(feature, voyageCategory, location.label, location.country)
      )

      destinationCacheRef.current.set(cacheKey, {
        label: location.label,
        places: normalizedPlaces,
      })

      setPlaces(normalizedPlaces)
      setIsLoadingPlaces(false)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setLoadError(error.code === 'missing-api-key' ? 'missing-api-key' : 'request-failed')
      setIsLoadingPlaces(false)
    }
  }

  // Lets a homepage "Popular destinations" card (see PopularDestinations
  // .jsx / App.jsx) deep-link straight into a search here, instead of
  // just dropping the user on Explore's empty selection screen. Runs
  // once per mount only — App.jsx conditionally renders <ExplorePage>
  // itself (see the `view === 'explore'` check), so every real
  // navigation here is a fresh mount, and `onInitialDestinationHandled`
  // clears the pending value back in App.jsx right away so navigating
  // away and back (or a plain "Explore" nav click) doesn't replay it.
  useEffect(() => {
    if (!initialDestination) return
    loadDestination(initialDestination)
    onInitialDestinationHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeDestination = () => {
    requestIdRef.current += 1 // ignore any in-flight request once we leave
    cancelPendingLookups() // drop this destination's own not-yet-started Pexels lookups too
    setDestinationLabel(null)
    setPlaces([])
    setLoadError(null)
    setIsLoadingPlaces(false)
    setGeocodeError(null)
    setIsGeocoding(false)
  }

  const visiblePlaces = filterPlaces(places, { category, searchTerm })
  const placesErrorInfo = loadError ? ERROR_MESSAGES[loadError] : null
  const geocodeErrorInfo = geocodeError ? ERROR_MESSAGES[geocodeError] : null

  return (
    <main className="explore-page">
      <section className="explore-header">
        <p className="eyebrow">EXPLORE</p>

        {destinationLabel ? (
          <div className="explore-title-row">
            <h1>Explore {destinationLabel}</h1>
            <button
              type="button"
              className="explore-change-destination"
              onClick={changeDestination}
            >
              Change destination
            </button>
          </div>
        ) : (
          <>
            <h1>Explore</h1>
            <p className="explore-subtitle">
              Search for a city to discover real attractions, restaurants
              and more, and save the ones you like to a trip.
            </p>
          </>
        )}
      </section>

      {!destinationLabel && (
        <>
          <DestinationSearch
            onSearch={loadDestination}
            onSelectSuggestion={loadDestination}
            placeholder="Search a city..."
          />

          {isGeocoding ? (
            <div className="empty-state explore-intro is-loading">
              <h3>Finding {pendingQuery}…</h3>
              <p>Looking up that destination.</p>
            </div>
          ) : geocodeErrorInfo ? (
            <div className="empty-state explore-intro">
              <h3>{geocodeErrorInfo.title}</h3>
              <p>{geocodeErrorInfo.message}</p>
            </div>
          ) : (
            <>
              {dedupedRecentSearches.length > 0 && (
                <div className="explore-recent-searches">
                  <p className="section-label">RECENT SEARCHES</p>
                  <div className="filter-row">
                    {dedupedRecentSearches.map((city) => (
                      <button
                        key={city}
                        type="button"
                        className="filter-pill"
                        onClick={() => loadDestination(city)}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {dedupedRecommendedDestinations.length > 0 && (
                <div className="explore-recommended">
                  <p className="section-label">RECOMMENDED DESTINATIONS</p>
                  <div className="filter-row">
                    {dedupedRecommendedDestinations.map((city) => (
                      <button
                        key={city}
                        type="button"
                        className="filter-pill"
                        onClick={() => loadDestination(city)}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {tripDestinations.length > 0 && (
                <div className="explore-trip-shortcuts">
                  <p className="section-label">EXPLORE YOUR TRIPS</p>
                  <div className="filter-row">
                    {tripDestinations.map((tripDestination) => (
                      <button
                        key={tripDestination}
                        type="button"
                        className="filter-pill"
                        onClick={() => loadDestination(tripDestination)}
                      >
                        {tripDestination}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="empty-state explore-intro">
                <h3>Where are you headed?</h3>
                <p>
                  Search for a city above, or choose a destination, to
                  start discovering places.
                </p>
              </div>
            </>
          )}
        </>
      )}

      {destinationLabel && (
        <>
          <input
            type="search"
            className="explore-search"
            placeholder="Search places..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Search places"
          />

          <div className="filter-row category-filters">
            {EXPLORE_CATEGORIES.map((option) => (
              <button
                key={option}
                type="button"
                className={
                  'filter-pill' + (option === category ? ' is-active' : '')
                }
                onClick={() => setCategory(option)}
              >
                {option}
              </button>
            ))}
          </div>

          {isLoadingPlaces ? (
            <div className="empty-state is-loading">
              <h3>Finding places…</h3>
              <p>Looking for real places near {destinationLabel}.</p>
            </div>
          ) : placesErrorInfo ? (
            <div className="empty-state">
              <h3>{placesErrorInfo.title}</h3>
              <p>{placesErrorInfo.message}</p>
            </div>
          ) : places.length === 0 ? (
            <div className="empty-state">
              <h3>No places found nearby</h3>
              <p>We couldn't find any places near {destinationLabel} yet.</p>
            </div>
          ) : visiblePlaces.length === 0 ? (
            <div className="empty-state">
              <h3>No places found</h3>
              <p>Try a different search term or category.</p>
            </div>
          ) : (
            <div className="place-grid">
              {visiblePlaces.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  categoryRank={categoryRanks.get(place.id)}
                  isSaved={isPlaceSavedAnywhere(trips, place)}
                  onOpen={() => setSelectedPlace(place)}
                  onSave={() => requireAuth(() => setPlaceToSave(place))}
                  onImageEnriched={handleImageEnriched}
                />
              ))}
            </div>
          )}

          {visiblePlaces.length > 0 && (
            <p className="pexels-attribution">
              Photos from{' '}
              <a href="https://www.pexels.com" target="_blank" rel="noreferrer">
                Pexels
              </a>
            </p>
          )}
        </>
      )}

      {selectedPlace && (
        <PlaceDetails
          place={selectedPlace}
          categoryRank={categoryRanks.get(selectedPlace.id)}
          isSaved={isPlaceSavedAnywhere(trips, selectedPlace)}
          onClose={() => setSelectedPlace(null)}
          onImageEnriched={handleImageEnriched}
          onSave={() =>
            requireAuth(() => {
              setPlaceToSave(selectedPlace)
              setSelectedPlace(null)
            })
          }
        />
      )}

      {placeToSave && (
        <SaveToTripDialog
          place={placeToSave}
          trips={trips}
          onClose={() => setPlaceToSave(null)}
          onToggleTrip={(tripId) => onToggleTrip(tripId, placeToSave)}
          onCreateTrip={() => {
            setPlaceToSave(null)
            onCreateTrip()
          }}
        />
      )}
    </main>
  )
}

export default ExplorePage
