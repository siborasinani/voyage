// Voyage's trip data-access layer — the one seam App.jsx goes through
// to load/persist trips, so components never call Supabase directly.
//
// Supabase is the single source of truth for all trip data — the
// top-level trip (id, name, destination, start/end date), saved
// places, activities, budget, and expenses. There is no localStorage
// fallback or duplicate copy anywhere: a signed-out session simply has
// no trip data (enforced at the render layer in App.jsx, via
// `visibleTrips`), and a signed-in session's trips come exclusively
// from the queries/mutations below. (This file used to also support a
// one-time "move my local trips to my account" migration from an
// earlier, localStorage-based version of the app; that entire system —
// migrateLocalTripsToSupabase, the local_id bookkeeping it relied on,
// and the localStorage read/write helpers — has been removed. The
// `trips.local_id` column itself still exists in the database schema
// on any row that was migrated before this removal, but nothing here
// reads, writes, or relies on it anymore.)
import { splitAmountEqually } from '../utils/budget'
import { supabase } from './supabase'

// Converts one `trips` row into Voyage's existing client-side Trip
// shape (see PROJECT_CONTEXT.md §5) so every component downstream of
// App.jsx keeps working unmodified. `activities`/`savedPlaces`/
// `expenses`/`packingItems` default to empty here, but getSupabaseTrips
// below always overwrites all four with the trip's real data once
// loaded — these defaults only matter for createSupabaseTrip/
// updateSupabaseTrip, where a genuinely empty (or, for update,
// not-yet-refetched) value is correct.
// `budget` is always `null` here now — as of 0014_personal_trip_
// budgets.sql, a trip's `budget_amount`/`budget_currency` columns are
// legacy/inert (same as `local_id`, see that migration's own header
// comment) and no longer read; the real, per-collaborator value is
// resolved separately in getSupabaseTrips (from trip_member_budgets)
// and overlaid onto the object this function returns, since "my
// budget" isn't a plain column on the trip row anymore. Trips created/
// updated via createSupabaseTrip/updateSupabaseTrip never carried real
// budget data through this function anyway (see their own callers in
// App.jsx), so this is a no-behavior-change simplification for them.
// `ownerId` (added for trip sharing — see getTripMembers/
// removeTripMember below, and services/invitationsRepository.js for
// how a collaborator actually joins now, via an invitation rather than
// a direct add) is the one field here
// that isn't purely display data: App.jsx compares it against the
// signed-in user's own id to know whether *they* are this trip's
// owner or just a collaborator, which TripPage.jsx uses to hide
// owner-only controls (Delete trip, adding/removing People) for an
// editor viewing a shared trip — RLS already refuses those actions for
// a non-owner regardless, this is purely about not showing a control
// that would just fail.
function fromRow(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    destination: row.destination,
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    budget: null,
    activities: {},
    savedPlaces: [],
    expenses: [],
    packingItems: [],
  }
}

// Converts one `saved_places` row into Voyage's existing client-side
// SavedPlace shape (see utils/explore.js's toSavedPlace / AddPlace.jsx)
// — a direct field-for-field mapping, since the table was designed
// against that exact shape from the start (see 0001_init.sql).
// `latitude`/`longitude` (see 0016_saved_places_coordinates.sql) are
// the one pair of fields that isn't `?? ''` — unlike every text field
// here, `null` is their own genuine "no coordinates for this place"
// value (a manually-added place, or any place saved before this
// migration existed), not a value to paper over with an empty string;
// TripMap.jsx relies on being able to tell "no coordinates" apart from
// "coordinates of 0,0" by checking for exactly this.
function fromPlaceRow(row) {
  return {
    id: row.id,
    sourcePlaceId: row.source_place_id,
    name: row.name,
    category: row.category ?? '',
    customCategory: row.custom_category ?? '',
    location: row.location ?? '',
    notes: row.notes ?? '',
    image: row.image ?? '',
    imageSource: row.image_source ?? 'none',
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
  }
}

function toPlaceFields(place) {
  return {
    source_place_id: place.sourcePlaceId || null,
    name: place.name,
    category: place.category || null,
    custom_category: place.customCategory || null,
    location: place.location || null,
    notes: place.notes || null,
    image: place.image || null,
    image_source: place.image ? place.imageSource || 'none' : null,
    // Same `?? null` reasoning as fromPlaceRow above — a manually-
    // added place (AddPlace.jsx) never sets these at all, so they
    // fall through to `place.latitude`/`place.longitude` being
    // `undefined` here, which `??` also correctly turns into `null`.
    latitude: place.latitude ?? null,
    longitude: place.longitude ?? null,
  }
}

