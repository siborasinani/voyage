// Voyage's friends data-access layer — the one seam the Friends UI
// goes through, matching the same repository pattern
// services/tripsRepository.js already established (no raw Supabase
// calls in components). Row Level Security (see
// supabase/migrations/0005_friendships.sql) already restricts every
// query below to rows the signed-in user is actually a party to — no
// app-level ownership filtering is trusted to do that work, same as
// tripsRepository.js's own comment on this.
//
// Friendships are a completely separate concept from trip membership —
// nothing here reads or writes `trips`, `trip_members`, or any other
// trip-related table, and nothing in tripsRepository.js reads or
// writes `friendships`.
import { supabase } from './supabase'

// Every query below needs the *other* person's name/avatar, not just
// their id — embedding both sides' profiles in one round trip (via the
// named foreign keys 0005_friendships.sql declares) instead of a
// second manual lookup per row.
const FRIENDSHIP_SELECT =
  'id, status, created_at, requester_id, recipient_id, ' +
  'requester:profiles!friendships_requester_id_fkey(id, display_name, avatar_url), ' +
  'recipient:profiles!friendships_recipient_id_fkey(id, display_name, avatar_url)'

function fromProfileRow(row) {
  if (!row) return null
  return {
    id: row.id,
    displayName: row.display_name || '',
    avatarUrl: row.avatar_url || '',
  }
}

// Maps one `friendships` row (with its embedded requester/recipient
// profiles) into a client-shape object. Tags on `isRequester` and
// resolves `otherUser` — whichever side isn't `currentUserId` — up
// front, so every UI list can just render `otherUser` directly instead
// of re-deriving "which side is me" per row.
function fromFriendshipRow(row, currentUserId) {
  const isRequester = row.requester_id === currentUserId
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    isRequester,
    otherUser: fromProfileRow(isRequester ? row.recipient : row.requester),
  }
}

// Finds other registered Voyage users by display name — case-
// insensitive partial match, always excluding the searching user
// themself (never "find" yourself), capped at a reasonable page size.
// Reads straight from `profiles`, which is already fully readable by
// any authenticated user (see 0001_init.sql's own "profiles are
// readable by authenticated users" policy) — no new RLS needed for
// search itself, and this never touches `friendships`.
export async function searchUsers(query, currentUserId) {
  const trimmed = query.trim()
  if (!trimmed) return []

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .ilike('display_name', `%${trimmed}%`)
    .neq('id', currentUserId)
    .limit(20)
  if (error) throw error
  return (data ?? []).map(fromProfileRow)
}

// The existing relationship (if any) between two specific users,
// regardless of who's the requester — used by sendFriendRequest below
// to give a friendly, specific outcome instead of letting a duplicate
// insert just fail, and reusable by the UI to know what to show next
// to a search result (Add / Pending / Friends). Declined relationships
// are deliberately excluded: they don't block a fresh request (see
// 0005_friendships.sql's partial unique index), so they shouldn't
// affect what's shown here either.
export async function getFriendshipBetween(userIdA, userIdB, currentUserId) {
  const { data, error } = await supabase
    .from('friendships')
    .select(FRIENDSHIP_SELECT)
    .or(
      `and(requester_id.eq.${userIdA},recipient_id.eq.${userIdB}),` +
        `and(requester_id.eq.${userIdB},recipient_id.eq.${userIdA})`
    )
    .neq('status', 'declined')
    .maybeSingle()
  if (error) throw error
  return data ? fromFriendshipRow(data, currentUserId) : null
}

// Sends a friend request — but first checks whether some relationship
// already exists between these two users, so every product rule around
// duplicates is enforced here, not just hoped-for from the UI already
// disabling the right buttons (defense in depth, same as every other
// Voyage form's own validation not being purely UI-side):
//   - already friends -> friendly error, no duplicate row.
//   - I already have a pending request out to them -> friendly error,
//     no duplicate row (also independently guaranteed by the partial
//     unique index in 0005_friendships.sql).
//   - they already sent *me* a pending request -> accept theirs
//     instead of creating a redundant second row; this is what "handle
//     the case where the other user already sent you a request" means
//     here.
export async function sendFriendRequest(currentUserId, recipientId) {
  if (currentUserId === recipientId) {
    throw new Error("You can't send a friend request to yourself.")
  }

  const existing = await getFriendshipBetween(currentUserId, recipientId, currentUserId)
  if (existing) {
    if (existing.status === 'accepted') {
      throw new Error("You're already friends.")
    }
    if (!existing.isRequester) {
      // They sent the original request — accept it rather than erroring.
      return acceptFriendRequest(existing.id, currentUserId)
    }
    throw new Error('Friend request already sent.')
  }

  const { data, error } = await supabase
    .from('friendships')
    .insert({ requester_id: currentUserId, recipient_id: recipientId })
    .select(FRIENDSHIP_SELECT)
    .single()
  if (error) throw error
  return fromFriendshipRow(data, currentUserId)
}

