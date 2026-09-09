import { useEffect, useState } from 'react'
import { getPlaceImage } from '../services/pexels'

// `onImageEnriched(placeId, image, source)` is optional — when given,
// it lets the caller update its own place data once a photo is found,
// so e.g. the matching card in the Explore grid picks it up too.
function PlaceDetails({ place, categoryRank, isSaved, onClose, onSave, onImageEnriched }) {
  // Only ever set by this view's own successful Pexels lookup below —
  // the displayed image otherwise comes straight from `place.image`
  // (already resolved by the grid card, or already cached), so there's
  // nothing to keep in sync here.
  const [found, setFound] = useState(null)
  const [isLoadingImage, setIsLoadingImage] = useState(!place.image)
  // Neither flag is set until the <img> itself actually finishes (or
  // fails) loading — the fallback area is never swapped for a real
  // image, or vice versa, before the browser has genuinely had a chance
  // to load it.
  const [imageFailed, setImageFailed] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Uses the same Pexels lookup as PlaceCard, which shares the same
  // city+category pool cache keyed independently of any single place —
  // if the grid card already resolved (or is still resolving) this
  // place's photo, this never fires a second Pexels request: it's
  // either an instant cache hit, or awaits the same in-flight pool
  // fetch (see services/pexels.js).
  useEffect(() => {
    if (place.image) return undefined // already have an image — nothing to fetch

    let cancelled = false
    // Legitimate loading-flag pattern for a mount-driven fetch — there's
    // no user event to hang this off of instead (same established
    // pattern as DestinationSearch.jsx's debounced autocomplete).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingImage(true)

    getPlaceImage(place, categoryRank).then(({ url, source }) => {
      if (cancelled) return
      setIsLoadingImage(false)
      if (url) {
        setFound({ url, source })
        setImageFailed(false)
        setImageLoaded(false)
        onImageEnriched?.(place.id, url, source)
      }
    })

    return () => {
      cancelled = true
    }
    // place/categoryRank/onImageEnriched are read once per mount — a fresh
    // PlaceDetails instance is mounted for each place opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id, place.image])

  const image = place.image || found?.url
  const imageSource = place.image ? place.imageSource : found?.source
  const displayImage = !imageFailed && image
  // A city/category-level photo is never of the place itself — say so
  // quietly rather than let it read as a real photo of this business.
  const showsDestinationOnly = imageSource === 'city' || imageSource === 'fallback'

  return (
    <div className="modal-overlay">
      <div className="modal place-details-modal">
        <div className="modal-header">
          <div>
            <p className="section-label">{place.category.toUpperCase()}</p>
            <h2>{place.name}</h2>
          </div>

          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        {displayImage ? (
          <div className="place-details-image-wrap">
            <img
              src={displayImage}
              alt={place.name}
              className={'place-details-image' + (imageLoaded ? ' is-loaded' : '')}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageFailed(true)}
            />
            {showsDestinationOnly && (
              <span className="place-image-source-badge">{place.destination}</span>
            )}
          </div>
        ) : (
          <div
            className={
              'place-details-image-fallback' + (isLoadingImage ? ' is-loading' : '')
            }
            aria-hidden="true"
          >
            <span className="place-image-fallback-label">{place.category}</span>
          </div>
        )}

        <p className="place-details-destination">{place.destination}</p>
        <p className="place-details-description">{place.description}</p>

        {place.address && (
          <p className="place-details-address">{place.address}</p>
        )}

        <button
          className={
            'submit-button' + (isSaved ? ' save-status-button' : ' primary-button')
          }
          type="button"
          onClick={onSave}
        >
          {isSaved ? '✓ Saved to a trip' : 'Save to trip'}
        </button>
      </div>
    </div>
  )
}

export default PlaceDetails
