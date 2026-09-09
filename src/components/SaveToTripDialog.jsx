import { isPlaceSavedToTrip } from '../utils/explore'

// Lets the user save (or un-save) an Explore place to any number of
// their trips' Saved Places. Every row reflects live state and stays
// open across clicks, so toggling several trips is a single visit —
// closing only happens via "Done".
function SaveToTripDialog({ place, trips, onClose, onToggleTrip, onCreateTrip }) {
  return (
    <div className="modal-overlay">
      <div className="modal confirm-dialog">
        <h2>Save to a trip</h2>

        {trips.length === 0 ? (
          <>
            <p className="confirm-dialog-message">
              You don't have any trips yet. Create one first, then come back
              to save "{place.name}" to it.
            </p>

            <div className="confirm-dialog-actions">
              <button type="button" className="secondary-button" onClick={onClose}>
                Maybe later
              </button>
              <button type="button" className="primary-button" onClick={onCreateTrip}>
                Create a trip
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="confirm-dialog-message">
              Choose which trips to save "{place.name}" to.
            </p>

            <ul className="save-trip-list">
              {trips.map((trip) => {
                const saved = isPlaceSavedToTrip(trip, place)

                return (
                  <li key={trip.id}>
                    <button
                      type="button"
                      className={
                        'save-trip-option' + (saved ? ' is-saved' : '')
                      }
                      onClick={() => onToggleTrip(trip.id)}
                      aria-pressed={saved}
                    >
                      <span className="save-trip-indicator" aria-hidden="true">
                        {saved && '✓'}
                      </span>
                      <span className="save-trip-name">{trip.name}</span>
                      <span className="save-trip-status">
                        {saved ? 'Saved' : trip.destination}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="confirm-dialog-actions">
              <button type="button" className="primary-button" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default SaveToTripDialog