export async function getIncomingFriendRequests(currentUserId) {
  const { data, error } = await supabase
    .from('friendships')
    .select(FRIENDSHIP_SELECT)
    .eq('recipient_id', currentUserId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => fromFriendshipRow(row, currentUserId))
}

export async function getOutgoingFriendRequests(currentUserId) {
  const { data, error } = await supabase
    .from('friendships')
    .select(FRIENDSHIP_SELECT)
    .eq('requester_id', currentUserId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => fromFriendshipRow(row, currentUserId))
}

// Accepted friendships, either side — a friend I added and a friend
// who added me show up in exactly the same list, same treatment.
export async function getFriends(currentUserId) {
  const { data, error } = await supabase
    .from('friendships')
    .select(FRIENDSHIP_SELECT)
    .or(`requester_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
    .eq('status', 'accepted')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => fromFriendshipRow(row, currentUserId))
}

// Just the count of accepted friendships — used by the Profile page's
// small Friends summary (see components/ProfilePage.jsx), which only
// needs a number, not the full embedded-profile row shape getFriends
// above returns. `{ count: 'exact', head: true }` makes this a HEAD
// request — Postgres computes the count but no row data is ever
// transferred, so this is genuinely cheap to show alongside other
// account info, not a hidden full fetch of the friends list.
export async function getFriendsCount(currentUserId) {
  const { count, error } = await supabase
    .from('friendships')
    .select('id', { count: 'exact', head: true })
    .or(`requester_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
    .eq('status', 'accepted')
  if (error) throw error
  return count ?? 0
}

// Same HEAD-request-only shape as getFriendsCount above — used by
// App.jsx to drive the small count badge on the Friends nav item
// without ever transferring the actual request rows just to count
// them. Only ever reflects *incoming* pending requests (recipient_id =
// me), never outgoing/sent ones — cancelling a request you sent never
// touches this count, only the recipient's.
export async function getIncomingFriendRequestsCount(currentUserId) {
  const { count, error } = await supabase
    .from('friendships')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', currentUserId)
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

// Only the recipient of a pending request can accept it — enforced by
// RLS (see 0005_friendships.sql's update policy), not re-checked here;
// a request from the wrong user simply fails at the database level,
// same trust-RLS approach tripsRepository.js already takes throughout.
export async function acceptFriendRequest(friendshipId, currentUserId) {
  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
    .select(FRIENDSHIP_SELECT)
    .single()
  if (error) throw error
  return fromFriendshipRow(data, currentUserId)
}

// Declining leaves the row (status: 'declined') rather than deleting
// it — it's excluded from the "does an active relationship already
// exist" check everywhere above, so it never blocks a fresh request
// between the same two people later; it's just not silently erased.
export async function declineFriendRequest(friendshipId) {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'declined' })
    .eq('id', friendshipId)
  if (error) throw error
}

// Ending a friendship (or withdrawing your own still-pending request)
// is a real delete, not a status change — there's no "removed" status
// in the schema (see 0005_friendships.sql). This only ever deletes a
// `friendships` row: it cannot cascade into, and has no relationship
// with, any trip, trip_members, activity, expense, or saved_places row
// — removing a friend never touches trip data.
export async function removeFriend(friendshipId) {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId)
  if (error) throw error
}

// Cancelling your own still-pending outgoing request is, at the
// database level, the exact same operation as removeFriend above — a
// real delete of the one shared row, already allowed for either party
// by 0005_friendships.sql's "either side can delete a friendship"
// policy. A distinct, named export purely so the intent reads clearly
// at the call site (FriendsPage.jsx's Sent Requests section) — it's
// never called on an accepted/declined row, since getOutgoingFriendRequests
// only ever returns pending ones in the first place, so there's nothing
// further to check here.
export async function cancelFriendRequest(friendshipId) {
  return removeFriend(friendshipId)
}
