import { useEffect, useState } from 'react'
import {
  calculateSharedExpenseBalances,
  formatCurrencyAmount,
  getSpendingByCategory,
  getTotalSpent,
  sortExpensesByDate,
  summarizeSettlements,
} from '../utils/budget'
import { formatDateLabel } from '../utils/date'
import { getTripMembers } from '../services/tripsRepository'
import AddExpense from './AddExpense'
import ConfirmDialog from './ConfirmDialog'
import SetBudget from './SetBudget'

// `canEdit` (owner or editor collaborator — see TripPage.jsx's own
// role fetch) gates budget/expense mutation controls only — a viewer
// still sees the full expense list and Balances, just none of Add/
// Edit/Delete expense. RLS already refuses those at the database level
// for a viewer regardless (see 0001_init.sql's "owners and editors can
// manage expenses"), this is purely about not showing a control that
// would just fail.
//
// "My Budget" (trip.budget, via 0014_personal_trip_budgets.sql) is
// genuinely personal — one row per (trip, user) — so a viewer sees
// their *own* budget the same way an owner/editor does (there's
// nothing shared left to hide), just with no Set/Edit button, since a
// viewer was never able to set a budget even before this became
// personal (that boundary carried over exactly, see the migration's
// own RLS comments). In practice a pure viewer who's never been an
// editor will simply never have a budget row at all and always see
// the empty state below — someone demoted from editor to viewer keeps
// seeing whatever they'd already set, read-only.
function BudgetSection({
  trip,
  currentUserId,
  canEdit,
  requireAuth,
  defaultCurrency,
  onSetBudget,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
}) {
  const [showBudgetForm, setShowBudgetForm] = useState(false)
  // { expense? } while the expense modal is open — `expense` is present
  // only when editing an existing one.
  const [expenseModal, setExpenseModal] = useState(null)
  const [expensePendingDelete, setExpensePendingDelete] = useState(null)

  // Independent of TripPeopleSection.jsx's own identical-looking fetch
  // — kept deliberately separate rather than lifted to a shared page-
  // level store, matching how every section on the Trip Detail page
  // already owns its own data. Only used to populate the Paid by/
  // Participants pickers when an expense is made Shared — a personal
  // expense never reads this at all.
  //
  // Re-fetched every time the Add/Edit Expense modal is about to open
  // (see openExpenseModal below), not just once on mount: this section
  // and TripPeopleSection are two separate, un-synced pieces of state,
  // so an owner adding a collaborator there and then immediately
  // opening "+ Add expense" here — with no page refresh in between —
  // needs a fresh read, not whatever membership existed when this
  // section first mounted.
  const [tripMembers, setTripMembers] = useState([])

  const refreshTripMembers = () => {
    getTripMembers(trip.id)
      .then((members) => setTripMembers(members))
      .catch(() => {
        // A failed fetch just leaves tripMembers as whatever it was —
        // AddExpense.jsx already hides the Personal/Shared toggle
        // entirely when there are fewer than two trip members to share
        // with, so this fails safe into "only personal expenses are
        // offered" rather than a visible error on a page that
        // otherwise loaded fine.
      })
  }

  useEffect(() => {
    refreshTripMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id])

  const openExpenseModal = (modalState) => {
    refreshTripMembers()
    setExpenseModal(modalState)
  }

  const budget = trip.budget ?? null
  const expenses = sortExpensesByDate(trip.expenses ?? [])
  // The already-set budget's own currency always wins the moment one
  // exists (never replaced by the user's default — see
  // 0015_profile_default_currency.sql's own comment); `defaultCurrency`
  // only ever matters for a trip with no personal budget yet, where it
  // was already hardcoded 'USD' before this preference existed — this
  // just makes that fallback configurable instead of adding a second,
  // separate "new vs. existing" distinction that doesn't exist anywhere
  // else in this data (expenses have no currency column of their own
  // at all, personal or otherwise — they're always shown in whatever
  // currency this trip's own personal budget uses, which is exactly
  // what `currency` below already governs for both the expense list
  // and the Add/Edit Expense modal's live split preview, unchanged).
  const currency = budget?.currency ?? defaultCurrency ?? 'USD'

  const totalSpent = getTotalSpent(expenses)
  const remaining = budget ? budget.amount - totalSpent : 0
  const isOverBudget = Boolean(budget) && totalSpent > budget.amount
  const spentPercent = budget && budget.amount > 0 ? (totalSpent / budget.amount) * 100 : 0
  const spendingByCategory = Object.entries(getSpendingByCategory(expenses)).sort(
    (a, b) => b[1] - a[1]
  )

  // A shared expense is simply one with at least one participant (see
  // services/tripsRepository.js's fromExpenseRow) — no separate flag.
  const sharedExpenses = expenses.filter((expense) => expense.participants.length > 0)
  const balances = calculateSharedExpenseBalances(sharedExpenses)
  const settlements = summarizeSettlements(balances)

  const profilesById = Object.fromEntries(
    tripMembers
      .filter((member) => member.profile)
      .map((member) => [member.userId, member.profile])
  )

  const handleSaveExpense = (expense) => {
    if (expenseModal.expense) {
      onUpdateExpense(expense)
    } else {
      onAddExpense(expense)
    }
    setExpenseModal(null)
  }

  return (
    <section className="budget-section">
      {/* id anchors for TripPage.jsx's in-page section nav — Budget,
          Expenses, and Balances are three independent jump targets
          even though they all live in this one component, so each of
          this section's own three headings gets its own id rather
          than the nav only being able to jump to the top of the whole
          block. Purely a DOM hook — nothing else about this component
          changes. */}
      <div className="section-heading" id="trip-section-budget">
        <div>
          <p className="section-label">MY BUDGET</p>
          <h2>My trip budget</h2>
        </div>

        {canEdit && (
          <button className="secondary-button" onClick={() => requireAuth(() => setShowBudgetForm(true))}>
            {budget ? 'Edit budget' : 'Set budget'}
          </button>
        )}
      </div>

      {budget ? (
        <div className="budget-summary">
          <div className="budget-stats">
            <div className="budget-stat">
              <p className="budget-stat-label">Budget</p>
              <p className="budget-stat-value">
                {formatCurrencyAmount(budget.amount, currency)}
              </p>
            </div>

            <div className="budget-stat">
              <p className="budget-stat-label">Trip spent</p>
              <p className="budget-stat-value">
                {formatCurrencyAmount(totalSpent, currency)}
              </p>
            </div>

            <div className="budget-stat">
              <p className="budget-stat-label">Remaining</p>
              <p
                className={
                  'budget-stat-value' + (isOverBudget ? ' is-over-budget' : '')
                }
              >
                {formatCurrencyAmount(remaining, currency)}
              </p>
            </div>
          </div>

          {/* This budget itself is genuinely private (trip_member_
              budgets, one row per person — see the file-level comment
              above), but "Trip spent"/"Remaining" are measured against
              *every* expense on the trip — everyone's personal expenses
              plus every shared one, the same total Group Spending shows
              below — because that's the only number that actually
              exists to compare a personal budget against (an
              individual expense isn't attributed to whoever logged it;
              see AddExpense.jsx). Without this line, "Trip spent"
              silently reads as "what I've spent," which it isn't for
              anyone travelling with collaborators — this makes the
              comparison honest instead of quietly renaming the same
              confusion. */}
          <p className="budget-scope-note">
            Measured against the trip's total spending below, not just yours.
          </p>

          <div className="budget-progress-track">
            <div
              className={
                'budget-progress-fill' + (isOverBudget ? ' is-over-budget' : '')
              }
              style={{ width: `${Math.min(spentPercent, 100)}%` }}
            />
          </div>

          {isOverBudget && (
            <p className="budget-overage-warning">
              Over budget by {formatCurrencyAmount(totalSpent - budget.amount, currency)}
            </p>
          )}

          {spendingByCategory.length > 0 && (
            <div className="budget-breakdown">
              {spendingByCategory.map(([category, amount]) => (
                <div className="budget-breakdown-row" key={category}>
                  <div className="budget-breakdown-label">
                    <span>{category}</span>
                    <span>{formatCurrencyAmount(amount, currency)}</span>
                  </div>
                  <div className="budget-breakdown-track">
                    <div
                      className="budget-breakdown-fill"
                      style={{
                        width: `${totalSpent > 0 ? (amount / totalSpent) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <h3>No personal budget set</h3>
          <p>
            {canEdit
              ? 'Set your own budget to keep track of your spending on this trip.'
              : "You haven't set a personal budget for this trip yet."}
          </p>
          {canEdit && (
            <button className="primary-button" onClick={() => requireAuth(() => setShowBudgetForm(true))}>
              Set a budget
            </button>
          )}
        </div>
      )}

      <div className="section-heading budget-expenses-heading" id="trip-section-expenses">
        <div>
          <p className="section-label">GROUP SPENDING</p>
          <h2>Expenses</h2>
        </div>

        {canEdit && (
          <button className="secondary-button" onClick={() => requireAuth(() => openExpenseModal({}))}>
            + Add expense
          </button>
        )}
      </div>

      {expenses.length === 0 ? (
        <div className="empty-state">
          <h3>No expenses yet</h3>
          <p>
            {canEdit
              ? 'Add an expense to start tracking spending on this trip.'
              : 'No expenses have been added to this trip yet.'}
          </p>
          {canEdit && (
            <button className="primary-button" onClick={() => requireAuth(() => openExpenseModal({}))}>
              Add an expense
            </button>
          )}
        </div>
      ) : (
        <ul className="expense-list">
          {expenses.map((expense) => {
            const isShared = expense.participants.length > 0

            return (
              <li className="expense-item" key={expense.id}>
                <div className="expense-details">
                  <div className="expense-main">
                    <span className="expense-name">{expense.name}</span>
                    <span className="expense-category">{expense.category}</span>
                    {isShared && <span className="expense-shared-pill">SHARED</span>}
                  </div>

                  <p className="expense-date">{formatDateLabel(expense.date)}</p>

                  {isShared && (
                    <p className="expense-split-info">
                      Paid by {expense.payerName || 'a trip member'} · split{' '}
                      {expense.participants.length} way
                      {expense.participants.length === 1 ? '' : 's'}
                      {' — '}
                      {expense.participants
                        .map(
                          (participant) =>
                            `${participant.displayName || 'Voyage user'} ${formatCurrencyAmount(
                              participant.shareAmount,
                              currency
                            )}`
                        )
                        .join(', ')}
                    </p>
                  )}

                  {expense.notes && <p className="expense-notes">{expense.notes}</p>}
                </div>

                <div className="expense-amount-actions">
                  <span className="expense-amount">
                    {formatCurrencyAmount(expense.amount, currency)}
                  </span>

                  {canEdit && (
                    <div className="expense-actions">
                      <button
                        type="button"
                        className="edit-activity-button"
                        onClick={() => requireAuth(() => openExpenseModal({ expense }))}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="delete-activity-button"
                        onClick={() => requireAuth(() => setExpensePendingDelete(expense))}
                        aria-label={`Delete ${expense.name}`}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {balances.length > 0 && (
        <div className="expense-balances">
          {/* Balances is the *result* of Group Spending, not a separate
              top-level financial area of its own — deliberately a
              lighter break than a full .section-heading (no h2, no
              border, a smaller top margin), the exact same "sub-list
              of the section above it, not a new page section" pattern
              already established for TripPeopleSection.jsx's own
              "Pending Invitations" (see .trip-people-pending). Earlier
              this had the full peer-section treatment Budget/Expenses
              get; that fixed Balances reading as buried with no
              identity of its own, but on reflection it overcorrected
              into implying Balances was its own independent financial
              area rather than a consequence of the expenses above it —
              this is the middle ground: still clearly labeled and
              visually set apart, just not equal-weight to Group
              Spending itself. */}
          <p className="section-label">BALANCES</p>

          <ul className="balance-list">
            {balances.map((balance) => (
              <li className="balance-row" key={balance.userId}>
                <span className="balance-name">
                  {balance.displayName || 'Voyage user'}
                </span>
                <span
                  className={
                    'balance-amount' +
                    (balance.net > 0 ? ' is-positive' : balance.net < 0 ? ' is-negative' : '')
                  }
                >
                  {balance.net === 0
                    ? 'Settled'
                    : `${balance.net > 0 ? '+' : '−'}${formatCurrencyAmount(
                        Math.abs(balance.net),
                        currency
                      )}`}
                </span>
              </li>
            ))}
          </ul>

          {settlements.length > 0 && (
            <ul className="settlement-list">
              {settlements.map((settlement, index) => (
                <li className="settlement-row" key={index}>
                  {settlement.from} owes {settlement.to}{' '}
                  {formatCurrencyAmount(settlement.amount, currency)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showBudgetForm && (
        <SetBudget
          budget={budget}
          defaultCurrency={defaultCurrency}
          onClose={() => setShowBudgetForm(false)}
          onSave={(nextBudget) => {
            onSetBudget(nextBudget)
            setShowBudgetForm(false)
          }}
        />
      )}

      {expenseModal && (
        <AddExpense
          expense={expenseModal.expense}
          defaultDate={trip.startDate}
          maxDate={trip.endDate}
          currency={currency}
          tripMembers={tripMembers}
          currentUserId={currentUserId}
          profilesById={profilesById}
          onClose={() => setExpenseModal(null)}
          onSave={handleSaveExpense}
        />
      )}

      {expensePendingDelete && (
        <ConfirmDialog
          title="Delete this expense?"
          message={`"${expensePendingDelete.name}" will be permanently removed.`}
          confirmLabel="Delete expense"
          destructive
          onCancel={() => setExpensePendingDelete(null)}
          onConfirm={() => {
            onDeleteExpense(expensePendingDelete.id)
            setExpensePendingDelete(null)
          }}
        />
      )}
    </section>
  )
}

export default BudgetSection
