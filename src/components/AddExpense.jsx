import { useState } from 'react'
import { EXPENSE_CATEGORIES, formatCurrencyAmount, splitAmountEqually } from '../utils/budget'
import { formatDateLabel } from '../utils/date'
import CategorySelect from './CategorySelect'
import DatePicker from './DatePicker'

// `tripMembers`/`currentUserId`/`profilesById` (see
// services/tripsRepository.js's getTripMembers and
// BudgetSection.jsx's own fetch of it) are only ever used when the
// Personal/Shared toggle below is set to Shared — a personal expense
// (still the default, and the only kind this form produced before
// shared expenses existed) ignores all three, so nothing changes for
// that flow. The toggle itself is hidden entirely when there are fewer
// than two trip members, since sharing with nobody isn't a real
// choice.
function AddExpense({
  expense,
  defaultDate,
  maxDate,
  currency,
  tripMembers = [],
  currentUserId,
  profilesById = {},
  onClose,
  onSave,
}) {
  const isEditing = Boolean(expense)
  const canShare = tripMembers.length > 1

  const [isShared, setIsShared] = useState(canShare && Boolean(expense?.participants?.length))
  const [category, setCategory] = useState(expense?.category ?? '')
  const [categoryError, setCategoryError] = useState('')
  const [date, setDate] = useState(expense?.date ?? defaultDate ?? '')
  const [dateError, setDateError] = useState('')
  const [amount, setAmount] = useState(expense?.amount ?? '')
  const [amountError, setAmountError] = useState('')
  const [nameError, setNameError] = useState('')

  // Tracked by display name, matching CategorySelect's own flat-
  // string-options shape — the same "pick one" component every other
  // single-select field in this app already uses, rather than a new
  // id-aware picker. Trip groups are small enough that two members
  // sharing the exact same display name is an accepted, documented
  // limitation for this first version.
  const initialPayer = isEditing
    ? tripMembers.find((member) => member.userId === expense?.paidBy)
    : tripMembers.find((member) => member.userId === currentUserId)
  const [paidByName, setPaidByName] = useState(initialPayer?.profile?.displayName ?? '')
  const [payerError, setPayerError] = useState('')

  const [participantIds, setParticipantIds] = useState(
    () => new Set((expense?.participants ?? []).map((participant) => participant.userId))
  )
  const [participantsError, setParticipantsError] = useState('')

  const toggleParticipant = (userId) => {
    setParticipantIds((current) => {
      const next = new Set(current)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const numericAmount = Number(amount) || 0
  const selectedParticipants = tripMembers.filter((member) => participantIds.has(member.userId))
  const previewShares = splitAmountEqually(numericAmount, selectedParticipants.length)
  const shareByUserId = Object.fromEntries(
    selectedParticipants.map((member, index) => [member.userId, previewShares[index]])
  )

  const handleSubmit = (event) => {
    event.preventDefault()

    const formData = new FormData(event.target)

    if (!(formData.get('name') || '').trim()) {
      setNameError('Enter an expense name.')
      return
    }
    setNameError('')

    const submittedAmount = Number(formData.get('amount'))
    if (!formData.get('amount') || Number.isNaN(submittedAmount) || submittedAmount < 0) {
      setAmountError('Enter a valid amount.')
      return
    }
    setAmountError('')

    const selectedCategory = formData.get('category')
    if (!selectedCategory) {
      setCategoryError('Select a category.')
      return
    }
    setCategoryError('')

    const submittedDate = formData.get('date')
    if (!submittedDate) {
      setDateError('Select a date.')
      return
    }
    // Safety-net fallback — the DatePicker's own max already keeps the
    // user from picking a date after the trip ends through the UI.
    // Dates before the trip start are allowed (flights, hotels, and
    // other bookings are often paid for in advance).
    if (maxDate && submittedDate > maxDate) {
      setDateError(`Choose a date on or before ${formatDateLabel(maxDate)}.`)
      return
    }
    setDateError('')

    let paidBy = null
    let participantIdList = []
    let participantProfilesById

    if (isShared) {
      const payer = tripMembers.find((member) => member.profile?.displayName === paidByName)
      if (!payer) {
        setPayerError('Choose who paid.')
        return
      }
      setPayerError('')

      if (selectedParticipants.length === 0) {
        setParticipantsError('Select at least one participant.')
        return
      }
      setParticipantsError('')

      paidBy = payer.userId
      participantIdList = selectedParticipants.map((member) => member.userId)
      participantProfilesById = profilesById
    } else {
      setPayerError('')
      setParticipantsError('')
    }

    const savedExpense = {
      id: isEditing ? expense.id : crypto.randomUUID(),
      name: formData.get('name'),
      amount: submittedAmount,
      category: selectedCategory,
      date: submittedDate,
      notes: formData.get('notes'),
      paidBy,
      participantIds: participantIdList,
      participantProfilesById,
    }

    onSave(savedExpense)
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <p className="section-label">
              {isEditing ? 'EDIT EXPENSE' : 'NEW EXPENSE'}
            </p>
            <h2>{isEditing ? 'Edit expense' : 'Add expense'}</h2>
          </div>

          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <label>
            Expense name
            <input
              name="name"
              type="text"
              placeholder="Flight to Rome"
              defaultValue={expense?.name}
              required
            />
          </label>

          {nameError && <p className="form-error">{nameError}</p>}

          <div className="date-row">
            <label>
              Amount
              <input
                name="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="120"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>

            <label>
              Category
              <CategorySelect
                name="category"
                value={category}
                onChange={setCategory}
                options={EXPENSE_CATEGORIES}
              />
            </label>
          </div>

          {amountError && <p className="form-error">{amountError}</p>}
          {categoryError && <p className="form-error">{categoryError}</p>}

          <label>
            Date
            <DatePicker
              name="date"
              value={date}
              onChange={setDate}
              max={maxDate}
            />
          </label>

          {dateError && <p className="form-error">{dateError}</p>}

          {canShare && (
            <div className="expense-type-toggle">
              <button
                type="button"
                className={'filter-pill' + (!isShared ? ' is-active' : '')}
                onClick={() => setIsShared(false)}
              >
                Personal
              </button>
              <button
                type="button"
                className={'filter-pill' + (isShared ? ' is-active' : '')}
                onClick={() => setIsShared(true)}
              >
                Shared
              </button>
            </div>
          )}

          {/* "Personal" only means "not split with anyone" — it does NOT
              mean private. There is no per-expense visibility concept in
              the schema (unlike trip_member_budgets, which really is
              private per person — see BudgetSection.jsx's own comment);
              every expense, personal or shared, is trip-scoped and
              visible to every collaborator with view access the moment
              it's saved (see 0001_init.sql's "members can view
              expenses" policy). Without this line, "Personal" sitting
              right next to a genuinely private "My Budget" elsewhere on
              this same page invites exactly the wrong assumption — this
              says so before that assumption forms, honestly (no claim
              of privacy the data can't back up). Only shown while
              Personal is actually selected — once Shared is chosen, the
              participant picker and live split preview below already
              make "who's involved and how much" self-evident, so a
              second explanation there would be redundant. */}
          {canShare && !isShared && (
            <p className="expense-type-hint">
              Personal just means the cost isn't split with anyone — it's
              still visible to everyone on this trip.
            </p>
          )}

          {isShared && (
            <>
              <label>
                Paid by
                <CategorySelect
                  name="paidBy"
                  value={paidByName}
                  onChange={setPaidByName}
                  options={tripMembers.map(
                    (member) => member.profile?.displayName || 'Voyage user'
                  )}
                />
              </label>

              {payerError && <p className="form-error">{payerError}</p>}

              <div className="expense-participants-field">
                <p className="expense-participants-label">Participants</p>

                <ul className="save-trip-list">
                  {tripMembers.map((member) => {
                    const selected = participantIds.has(member.userId)
                    const share = shareByUserId[member.userId]

                    return (
                      <li key={member.userId}>
                        <button
                          type="button"
                          className={'save-trip-option' + (selected ? ' is-saved' : '')}
                          onClick={() => toggleParticipant(member.userId)}
                          aria-pressed={selected}
                        >
                          <span className="save-trip-indicator" aria-hidden="true">
                            {selected && '✓'}
                          </span>
                          <span className="save-trip-name">
                            {member.profile?.displayName || 'Voyage user'}
                          </span>
                          <span className="save-trip-status">
                            {selected && numericAmount > 0 && share != null
                              ? formatCurrencyAmount(share, currency)
                              : ''}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>

                {participantsError && <p className="form-error">{participantsError}</p>}
              </div>

              {selectedParticipants.length > 0 && numericAmount > 0 && (
                <p className="expense-split-preview">
                  {formatCurrencyAmount(numericAmount, currency)} split{' '}
                  {selectedParticipants.length} way
                  {selectedParticipants.length === 1 ? '' : 's'}
                </p>
              )}
            </>
          )}

          <label>
            Notes (optional)
            <textarea
              name="notes"
              rows="3"
              placeholder="Any details worth remembering"
              defaultValue={expense?.notes}
            />
          </label>

          <button className="primary-button submit-button" type="submit">
            {isEditing ? 'Save changes' : 'Add expense'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default AddExpense
