import { useState } from 'react'
import { CURRENCIES } from '../utils/budget'
import CategorySelect from './CategorySelect'

function SetBudget({ budget, defaultCurrency, onClose, onSave }) {
  const isEditing = Boolean(budget)
  // An already-set budget's own currency always wins (editing never
  // replaces it with the user's default — see
  // 0015_profile_default_currency.sql's own comment); `defaultCurrency`
  // only ever supplies the *initial* value for a brand-new budget that
  // has none yet, same fallback chain BudgetSection.jsx's own
  // `currency` already uses.
  const [currency, setCurrency] = useState(budget?.currency ?? defaultCurrency ?? 'USD')
  const [amountError, setAmountError] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()

    const formData = new FormData(event.target)
    const amount = Number(formData.get('amount'))

    if (!formData.get('amount') || Number.isNaN(amount) || amount < 0) {
      setAmountError('Enter a valid budget amount.')
      return
    }

    setAmountError('')
    onSave({ amount, currency })
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <p className="section-label">
              {isEditing ? 'EDIT BUDGET' : 'MY BUDGET'}
            </p>
            <h2>{isEditing ? 'Edit budget' : 'Set your budget'}</h2>
          </div>

          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="date-row">
            <label>
              Budget amount
              <input
                name="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="1500"
                defaultValue={budget?.amount}
                required
              />
            </label>

            <label>
              Currency
              <CategorySelect
                name="currency"
                value={currency}
                onChange={setCurrency}
                options={CURRENCIES}
              />
            </label>
          </div>

          {amountError && <p className="form-error">{amountError}</p>}

          <button className="primary-button submit-button" type="submit">
            {isEditing ? 'Save changes' : 'Set budget'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default SetBudget
