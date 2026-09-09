import { useEffect, useState } from 'react'

// Returns `value`, but only after it hasn't changed for `delayMs` —
// used on the place search input so fast typing doesn't recompute (or,
// in the future, refetch) on every keystroke.
export function useDebouncedValue(value, delayMs) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debouncedValue
}
