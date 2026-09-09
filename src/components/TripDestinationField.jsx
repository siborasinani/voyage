import { useEffect, useRef, useState } from 'react'
import { useDebouncedValue } from '../utils/useDebouncedValue'
import { autocompleteCity } from '../services/geoapify'

const MIN_QUERY_LENGTH = 2
const AUTOCOMPLETE_DEBOUNCE_MS = 300

// The Create/Edit Trip destination field — real city suggestions via
// the same Geoapify Autocomplete API and debounce pattern
// DestinationSearch.jsx (Explore's own search bar) already
// established, reused here rather than a second integration. The
// shape is deliberately different, though, not a copy: this is one
// plain labeled form field (matching Trip name/every other CreateTrip
// field), not a standalone search-bar-with-button — and, the actual
// point of this component, there is no free-text-submit path at all.
// A trip's destination can only ever come from an actually-selected
// suggestion; DestinationSearch.jsx is deliberately left untouched,
// since Explore's own "search whatever I typed" behavior is a
// different, existing product decision this was never asked to
// change.
//
// This component owns its own typed-query/suggestion-list/dropdown
// state, but never decides whether the *form* can submit — that
// stays entirely with the caller (CreateTrip.jsx), via two callbacks:
// `onSelect(label)` fires with the composed "City, Country" string the
// moment a real suggestion is chosen; `onInvalidate()` fires the
// instant the visible text stops matching the most recently confirmed
// label (a fresh keystroke after picking one, or after `initialValue`
// while editing an existing trip) — CreateTrip.jsx treats that as "no
// longer a valid destination" and blocks submission again until a new
// suggestion is chosen.
function TripDestinationField({ initialValue, onSelect, onInvalidate }) {
  const [query, setQuery] = useState(initialValue || '')
  // Editing an existing trip starts already-valid (its current
  // destination counts as a confirmed selection with no re-picking
  // required) — only diverging from it invalidates. A brand-new trip
  // starts with nothing confirmed.
  const [confirmedLabel, setConfirmedLabel] = useState(initialValue || null)
  const [suggestions, setSuggestions] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)

  const containerRef = useRef(null)
  const requestIdRef = useRef(0)
  const debouncedQuery = useDebouncedValue(query, AUTOCOMPLETE_DEBOUNCE_MS)

  useEffect(() => {
    const trimmed = debouncedQuery.trim()

    // Below the minimum length, just don't fetch — the render below
    // already gates the dropdown on the live (non-debounced) query's
    // length, so stale suggestions never show regardless of what's
    // left in state here (same as DestinationSearch.jsx's own
    // identical effect).
    if (trimmed.length < MIN_QUERY_LENGTH) return

    const requestId = (requestIdRef.current += 1)
    // Legitimate loading-flag pattern for a debounced, effect-driven
    // fetch — same established precedent as DestinationSearch.jsx's
    // own identical effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingSuggestions(true)

    autocompleteCity(trimmed)
      .then((results) => {
        if (requestId !== requestIdRef.current) return // a newer query superseded this one
        setSuggestions(results)
        setIsLoadingSuggestions(false)
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return
        setSuggestions([])
        setIsLoadingSuggestions(false)
      })
  }, [debouncedQuery])

  useEffect(() => {
    if (!isOpen) return undefined

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleQueryChange = (nextQuery) => {
    setQuery(nextQuery)
    setIsOpen(true)
    setHighlightedIndex(-1)
    if (confirmedLabel && nextQuery !== confirmedLabel) {
      setConfirmedLabel(null)
      onInvalidate()
    }
  }

  const handleSelectSuggestion = (suggestion) => {
    const label = suggestion.country
      ? `${suggestion.label}, ${suggestion.country}`
      : suggestion.label
    setQuery(label)
    setConfirmedLabel(label)
    setSuggestions([])
    setIsOpen(false)
    setHighlightedIndex(-1)
    onSelect(label)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setIsOpen(false)
      return
    }

    if (!isOpen || suggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((index) => Math.min(index + 1, suggestions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && highlightedIndex >= 0) {
      // Choosing by keyboard shouldn't also submit the surrounding
      // form on this same Enter press.
      event.preventDefault()
      handleSelectSuggestion(suggestions[highlightedIndex])
    }
  }

  const showSuggestions = isOpen && query.trim().length >= MIN_QUERY_LENGTH
  // True for the whole gap between a keystroke and a settled result —
  // same reasoning as DestinationSearch.jsx's own isSearchPending.
  const isSearchPending = query.trim() !== debouncedQuery.trim() || isLoadingSuggestions

  return (
    <div className="trip-destination-field" ref={containerRef}>
      <input
        type="text"
        placeholder="Rome, Italy"
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        onFocus={() => {
          if (query.trim().length >= MIN_QUERY_LENGTH) setIsOpen(true)
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        aria-label="Destination"
      />

      {showSuggestions && (
        <div className="destination-search-suggestions" role="listbox">
          {isSearchPending ? (
            <p className="destination-search-empty">Searching…</p>
          ) : suggestions.length === 0 ? (
            <p className="destination-search-empty">No matching cities.</p>
          ) : (
            suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.lat},${suggestion.lon}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                className={
                  'destination-search-option' +
                  (index === highlightedIndex ? ' is-highlighted' : '')
                }
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => handleSelectSuggestion(suggestion)}
              >
                <span className="destination-search-option-primary">
                  {suggestion.primaryText}
                </span>
                {suggestion.secondaryText && (
                  <span className="destination-search-option-secondary">
                    {suggestion.secondaryText}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default TripDestinationField
