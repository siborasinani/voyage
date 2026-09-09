import { useEffect, useState } from 'react'
import { getRecentActivity } from '../services/activityRepository'
import { formatRelativeTime } from '../utils/date'

const ACTIVITY_LIMIT = 10

// One sentence per event — built here, not in activityRepository.js
// (which only shapes data, same division every other repository in
// this app already keeps), from whatever that repository already
// resolved (actorName/subjectName already read "You"/"you" for the
// signed-in user's own side of an event, tripName from the embedded
// FK join). Every word here is either a fixed template or something
// the database actually recorded — nothing invented, matching
// activity_events' own no-fabrication guarantee all the way through
// to the sentence itself.
function describeEvent(event) {
  switch (event.type) {
    case 'activity_added':
      return `${event.actorName} added ${event.summary || 'an activity'} to ${event.tripName}`
    case 'place_added':
      return `${event.actorName} saved ${event.summary || 'a place'} to ${event.tripName}`
    case 'expense_added':
      return `${event.actorName} added a shared expense to ${event.tripName}`
    case 'trip_shared':
      // Fires when an *invitation* is sent (see
      // supabase/migrations/0012_trip_invitations_and_notifications.sql
      // — 'trip_shared' now records that moment, not actual membership
      // being created; 'trip_joined' below is the event for that).
      // "Invited" is the accurate word for it now, even though the
      // event_type name itself was kept unchanged to avoid an
      // unnecessary schema churn.
      return `${event.actorName} invited ${event.subjectName} to ${event.tripName}`
    case 'trip_joined':
      return `${event.actorName} joined ${event.tripName}`
    case 'friend_added':
      return `You and ${event.isMine ? event.subjectName : event.actorName} are now friends`
    default:
      return null
  }
}

// The signed-in dashboard's compact activity feed — every row here
// already passed through activity_events' own RLS (see
// supabase/migrations/0011_activity_feed.sql), so this component never
// filters by trip/friend access itself; it only ever renders what the
// repository already returned. Capped at ACTIVITY_LIMIT (10) — "the
// most recent 5–10 activities", never a long scrolling feed.
function DashboardRecentActivity({ currentUserId }) {
  // `null` while loading (distinct from `[]`, an empty result) so this
  // never briefly flashes the empty state before the real answer comes
  // back — same convention as DashboardFriendsSummary.jsx's own
  // `friends` state.
  const [events, setEvents] = useState(null)

  useEffect(() => {
    let cancelled = false
    // Legitimate initial-load pattern — same established precedent as
    // every other dashboard-section effect in this app.
    getRecentActivity(currentUserId, ACTIVITY_LIMIT)
      .then((list) => {
        if (!cancelled) setEvents(list)
      })
      .catch(() => {
        if (!cancelled) setEvents([])
      })
    return () => {
      cancelled = true
    }
  }, [currentUserId])

  if (events === null) return null

  return (
    <section className="dashboard-activity-section">
      <div className="section-heading">
        <div>
          <p className="section-label">RECENT ACTIVITY</p>
          <h2>What's new</h2>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="empty-state dashboard-activity-empty">
          <h3>Nothing new yet.</h3>
          <p>Start planning with friends and your activity will appear here.</p>
        </div>
      ) : (
        <ul className="activity-feed-list">
          {events.map((event) => {
            const description = describeEvent(event)
            if (!description) return null
            return (
              <li className="activity-feed-row" key={event.id}>
                <p className="activity-feed-text">{description}</p>
                <p className="activity-feed-time">{formatRelativeTime(event.createdAt)}</p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default DashboardRecentActivity
