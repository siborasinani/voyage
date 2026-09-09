import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { getActivityCategoryLabel } from '../utils/activities'

// Map v1 — the honest, small version: a map of a trip's saved places
// that actually have coordinates (see utils/explore.js's toSavedPlace,
// which now persists Geoapify's own lat/lon at save time — see
// PROJECT_CONTEXT.md and supabase/migrations/0016_saved_places_
// coordinates.sql). Nothing here geocodes anything: a saved place
// either already has coordinates or it doesn't, and this component
// never guesses. A manually-added place (AddPlace.jsx has no Geoapify
// integration) and any place saved before this migration existed both
// simply have `latitude`/`longitude` of `null` — they stay fully
// visible and editable in SavedPlaces.jsx's own list, just absent from
// the map, exactly like the architecture investigation recommended.

// Leaflet's default marker icon references image paths relative to its
// own CSS file, which doesn't resolve once bundled — the standard fix
// (same one every Leaflet-in-a-bundler setup needs) is pointing the
// default icon at the bundled marker images explicitly, once, here.
const placeIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

// A single pin has no "bounds" to fit — without this, fitBounds on one
// point zooms in as far as the map allows, which reads as broken, not
// helpful. This is a plain "you're looking at one place" street-level
// zoom instead.
const SINGLE_PLACE_ZOOM = 14
// Caps how far fitBounds is allowed to zoom in for multiple pins that
// happen to sit very close together (or literally overlap) — the same
// "don't zoom in absurdly" concern as the single-pin case above, just
// for the multi-pin path.
const MAX_FIT_ZOOM = 15

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

function hasCoordinates(place) {
  return (
    typeof place.latitude === 'number' &&
    typeof place.longitude === 'number' &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude)
  )
}

// `places` is the trip's own `savedPlaces` array, passed down exactly
// as TripPage.jsx already has it — this component never fetches
// anything itself, and never mutates anything (no add/edit/delete
// controls at all), so it needs no `canEdit`/requireAuth gating: an
// owner, editor, and viewer who can already see Saved Places see
// exactly the same map, same as the rest of that section.
function TripMap({ places }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [failed, setFailed] = useState(false)

  const mappedPlaces = useMemo(() => (places ?? []).filter(hasCoordinates), [places])

  useEffect(() => {
    if (mappedPlaces.length === 0) return undefined
    if (!containerRef.current) return undefined

    // Leaflet's own init/tile/marker calls are synchronous DOM/library
    // work, not a network promise — a failure here (a corrupted
    // container, the library throwing on a bad option) is caught so
    // one broken map never takes the rest of Saved Places down with
    // it. An actual tile *image* failing to load isn't an exception at
    // all (Leaflet just leaves that grid square blank and keeps
    // going), so no separate handling is needed for that case.
    let map
    try {
      map = L.map(containerRef.current, {
        scrollWheelZoom: false,
      })
      mapRef.current = map

      L.tileLayer(TILE_URL, {
        maxZoom: 19,
        attribution: TILE_ATTRIBUTION,
      }).addTo(map)

      for (const place of mappedPlaces) {
        const marker = L.marker([place.latitude, place.longitude], { icon: placeIcon }).addTo(
          map
        )

        const popup = document.createElement('div')
        popup.className = 'trip-map-popup'
        const nameEl = document.createElement('strong')
        nameEl.textContent = place.name
        popup.appendChild(nameEl)

        const categoryLabel = getActivityCategoryLabel(place)
        if (categoryLabel) {
          const categoryEl = document.createElement('span')
          categoryEl.className = 'trip-map-popup-category'
          categoryEl.textContent = categoryLabel
          popup.appendChild(categoryEl)
        }

        marker.bindPopup(popup)
      }

      if (mappedPlaces.length === 1) {
        map.setView([mappedPlaces[0].latitude, mappedPlaces[0].longitude], SINGLE_PLACE_ZOOM)
      } else {
        const bounds = L.latLngBounds(
          mappedPlaces.map((place) => [place.latitude, place.longitude])
        )
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: MAX_FIT_ZOOM })
      }
    } catch {
      // Legitimate synchronous-failure flag, same established precedent
      // as TripDestinationField.jsx's own effect-driven setState calls
      // — this only ever fires once, from Leaflet's own init throwing,
      // never in a loop, so it can't cascade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFailed(true)
    }

    return () => {
      map?.remove()
      mapRef.current = null
    }
  }, [mappedPlaces])

  if (mappedPlaces.length === 0) {
    return (
      <div className="trip-map-empty">
        <p>
          Saved places from Explore will appear here once they have map
          coordinates.
        </p>
      </div>
    )
  }

  if (failed) {
    // The map couldn't be shown, but the rest of Saved Places (the
    // list below) never depends on this component succeeding — same
    // "fail gracefully, keep the rest of the page usable" approach as
    // the rest of the app.
    return (
      <div className="trip-map-empty">
        <p>The map couldn&apos;t be loaded right now.</p>
      </div>
    )
  }

  return <div className="trip-map" ref={containerRef} />
}

export default TripMap