// Converts one `activities` row into Voyage's existing client-side
// Activity shape (see AddActivity.jsx) — direct field-for-field, same
// as saved places, with one adjustment: Postgres's `time` columns come
// back from PostgREST as "HH:MM:SS", but every existing consumer
// (TimePicker, utils/activities.js's string-based sorting/display)
// expects the same "HH:MM" <input type="time"> shape the app has
// always used — trimmed here, once, rather than teaching every reader
// downstream about a Postgres-specific format. `day_number` isn't part
// of the returned object: it's the grouping key in `trip.activities`
// (see getSupabaseTrips), never a field on the activity itself, same
// as the existing local shape.
function fromActivityRow(row) {
  return {
    id: row.id,
    name: row.name,
    startTime: row.start_time?.slice(0, 5) ?? '',
    endTime: row.end_time?.slice(0, 5) ?? '',
    category: row.category ?? '',
    customCategory: row.custom_category ?? '',
    notes: row.notes ?? '',
  }
}

function toActivityFields(activity) {
  return {
    name: activity.name,
    start_time: activity.startTime || null,
    end_time: activity.endTime || null,
    category: activity.category || null,
    custom_category: activity.customCategory || null,
    notes: activity.notes || null,
  }
}

// Converts one `packing_items` row into Voyage's existing client-side
// PackingItem shape (see AddPackingItem.jsx) — direct field-for-field,
// same approach as activities/saved places. `completed` already comes
// back from PostgREST as a real boolean (unlike Postgres's `time`
// columns above), so no reshaping is needed beyond the usual `?? `
// fallback for a row read before its own column existed.
function fromPackingItemRow(row) {
  return {
    id: row.id,
    name: row.name,
    completed: row.completed ?? false,
  }
}

function toPackingItemFields(item) {
  return {
    name: item.name,
    completed: item.completed ?? false,
  }
}

// Converts one `expenses` row into Voyage's existing client-side
// Expense shape (see AddExpense.jsx) — direct field-for-field, same
// approach as activities/saved places. `expense_date` is a plain `date`
// column (not `timestamptz`), so — unlike activities' `time` columns —
// PostgREST already returns it as a bare "YYYY-MM-DD", the exact string
// format `date` has always been client-side; no trimming/reformatting
// needed.
//
// `participantRows` (the matching `expense_participants` rows, if any
// — see getSupabaseTrips/getExpenseParticipants below) and
// `profilesById` (`{ [userId]: { id, displayName, avatarUrl } }`,
// resolved separately since expense_participants.user_id references
// auth.users, not profiles, directly — same reason trip_members needs
// its own join, see getTripMembers) are what distinguish a personal
// expense from a shared one: an empty `participants` array *is* what
// "personal" means client-side, not a separate flag — see
// 0007_shared_expenses.sql's own header comment for why that's
// deliberate. Every expense created before shared expenses existed has
// zero participant rows, so it reads as personal automatically.
function fromExpenseRow(row, participantRows = [], profilesById = {}) {
  const payerProfile = row.paid_by ? profilesById[row.paid_by] : null

  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    category: row.category ?? '',
    date: row.expense_date ?? '',
    notes: row.notes ?? '',
    paidBy: row.paid_by ?? null,
    payerName: payerProfile?.displayName ?? '',
    participants: participantRows.map((participantRow) => ({
      userId: participantRow.user_id,
      displayName: profilesById[participantRow.user_id]?.displayName ?? '',
      shareAmount: participantRow.share_amount,
    })),
  }
}

// Deliberately excludes `id` — AddExpense.jsx generates a client-side
// id (`crypto.randomUUID()`) for a brand-new expense purely so it has
// *some* id before being saved, same as it always has, but a Supabase-
// backed expense's real id is whatever the insert returns (see
// createSupabaseExpense); the client-generated one is simply discarded,
// same pattern as activities. `paid_by` stays `null` unless the
// expense is shared (see AddExpense.jsx's Personal/Shared toggle) —
// exactly what every existing personal expense already had, so this
// changes nothing for that flow.
function toExpenseFields(expense) {
  return {
    name: expense.name,
    amount: expense.amount,
    category: expense.category || null,
    expense_date: expense.date || null,
    notes: expense.notes || null,
    paid_by: expense.paidBy || null,
  }
}

