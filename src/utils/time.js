// Shared conversion helpers for TimePicker. Values are always stored as
// 24-hour "HH:mm" strings (so sorting and overlap detection keep working
// with plain string comparison) and displayed to the user in 12-hour form.

export const TIME_PICKER_HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
export const TIME_PICKER_MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
export const TIME_PICKER_PERIODS = ['AM', 'PM']

// Converts 12-hour parts to a 24-hour "HH:mm" string, e.g. (2, 0, 'PM') -> "14:00".
export function to24HourValue(hour12, minute, period) {
  const hourInDay = hour12 % 12
  const hour24 = period === 'PM' ? hourInDay + 12 : hourInDay
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// Parses a 24-hour "HH:mm" string into 12-hour parts, or null if empty/invalid.
export function parseTimeValue(value) {
  if (!value) return null

  const [hourString, minuteString] = value.split(':')
  const hour24 = Number(hourString)
  const minute = Number(minuteString)

  if (Number.isNaN(hour24) || Number.isNaN(minute)) return null

  const period = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12

  return { hour12, minute, period }
}

// e.g. "14:00" -> "2:00 PM"
export function formatTimeValue(value) {
  const parsed = parseTimeValue(value)
  if (!parsed) return ''

  return `${parsed.hour12}:${String(parsed.minute).padStart(2, '0')} ${parsed.period}`
}

// Whether a given 12-hour slot satisfies an optional 24-hour "HH:mm"
// minimum (inclusive) — used to keep the End Time picker from ever
// offering a time earlier than the selected Start Time.
export function isTimeSlotAllowed(hour12, minute, period, min) {
  if (!min) return true
  return to24HourValue(hour12, minute, period) >= min
}

// Whether at least one minute in this hour+period satisfies `min`.
export function isHourAllowed(hour12, period, min) {
  if (!min) return true
  return TIME_PICKER_MINUTES.some((minute) =>
    isTimeSlotAllowed(hour12, minute, period, min)
  )
}

// Whether at least one hour+minute in this period satisfies `min`.
export function isPeriodAllowed(period, min) {
  if (!min) return true
  return TIME_PICKER_HOURS.some((hour12) => isHourAllowed(hour12, period, min))
}
