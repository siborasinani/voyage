import { useEffect, useRef, useState } from 'react'
import { parseDateInput, getTodayInputValue } from '../utils/itinerary'
import {
  MONTH_NAMES,
  WEEKDAY_LABELS,
  formatDateLabel,
  getCalendarGrid,
  toDateInputValue,
} from '../utils/date'

const POPOVER_WIDTH = 300
const POPOVER_PREFERRED_HEIGHT = 380
const POPOVER_MIN_HEIGHT = 220
const GAP_FROM_TRIGGER = 8
const VIEWPORT_MARGIN = 12

// Figures out where the popover should render (below or above the
// trigger, and how tall it's allowed to be) from the trigger's actual
// position and the current viewport size, so it always fits on screen
// instead of ever being cut off — flipping to whichever side has more
// room, and shrinking (with its own internal scroll) if neither side
// has enough space for the full calendar.
function computePopoverStyle(anchorRect) {
  const viewportHeight = window.innerHeight
  const viewportWidth = window.innerWidth

  const spaceBelow = viewportHeight - anchorRect.bottom - GAP_FROM_TRIGGER - VIEWPORT_MARGIN
  const spaceAbove = anchorRect.top - GAP_FROM_TRIGGER - VIEWPORT_MARGIN

  const openUpward = spaceBelow < POPOVER_PREFERRED_HEIGHT && spaceAbove > spaceBelow

  const maxHeight = Math.max(
    POPOVER_MIN_HEIGHT,
    Math.min(POPOVER_PREFERRED_HEIGHT, openUpward ? spaceAbove : spaceBelow)
  )

  const width = Math.min(POPOVER_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2)
  const maxLeft = viewportWidth - VIEWPORT_MARGIN - width
  const left = Math.min(Math.max(anchorRect.left, VIEWPORT_MARGIN), Math.max(maxLeft, VIEWPORT_MARGIN))

  return {
    left,
    width,
    maxHeight,
    ...(openUpward
      ? { bottom: viewportHeight - anchorRect.top + GAP_FROM_TRIGGER }
      : { top: anchorRect.bottom + GAP_FROM_TRIGGER }),
  }
}

// A compact, custom-styled calendar replacing the browser's native
// <input type="date">. Stores/emits a "YYYY-MM-DD" string — the same
// format trips already use — via `onChange`, so this is a drop-in swap
// wherever a date input was used before. Optional `min`/`max` (also
// "YYYY-MM-DD") disable any day outside that range directly on its
// calendar button, rather than allowing the pick and flagging it after.
function DatePicker({ name, value, onChange, min, max, placeholder = 'Select date' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState(null)
  const [viewYear, setViewYear] = useState(() => (parseDateInput(value || min || getTodayInputValue())).getFullYear())
  const [viewMonth, setViewMonth] = useState(() => (parseDateInput(value || min || getTodayInputValue())).getMonth())
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

    const handleReposition = () => {
      if (containerRef.current) {
        setPopoverStyle(computePopoverStyle(containerRef.current.getBoundingClientRect()))
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
    }
  }, [isOpen])

  // Open on whichever month is most relevant: the selected date, else
  // the `min` boundary, else today. Position/size are computed here too
  // (rather than in an effect keyed on `isOpen`) so opening the
  // calendar is a single state update, not a render followed by a
  // setState-triggered re-render.
  const openCalendar = () => {
    const anchor = parseDateInput(value || min || getTodayInputValue())
    setViewYear(anchor.getFullYear())
    setViewMonth(anchor.getMonth())
    if (containerRef.current) {
      setPopoverStyle(computePopoverStyle(containerRef.current.getBoundingClientRect()))
    }
    setIsOpen(true)
  }

  const goToPreviousMonth = () => {
    setViewMonth((month) => {
      if (month === 0) {
        setViewYear((year) => year - 1)
        return 11
      }
      return month - 1
    })
  }

  const goToNextMonth = () => {
    setViewMonth((month) => {
      if (month === 11) {
        setViewYear((year) => year + 1)
        return 0
      }
      return month + 1
    })
  }

  const handleSelectDate = (dateValue, disabled) => {
    if (disabled) return
    onChange(dateValue)
    setIsOpen(false)
  }

  const todayValue = getTodayInputValue()
  const cells = getCalendarGrid(viewYear, viewMonth)

  return (
    <div className="date-picker" ref={containerRef}>
      <button
        type="button"
        className="date-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? setIsOpen(false) : openCalendar())}
      >
        <span className={value ? 'date-picker-value' : 'date-picker-placeholder'}>
          {value ? formatDateLabel(value) : placeholder}
        </span>
      </button>

      {isOpen && (
        <div
          className="date-picker-popover"
          style={popoverStyle ?? undefined}
          role="dialog"
          aria-label="Select a date"
        >
          <div className="date-picker-header">
            <button
              type="button"
              className="date-picker-nav"
              onClick={goToPreviousMonth}
              aria-label="Previous month"
            >
              ‹
            </button>

            <p className="date-picker-month-label">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </p>

            <button
              type="button"
              className="date-picker-nav"
              onClick={goToNextMonth}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="date-picker-weekdays">
            {WEEKDAY_LABELS.map((label, index) => (
              <span key={`${label}-${index}`} className="date-picker-weekday">
                {label}
              </span>
            ))}
          </div>

          <div className="date-picker-grid-scroll">
            <div className="date-picker-grid">
              {cells.map(({ date, isCurrentMonth }) => {
                const dateValue = toDateInputValue(date)
                const disabled = Boolean(
                  (min && dateValue < min) || (max && dateValue > max)
                )
                const isSelected = value === dateValue
                const isToday = dateValue === todayValue

                return (
                  <button
                    key={dateValue}
                    type="button"
                    className={[
                      'date-picker-day',
                      !isCurrentMonth && 'is-outside-month',
                      isSelected && 'is-selected',
                      isToday && !isSelected && 'is-today',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={disabled}
                    onClick={() => handleSelectDate(dateValue, disabled)}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <input type="hidden" name={name} value={value} readOnly />
    </div>
  )
}

export default DatePicker
