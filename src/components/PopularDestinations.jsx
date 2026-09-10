import { useState } from 'react'
import { RECOMMENDED_DESTINATIONS } from '../data/places'
import londonImage from '../assets/destinations/london.jpg'
import milanImage from '../assets/destinations/milan.jpg'
import parisImage from '../assets/destinations/paris.jpg'
import romeImage from '../assets/destinations/rome.jpg'

// These four cities are the *only* ones Popular Destinations ever
// shows (RECOMMENDED_DESTINATIONS below is this exact fixed list, not
// user- or data-driven) — unlike every other photo in Voyage, which
// comes from Pexels because the place/city it's for isn't known ahead
// of time, these four are permanently fixed, so their photos can just
// ship as bundled local assets instead. That was a deliberate change
// away from the previous approach (a read-only lookup into Pexels'
// destination-image cache, `getCachedDestinationImage` — still exactly
// how Trip Cards resolve their own photos, see App.jsx's
// getTripCardImage): that only ever had something to show once this
// browser had actually explored that city, so an offline/never-
// explored visitor's Popular Destinations reliably showed blank
// fallback cards — this bundled-asset approach shows a real photo for
// all four unconditionally, on the very first load, with no network
// dependency (no Pexels request, no cache, no external image URL) and
// nothing left for mobile/slow connections to fail to load.
// Vite fingerprints/optimizes each import at build time — same as
// every other bundled asset already in src/assets — so these are
// already reasonably sized files, not the original multi-MB photos.
const DESTINATION_IMAGES = {
  Rome: romeImage,
  Paris: parisImage,
  Milan: milanImage,
  London: londonImage,
}

// One destination card — its own component (not just inline JSX inside
// the map below) so each card can independently track whether its own
// image actually rendered, via the same onError-recovery pattern
// PlaceCard.jsx already uses for Explore's own cards. A bundled local
// asset essentially can't 404 the way a Pexels URL occasionally can,
// but this costs nothing to keep as a last-resort safety net — it's
// the same neutral fallback every other no-image case in Voyage
// already uses, not a new one.
function DestinationCard({ city, onSelect }) {
  const localImage = DESTINATION_IMAGES[city] ?? null
  const [imageFailed, setImageFailed] = useState(false)

  const showImage = Boolean(localImage) && !imageFailed

  return (
    <button type="button" className="destination-card" onClick={onSelect}>
      {showImage ? (
        <img
          src={localImage}
          alt=""
          className="destination-card-image"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="destination-card-image-fallback" aria-hidden="true" />
      )}
      <span className="destination-card-name">{city}</span>
    </button>
  )
}

// A compact strip of destination teasers for the homepage — Explore's
// own visual language (image on top, name below, same radius/border/
// fallback treatment as .place-explore-card) in miniature, reused here
// rather than a new card style. Deliberately reuses the same
// recommended-cities list Explore itself offers (data/places.js) — the
// destination each card *links to* still goes through the exact same
// onSelectDestination -> Explore flow as before; only how the card's
// own photo is sourced changed (see DESTINATION_IMAGES above).
function PopularDestinations({ onSelectDestination }) {
  return (
    <div className="destination-strip">
      {RECOMMENDED_DESTINATIONS.map((city) => (
        <DestinationCard
          key={city}
          city={city}
          onSelect={() => onSelectDestination(city)}
        />
      ))}
    </div>
  )
}

export default PopularDestinations
