import { useEffect, useRef, useState } from 'react'
import { useDebouncedValue } from '../utils/useDebouncedValue'
import { autocompleteCity } from '../services/geoapify'

const MIN_QUERY_LENGTH = 2
const AUTOCOMPLETE_DEBOUNCE_MS = 300

// A destination field with live city suggestions as the user types
// (Geoapify's Autocomplete API), while still supporting a direct submit
// of whatever's typed (resolved by the caller via geocoding) if the
// user doesn't pick one.
function DestinationSearch({ onSearch, onSelectSuggestion, placeholder }) {
  const [query, setQuery] = useState('')
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
    // left in state here.
    if (trimmed.length < MIN_QUERY_LENGTH) return

    const requestId = (requestIdRef.current += 1)
    // Legitimate loading-flag pattern for a debounced, effect-driven
    // fetch — there's no user event to hang this off of instead.
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

  const closeSuggestions = () => {
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  const handleSelectSuggestion = (suggestion) => {
    setQuery('')
    setSuggestions([])
    closeSuggestions()
    onSelectSuggestion(suggestion)
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (isOpen && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
      handleSelectSuggestion(suggestions[highlightedIndex])
      return
    }

    if (!query.trim()) return
    closeSuggestions()
    onSearch(query)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      closeSuggestions()
      return
    }

    if (!isOpen || suggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((index) => Math.min(index + 1, suggestions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((index) => Math.max(index - 1, 0))
    }
  }

  const showSuggestions = isOpen && query.trim().length >= MIN_QUERY_LENGTH
  // True for the whole gap between a keystroke and a settled result —
  // both while the debounce timer is still waiting (debouncedQuery
  // hasn't caught up to query yet) and while the request itself is in
  // flight. Without this, the dropdown would briefly flash "No matching
  // cities" during the debounce window, since `suggestions` is still
  // whatever the previous (or initial, empty) result was.
  const isSearchPending =
    query.trim() !== debouncedQuery.trim() || isLoadingSuggestions

  return (
    <div className="destination-search" ref={containerRef}>
      <form className="destination-search-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="destination-search-input"
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setIsOpen(true)
            setHighlightedIndex(-1)
          }}
          onFocus={() => {
            if (query.trim().length >= MIN_QUERY_LENGTH) setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          aria-label="Search a city"
        />
        <button type="submit" className="destination-search-button">
          Search
        </button>
      </form>

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

export default DestinationSearch