// The trip's own top-level fields — deliberately excludes
// budget_amount/budget_currency, which go through toBudgetFields/
// updateSupabaseBudget instead: budget is edited independently of the
// trip's name/destination/dates (see BudgetSection.jsx's separate
// "Edit budget" flow), and keeping the two update paths separate means
// neither one can accidentally clobber the other's most recent value.
function toFields(tripData) {
  return {
    name: tripData.name,
    destination: tripData.destination,
    start_date: tripData.startDate || null,
    end_date: tripData.endDate || null,
  }
}

// `budget` is the client-shape Budget — always a real `{ amount,
// currency }` here (SetBudget.jsx's form requires an amount; there is
// no "clear my budget" action, so no null case to handle — see
// updateSupabaseBudget below).
function toBudgetFields(tripId, userId, budget) {
  return {
    trip_id: tripId,
    user_id: userId,
    amount: budget.amount,
    currency: budget.currency,
  }
}

// Row Level Security (see supabase/migrations/0001_init.sql) already
// restricts every one of these queries to trips the signed-in user is
// a member of — no `.eq('owner_id', ...)` filter needed for that; it's
// enforced at the database level, not trusted to app code.

// Fetched alongside trips (one extra query each, not one per trip) and
// grouped client-side — RLS on saved_places/activities/expenses already
// restricts these to rows belonging to trips the signed-in user is a
// member of, same as trips itself, so no explicit trip_id filter is
// needed for any of them.
// `currentUserId` (App.jsx's own `auth.user.id`) is only ever used to
// pick out *which* of a trip's several trip_members rows is "my own"
// role — every row returned here is already independently scoped by
// RLS to trips this user can actually see, same as always; this
// parameter never does any filtering of its own.
export async function getSupabaseTrips(currentUserId) {
  const [
    tripsResult,
    placesResult,
    activitiesResult,
    expensesResult,
    participantsResult,
    membersResult,
    budgetsResult,
    packingItemsResult,
  ] = await Promise.all([
    supabase.from('trips').select('*').order('created_at', { ascending: true }),
    supabase.from('saved_places').select('*'),
    supabase.from('activities').select('*'),
    supabase.from('expenses').select('*'),
    supabase.from('expense_participants').select('*'),
    supabase.from('trip_members').select('*'),
    // No explicit .eq('user_id', ...) — RLS on trip_member_budgets
    // already returns only the signed-in user's own rows (see
    // 0014_personal_trip_budgets.sql), same "trust RLS, don't
    // re-filter in app code" approach every other query here already
    // takes.
    supabase.from('trip_member_budgets').select('*'),
    // Same "fetched alongside trips, grouped client-side" approach as
    // saved_places/activities/expenses above — packing items are
    // trip-shared data, not per-user like budgets, so they belong in
    // this same batch rather than a separate component-level fetch
    // (see 0017_packing_items.sql).
    supabase.from('packing_items').select('*'),
  ])
  if (tripsResult.error) throw tripsResult.error
  if (placesResult.error) throw placesResult.error
  if (activitiesResult.error) throw activitiesResult.error
  if (expensesResult.error) throw expensesResult.error
  if (participantsResult.error) throw participantsResult.error
  if (membersResult.error) throw membersResult.error
  if (budgetsResult.error) throw budgetsResult.error
  if (packingItemsResult.error) throw packingItemsResult.error

  const membersByTripId = new Map()
  for (const row of membersResult.data ?? []) {
    const list = membersByTripId.get(row.trip_id) ?? []
    list.push(row)
    membersByTripId.set(row.trip_id, list)
  }

  // At most one row per trip here (trip_member_budgets' primary key is
  // (trip_id, user_id), and every row returned is already this user's
  // own — see the query above), so a plain map, not a list.
  const myBudgetByTripId = new Map()
  for (const row of budgetsResult.data ?? []) {
    myBudgetByTripId.set(row.trip_id, { amount: row.amount, currency: row.currency })
  }

  const placesByTripId = new Map()
  for (const row of placesResult.data ?? []) {
    const list = placesByTripId.get(row.trip_id) ?? []
    list.push(fromPlaceRow(row))
    placesByTripId.set(row.trip_id, list)
  }

  // Flat list per trip — same grouping shape as saved_places above, no
  // sorting relied on here either: PackingList.jsx renders whatever
  // order is returned, same as this app already accepts for places.
  const packingItemsByTripId = new Map()
  for (const row of packingItemsResult.data ?? []) {
    const list = packingItemsByTripId.get(row.trip_id) ?? []
    list.push(fromPackingItemRow(row))
    packingItemsByTripId.set(row.trip_id, list)
  }

  // Two-level grouping — trip_id, then day_number — to land exactly on
  // trip.activities' existing `{ [dayNumber]: Activity[] }` shape.
  // Storage order is never relied on here (or anywhere): TripPage.jsx
  // already re-sorts each day's activities by time on every render
  // (sortActivitiesByTime), same as it always has for local data.
  const activitiesByTripId = new Map()
  for (const row of activitiesResult.data ?? []) {
    const byDay = activitiesByTripId.get(row.trip_id) ?? {}
    const dayActivities = byDay[row.day_number] ?? []
    byDay[row.day_number] = [...dayActivities, fromActivityRow(row)]
    activitiesByTripId.set(row.trip_id, byDay)
  }

  const participantsByExpenseId = new Map()
  for (const row of participantsResult.data ?? []) {
    const list = participantsByExpenseId.get(row.expense_id) ?? []
    list.push(row)
    participantsByExpenseId.set(row.expense_id, list)
  }

  // Every user id a display name is needed for, across every trip
  // being loaded — every shared expense's payer, every participant,
  // and (new) every trip member, since the dashboard's own "Owned by
  // X" caption on a shared trip's card needs the owner's name too —
  // resolved in one extra query rather than one per expense/trip, same
  // two-query-then-join approach used throughout this file (saved_
  // places/activities/expenses above, and getTripMembers below) and in
  // services/friendsRepository.js.
  const relevantUserIds = new Set()
  for (const row of expensesResult.data ?? []) {
    if (row.paid_by) relevantUserIds.add(row.paid_by)
  }
  for (const row of participantsResult.data ?? []) {
    relevantUserIds.add(row.user_id)
  }
  for (const row of membersResult.data ?? []) {
    relevantUserIds.add(row.user_id)
  }

  const profilesById = {}
  if (relevantUserIds.size > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', [...relevantUserIds])
    if (profileError) throw profileError
    for (const row of profileRows ?? []) {
      profilesById[row.id] = {
        id: row.id,
        displayName: row.display_name || '',
        avatarUrl: row.avatar_url || '',
      }
    }
  }

  // Flat list per trip, sorted the same way BudgetSection.jsx's own
  // display sort already re-does on every render (sortExpensesByDate)
  // — storage order isn't relied on here either, same as places/
  // activities above.
  const expensesByTripId = new Map()
  for (const row of expensesResult.data ?? []) {
    const list = expensesByTripId.get(row.trip_id) ?? []
    list.push(fromExpenseRow(row, participantsByExpenseId.get(row.id) ?? [], profilesById))
    expensesByTripId.set(row.trip_id, list)
  }

  // `trips` itself is now visible for one more reason than "I'm a
  // member": 0013_fix_invitee_trip_preview.sql also lets someone with
  // a still-pending invitation see the bare trip row (so the
  // notification popover can name it before they've accepted — see
  // that migration's own comment). That's deliberately *not* the same
  // thing as actually having access, so a trip is only ever included
  // here when the signed-in user has a real trip_members row for it —
  // without this filter, a pending invitation would leak the trip into
  // the dashboard's own Shared With You section before it was ever
  // accepted, which is exactly the live-tested bug this filter fixes.
  return (tripsResult.data ?? [])
    .filter((row) => (membersByTripId.get(row.id) ?? []).some((member) => member.user_id === currentUserId))
    .map((row) => {
      const members = membersByTripId.get(row.id) ?? []
      const myMembership = members.find((member) => member.user_id === currentUserId)
      const ownerMembership = members.find((member) => member.role === 'owner')
      const ownerProfile = ownerMembership ? profilesById[ownerMembership.user_id] : null

      return {
        ...fromRow(row),
        // Overrides fromRow's own always-null budget with the signed-
        // in user's personal one, if they've set it (see
        // 0014_personal_trip_budgets.sql) — every other collaborator
        // loading this same trip gets their own value here instead,
        // from their own copy of budgetsResult (RLS-scoped per user).
        budget: myBudgetByTripId.get(row.id) ?? null,
        savedPlaces: placesByTripId.get(row.id) ?? [],
        activities: activitiesByTripId.get(row.id) ?? {},
        expenses: expensesByTripId.get(row.id) ?? [],
        packingItems: packingItemsByTripId.get(row.id) ?? [],
        myRole: myMembership?.role,
        ownerName: ownerProfile?.displayName || undefined,
      }
    })
}

