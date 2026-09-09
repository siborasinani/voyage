import { useState } from 'react'
import { ACTIVITY_CATEGORIES } from '../utils/activities'
import CategorySelect from './CategorySelect'

function AddPlace({ onClose, onSave }) {
  const [category, setCategory] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [nameError, setNameError] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()

    const formData = new FormData(event.target)

    if (!(formData.get('name') || '').trim()) {
      setNameError('Enter a place name.')
      return
    }

    setNameError('')

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

    const place = {
      id: crypto.randomUUID(),
      name: formData.get('name'),
      category: selectedCategory,
      customCategory: selectedCategory === 'Custom' ? customCategory : '',
      location: formData.get('location'),
      notes: formData.get('notes'),
    }

    onSave(place)
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <p className="section-label">NEW PLACE</p>
            <h2>Add a place</h2>
          </div>

          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <label>
            Place name
            <input
              name="name"
              type="text"
              placeholder="Colosseum"
              required
            />
          </label>

          {nameError && <p className="form-error">{nameError}</p>}

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
                required
              />
            </label>
          )}

          {categoryError && <p className="form-error">{categoryError}</p>}

          <label>
            Location / address (optional)
            <input
              name="location"
              type="text"
              placeholder="Piazza del Colosseo, 1, Rome"
            />
          </label>

          <label>
            Notes (optional)
            <textarea
              name="notes"
              rows="3"
              placeholder="Why you want to visit"
            />
          </label>

          <button className="primary-button submit-button" type="submit">
            Save place
          </button>
        </form>
      </div>
    </div>
  )
}

export default AddPlace
