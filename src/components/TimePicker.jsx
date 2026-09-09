import { useEffect, useRef, useState } from 'react'
import {
  TIME_PICKER_HOURS,
  TIME_PICKER_MINUTES,
  TIME_PICKER_PERIODS,
  formatTimeValue,
  isHourAllowed,
  isPeriodAllowed,
  isTimeSlotAllowed,
  parseTimeValue,
  to24HourValue,
} from '../utils/time'

// A compact, custom-styled time picker replacing the browser's native
// <input type="time">. Stores/emits a 24-hour "HH:mm" string via
// `onChange`, while showing and letting the user pick in familiar
// 12-hour Hour / Minute / AM-PM form. An optional 24-hour `min` (used
// for an End Time picker tied to a Start Time) disables any slot that
// would fall earlier than it, directly in the UI, rather than allowing
// the pick and flagging it afterward.
function TimePicker({ name, value, onChange, min, placeholder = 'Select time' }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    // Scroll each column to the current (or default) position so the
    // user isn't dropped at the top of a long, scrollable list.
    const container = containerRef.current
    ;['hour', 'minute', 'period'].forEach((column) => {
      container
        ?.querySelector(`[data-column="${column}"].is-selected, [data-column="${column}"].is-default`)
        ?.scrollIntoView({ block: 'nearest' })
    })
  }, [isOpen])

  const parsed = parseTimeValue(value)
  // When nothing is chosen yet, start the picker at `min` itself (always
  // a valid slot) rather than an arbitrary default that might land on a
  // disabled hour/period.
  const fallback = min ? parseTimeValue(min) : { hour12: 9, minute: 0, period: 'AM' }
  const hour12 = parsed?.hour12 ?? fallback.hour12
  const minute = parsed?.minute ?? fallback.minute
  const period = parsed?.period ?? fallback.period

  const commit = (nextHour12, nextMinute, nextPeriod) => {
    onChange(to24HourValue(nextHour12, nextMinute, nextPeriod))
  }

  const handleSelectHour = (nextHour) => {
    if (!isHourAllowed(nextHour, period, min)) return

    const nextMinute = isTimeSlotAllowed(nextHour, minute, period, min)
      ? minute
      : TIME_PICKER_MINUTES.find((candidate) =>
          isTimeSlotAllowed(nextHour, candidate, period, min)
        ) ?? minute

    commit(nextHour, nextMinute, period)
  }

  const handleSelectMinute = (nextMinute) => {
    if (!isTimeSlotAllowed(hour12, nextMinute, period, min)) return
    commit(hour12, nextMinute, period)
  }

  const handleSelectPeriod = (nextPeriod) => {
    if (!isPeriodAllowed(nextPeriod, min)) return

    const nextHour = isHourAllowed(hour12, nextPeriod, min)
      ? hour12
      : TIME_PICKER_HOURS.find((candidate) =>
          isHourAllowed(candidate, nextPeriod, min)
        ) ?? hour12

    const nextMinute = isTimeSlotAllowed(nextHour, minute, nextPeriod, min)
      ? minute
      : TIME_PICKER_MINUTES.find((candidate) =>
          isTimeSlotAllowed(nextHour, candidate, nextPeriod, min)
        ) ?? minute

    commit(nextHour, nextMinute, nextPeriod)
  }

  return (
    <div className="time-picker" ref={containerRef}>
      <button
        type="button"
        className="time-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span
          className={value ? 'time-picker-value' : 'time-picker-placeholder'}
        >
          {value ? formatTimeValue(value) : placeholder}
        </span>
      </button>

      {isOpen && (
        <div className="time-picker-popover" role="dialog" aria-label="Select a time">
          <div className="time-picker-columns">
            <div className="time-picker-column-group">
              <p className="time-picker-column-label">Hour</p>
              <div className="time-picker-column">
                {TIME_PICKER_HOURS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    data-column="hour"
                    className={[
                      'time-picker-option',
                      option === hour12 && parsed && 'is-selected',
                      option === hour12 && !parsed && 'is-default',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={!isHourAllowed(option, period, min)}
                    onClick={() => handleSelectHour(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="time-picker-column-group">
              <p className="time-picker-column-label">Min</p>
              <div className="time-picker-column">
                {TIME_PICKER_MINUTES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    data-column="minute"
                    className={[
                      'time-picker-option',
                      option === minute && parsed && 'is-selected',
                      option === minute && !parsed && 'is-default',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={!isTimeSlotAllowed(hour12, option, period, min)}
                    onClick={() => handleSelectMinute(option)}
                  >
                    {String(option).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>

            <div className="time-picker-column-group">
              <p className="time-picker-column-label">&nbsp;</p>
              <div className="time-picker-column">
                {TIME_PICKER_PERIODS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    data-column="period"
                    className={[
                      'time-picker-option',
                      option === period && parsed && 'is-selected',
                      option === period && !parsed && 'is-default',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={!isPeriodAllowed(option, min)}
                    onClick={() => handleSelectPeriod(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="time-picker-footer">
            <button
              type="button"
              className="time-picker-done"
              onClick={() => setIsOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}

      <input type="hidden" name={name} value={value} readOnly />
    </div>
  )
}

export default TimePicker
