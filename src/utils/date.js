import { parseDateInput } from './itinerary'

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// Converts a local Date to a "YYYY-MM-DD" string — the inverse of
// itinerary.js's parseDateInput, and the same format trips already
// store startDate/endDate in.
export function toDateInputValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// e.g. "2026-06-10" -> "10 June 2026"
export function formatDateLabel(value) {
  if (!value) return ''
  const date = parseDateInput(value)
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
}

// For a `timestamptz` value (e.g. activity_events.created_at) rather
// than the plain "YYYY-MM-DD" dates the rest of this file works with —
// this one genuinely needs real elapsed time, not just a calendar-day
// comparison, so it's the one place in the app that reads a raw JS
// Date directly instead of going through parseDateInput. "Just now" /
// "N minutes ago" / "N hours ago" / "Yesterday" / "N days ago", then
// falls back to formatDateLabel's own "10 June 2026" for anything
// older than a week — recent activity is meant to read as recent, not
// accumulate an ever-growing tail of "42 days ago" entries.
export function formatRelativeTime(isoString) {
  if (!isoString) return ''
  const then = new Date(isoString)
  const diffMs = Date.now() - then.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`

  return formatDateLabel(toDateInputValue(then))
}

// Builds a calendar grid for the given month as a flat array of cells
// (always a multiple of 7, one row per week), including the leading and
// trailing days from adjacent months needed to fill each week.
export function getCalendarGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1)
  const startWeekday = firstOfMonth.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []

  for (let i = 0; i < startWeekday; i++) {
    cells.push({
      date: new Date(year, month, i - startWeekday + 1),
      isCurrentMonth: false,
    })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(year, month, day), isCurrentMonth: true })
  }

  while (cells.length % 7 !== 0) {
    const previousDate = cells[cells.length - 1].date
    const nextDate = new Date(previousDate)
    nextDate.setDate(nextDate.getDate() + 1)
    cells.push({ date: nextDate, isCurrentMonth: false })
  }

  return cells
}
