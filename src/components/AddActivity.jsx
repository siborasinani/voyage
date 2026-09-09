import { useState } from 'react'
import { ACTIVITY_CATEGORIES } from '../utils/activities'
import CategorySelect from './CategorySelect'
import TimePicker from './TimePicker'

// `activity` (editing an existing one) and `prefill` (starting a new one
// from a saved place) are mutually exclusive — `prefill` only supplies
// name/category/notes, never times, since the user still has to choose
// when it actually happens.
function AddActivity({ activity, prefill, onClose, onSave }) {
  const isEditing = Boolean(activity)
  const details = activity ?? prefill

  // Legacy activities (created before start/end times existed) only have
  // a single `time` field — fall back to it so editing one pre-fills
  // sensibly instead of leaving both fields blank.
  const initialStartTime = activity?.startTime ?? activity?.time ?? ''
  const initialEndTime = activity?.endTime ?? activity?.time ?? ''

  const [startTime, setStartTime] = useState(initialStartTime)
  const [endTime, setEndTime] = useState(initialEndTime)
  const [timeError, setTimeError] = useState('')

  const [category, setCategory] = useState(details?.category ?? '')
  const [categoryError, setCategoryError] = useState('')
  const [nameError, setNameError] = useState('')

  // The End Time picker already refuses to offer anything earlier than
  // Start Time, but if Start Time moves *past* an already-chosen End
  // Time, that End Time is no longer valid — clear it rather than
  // silently keeping the now-invalid value, so the user has to pick a
  // fresh one.
  const handleStartTimeChange = (nextStartTime) => {
    setStartTime(nextStartTime)
    if (endTime && endTime < nextStartTime) {
      setEndTime('')
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const formData = new FormData(event.target)

    if (!(formData.get('name') || '').trim()) {
      setNameError('Enter an activity name.')
      return
    }

    setNameError('')

    const submittedStartTime = formData.get('startTime')
    const submittedEndTime = formData.get('endTime')

    if (!submittedStartTime) {
      setTimeError('Select a start time.')
      return
    }

    if (!submittedEndTime) {
      setTimeError('Select an end time.')
      return
    }

    // Safety-net fallback — the TimePicker's own `min` already prevents
    // choosing an end time before the start time through the UI.
    if (submittedEndTime < submittedStartTime) {
      setTimeError('End time cannot be before the start time.')
      return
    }

    setTimeError('')

    const selectedCategory = formData.get('category')
    const customCategory = (formData.get('customCategory') || '').trim()

    if (!selectedCategory) {
      setCategoryError('Select a category.')
      return
    }

    if (selectedCategory === 'Custom' && !customCategory) {
      setCategoryError('Enter a name for your custom category.')
      return
    }

    setCategoryError('')

    const savedActivity = {
      id: isEditing ? activity.id : crypto.randomUUID(),
      name: formData.get('name'),
      startTime: submittedStartTime,
      endTime: submittedEndTime,
      category: selectedCategory,
      customCategory: selectedCategory === 'Custom' ? customCategory : '',
      notes: formData.get('notes'),
    }

    onSave(savedActivity)
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <p className="section-label">
              {isEditing ? 'EDIT ACTIVITY' : 'NEW ACTIVITY'}
            </p>
            <h2>{isEditing ? 'Edit activity' : 'Add activity'}</h2>
          </div>

          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <label>
            Activity name
            <input
              name="name"
              type="text"
              placeholder="Colosseum tour"
              defaultValue={details?.name}
              required
            />
          </label>

          {nameError && <p className="form-error">{nameError}</p>}

          <div className="date-row">
            <label>
              Start time
              <TimePicker
                name="startTime"
                value={startTime}
                onChange={handleStartTimeChange}
              />
            </label>

            <label>
              End time
              <TimePicker
                name="endTime"
                value={endTime}
                onChange={setEndTime}
                min={startTime || undefined}
              />
            </label>
          </div>

          {timeError && <p className="form-error">{timeError}</p>}

          <label>
            Category
            <CategorySelect
              name="category"
              value={category}
              onChange={setCategory}
              options={ACTIVITY_CATEGORIES}
            />
          </label>

          {category === 'Custom' && (
            <label>
              Custom category
              <input
                name="customCategory"
                type="text"
                placeholder="Photography"
                defaultValue={
                  details?.category === 'Custom' ? details.customCategory : ''
                }
                required
              />
            </label>
          )}

          {categoryError && <p className="form-error">{categoryError}</p>}

          <label>
            Notes (optional)
            <textarea
              name="notes"
              rows="3"
              placeholder="Any details worth remembering"
              defaultValue={details?.notes}
            />
          </label>

          <button className="primary-button submit-button" type="submit">
            {isEditing ? 'Save changes' : 'Add activity'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default AddActivity
