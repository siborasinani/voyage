// Builds a standard RFC 5545 `.ics` calendar file from one trip's own
// itinerary — read-only, entirely client-side, no network call and no
// external dependency (every piece used below — Blob, URL.createObjectURL,
// TextEncoder — is a standard browser API already available, matching
// this project's "no new dependency without a clear need" convention).
//
// Deliberately excludes anything Voyage doesn't actually model: no
// LOCATION (activities have no address/coordinates — see
// PROJECT_CONTEXT.md's Map-feature review), no attendees, no
// recurrence, no reminders. This is a one-way export of what's
// genuinely there, nothing invented.
import { getTripDays } from './itinerary'
import {
  getActivityCategoryLabel,
  getEndTime,
  getStartTime,
  sortActivitiesByTime,
} from './activities'

const ICS_LINE_LIMIT_BYTES = 75

// RFC 5545 §3.3.11 TEXT escaping — backslash first (so the backslashes
// this introduces for `;`/`,`/newlines below are never themselves
// re-escaped), then semicolon and comma, then every newline flavor
// (\r\n, \r, \n) normalized to the same literal "\n" escape sequence.
// Quotes and apostrophes are deliberately left untouched — the TEXT
// value type never requires escaping them (only PARAM values using a
// quoted-string do, which nothing here uses) — and Unicode text needs
// no escaping of its own at all; it's carried through as-is and relies
// on the file being written as UTF-8 (see downloadIcsFile below).
function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

// RFC 5545 §3.1 line folding: a content line SHOULD NOT exceed 75
// *octets* (UTF-8 bytes, not JS characters — a single emoji or
// accented character can be several bytes), continued by a CRLF
// followed by one leading space. Iterates by Unicode code point (not
// UTF-16 code unit) via `for...of`, so a surrogate pair (e.g. an emoji)
// is never split across two chunks either. Short lines (the common
// case) return unchanged, no folding overhead.
function foldLine(line) {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= ICS_LINE_LIMIT_BYTES) return line

  const chunks = []
  let chunk = ''
  let chunkBytes = 0

  for (const char of line) {
    const charBytes = encoder.encode(char).length
    // The first chunk gets the full 75 octets; every continuation chunk
    // loses one to the single leading space RFC 5545 requires.
    const limit = chunks.length === 0 ? ICS_LINE_LIMIT_BYTES : ICS_LINE_LIMIT_BYTES - 1
    if (chunkBytes + charBytes > limit && chunk) {
      chunks.push(chunk)
      chunk = ''
      chunkBytes = 0
    }
    chunk += char
    chunkBytes += charBytes
  }
  if (chunk) chunks.push(chunk)

  return chunks.join('\r\n ')
}

// DTSTART/DTEND are deliberately "floating" local times — no trailing
// `Z`, no TZID parameter — per RFC 5545's own "form #1: DATE WITH
// LOCAL TIME". This is the one honest choice available: Voyage's data
// model has never captured a timezone anywhere (TimePicker stores a
// bare "HH:mm" wall-clock value, nothing else), so there is no real
// timezone to attach here — inventing one (e.g. assuming the exporting
// browser's own zone, or assuming UTC) would risk silently shifting
// every activity by however many hours that guess was wrong by. A
// floating time is rendered by every calendar app using whatever
// timezone *that device* is currently set to, with zero conversion
// applied on import — exactly matching how "9:00 AM" already has no
// timezone attached anywhere else in Voyage's own UI, and exactly what
// this task's own instruction ("should not unexpectedly shift... because
// of browser timezone conversion") rules out any other choice.
function formatIcsLocalDateTime(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}${month}${day}T${hours}${minutes}00`
}

// DTSTAMP is the one property in this file that genuinely *is* a real
// UTC instant per spec (it records when this VEVENT was generated, not
// when the activity happens) — the only place this module reads real
// wall-clock "now" rather than a trip's own stored date/time.
function formatIcsUtcTimestamp(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`
}

// Combines a day-card's own calendar `Date` (from getTripDays — already
// a local midnight, see itinerary.js's own parseDateInput) with an
// activity's "HH:mm" time string. Built entirely from local getters/
// setters on both sides — never a UTC round-trip — so this can't
// introduce a timezone shift of its own on top of the floating-time
// choice above.
function combineDateAndTime(date, timeString) {
  const [hours, minutes] = timeString.split(':').map(Number)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes)
}