export async function createSupabaseTrip(userId, tripData) {
  const { data, error } = await supabase
    .from('trips')
    .insert({ owner_id: userId, ...toFields(tripData) })
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

export async function updateSupabaseTrip(tripId, tripData) {
  const { data, error } = await supabase
    .from('trips')
    .update(toFields(tripData))
    .eq('id', tripId)
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

export async function deleteSupabaseTrip(tripId) {
  const { error } = await supabase.from('trips').delete().eq('id', tripId)
  if (error) throw error
}

// Sets or edits the *signed-in user's own* budget for a trip —
// SetBudget.jsx's only save path, whether that's their first budget
// for this trip or a change to one they already set; there's no
// separate "create" vs "update" on the client (see BudgetSection.jsx:
// same modal, same onSave either way), so this upserts rather than
// picking between insert/update itself. Scoped to `trip_member_budgets`
// (see 0014_personal_trip_budgets.sql) — one row per (trip, user), so
// this can never touch, and is never affected by, another
// collaborator's own budget for the same trip. RLS still independently
// enforces "only your own row, only while you're owner/editor" even
// if this ever got a wrong userId — this parameter isn't the only
// thing standing between a client and someone else's row.
export async function updateSupabaseBudget(tripId, userId, budget) {
  const { data, error } = await supabase
    .from('trip_member_budgets')
    .upsert(toBudgetFields(tripId, userId, budget), { onConflict: 'trip_id,user_id' })
    .select()
    .single()
  if (error) throw error
  return { amount: data.amount, currency: data.currency }
}

// `place` is the client-shape SavedPlace (see toPlaceFields) — used
// both for a manually-added place and for one converted from Explore
// via toSavedPlace(); either way, only `trip_id` plus whatever the
// object carries is written, so a manual place's absent
// sourcePlaceId/image/imageSource just become null columns, exactly
// matching today's local behavior.
export async function createSupabasePlace(tripId, place) {
  const { data, error } = await supabase
    .from('saved_places')
    .insert({ trip_id: tripId, ...toPlaceFields(place) })
    .select()
    .single()
  if (error) throw error
  return fromPlaceRow(data)
}

export async function deleteSupabasePlace(placeId) {
  const { error } = await supabase.from('saved_places').delete().eq('id', placeId)
  if (error) throw error
}

// `item` is the client-shape PackingItem (see toPackingItemFields) —
// AddPackingItem.jsx only ever submits a `name` (a brand-new item is
// never created already-completed), same "only `trip_id` plus whatever
// the object carries is written" approach as createSupabasePlace above.
export async function createSupabasePackingItem(tripId, item) {
  const { data, error } = await supabase
    .from('packing_items')
    .insert({ trip_id: tripId, ...toPackingItemFields(item) })
    .select()
    .single()
  if (error) throw error
  return fromPackingItemRow(data)
}

// Used for both "toggle completed" (PackingList.jsx's row button) and
// "rename" (not currently exposed in the UI, but this is the same
// general-purpose update every other trip-child table's own
// updateSupabaseX already is) — same shape as updateSupabaseActivity
// below: the full current item is sent, not a partial patch.
export async function updateSupabasePackingItem(itemId, item) {
  const { data, error } = await supabase
    .from('packing_items')
    .update(toPackingItemFields(item))
    .eq('id', itemId)
    .select()
    .single()
  if (error) throw error
  return fromPackingItemRow(data)
}

export async function deleteSupabasePackingItem(itemId) {
  const { error } = await supabase.from('packing_items').delete().eq('id', itemId)
  if (error) throw error
}

// `dayNumber` is never part of `activity` itself (see fromActivityRow)
// — it's supplied separately, exactly as TripPage.jsx already tracks
// which day's modal is open independently of the activity's own
// fields (and never lets an edit move an activity to a different day).
export async function createSupabaseActivity(tripId, dayNumber, activity) {
  const { data, error } = await supabase
    .from('activities')
    .insert({ trip_id: tripId, day_number: dayNumber, ...toActivityFields(activity) })
    .select()
    .single()
  if (error) throw error
  return fromActivityRow(data)
}

export async function updateSupabaseActivity(activityId, activity) {
  const { data, error } = await supabase
    .from('activities')
    .update(toActivityFields(activity))
    .eq('id', activityId)
    .select()
    .single()
  if (error) throw error
  return fromActivityRow(data)
}

export async function deleteSupabaseActivity(activityId) {
  const { error } = await supabase.from('activities').delete().eq('id', activityId)
  if (error) throw error
}

// Replaces this expense's `expense_participants` rows entirely: deletes
// whatever's there, then — only if `expense.participantIds` is
// non-empty — inserts fresh rows with freshly computed equal shares
// (see utils/budget.js's splitAmountEqually for the rounding
// approach). This is the one shared code path behind both
// createSupabaseExpense and updateSupabaseExpense below, and it's what
// keeps "personal" and "shared" expenses — and every transition
// between them — all the same logic rather than three separate cases:
//   - A personal expense (no `participantIds` at all, the same as
//     every expense ever created before shared expenses existed) has
//     nothing to delete and nothing to insert — a true no-op.
//   - A brand-new shared expense has nothing to delete (fresh
//     expense_id) and inserts its first set of shares.
//   - Editing an existing shared expense's amount or participant list
//     always fully replaces the old shares with freshly recalculated
//     ones, rather than trying to diff/reconcile an existing set — the
//     simplest way to guarantee shares are never stale after a change,
//     and to guarantee there's never an orphaned participant row left
//     over from a shrunk list.
//   - Switching an existing shared expense back to Personal (in
//     AddExpense.jsx's toggle) passes an empty `participantIds` —
//     deletes the old shares, inserts nothing — so it's genuinely
//     personal again afterward, not just personal-looking.
// Not wrapped in a database transaction (Supabase's client-side API
// has no multi-statement transaction primitive, and nothing else in
// this app's repository layer uses one either — createSupabaseTrip
// relies on its own trigger for atomicity, not client-orchestrated
// multi-step transactions) — a failure between the delete and the
// insert is a known, accepted limitation for this first version, and
// is surfaced to the user as a normal save error rather than silently
// swallowed.
async function writeExpenseParticipants(expenseId, expense) {
  const { error: deleteError } = await supabase
    .from('expense_participants')
    .delete()
    .eq('expense_id', expenseId)
  if (deleteError) throw deleteError

  const participantIds = expense.participantIds ?? []
  if (participantIds.length === 0) return []

  const shares = splitAmountEqually(expense.amount, participantIds.length)
  const rows = participantIds.map((userId, index) => ({
    expense_id: expenseId,
    user_id: userId,
    share_amount: shares[index],
  }))

  const { data, error } = await supabase.from('expense_participants').insert(rows).select()
  if (error) throw error
  return data
}

// `expense` is the client-shape Expense from AddExpense.jsx — its own
// client-generated `id` is discarded (see toExpenseFields); the real
// id is whatever this insert returns. `expense.participantIds` (only
// ever present when AddExpense.jsx's Personal/Shared toggle is set to
// Shared) drives whether this also becomes a shared expense — see
// writeExpenseParticipants above. `profilesById` (optional,
// `{ [userId]: { id, displayName, avatarUrl } }`) is whatever the
// caller already has on hand (BudgetSection.jsx already fetched trip
// members to populate the Paid by/Participants pickers) — passed
// through purely so the returned expense can show real names
// immediately, with no extra round trip, matching how trip sharing's
// AddTripFriends.jsx already avoids a redundant fetch after adding a
// collaborator.
export async function createSupabaseExpense(tripId, expense, profilesById = {}) {
  const { data, error } = await supabase
    .from('expenses')
    .insert({ trip_id: tripId, ...toExpenseFields(expense) })
    .select()
    .single()
  if (error) throw error

  const participantRows = await writeExpenseParticipants(data.id, expense)
  return fromExpenseRow(data, participantRows, profilesById)
}

export async function updateSupabaseExpense(expenseId, expense, profilesById = {}) {
  const { data, error } = await supabase
    .from('expenses')
    .update(toExpenseFields(expense))
    .eq('id', expenseId)
    .select()
    .single()
  if (error) throw error

  const participantRows = await writeExpenseParticipants(expenseId, expense)
  return fromExpenseRow(data, participantRows, profilesById)
}

// Deletes the expense row only — its expense_participants rows are
// removed automatically, at the database level, by the existing
// `on delete cascade` from expense_participants.expense_id (see
// 0001_init.sql) — nothing to orchestrate here.
export async function deleteSupabaseExpense(expenseId) {
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId)
  if (error) throw error
}

// --- Trip sharing (trip_members) ---------------------------------------
// Reuses the `trip_members` table 0001_init.sql already scaffolded for
// this — no new table. See supabase/migrations/0006_trip_sharing.sql
// for the RLS this all actually relies on: ownership and friendship
// are enforced there, at the database level, not by anything below.

// Converts one `trip_members` row into the client shape
// TripPeopleSection.jsx/AddTripFriends.jsx render — `profile` (a
// plain `{ id, displayName, avatarUrl }` or null) is passed in
// separately rather than embedded via a PostgREST join: trip_members.
// user_id references auth.users, not profiles, directly (unlike
// friendships — see 0005_friendships.sql's own comment on why *that*
// table points at profiles instead), so there's no FK PostgREST can
// auto-embed here. getTripMembers below does the same two-query,
// join-client-side approach getSupabaseTrips already uses for
// saved_places/activities/expenses — not a new pattern.
function fromMemberRow(row, profile) {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role,
    profile: profile
      ? {
          id: profile.id,
          displayName: profile.display_name || '',
          avatarUrl: profile.avatar_url || '',
        }
      : null,
  }
}

