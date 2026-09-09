// Parses a "YYYY-MM-DD" input value as a local date (avoids the UTC
// off-by-one day shift you get from `new Date("YYYY-MM-DD")`).
export function parseDateInput(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Today's date as a local "YYYY-MM-DD" string, suitable for an
// <input type="date"> value or min attribute. Deliberately not
// `toISOString()`, which reports the date in UTC and can be off by a
// day depending on the viewer's timezone.
export function getTodayInputValue() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// "YYYY-MM-DD" shape check — guards isTripUpcoming below against a
// missing or malformed endDate rather than trusting it blindly.
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// A trip is Upcoming if its end date is today or later, Past if it's
// before today — end date is the single source of truth (a trip
// starting in the past but ending today or later still counts as
// Upcoming). Compared as plain "YYYY-MM-DD" strings rather than Date
// objects: that format already sorts chronologically as text, so this
// sidesteps timezone/parsing edge cases entirely. A trip with no
// endDate, or one that isn't a real "YYYY-MM-DD" string (which
// shouldn't happen — CreateTrip.jsx requires one before a trip can
// even be saved — but data can always be unexpectedly malformed),
// safely counts as Upcoming: it stays visible in the primary trips
// list rather than silently vanishing into Past Trips or breaking the
// list entirely.
export function isTripUpcoming(trip) {
  const endDate = trip?.endDate
  if (typeof endDate !== 'string' || !DATE_INPUT_PATTERN.test(endDate)) return true
  return endDate >= getTodayInputValue()
}

export function isTripPast(trip) {
  return !isTripUpcoming(trip)
}

// Two inclusive date ranges overlap iff each one's start is on or
// before the other's end — the standard interval-overlap check, and
// exactly what "share at least one calendar day" means. Compared as
// plain "YYYY-MM-DD" strings, same as every other date comparison in
// this file (isTripUpcoming above) and the same reasoning: that format
// already sorts/compares correctly as text, so this never touches a
// Date object or a timezone at all.
export function dateRangesOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA
}

// Every trip (already loaded, already scoped by RLS to ones the
// signed-in user can see — owned or shared, see App.jsx's own
// `visibleTrips`/`trips`) whose dates overlap the given range — used
// by CreateTrip.jsx's non-blocking "these dates overlap with..."
// warning. `excludeTripId` leaves out the trip being edited itself
// (its own unchanged dates trivially "overlap" with themselves, which
// isn't a meaningful warning). Trips with no dates yet, or the same
// malformed-date safety net isTripUpcoming already guards against,
// are simply skipped rather than ever being treated as a false
// overlap.
export function findOverlappingTrips(startDate, endDate, trips, excludeTripId) {
  if (!startDate || !endDate) return []

  return (trips ?? []).filter((trip) => {
    if (trip.id === excludeTripId) return false
    if (!trip.startDate || !trip.endDate) return false
    return dateRangesOverlap(startDate, endDate, trip.startDate, trip.endDate)
  })
}

// Builds one entry per calendar day of the trip, inclusive of both the
// start and end dates. Handles month and year boundaries automatically
// since it steps forward using Date's own day rollover.
export function getTripDays(startDate, endDate) {
  const start = parseDateInput(startDate)
  const end = parseDateInput(endDate)

  const days = []
  const current = new Date(start)
  let dayNumber = 1

  while (current <= end) {
    days.push({
      dayNumber,
      date: new Date(current),
    })

    current.setDate(current.getDate() + 1)
    dayNumber++
  }

  return days
}

// e.g. "Tuesday, June 10"
export function formatDayDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

// Formats a "HH:MM" <input type="time"> value as e.g. "2:30 PM".
export function formatTime(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number)
  const date = new Date(2000, 0, 1, hours, minutes)

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}
