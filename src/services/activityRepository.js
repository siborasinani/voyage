// Voyage's Recent Activity data-access layer — the one seam the
// dashboard's activity section goes through, matching every other
// repository's pattern (no raw Supabase calls in components). Every
// row this reads already only exists because a real trigger recorded
// a real database write, by a real, database-verified actor — see
// supabase/migrations/0011_activity_feed.sql's own header for the full
// "why not just derive this from existing timestamps" reasoning. This
// file only ever reads `activity_events`; it never writes to it —
// there is no write path for a client at all (see that migration's
// missing insert/update/delete grant).
import { supabase } from './supabase'

// `trip_id` -> `trips(name)` is a normal FK to a public table (unlike
// actor_id/subject_user_id, which reference auth.users and so can't be
// embedded this way — see the two-query-then-join below, same pattern
// tripsRepository.js's getTripMembers/services/friendsRepository.js
// both already use for exactly this reason), so PostgREST can embed it
// directly in one round trip.
const ACTIVITY_SELECT = 'id, trip_id, actor_id, subject_user_id, event_type, summary, created_at, trip:trips(name)'

// Every recent activity event visible to the signed-in user — RLS
// (0011_activity_feed.sql) already restricts this to trip-scoped
// events on trips they're currently a member of, plus friend_added
// events they were actually a party to; no app-level filtering by
// `currentUserId` happens here at all, it's only used to shape *how*
// each event reads ("You added..." vs "Ada added...", "...with you"
// vs "...with Chuck").
export async function getRecentActivity(currentUserId, limit = 10) {
  const { data, error } = await supabase
    .from('activity_events')
    .select(ACTIVITY_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  const rows = data ?? []

  const relevantUserIds = new Set()
  for (const row of rows) {
    relevantUserIds.add(row.actor_id)
    if (row.subject_user_id) relevantUserIds.add(row.subject_user_id)
  }

  const profilesById = {}
  if (relevantUserIds.size > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', [...relevantUserIds])
    if (profileError) throw profileError
    for (const row of profileRows ?? []) {
      profilesById[row.id] = row.display_name || 'Voyage user'
    }
  }

  const nameFor = (userId) => (userId ? profilesById[userId] || 'Voyage user' : null)

  return rows.map((row) => ({
    id: row.id,
    type: row.event_type,
    createdAt: row.created_at,
    tripId: row.trip_id,
    tripName: row.trip?.name || '',
    summary: row.summary || '',
    isMine: row.actor_id === currentUserId,
    actorName: row.actor_id === currentUserId ? 'You' : nameFor(row.actor_id),
    // Mirrors actorName's own "You" treatment for whichever side of a
    // trip_shared/friend_added event isn't the actor — e.g. "Ada
    // shared Paris Weekend with you" reads correctly regardless of
    // capitalization needs the caller has for mid-sentence "you".
    subjectName:
      row.subject_user_id === currentUserId ? 'you' : nameFor(row.subject_user_id),
  }))
}
