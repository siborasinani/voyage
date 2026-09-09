// Thin Supabase client setup — the one place `VITE_SUPABASE_URL`/
// `VITE_SUPABASE_ANON_KEY` are read, matching how services/geoapify.js
// and services/pexels.js each own their one API key. Only the anon
// (public) key ever belongs here: it's safe to ship to the browser by
// design, because Postgres Row Level Security is what actually enforces
// access control (see supabase/migrations/0001_init.sql) — the
// service_role key bypasses RLS entirely and must never appear in
// frontend code, so nothing in src/ should ever reference one.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// `null` when unconfigured (e.g. a fresh clone before .env is filled
// in), rather than throwing at import time — every other Voyage
// feature (Explore, trips, budget…) already works with zero backend
// configured, and accounts should degrade the same way: the auth UI
// shows a "not set up" state instead of crashing the whole app. See
// utils/useAuth.js and components/AuthDialog.jsx for how that's
// surfaced.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Supabase's own defaults already persist the session in
        // localStorage and refresh it automatically — spelled out
        // explicitly here so that behavior (session survives a
        // refresh, per this milestone's requirement) is documented,
        // not just relied on implicitly.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
