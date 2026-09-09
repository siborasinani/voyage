// Voyage's own category labels for the Explore filters — kept as the
// single source of truth the UI renders, independent of whatever place
// data source (Geoapify or otherwise) is behind it. See
// services/geoapify.js for how each of these maps to real API
// categories.
export const EXPLORE_CATEGORIES = [
  'All',
  'Attractions',
  'Restaurants',
  'Cafes',
  'Museums',
  'Beaches',
  'Nature',
  'Shopping',
  'Nightlife',
]

// Shown as one-tap suggestions before a destination is picked. Not
// special-cased in any way — clicking one just calls the same
// geocode-then-search flow used for typed search and trip shortcuts.
export const RECOMMENDED_DESTINATIONS = ['Rome', 'Paris', 'Milan', 'London']