// RLS ("members can view fellow members") already scopes this to
// trips the caller is actually a member of — no explicit filter needed
// beyond `trip_id` itself.
export async function getTripMembers(tripId) {
  const { data: memberRows, error: memberError } = await supabase
    .from('trip_members')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })
  if (memberError) throw memberError

  const userIds = (memberRows ?? []).map((row) => row.user_id)
  if (userIds.length === 0) return []

  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', userIds)
  if (profileError) throw profileError

  const profilesById = new Map((profileRows ?? []).map((row) => [row.id, row]))
  return memberRows.map((row) => fromMemberRow(row, profilesById.get(row.user_id)))
}

// Changes an existing collaborator's role between 'editor' and
// 'viewer' — the owner-only action in TripPeopleSection.jsx's own role
// toggle on each collaborator row. Never used to touch the owner's own
// row, and never used to set 'owner': the database refuses both
// regardless of what's sent, via 0008_collaboration_account_completeness.sql's
// tightened "owners can change member roles" policy (USING excludes any
// row whose current role is 'owner'; WITH CHECK requires the new role
// to be 'editor' or 'viewer').
export async function updateTripMemberRole(memberId, role) {
  const { data, error } = await supabase
    .from('trip_members')
    .update({ role })
    .eq('id', memberId)
    .select()
    .single()
  if (error) throw error
  return fromMemberRow(data, null)
}

// The signed-in user's own role on one specific trip — used by
// TripPage.jsx to decide whether to show editor-only controls (Edit
// trip, add/edit/delete activities, saved places, budget, expenses) to
// a collaborator who isn't the owner. Only ever called for a non-owner
// (TripPage.jsx already knows `isOwner` for free, from trip.ownerId, no
// query needed for that case) — returns `null` if there's no
// membership row at all, which TripPage.jsx treats the same as
// 'viewer' for UI-gating purposes (RLS refuses every mutation either
// way; this only ever decides what to show, never what to allow).
export async function getMyTripRole(tripId, userId) {
  const { data, error } = await supabase
    .from('trip_members')
    .select('role')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data?.role ?? null
}

// Removing a collaborator is a real delete of their trip_members row
// only — it cannot cascade into, and has no relationship with, the
// `friendships` table (same guarantee services/friendsRepository.js's
// removeFriend already documents in the other direction): removing
// someone from a trip never touches the friendship, and vice versa.
export async function removeTripMember(memberId) {
  const { error } = await supabase.from('trip_members').delete().eq('id', memberId)
  if (error) throw error
}
