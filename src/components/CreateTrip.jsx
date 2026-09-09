import { useMemo, useState } from 'react'
import { formatDateLabel } from '../utils/date'
import {
  findOverlappingTrips,
  parseDateInput,
  getTodayInputValue,
} from '../utils/itinerary'
import DatePicker from './DatePicker'
import TripDestinationField from './TripDestinationField'

// `trips` (optional — every trip already visible to the signed-in
// user, owned or shared, see App.jsx's own `visibleTrips`) drives the
// non-blocking date-overlap warning below; omitted entirely, this
// component works exactly as it always has, minus that one warning.
function CreateTrip({ trip, trips = [], onClose, onSave }) {
  const isEditing = Boolean(trip)

  const [startDate, setStartDate] = useState(trip?.startDate ?? '')
  const [endDate, setEndDate] = useState(trip?.endDate ?? '')
  const [dateError, setDateError] = useState('')
  const [fieldError, setFieldError] = useState('')

  // The destination is no longer read from the form's own FormData —
  // TripDestinationField.jsx never lets arbitrary typed text alone
  // count as a real destination, so this is the actual source of
  // truth for "is there currently a valid, selected destination", kept
  // in sync via that field's onSelect/onInvalidate callbacks. Starts
  // already-valid when editing an existing trip (its current
  // destination), null for a brand-new one.
  const [destination, setDestination] = useState(trip?.destination || null)
  const [destinationError, setDestinationError] = useState('')

  // Purely informational — computed fresh on every render from
  // whatever's currently in the date fields, never gates submission.
  // See utils/itinerary.js's findOverlappingTrips for the actual
  // "share at least one calendar day" comparison.
  const overlappingTrips = useMemo(
    () => findOverlappingTrips(startDate, endDate, trips, trip?.id),
    [startDate, endDate, trips, trip?.id]
  )

  // The End Date calendar already refuses to offer anything earlier
  // than Start Date, but if Start Date moves past an already-chosen End
  // Date, that End Date is no longer valid — clear it rather than
  // silently keeping the now-invalid value.
  const handleStartDateChange = (nextStartDate) => {
    setStartDate(nextStartDate)
    if (endDate && endDate < nextStartDate) {
      setEndDate('')
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const formData = new FormData(event.target)

    const tripData = {
      name: formData.get('name'),
      destination: destination || '',
      startDate: formData.get('startDate'),
      endDate: formData.get('endDate'),
    }

    if (!tripData.name.trim()) {
      setFieldError('Enter a trip name.')
      return
    }

    setFieldError('')

    // A destination must come from an actually-selected suggestion —
    // `destination` (see TripDestinationField.jsx's onSelect/
    // onInvalidate) is null the moment the typed text stops matching
    // one, whether nothing was ever picked or the user kept typing
    // after picking something. Deliberately checked here, not left to
    // a blank-field check alone: the field can hold plenty of typed
    // text and still not represent a real place.
    if (!tripData.destination.trim()) {
      setDestinationError('Select a destination from the suggestions.')
      return
    }

    setDestinationError('')

    if (!tripData.startDate) {
      setDateError('Select a start date.')
      return
    }

    if (!tripData.endDate) {
      setDateError('Select an end date.')
      return
    }

    if (parseDateInput(tripData.endDate) < parseDateInput(tripData.startDate)) {
      setDateError('End date cannot be before the start date.')
      return
    }

    // Past-date restriction only applies to brand-new trips — editing an
    // already-past trip should stay possible.
    if (
      !isEditing &&
      parseDateInput(tripData.startDate) < parseDateInput(getTodayInputValue())
    ) {
      setDateError('Start date cannot be in the past.')
      return
    }

    setDateError('')
    onSave(tripData)
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <p className="section-label">
              {isEditing ? 'EDIT TRIP' : 'NEW TRIP'}
            </p>
            <h2>{isEditing ? 'Edit trip' : 'Create a trip'}</h2>
          </div>

          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <label>
            Trip name
            <input
              name="name"
              type="text"
              placeholder="Summer in Italy"
              defaultValue={trip?.name}
              required
            />
          </label>

          {fieldError && <p className="form-error">{fieldError}</p>}

          <label>
            Destination
            <TripDestinationField
              initialValue={trip?.destination}
              onSelect={(label) => {
                setDestination(label)
                setDestinationError('')
              }}
              onInvalidate={() => setDestination(null)}
            />
          </label>

          {destinationError && <p className="form-error">{destinationError}</p>}

          <div className="date-row">
            <label>
              Start date
              <DatePicker
                name="startDate"
                value={startDate}
                onChange={handleStartDateChange}
                min={isEditing ? undefined : getTodayInputValue()}
              />
            </label>

            <label>
              End date
              <DatePicker
                name="endDate"
                value={endDate}
                onChange={setEndDate}
                min={startDate || undefined}
              />
            </label>
          </div>

          {dateError && <p className="form-error">{dateError}</p>}

          {/* Purely informational — never blocks Create/Save, unlike
              every .form-error above. Voyage already allows overlapping
              trips on purpose; this only makes sure the user notices
              before confirming, the same spirit as the itinerary's own
              .activity-overlap-warning pill for a same-day time clash,
              just for trip-level dates instead. */}
          {overlappingTrips.length > 0 && (
            <p className="trip-date-overlap-warning">
              <strong>Date overlap</strong>
              These dates overlap with your trip
              {overlappingTrips.length === 1 ? '' : 's'}{' '}
              {overlappingTrips.map((overlapping, index) => (
                <span key={overlapping.id}>
                  {index > 0 &&
                    (index === overlappingTrips.length - 1 ? ', and ' : ', ')}
                  &ldquo;{overlapping.name}&rdquo; ({formatDateLabel(overlapping.startDate)}
                  {' – '}
                  {formatDateLabel(overlapping.endDate)})
                </span>
              ))}
              .
            </p>
          )}

          <button className="primary-button submit-button" type="submit">
            {isEditing ? 'Save changes' : 'Create trip'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default CreateTrip