// Category (if any) plus notes (if any), one plain multi-line string —
// built with real newlines first and escaped once at the end (by the
// caller), rather than hand-assembling the "\n" escape sequence here,
// so a notes field that already contains its own newlines (a textarea
// allows them) is escaped identically to the separator between the two
// sections, not treated specially.
function buildDescription(activity) {
  const parts = []
  const categoryLabel = getActivityCategoryLabel(activity)
  if (categoryLabel) parts.push(`Category: ${categoryLabel}`)
  if (activity.notes) parts.push(activity.notes)
  return parts.join('\n\n')
}

function sanitizeFilename(name) {
  const cleaned = (name || 'voyage-trip').trim().replace(/[\\/:*?"<>|]+/g, '-')
  return (cleaned || 'voyage-trip').slice(0, 80)
}

// Builds the full `.ics` file text for one trip. Returns `eventCount`
// alongside `content` specifically so the caller (TripPage.jsx) can
// decide *before* ever touching the DOM whether there's anything worth
// downloading — see its own comment on why a trip with no timed
// activities never produces a file at all, rather than an empty or
// near-empty one.
//
// An activity with no usable start time at all (not even the legacy
// `.time` field — realistically only ever reachable via malformed/
// corrupted data, since AddActivity.jsx has required both start and
// end time for as long as that flow has existed) is silently excluded
// from the export rather than emitted as an invalid VEVENT — DTSTART
// is a required property per RFC 5545, so a VEVENT with none would be
// a genuinely malformed calendar entry, not just an incomplete one.
//
// An activity *with* a start time but no end time (via getEndTime's
// own fallback, only reachable if even the legacy `.time` field is
// absent) gets DTEND set equal to DTSTART — an explicit, valid,
// zero-duration event — rather than omitting DTEND altogether. Both
// are legal per spec, but an explicit DTEND is honored consistently by
// every mainstream calendar client, where an absent DTEND is left to
// each client's own (sometimes surprising) default; this never invents
// a duration that isn't actually known, it just states "zero, exactly"
// unambiguously instead of leaving it to guesswork.
export function buildTripCalendar(trip) {
  const days = getTripDays(trip.startDate, trip.endDate)
  const dtstamp = formatIcsUtcTimestamp(new Date())
  const eventLines = []
  let eventCount = 0

  for (const day of days) {
    const activities = sortActivitiesByTime(trip.activities?.[day.dayNumber] ?? [])

    for (const activity of activities) {
      const startTimeValue = getStartTime(activity)
      if (!startTimeValue) continue

      const endTimeValue = getEndTime(activity) || startTimeValue
      const startDate = combineDateAndTime(day.date, startTimeValue)
      const endDate = combineDateAndTime(day.date, endTimeValue)

      eventLines.push('BEGIN:VEVENT')
      eventLines.push(`UID:${activity.id}@voyage.app`)
      eventLines.push(`DTSTAMP:${dtstamp}`)
      eventLines.push(`DTSTART:${formatIcsLocalDateTime(startDate)}`)
      eventLines.push(`DTEND:${formatIcsLocalDateTime(endDate)}`)
      eventLines.push(`SUMMARY:${escapeIcsText(activity.name || 'Untitled activity')}`)

      const categoryLabel = getActivityCategoryLabel(activity)
      if (categoryLabel) {
        eventLines.push(`CATEGORIES:${escapeIcsText(categoryLabel)}`)
      }

      const description = buildDescription(activity)
      if (description) {
        eventLines.push(`DESCRIPTION:${escapeIcsText(description)}`)
      }

      eventLines.push('END:VEVENT')
      eventCount++
    }
  }

  if (eventCount === 0) {
    return { content: '', eventCount: 0, filename: '' }
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Voyage//Trip Itinerary//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(trip.name || 'Voyage trip')}`,
    ...eventLines,
    'END:VCALENDAR',
  ]

  // RFC 5545 requires CRLF line terminators throughout the file itself
  // (distinct from the literal "\n" *within* a folded/escaped value
  // above) — every line, folded or not, joins on "\r\n", with one
  // trailing terminator after the final line.
  const content = lines.map(foldLine).join('\r\n') + '\r\n'

  return { content, eventCount, filename: `${sanitizeFilename(trip.name)}.ics` }
}

// Triggers a normal browser file download — a Blob + a momentary,
// invisible <a download> click, the standard dependency-free pattern
// for "save this generated text as a file" (nothing analogous existed
// elsewhere in this app to reuse; EditProfile.jsx's own `URL.
// createObjectURL` use is for a local image *preview*, a different
// purpose, though the same underlying API). Revoked immediately after
// the click starts the download — the browser has already captured
// what it needs from the blob URL by then, same as every other
// documented use of this pattern. `text/calendar;charset=utf-8`
// (RFC 5545's own registered MIME type) is what lets a browser/OS
// offer "open with Calendar" instead of just treating it as generic
// text.
export function downloadIcsFile(filename, content) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}
