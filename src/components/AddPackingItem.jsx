import { useState } from 'react'

// The smallest possible add-modal in the app — deliberately just one
// field. Same modal skeleton as AddPlace.jsx/AddActivity.jsx (modal-
// overlay > modal, modal-header with a × close button, one labeled
// input, one primary submit button) — "Cancel" is that same × close
// button, same as every other add-modal here; none of them have a
// separate "Cancel" text button either.
function AddPackingItem({ onClose, onSave }) {
  const [nameError, setNameError] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()

    const formData = new FormData(event.target)
    const name = (formData.get('name') || '').trim()

    if (!name) {
      setNameError('Enter an item name.')
      return
    }

    setNameError('')

    // Trimmed here, once — same "never store what was only ever
    // accidental leading/trailing whitespace" approach every other
    // add-modal in this app already takes for its own required field.
    onSave({ name })
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <p className="section-label">NEW ITEM</p>
            <h2>Add a packing item</h2>
          </div>

          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <label>
            Item name
            <input
              name="name"
              type="text"
              placeholder="Passport"
              required
            />
          </label>

          {nameError && <p className="form-error">{nameError}</p>}

          <button className="primary-button submit-button" type="submit">
            Add item
          </button>
        </form>
      </div>
    </div>
  )
}

export default AddPackingItem
