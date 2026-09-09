// A trip's packing checklist — a flat, trip-level list (not day-scoped
// the way Itinerary is), same relationship to the trip as Saved Places
// has. `canEdit` (owner or editor — see TripPage.jsx's own role fetch)
// gates Add/toggle/delete; a viewer still sees the full checklist,
// including which items are already checked, just none of the
// mutating controls — RLS already refuses all three at the database
// level regardless (see 0017_packing_items.sql), this is purely about
// not showing a control that would just fail.
//
// Voyage has no native checkbox input anywhere (see AddExpense.jsx's
// participant picker / SaveToTripDialog.jsx's own save-to-trip rows)
// — the completion toggle below reuses that same full-row `<button
// aria-pressed>` + circular indicator pattern (`.save-trip-indicator`,
// with one added `.is-completed` state — see App.css) rather than
// inventing a checkbox.
function PackingList({ items, canEdit, onAddItem, onToggleItem, onDeleteItem }) {
  return (
    <section className="packing-section">
      <div className="section-heading">
        <div>
          <p className="section-label">PACKING</p>
          <h2>Packing checklist</h2>
        </div>

        {canEdit && (
          <button className="secondary-button" onClick={onAddItem}>
            + Add item
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✓</div>

          <h3>No packing items yet</h3>

          <p>
            {canEdit
              ? 'Add the things you need to pack and check them off as you go.'
              : 'No packing items have been added for this trip yet.'}
          </p>

          {canEdit && (
            <button className="primary-button" onClick={onAddItem}>
              Add an item
            </button>
          )}
        </div>
      ) : (
        <ul className="packing-list">
          {items.map((item) => (
            <li className="packing-item" key={item.id}>
              {/* Read-only for a viewer: same content and completed
                  styling, just not a real button — nothing here would
                  do anything for them anyway (RLS refuses the write),
                  so it isn't presented as if it would. */}
              {canEdit ? (
                <button
                  type="button"
                  className="packing-item-toggle"
                  aria-pressed={item.completed}
                  onClick={() => onToggleItem(item)}
                >
                  <span
                    className={
                      'save-trip-indicator' + (item.completed ? ' is-completed' : '')
                    }
                    aria-hidden="true"
                  >
                    {item.completed && '✓'}
                  </span>
                  <span
                    className={
                      'packing-item-name' + (item.completed ? ' is-completed' : '')
                    }
                  >
                    {item.name}
                  </span>
                </button>
              ) : (
                <div className="packing-item-toggle is-readonly">
                  <span
                    className={
                      'save-trip-indicator' + (item.completed ? ' is-completed' : '')
                    }
                    aria-hidden="true"
                  >
                    {item.completed && '✓'}
                  </span>
                  <span
                    className={
                      'packing-item-name' + (item.completed ? ' is-completed' : '')
                    }
                  >
                    {item.name}
                  </span>
                </div>
              )}

              {canEdit && (
                <button
                  type="button"
                  className="delete-activity-button"
                  onClick={() => onDeleteItem(item)}
                  aria-label={`Delete ${item.name}`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default PackingList
