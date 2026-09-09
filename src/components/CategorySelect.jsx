import { useEffect, useRef, useState } from 'react'

// A compact, custom-styled dropdown standing in for a native <select>.
// Native <select> popups can't be restyled consistently across browsers
// (rounded corners, scrollable max-height, hover/selected states), so
// this renders its own listbox and mirrors the chosen value into a
// hidden input, keeping it a normal participant in the surrounding
// <form>'s FormData.
function CategorySelect({ name, value, onChange, options }) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef(null)

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

  useEffect(() => {
    if (!isOpen) return

    // Keep the currently selected option in view when the menu opens.
    const selectedOption = containerRef.current?.querySelector(
      '.category-select-option.is-selected'
    )
    selectedOption?.scrollIntoView({ block: 'nearest' })
  }, [isOpen])

  const openMenu = () => {
    setHighlightedIndex(Math.max(options.indexOf(value), 0))
    setIsOpen(true)
  }

  const handleSelect = (option) => {
    onChange(option)
    setIsOpen(false)
  }

  const handleKeyDown = (event) => {
    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        openMenu()
      }
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((index) => Math.min(index + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (highlightedIndex >= 0) handleSelect(options[highlightedIndex])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setIsOpen(false)
    }
  }

  return (
    <div className="category-select" ref={containerRef}>
      <button
        type="button"
        className="category-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
      >
        <span
          className={
            value ? 'category-select-value' : 'category-select-placeholder'
          }
        >
          {value || 'Select a category'}
        </span>
        <span className="category-select-chevron" aria-hidden="true">
          ⌄
        </span>
      </button>

      {isOpen && (
        <ul className="category-select-menu" role="listbox">
          {options.map((option, index) => (
            <li
              key={option}
              role="option"
              aria-selected={value === option}
              className={[
                'category-select-option',
                value === option && 'is-selected',
                index === highlightedIndex && 'is-highlighted',
              ]
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => {
                // Select (and close) on mousedown rather than click. This
                // fires — and finishes — before the document-level
                // mousedown listener below ever runs, so closing here
                // never depends on that outside-click handler.
                event.preventDefault()
                handleSelect(option)
              }}
              onClick={() => handleSelect(option)}
            >
              {option}
            </li>
          ))}
        </ul>
      )}

      <input type="hidden" name={name} value={value} readOnly />
    </div>
  )
}

export default CategorySelect
