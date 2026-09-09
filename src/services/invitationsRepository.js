// Voyage's trip-invitation data-access layer — the one seam the
// invite/accept/decline/cancel UI goes through, matching every other
// repository's pattern (no raw Supabase calls in components). Reuses
// the `trip_invitations` table 0001_init.sql already scaffolded (see
// supabase/migrations/0012_trip_invitations_and_notifications.sql for
// the full narrative on adapting it from "invite by email" to "invite
// an existing friend by id", and every RLS/security guarantee this
// file relies on but never re-checks itself — same trust-RLS approach
// tripsRepository.js/friendsRepository.js already take throughout).
import { supabase } from './supabase'

// `trip_id` -> `trips(name)` is a normal FK to a public table, so
// PostgREST can embed it directly (same as activity_events' own
// select) — `invited_user_id`/`invited_by` both reference auth.users,
// which can't be embedded this way, so those are resolved via the same
// two-query-then-join pattern used throughout this app (getTripMembers,
// getSupabaseTrips, activityRepository.js) instead.
const INVITATION_SELECT =
  'id, trip_id, role, status, created_at, invited_user_id, invited_by, trip:trips(name)'

async function fetchProfilesById(userIds) {
  if (userIds.length === 0) return {}
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds)
  if (error) throw error
  const map = {}
  for (const row of data ?? []) {
    map[row.id] = { displayName: row.display_name || '', avatarUrl: row.avatar_url || '' }
  }
  return map
}

// Invitations sent *to* the signed-in user, still pending — what the
// notification popover's "trip invitation" rows and the badge count
// are both built from.
export async function getMyPendingInvitations(userId) {
  const { data, error } = await supabase
    .from('trip_invitations')
    .select(INVITATION_SELECT)
    .eq('invited_user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error

  const inviterIds = [...new Set((data ?? []).map((row) => row.invited_by).filter(Boolean))]
  const profilesById = await fetchProfilesById(inviterIds)

  return (data ?? []).map((row) => ({
    id: row.id,
    tripId: row.trip_id,
    tripName: row.trip?.name || '',
    role: row.role,
    createdAt: row.created_at,
    inviterId: row.invited_by,
    inviterName: profilesById[row.invited_by]?.displayName || 'Voyage user',
    inviterAvatarUrl: profilesById[row.invited_by]?.avatarUrl || '',
  }))
}

// Same HEAD-only shape as friendsRepository.js's own
// getIncomingFriendRequestsCount — used wherever only the number is
// needed, not the full row data.
export async function getPendingInvitationsCount(userId) {
  const { count, error } = await supabase
    .from('trip_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('invited_user_id', userId)
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

// Invitations the signed-in owner has sent for *one specific trip*,
// still pending — TripPeopleSection.jsx's own "Pending Invitations"
// list, so an owner can see who they're still waiting on and cancel
// if needed. RLS already restricts this to the trip's actual owner;
// no explicit filter for that here.
export async function getSentInvitationsForTrip(tripId) {
  const { data, error } = await supabase
    .from('trip_invitations')
    .select(INVITATION_SELECT)
    .eq('trip_id', tripId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error

  const inviteeIds = [...new Set((data ?? []).map((row) => row.invited_user_id).filter(Boolean))]
  const profilesById = await fetchProfilesById(inviteeIds)

  return (data ?? []).map((row) => ({
    id: row.id,
    tripId: row.trip_id,
    role: row.role,
    createdAt: row.created_at,
    invitedUserId: row.invited_user_id,
    inviteeName: profilesById[row.invited_user_id]?.displayName || 'Voyage user',
    inviteeAvatarUrl: profilesById[row.invited_user_id]?.avatarUrl || '',
  }))
}

// `invitedBy` is passed explicitly (App.jsx/AddTripFriends.jsx already
// have the signed-in user's own id in hand) rather than assumed —
// 0012's own INSERT policy independently requires `invited_by =
// auth.uid()` regardless of what's sent, so a forged value here would
// simply be refused, not trusted.
export async function inviteToTrip(tripId, invitedUserId, invitedBy, role) {
  const { error } = await supabase.from('trip_invitations').insert({
    trip_id: tripId,
    invited_user_id: invitedUserId,
    invited_by: invitedBy,
    role,
  })
  if (error) throw error
}

// Cancelling is a real delete of the still-pending row — 0012's own
// delete policy already refuses this for anyone but the trip's owner,
// and already refuses it once the invitation is no longer pending.
// "A cancelled invitation must not be possible to accept afterwards"
// is true simply because there's no row left to accept.
export async function cancelTripInvitation(invitationId) {
  const { error } = await supabase.from('trip_invitations').delete().eq('id', invitationId)
  if (error) throw error
}

// Goes through the accept_trip_invitation() RPC (0012's own security-
// definer function), never a plain client-side status update — that's
// what atomically creates the real trip_members row alongside marking
// the invitation accepted; see that migration's own comment on why a
// two-step client flow would risk an inconsistent "accepted but not
// actually a member" state.
export async function acceptTripInvitation(invitationId) {
  const { error } = await supabase.rpc('accept_trip_invitation', {
    p_invitation_id: invitationId,
  })
  if (error) throw error
}

// A plain status update is safe here (unlike accept) — declining never
// needs to touch a second table. 0012's own update policy already
// restricts this to the invitation's own invitee, and only while it's
// still pending.
export async function declineTripInvitation(invitationId) {
  const { error } = await supabase
    .from('trip_invitations')
    .update({ status: 'declined' })
    .eq('id', invitationId)
  if (error) throw error
}
