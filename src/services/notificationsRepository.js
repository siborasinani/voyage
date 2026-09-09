// Voyage's notifications data-access layer. Deliberately thin — this
// only ever reads/updates the `notifications` table itself (see
// supabase/migrations/0012_trip_invitations_and_notifications.sql for
// why that table exists at all: only the two notification types with
// no natural "pending state" to derive from — an already-resolved
// invitation being accepted/declined — needed real persisted storage;
// "you have a friend request"/"you have a trip invitation" stay purely
// derived from friendships/trip_invitations' own pending rows, via
// friendsRepository.js's/invitationsRepository.js's existing exports
// — see NotificationBell.jsx for where those three sources are
// actually merged into one popover).
import { supabase } from './supabase'

// `trip_id` -> `trips(name)` embeds directly (a normal FK to a public
// table); `actor_id` references auth.users and needs the same
// two-query-then-join pattern every other repository in this app
// already uses for exactly that reason.
export async function getUnreadNotifications(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, summary, created_at, actor_id, trip_id, trip:trips(name)')
    .eq('recipient_id', userId)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
  if (error) throw error

  const actorIds = [...new Set((data ?? []).map((row) => row.actor_id).filter(Boolean))]
  let namesById = {}
  if (actorIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', actorIds)
    if (profileError) throw profileError
    namesById = Object.fromEntries(
      (profileRows ?? []).map((row) => [row.id, row.display_name || 'Voyage user'])
    )
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    // `trip.name` (live) when the trip still exists, else the snapshot
    // taken at the moment this notification was recorded — a trip
    // deleted afterward still leaves a readable notification behind,
    // same reasoning as activity_events.summary.
    tripName: row.trip?.name || row.summary || 'a trip',
    actorName: namesById[row.actor_id] || 'Voyage user',
    createdAt: row.created_at,
  }))
}

export async function getUnreadNotificationsCount(userId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .eq('is_read', false)
  if (error) throw error
  return count ?? 0
}

// Called once the notification popover opens (see NotificationBell.jsx)
// — the informational notifications shown stay visible for that
// viewing, but no longer count toward the badge on the next load. RLS
// (0012's own update policy) already restricts this to the caller's
// own notifications.
export async function markNotificationsRead(notificationIds) {
  if (notificationIds.length === 0) return
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .in('id', notificationIds)
  if (error) throw error
}
