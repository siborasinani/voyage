import { useState } from 'react'
import { formatDateLabel } from '../utils/date'
import { getCachedDestinationImage } from '../services/pexels'

// A Trip Card's photo is never its own Pexels request — it only ever
// reuses a photo the user's own Explore browsing already paid for:
// first a saved place's own image (already stored on the trip, no
// lookup at all), then whatever's already sitting in Pexels' local
// pool cache for this destination (see getCachedDestinationImage).
// Neither path can ever trigger a new network request; a trip whose
// destination was never explored in this browser simply renders the
// card's no-image fallback instead.
function getTripCardImage(trip) {
  const savedPlaceWithImage = (trip.savedPlaces ?? []).find((place) => place.image)
  if (savedPlaceWithImage) return savedPlaceWithImage.image

  return getCachedDestinationImage(trip.destination, trip.id)
}

// `isPast` (see utils/itinerary.js's isTripUpcoming/isTripPast) adds a
// small, quiet "PAST TRIP" status pill and slightly recedes the card's
// resting opacity — never disabled, never missing any of its usual
// info or its "View trip" action, just a subtle cue that this one is
// travel history rather than something still ahead.
//
// `role`/`ownerName` (both optional — App.jsx only ever passes them
// for a trip the current user doesn't own, see its own
// ownedUpcomingTrips/sharedUpcomingTrips split) add the same
// OWNER/EDITOR/VIEWER pill language TripPeopleSection.jsx's own People
// list already uses (`.friend-status-pill`, reused verbatim — not a
// new pill style) plus a small "Owned by X" caption, so a shared
// trip's card is identifiable at a glance without a whole separate
// card design.
function TripCard({ trip, isPast = false, role, ownerName, onView }) {
  const tripImage = getTripCardImage(trip)
  // Same onError-recovery pattern PopularDestinations.jsx's DestinationCard
  // and Explore's own PlaceCard already use: a cached/saved URL can exist
  // but still fail to load (an expired/removed Pexels asset, a stale
  // saved-place photo), which would otherwise leave a permanently broken
  // image instead of the same neutral fallback every other no-image case
  // uses. Tracks the specific URL that failed (not just a boolean) so
  // that if `tripImage` later resolves to a *different* URL for this
  // same trip (e.g. a saved place gains an image, or the cache picks up
  // a fresh pool), that new URL still gets a fair chance to load instead
  // of inheriting a previous, unrelated URL's failure.
  const [failedImage, setFailedImage] = useState(null)
  const showImage = Boolean(tripImage) && tripImage !== failedImage

  return (
    <article className={'trip-card' + (isPast ? ' is-past' : '')}>
      {showImage ? (
        <img
          src={tripImage}
          alt=""
          className="trip-card-image"
          loading="lazy"
          onError={() => setFailedImage(tripImage)}
        />
      ) : (
        <div className="trip-card-image-fallback" aria-hidden="true" />
      )}

      <div className="trip-card-body">
        <div className="trip-card-meta">
          <p className="section-label">{trip.destination}</p>
          {role && <span className="friend-status-pill">{role.toUpperCase()}</span>}
          {isPast && <span className="trip-card-status">PAST TRIP</span>}
        </div>

        <h3>{trip.name}</h3>

        <p className="trip-card-dates">
          {formatDateLabel(trip.startDate)} → {formatDateLabel(trip.endDate)}
        </p>

        {ownerName && <p className="trip-card-owner">Owned by {ownerName}</p>}
      </div>

      <button className="secondary-button" onClick={onView}>
        View trip
      </button>
    </article>
  )
}

export default TripCard
