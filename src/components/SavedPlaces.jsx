import { getActivityCategoryLabel } from '../utils/activities'
import TripMap from './TripMap'

// Places the user wants to visit on this trip, kept separate from the
// day-by-day itinerary — saving one here doesn't commit it to a
// specific day, and adding it to a day later doesn't remove it from
// here either.
// `canEdit` (owner or editor collaborator — see TripPage.jsx's own
// role fetch) gates every mutating control here; a viewer still sees
// the full list, just none of the Add/Delete/Add-to-itinerary actions
// — RLS already refuses all three at the database level regardless,
// this is purely about not showing a control that would just fail.
function SavedPlaces({ places, canEdit, onAddPlace, onRequestDelete, onAddToItinerary }) {
  return (
    <section className="saved-places-section">
      <div className="section-heading">
        <div>
          <p className="section-label">SAVED PLACES</p>
          <h2>Places to visit</h2>
        </div>

        {canEdit && (
          <button className="secondary-button" onClick={onAddPlace}>
            + Add place
          </button>
        )}
      </div>

      {/* Map v1 — only rendered once there's at least one saved place
          at all; a brand-new trip with nothing saved yet already gets
          a full explanation from the "No saved places yet" empty state
          right below, so a second, smaller "nothing to map yet" notice
          on top of it would just be noise. Once a place exists — saved
          from Explore or added by hand — TripMap.jsx itself decides
          whether to show real pins or its own compact "no coordinates
          yet" state (see that component's own comment). */}
      {places.length > 0 && <TripMap places={places} />}

      {places.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">♡</div>

          <h3>No saved places yet</h3>

          <p>
            {canEdit
              ? "Save places you're interested in and add them to your itinerary whenever you're ready."
              : "No places have been saved for this trip yet."}
          </p>

          {canEdit && (
            <button className="primary-button" onClick={onAddPlace}>
              Add a place
            </button>
          )}
        </div>
      ) : (
        <ul className="place-list">
          {places.map((place) => (
            <li className="place-item" key={place.id}>
              {/* Reuses whatever image the place already has from Explore
                  (see tripsRepository.js's toPlaceFields/fromPlaceRow) —
                  never a fresh lookup just to show a saved place. */}
              {place.image ? (
                <img
                  src={place.image}
                  alt=""
                  className="place-item-image"
                  loading="lazy"
                />
              ) : (
                <div className="place-item-image-fallback" aria-hidden="true" />
              )}

              <div className="place-details">
                <div className="place-main">
                  <span className="place-name">{place.name}</span>
                  <span className="place-category">
                    {getActivityCategoryLabel(place)}
                  </span>
                </div>

                {place.location && (
                  <p className="place-location">{place.location}</p>
                )}

                {place.notes && <p className="place-notes">{place.notes}</p>}
              </div>

              {canEdit && (
                <div className="place-actions">
                  <button
                    type="button"
                    className="edit-activity-button"
                    onClick={() => onAddToItinerary(place)}
                  >
                    Add to itinerary
                  </button>

                  <button
                    type="button"
                    className="delete-activity-button"
                    onClick={() => onRequestDelete(place)}
                    aria-label={`Delete ${place.name}`}
                  >
                    ×
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default SavedPlaces
