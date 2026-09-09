export const ACTIVITY_CATEGORIES = [
  'Attraction',
  'Food',
  'Cafe',
  'Restaurant',
  'Hotel',
  'Transport',
  'Shopping',
  'Beach',
  'Museum',
  'Nightlife',
  'Nature',
  'Event',
  'Other',
  'Custom',
]

// The label to display for an activity's category — the name the user
// typed in when they picked "Custom", otherwise the category itself.
export function getActivityCategoryLabel(activity) {
  return activity.category === 'Custom'
    ? activity.customCategory
    : activity.category
}

// Reads an activity's start time, falling back to the legacy single
// `time` field for activities created before start/end times existed.
// Exported (not just used internally below) so utils/ics.js's calendar
// export reads a start/end time exactly the same way every other
// consumer in this file already does, instead of a second, possibly
// drifting copy of the same fallback.
export function getStartTime(activity) {
  return activity.startTime ?? activity.time
}

// Reads an activity's end time, with the same legacy fallback.
export function getEndTime(activity) {
  return activity.endTime ?? activity.time
}

// Returns a new array of activities ordered chronologically by start time
// ("HH:MM" values compare correctly as plain strings). Array.prototype.sort
// is stable, so activities sharing the exact same start time keep their
// existing relative order rather than being shuffled.
export function sortActivitiesByTime(activities) {
  return [...activities].sort((a, b) => {
    const aStartTime = getStartTime(a)
    const bStartTime = getStartTime(b)

    if (aStartTime < bStartTime) return -1
    if (aStartTime > bStartTime) return 1
    return 0
  })
}

// e.g. "09:30 – 11:30". <input type="time"> values are always a
// zero-padded 24-hour "HH:MM" string, so displaying them as-is keeps
// single-digit hours consistent (never "9:30" next to "09:30") without
// any extra formatting or date/timezone conversion. Legacy activities
// with only a single `time` (no distinct start/end) display as just
// that one time.
export function getActivityTimeRangeLabel(activity) {
  const startTime = getStartTime(activity)
  const endTime = getEndTime(activity)

  if (!startTime) return ''
  if (!endTime || endTime === startTime) return startTime

  return `${startTime} – ${endTime}`
}

// Returns the set of activity ids that overlap with at least one other
// activity in the same list (same day). Two activities overlap when
// one starts before the other ends, in both directions — touching
// boundaries (one ending exactly when the other starts) don't count.
export function getOverlappingActivityIds(activities) {
  const overlappingIds = new Set()

  for (let i = 0; i < activities.length; i++) {
    for (let j = i + 1; j < activities.length; j++) {
      const a = activities[i]
      const b = activities[j]

      const aStart = getStartTime(a)
      const aEnd = getEndTime(a)
      const bStart = getStartTime(b)
      const bEnd = getEndTime(b)

      if (aStart < bEnd && bStart < aEnd) {
        overlappingIds.add(a.id)
        overlappingIds.add(b.id)
      }
    }
  }

  return overlappingIds
}
