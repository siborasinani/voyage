import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// One-time cleanup of `voyage:trips` — the localStorage key an earlier
// version of the app used as its only trip storage, later as a
// migration source, and now not at all: Supabase is the sole source of
// truth for trip data, with no localStorage fallback or duplicate copy.
// Removing it here means old, no-longer-migratable local trip data
// (e.g. a trip already deleted from Supabase) can never resurface or be
// offered for migration again — deliberately discarded, not read by
// anything anymore. Only ever touches this one key: Supabase's own
// session storage and the unrelated Pexels image-pool cache are both
// left untouched. Wrapped in try/catch, matching how every other
// localStorage access in this app tolerates storage being disabled —
// failing to clean up an already-inert key should never block the app
// from starting.
try {
  window.localStorage.removeItem('voyage:trips')
} catch {
  // Ignore — see comment above.
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
