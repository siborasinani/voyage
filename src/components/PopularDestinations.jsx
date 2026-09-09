import { useState } from 'react'
import { RECOMMENDED_DESTINATIONS } from '../data/places'
import { getCachedDestinationImage } from '../services/pexels'

// One destination card — its own component (not just inline JSX inside
// the map below) so each card can independently track whether its own
// cached image actually rendered, via the same onError-recovery
// pattern PlaceCard.jsx already uses for Explore's own cards. A cached
// URL can exist but still fail to load (an expired/removed Pexels
// asset, a transient network hiccup) — without this, that one card
// would show a permanently blank/broken image instead of recovering
// into the same neutral fallback every other no-image case already
// uses. Still a pure, read-only cache lookup — never a new request.
function DestinationCard({ city, onSelect }) {
  const cachedImage = getCachedDestinationImage(city, city)
  const [imageFailed, setImageFailed] = useState(false)

  const showImage = Boolean(cachedImage) && !imageFailed

  return (
    <button type="button" className="destination-card" onClick={onSelect}>
      {showImage ? (
        <img
          src={cachedImage}
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
// recommended-cities list Explore itself offers (data/places.js) and
// the same read-only, no-network image lookup Trip Cards already use
// (see App.jsx's getTripCardImage) — a city this browser has already
// explored shows its real photo; one that hasn't simply shows the same
// quiet neutral fallback Explore uses, never a fresh Pexels request.
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
