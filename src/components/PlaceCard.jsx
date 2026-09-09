import { useEffect, useRef, useState } from 'react'
import { getPlaceImage } from '../services/pexels'

const DEV = import.meta.env.DEV
function devLog(event, data) {
  if (!DEV) return
  console.debug(`[explore-lazy] ${event}`, data)
}

// Temporary diagnostic only: how many cards currently have a "live"
// (observing, not-yet-triggered) IntersectionObserver — used to verify
// this returns to a sane baseline after a destination change instead of
// growing unboundedly. Never read by any real app logic. Inspect via
// `window.__exploreObservedCount` in devtools.
let observedCardCount = 0
function setObservedCardCount(next) {
  observedCardCount = next
  if (DEV && typeof window !== 'undefined') window.__exploreObservedCount = observedCardCount
}

// How far below the viewport a card can be before it's treated as
// "approaching" it and its image lookup is triggered — a little head
// start so the image has a chance to arrive by the time the user
// actually scrolls it into view, without requesting for the entire
// rest of a long grid up front (see the module comment below).
const VIEWPORT_ROOT_MARGIN = '400px 0px'

// `onImageEnriched(placeId, image, source)` is optional — when given,
// it lets the caller lift a found photo (and its source — see
// services/pexels.js) into its own place list once, so switching
// filters or reopening this place later reuses it instead of searching
// again (see ExplorePage.jsx's handleImageEnriched).
//
// Image lookups are gated on this card actually approaching the
// viewport (IntersectionObserver below), not fired unconditionally on
// mount — a large grid renders every card into the DOM immediately, so
// without this a large grid's worth of lookups would all fire at once.
// See services/pexels.js's module comment for the other half of this:
// a place's own lookup is a cheap, no-network derivation from an
// already-fetched (and cached/shared) city+category pool, never its
// own Pexels request.
function PlaceCard({ place, categoryRank, isSaved, onOpen, onSave, onImageEnriched }) {
  const cardRef = useRef(null)
  // Cards that already have an image don't need to be observed at all —
  // treated as "visible" from the start so the fetch effect below skips
  // straight past needing a trigger — same fallback, and for the same
  // reason, if IntersectionObserver were ever unavailable: computed
  // once here rather than via a setState inside the effect below, so
  // that effect never needs to synchronously set state on mount.
  const [isNearViewport, setIsNearViewport] = useState(
    () => Boolean(place.image) || typeof IntersectionObserver === 'undefined'
  )

  // Only ever set by this card's own successful Pexels lookup below —
  // the displayed image otherwise comes straight from `place.image`
  // (e.g. already resolved earlier, or lifted back down via
  // onImageEnriched), so there's nothing to keep in sync here.
  const [found, setFound] = useState(null)
  const [isLoadingImage, setIsLoadingImage] = useState(!place.image)
  // A place can have a real image URL that still fails to load (e.g. an
  // expired link) — fall back to the same neutral treatment as having
  // no image at all, rather than a broken-image icon. Neither flag is
  // set until the <img> itself actually finishes (or fails) loading —
  // the fallback area is never swapped for a real image, or vice versa,
  // before the browser has genuinely had a chance to load it.
  const [imageFailed, setImageFailed] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Observes this card's own root element only — a fresh observer per
  // card, disconnected on unmount (destination change, category filter
  // removing this card, or this card's own image resolving) rather than
  // one shared/global observer that could accidentally get disconnected
  // for everyone after the first card loads.
  useEffect(() => {
    // Either case is already covered by the initial state above (has
    // an image, or no IntersectionObserver support) — nothing to
    // observe. Checked directly, not via `isNearViewport`, so this
    // effect only ever runs once per place mount, not again once that
    // state flips true from the observer callback below.
    if (place.image || typeof IntersectionObserver === 'undefined') return undefined

    const node = cardRef.current
    if (!node) return undefined

    devLog('card-observed', { placeId: place.id, name: place.name })
    let isObserving = true
    setObservedCardCount(observedCardCount + 1)

    const stopObserving = () => {
      if (!isObserving) return // avoid double-decrementing if both the
      isObserving = false // trigger callback and unmount cleanup fire
      setObservedCardCount(observedCardCount - 1)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        devLog('card-entered-viewport', { placeId: place.id, name: place.name })
        setIsNearViewport(true)
        // Unobserve this one card now that it's triggered — no reason
        // to keep watching it, and this never touches any other card's
        // observer (each card owns its own instance).
        observer.unobserve(node)
        stopObserving()
      },
      { rootMargin: VIEWPORT_ROOT_MARGIN }
    )

    observer.observe(node)
    return () => {
      observer.disconnect()
      stopObserving()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id, place.image])

  useEffect(() => {
    if (place.image) return undefined // already have an image — nothing to fetch
    if (!isNearViewport) return undefined // not yet approaching the viewport — wait for the observer above

    let cancelled = false
    // Legitimate loading-flag pattern for a visibility-driven fetch —
    // there's no user event to hang this off of instead (same
    // established pattern as DestinationSearch.jsx's debounced
    // autocomplete).
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
    // place/categoryRank/onImageEnriched are read once per trigger — a fresh
    // PlaceCard is mounted for each place in the grid, and this only
    // fires again if isNearViewport flips (which only ever happens
    // once, false -> true).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id, place.image, isNearViewport])

  const image = place.image || found?.url
  const imageSource = place.image ? place.imageSource : found?.source
  const showImage = Boolean(image) && !imageFailed
  // A city/category-level photo is never of the place itself — say so
  // quietly rather than let it read as a real photo of this business.
  const showsDestinationOnly = imageSource === 'city' || imageSource === 'fallback'

  return (
    <article className="place-explore-card" ref={cardRef}>
      {showImage ? (
        <div className="place-explore-image-wrap">
          <img
            src={image}
            alt={place.name}
            className={'place-explore-image' + (imageLoaded ? ' is-loaded' : '')}
            loading="lazy"
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
            'place-explore-image-fallback' + (isLoadingImage ? ' is-loading' : '')
          }
          aria-hidden="true"
        >
          <span className="place-image-fallback-label">{place.category}</span>
        </div>
      )}

      <div className="place-explore-body">
        <div className="place-explore-heading">
          <h3>{place.name}</h3>
          <span className="place-explore-category">{place.category}</span>
        </div>

        <p className="place-explore-destination">{place.destination}</p>
        <p className="place-explore-description">{place.description}</p>

        <div className="place-explore-actions">
          <button type="button" className="secondary-button" onClick={onOpen}>
            View details
          </button>
          <button
            type="button"
            className={isSaved ? 'save-status-button is-saved' : 'primary-button'}
            onClick={onSave}
          >
            {isSaved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </article>
  )
}

export default PlaceCard
