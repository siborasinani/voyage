import { formatDayDate } from '../utils/itinerary'

// Lets the user pick which itinerary day a saved place should be added
// to, before the Add Activity form opens pre-filled with its details.
function ChooseDayDialog({ days, onSelectDay, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal confirm-dialog">
        <h2>Add to itinerary</h2>
        <p className="confirm-dialog-message">Choose which day to add this to.</p>

        <ul className="choose-day-list">
          {days.map((day) => (
            <li key={day.dayNumber}>
              <button
                type="button"
                className="choose-day-option"
                onClick={() => onSelectDay(day.dayNumber)}
              >
                <span className="choose-day-number">Day {day.dayNumber}</span>
                <span className="choose-day-date">{formatDayDate(day.date)}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="confirm-dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChooseDayDialog
