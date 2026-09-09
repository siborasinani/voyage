import { useEffect, useRef, useState } from 'react'
import { formatDateLabel } from '../utils/date'
import { getTripDays, formatDayDate } from '../utils/itinerary'
import {
  getActivityCategoryLabel,
  getActivityTimeRangeLabel,
  getOverlappingActivityIds,
  sortActivitiesByTime,
} from '../utils/activities'
import { buildTripCalendar, downloadIcsFile } from '../utils/ics'
import { getMyTripRole } from '../services/tripsRepository'
import AddActivity from './AddActivity'
import AddPackingItem from './AddPackingItem'
import AddPlace from './AddPlace'
import BudgetSection from './BudgetSection'
import ChooseDayDialog from './ChooseDayDialog'
import ConfirmDialog from './ConfirmDialog'
import PackingList from './PackingList'
import SavedPlaces from './SavedPlaces'
import TripPeopleSection from './TripPeopleSection'

function TripPage({
  trip,
  isOwner,
  currentUserId,
  requireAuth,
  defaultCurrency,
  onBack,
  onEditTrip,
  onDeleteTrip,
  onAddPlace,
  onDeletePlace,
  onAddPackingItem,
  onTogglePackingItem,
  onDeletePackingItem,
  onSetBudget,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity,
}) {
  // { dayNumber, activity?, prefill? } while a modal is open — `activity`
  // is present only when editing an existing one; `prefill` carries a
  // saved place's details when starting a new activity from it.
  const [activityModal, setActivityModal] = useState(null)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [showAddPlace, setShowAddPlace] = useState(false)
  const [placePendingDelete, setPlacePendingDelete] = useState(null)
  const [showAddPackingItem, setShowAddPackingItem] = useState(false)
  const [placeToAddToItinerary, setPlaceToAddToItinerary] = useState(null)
  // A one-line status under the header's own action buttons — the exact
  // outcome of the last Export calendar click, or null before the first
  // one. Never auto-clears on a timer (this app has no toast system to
  // begin with, see AuthDialog.jsx's own comment on that) — it just sits
  // there, same as Settings' own "Saved." confirmation, until the next
  // export attempt replaces it or the page is left.
  const [exportStatus, setExportStatus] = useState(null)

  // The owner already knows they can edit for free (isOwner, derived
  // from trip.ownerId — no query needed). A collaborator's own role
  // isn't known yet at this point though (TripPeopleSection fetches all
  // members for its own display, but that's a separate, un-synced piece
  // of state — see BudgetSection.jsx's own comment on the same
  // situation) — so a non-owner's role is fetched once here, the one
  // place every editor-only control on this page (Edit trip, itinerary,
  // and — via the `canEdit` prop — SavedPlaces/BudgetSection) reads
  // from, instead of three separate guesses. Starts `null` (same as "no
  // membership row" from getMyTripRole) so a viewer/still-loading
  // collaborator never briefly sees an editor-only control flash in
  // before being hidden — RLS refuses the mutation regardless, this is
  // purely about not showing a control that would just fail.
  const [myRole, setMyRole] = useState(isOwner ? 'owner' : null)

  useEffect(() => {
    if (isOwner) return undefined
    let cancelled = false
    getMyTripRole(trip.id, currentUserId)
      .then((role) => {
        if (!cancelled) setMyRole(role)
      })
      .catch(() => {
        if (!cancelled) setMyRole(null)
      })
    return () => {
      cancelled = true
    }
  }, [trip.id, currentUserId, isOwner])

  const canEdit = isOwner || myRole === 'editor'

  const days = getTripDays(trip.startDate, trip.endDate)
  const savedPlaces = trip.savedPlaces ?? []
  const packingItems = trip.packingItems ?? []

  // The compact in-page jump nav rendered right after the trip header
  // (see the JSX below) — one entry per section that's actually on the
  // page, all unconditionally rendered by TripPage itself. Balances no
  // longer gets its own entry here: it's a subsection of Group Spending
  // now (see BudgetSection.jsx), not an independent section a nav pill
  // should point to on its own — reachable by scrolling slightly past
  // "Group Spending" instead, same as any other subsection of a page
  // is reached via its parent section's own link.
  const sectionNavItems = [
    { id: 'trip-section-people', label: 'People' },
    { id: 'trip-section-itinerary', label: 'Itinerary' },
    { id: 'trip-section-packing', label: 'Packing' },
    { id: 'trip-section-places', label: 'Saved Places' },
    { id: 'trip-section-budget', label: 'My Budget' },
    { id: 'trip-section-expenses', label: 'Group Spending' },
  ]

  // Highlights whichever section the user is currently looking at — a
  // plain IntersectionObserver watching each section's own heading (a
  // thin "active band" near the top of the viewport; whichever
  // observed heading is currently closest to it gets marked active),
  // for organic scrolling. The nav itself is intentionally not sticky
  // (see the .filter-row reuse in the JSX below — nothing else in
  // Voyage is sticky either, and a compact secondary nav shouldn't be
  // the first thing that changes that), so this highlight is only
  // visible once the user has scrolled back near the top of the page
  // rather than updating live in a fixed header — a known, accepted
  // tradeoff, not a bug.
  //
  // Clicking a nav pill is handled separately, deliberately not left
  // to the observer alone: confirmed live that when a clicked section
  // sits close to the very end of the page, the browser can't always
  // scroll it into that top band at all (there's no more page left
  // below it to push it up that far) — and when several such sections
  // are clustered together near the end, they end up close enough to
  // an identical maximum scroll position that geometry alone truly
  // can't tell which one was actually clicked. The click itself is the
  // only reliable signal in that situation, so `scrollToSection` sets
  // the active id directly, and `suppressAutoUntilRef` gives that an
  // explicit ~1s window the scroll-driven observer won't override —
  // long enough for a smooth scroll to finish settling, short enough
  // that normal scrolling resumes driving the highlight right after.
  const [activeSectionId, setActiveSectionId] = useState(null)
  const suppressAutoUntilRef = useRef(0)

  useEffect(() => {
    const ids = [
      'trip-section-people',
      'trip-section-itinerary',
      'trip-section-packing',
      'trip-section-places',
      'trip-section-budget',
      'trip-section-expenses',
    ]
    const elements = ids.map((id) => document.getElementById(id)).filter(Boolean)
    if (elements.length === 0) return undefined

    // A sensible default the instant the page mounts, rather than no
    // pill being highlighted at all until the first scroll or click —
    // same "legitimate response to a one-time setup event, not a
    // derived-state loop" precedent already used elsewhere in this app
    // (e.g. NotificationBell.jsx's own initial-mount setState).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveSectionId(ids[0])

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < suppressAutoUntilRef.current) return
        const visible = entries.filter((entry) => entry.isIntersecting)
        if (visible.length === 0) return
        const topMost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b
        )
        setActiveSectionId(topMost.target.id)
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 }
    )
    elements.forEach((element) => observer.observe(element))

    // Organic scrolling all the way to the true bottom of the page —
    // no click involved — is the one case the band above can't cover
    // on its own (the last section's heading may never reach it, for
    // the same "nowhere left to scroll" reason described above); this
    // defaults that case to the last section, same as reaching the
    // bottom of any normal jump-nav'd page would.
    const lastId = ids[ids.length - 1]
    const handleScroll = () => {
      if (Date.now() < suppressAutoUntilRef.current) return
      // A generous-looking tolerance, not a tight one, on purpose: a
      // page's real bottom scroll position routinely lands a handful
      // to a couple dozen px short of the mathematical scrollHeight
      // (sub-pixel rounding, the last section's own bottom padding) —
      // confirmed live, a strict few-px check missed this case
      // entirely on a real trip page during testing.
      const atBottom =
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 24
      if (atBottom) setActiveSectionId(lastId)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', handleScroll)
    }
  }, [trip.id])

  const scrollToSection = (id) => {
    setActiveSectionId(id)
    // Only ever runs from a click, never during render — the linter's
    // purity check can't tell a `Date.now()` inside an event handler
    // apart from one called during render just by looking at the
    // source, so it flags this defensively; this genuinely is the
    // former.
    // eslint-disable-next-line react-hooks/purity
    suppressAutoUntilRef.current = Date.now() + 1000
    // No explicit `behavior` here so the browser consults the CSS
    // `scroll-behavior` property (smooth by default, forced back to
    // `auto` under prefers-reduced-motion — see App.css) instead of
    // duplicating that check in JS.
    document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }

  const handleSaveActivity = (activity) => {
    if (activityModal.activity) {
      onUpdateActivity(activityModal.dayNumber, activity)
    } else {
      onAddActivity(activityModal.dayNumber, activity)
    }

    setActivityModal(null)
  }

  const handleSavePlace = (place) => {
    onAddPlace(place)
    setShowAddPlace(false)
  }

  const handleSavePackingItem = (item) => {
    onAddPackingItem(item)
    setShowAddPackingItem(false)
  }

  const handleConfirmDeletePlace = () => {
    onDeletePlace(placePendingDelete.id)
    setPlacePendingDelete(null)
  }

  const handleChooseDay = (dayNumber) => {
    setActivityModal({ dayNumber, prefill: placeToAddToItinerary })
    setPlaceToAddToItinerary(null)
  }

  // Entirely client-side — reads only `trip`, already loaded in memory
  // (see buildTripCalendar's own comment on why an activity with no
  // usable time is silently excluded rather than producing a malformed
  // event). No requireAuth wrapping, unlike every mutating action on
  // this page: this never touches Supabase at all, so there's no
  // session to defend, and — per this feature's own "a user who can
  // view the trip can export it" scope — it's available to a viewer,
  // not gated behind canEdit/isOwner the way Edit/Delete trip are.
  const handleExportCalendar = () => {
    const { content, eventCount, filename } = buildTripCalendar(trip)

    if (eventCount === 0) {
      setExportStatus("This trip doesn't have any timed activities to export yet.")
      return
    }

    downloadIcsFile(filename, content)
    setExportStatus('Calendar file downloaded.')
  }

  // Also entirely client-side and read-only, same reasoning as Export
  // calendar just above — no requireAuth, available to a viewer too.
  // `window.print()` triggers the browser's own native print dialog
  // (which already offers "Save as PDF" as a destination on every
  // major browser/OS — no PDF library needed); everything about what
  // actually prints is decided by the `@media print` rules in App.css,
  // not by anything built here. Voyage renders the exact same DOM
  // either way — there is no separate print-only markup to keep in
  // sync with the screen version.
  const handlePrintItinerary = () => {
    window.print()
  }

  return (
    <main className="trip-page">
      <button className="back-button" onClick={onBack}>
        ← Back to trips
      </button>

      <section className="trip-header">
        <div>
          <p className="eyebrow">{trip.destination}</p>
          <h1>{trip.name}</h1>
          <p className="trip-dates">
            {formatDateLabel(trip.startDate)} → {formatDateLabel(trip.endDate)}
          </p>
        </div>

        <div className="trip-header-actions">
          {/* Unconditional — unlike every other button here, exporting
              is read-only and never touches Supabase (see
              handleExportCalendar's own comment), so it's available to
              a viewer too, not just canEdit/isOwner. Placed first so its
              position never shifts depending on role: for a pure
              viewer, who sees neither of the other two buttons, this
              would otherwise be the only thing ever in this row. */}
          <button type="button" className="secondary-button" onClick={handleExportCalendar}>
            Export calendar
          </button>

          {/* Same unconditional, read-only reasoning as Export calendar
              right above — a viewer can print/save-as-PDF the itinerary
              too. */}
          <button type="button" className="secondary-button" onClick={handlePrintItinerary}>
            Print itinerary
          </button>

          {/* Editors can edit a trip's own fields (RLS already allows
              it, see 0001_init.sql's "owners and editors can update
              trips") — hidden for a viewer, same reasoning as every
              other editor-only control below. */}
          {canEdit && (
            <button className="secondary-button" onClick={() => requireAuth(onEditTrip)}>
              Edit trip
            </button>
          )}

          {/* Deleting the whole trip stays owner-only — hidden here
              rather than left visible-but-always-failing for a
              collaborator. */}
          {isOwner && (
            <button
              type="button"
              className="delete-trip-button"
              onClick={() => requireAuth(() => setIsConfirmingDelete(true))}
            >
              Delete trip
            </button>
          )}

          {exportStatus && <p className="trip-export-status">{exportStatus}</p>}
        </div>
      </section>

      {/* Compact jump nav for a long trip page — reuses Explore's own
          filter-pill row verbatim (.filter-row/.filter-pill, including
          its existing hover/focus-visible/is-active treatment) rather
          than inventing a new nav style. Only rendered once there's
          more than one section to jump between so a bare, empty-ish
          trip never shows a navigation aid with nothing meaningful to
          navigate. */}
      {sectionNavItems.length > 1 && (
        <nav className="filter-row" aria-label="Jump to a section">
          {sectionNavItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                'filter-pill' + (activeSectionId === item.id ? ' is-active' : '')
              }
              onClick={() => scrollToSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      <div id="trip-section-people">
        <TripPeopleSection trip={trip} isOwner={isOwner} requireAuth={requireAuth} />
      </div>

      <section className="itinerary-section" id="trip-section-itinerary">
        <div className="section-heading">
          <div>
            <p className="section-label">ITINERARY</p>
            <h2>Your days</h2>
          </div>
        </div>

        {days.map((day) => {
          const activities = sortActivitiesByTime(
            trip.activities?.[day.dayNumber] ?? []
          )
          const overlappingActivityIds = getOverlappingActivityIds(activities)

          return (
            <div className="day-card" key={day.dayNumber}>
              <div className="day-header">
                <div>
                  <p className="day-number">DAY {day.dayNumber}</p>
                  <h3>{formatDayDate(day.date)}</h3>
                </div>

                {/* Only shown once a day already has activities — an
                    empty day's own full-width row below is already a
                    complete, obvious "+ Add activity" control on its
                    own, so showing this too was a second identical
                    control doing the exact same thing (see the
                    .empty-day comment in App.css). Once there's at
                    least one activity, that row no longer renders, so
                    this becomes the only contextual way to add
                    another one. */}
                {canEdit && activities.length > 0 && (
                  <button
                    className="secondary-button"
                    onClick={() =>
                      requireAuth(() => setActivityModal({ dayNumber: day.dayNumber }))
                    }
                  >
                    + Add activity
                  </button>
                )}
              </div>

              {activities.length === 0 ? (
                canEdit ? (
                  <button
                    type="button"
                    className="empty-day"
                    onClick={() =>
                      requireAuth(() => setActivityModal({ dayNumber: day.dayNumber }))
                    }
                  >
                    <span>No activities planned yet.</span>
                    <span className="empty-day-cta">+ Add activity</span>
                  </button>
                ) : (
                  <p className="empty-day is-static">No activities planned yet.</p>
                )
              ) : (
                <ul className="activity-list">
                  {activities.map((activity) => {
                    const hasOverlap = overlappingActivityIds.has(activity.id)

                    return (
                      <li className="activity-item" key={activity.id}>
                        <div className="activity-details">
                          <div className="activity-main">
                            <span className="activity-time">
                              {getActivityTimeRangeLabel(activity)}
                            </span>
                            <span className="activity-name">
                              {activity.name}
                            </span>
                            <span className="activity-category">
                              {getActivityCategoryLabel(activity)}
                            </span>
                          </div>

                          {activity.notes && (
                            <p className="activity-notes">{activity.notes}</p>
                          )}

                          {hasOverlap && (
                            <p className="activity-overlap-warning">
                              <span aria-hidden="true">⚠</span>
                              Time overlaps with another activity
                            </p>
                          )}
                        </div>

                        {canEdit && (
                          <div className="activity-actions">
                            <button
                              className="edit-activity-button"
                              onClick={() =>
                                requireAuth(() =>
                                  setActivityModal({
                                    dayNumber: day.dayNumber,
                                    activity,
                                  })
                                )
                              }
                              aria-label={`Edit ${activity.name}`}
                              type="button"
                            >
                              Edit
                            </button>

                            <button
                              className="delete-activity-button"
                              onClick={() =>
                                requireAuth(() =>
                                  onDeleteActivity(day.dayNumber, activity.id)
                                )
                              }
                              aria-label={`Delete ${activity.name}`}
                              type="button"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </section>

      <div id="trip-section-packing">
        <PackingList
          items={packingItems}
          canEdit={canEdit}
          onAddItem={() => requireAuth(() => setShowAddPackingItem(true))}
          onToggleItem={(item) => requireAuth(() => onTogglePackingItem(item))}
          onDeleteItem={(item) => requireAuth(() => onDeletePackingItem(item.id))}
        />
      </div>

      <div id="trip-section-places">
        <SavedPlaces
          places={savedPlaces}
          canEdit={canEdit}
          onAddPlace={() => requireAuth(() => setShowAddPlace(true))}
          onRequestDelete={(place) => requireAuth(() => setPlacePendingDelete(place))}
          onAddToItinerary={(place) => requireAuth(() => setPlaceToAddToItinerary(place))}
        />
      </div>

      <BudgetSection
        trip={trip}
        currentUserId={currentUserId}
        canEdit={canEdit}
        requireAuth={requireAuth}
        defaultCurrency={defaultCurrency}
        onSetBudget={onSetBudget}
        onAddExpense={onAddExpense}
        onUpdateExpense={onUpdateExpense}
        onDeleteExpense={onDeleteExpense}
      />

      {activityModal && (
        <AddActivity
          activity={activityModal.activity}
          prefill={activityModal.prefill}
          onClose={() => setActivityModal(null)}
          onSave={handleSaveActivity}
        />
      )}

      {showAddPlace && (
        <AddPlace
          onClose={() => setShowAddPlace(false)}
          onSave={handleSavePlace}
        />
      )}

      {showAddPackingItem && (
        <AddPackingItem
          onClose={() => setShowAddPackingItem(false)}
          onSave={handleSavePackingItem}
        />
      )}

      {placeToAddToItinerary && (
        <ChooseDayDialog
          days={days}
          onSelectDay={handleChooseDay}
          onClose={() => setPlaceToAddToItinerary(null)}
        />
      )}

      {placePendingDelete && (
        <ConfirmDialog
          title="Delete this place?"
          message={`"${placePendingDelete.name}" will be permanently removed from your saved places.`}
          confirmLabel="Delete place"
          destructive
          onCancel={() => setPlacePendingDelete(null)}
          onConfirm={handleConfirmDeletePlace}
        />
      )}

      {isConfirmingDelete && (
        <ConfirmDialog
          title="Delete this trip?"
          message="Deleting this trip will also delete its itinerary and all activities. This can't be undone."
          confirmLabel="Delete trip"
          destructive
          onCancel={() => setIsConfirmingDelete(false)}
          onConfirm={onDeleteTrip}
        />
      )}
    </main>
  )
}

export default TripPage
