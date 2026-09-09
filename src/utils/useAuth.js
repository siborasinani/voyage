import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../services/supabase'

// Recognizes the rare-race outcome of a duplicate username slipping
// past AuthDialog.jsx's own pre-check (see signUp below).
//
// Confirmed live against the real project, not guessed: a direct
// fetch to Supabase's own /auth/v1/signup endpoint surfaces the raw
// Postgres error for this ("duplicate key value violates unique
// constraint \"profiles_username_idx\""), but supabase-js's client
// normalizes *any* 500 from that endpoint into one generic
// `AuthRetryableFetchError` with the message "Database error saving
// new user" — the specific Postgres detail never reaches the browser
// at all. That generic message is still a reliable signal today,
// though: handle_new_user() (0018_profile_usernames.sql) has exactly
// one way to fail — the username unique index — since its only other
// constraint (`id`, the primary key) is already handled by its own
// `on conflict (id) do nothing`. If handle_new_user() ever gains a
// second real failure mode, this would need to stop assuming "any
// generic database error at signup = a username conflict" — it isn't
// one going forward on its own, only true given today's trigger.
function isLikelyUsernameConflict(error) {
  const message = (error?.message || '').toLowerCase()
  return (
    message.includes('database error saving new user') ||
    message.includes('profiles_username') ||
    (message.includes('username') && (message.includes('taken') || message.includes('unique') || message.includes('duplicate')))
  )
}

// This hook is the one place App.jsx reads/drives auth state from,
// matching the app's existing "all state in App.jsx, passed down via
// props" convention (no Context provider introduced for this).
// Signed-out (or Supabase not configured at all) is still a fully
// supported, first-class state — Explore stays completely public with
// no account — but trip data itself is account-required: App.jsx's own
// `visibleTrips` is what actually enforces that a signed-out `user`
// (`null`) never has any trip data available, this hook just reports
// the auth state honestly either way.
export function useAuth() {
  // `undefined` while the initial session lookup is still in flight,
  // `null` once it's confirmed there's no session — kept distinct from
  // `isLoadingSession` below only so a consumer that just wants
  // "logged in or not" can treat undefined and null the same way via
  // `Boolean(user)`.
  const [session, setSession] = useState(null)
  const [isLoadingSession, setIsLoadingSession] = useState(isSupabaseConfigured)
  const [authError, setAuthError] = useState(null)
  // True once Supabase's client has actually confirmed a password-
  // recovery session — set only by the `PASSWORD_RECOVERY` event below,
  // never inferred from `session`/`user` alone. A recovery link *does*
  // establish a genuine, otherwise-normal session (that's how
  // `auth.updateUser({ password })` is allowed to work at all — see
  // ResetPasswordPage.jsx), so `Boolean(user)` on its own can't tell a
  // real recovery visit apart from an already-signed-in user who simply
  // navigated to `/reset-password` directly; this flag is what actually
  // does. Never reset back to `false` — once a recovery session is
  // established it stays true for the rest of that tab's lifetime,
  // which is fine: ResetPasswordPage is the only reader, and there's no
  // other view in the app whose behavior this could affect.
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  useEffect(() => {
    if (!supabase) return undefined

    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setIsLoadingSession(false)
    })

    // Fires on sign-in, sign-out, a token refresh, and — the one this
    // hook now also cares about — `PASSWORD_RECOVERY`, the instant
    // Supabase's client finishes parsing a valid recovery link's token
    // out of the URL (this app's `detectSessionInUrl: true`, already
    // set in services/supabase.js, is what makes that parsing happen at
    // all — no extra wiring needed here beyond reading the event name).
    // This (plus Supabase's own `persistSession: true`) is also what
    // makes a session survive a page refresh: the client reads it back
    // out of localStorage on load and this listener reflects that into
    // React state.
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (cancelled) return
      setSession(newSession)
      setIsLoadingSession(false)
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true)
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  // Returns the raw `data` (not just a success boolean) — a caller like
  // AuthDialog needs to tell "signed up, and already have a session"
  // apart from "signed up, but a project with email confirmation on
  // means there's no session yet", and `data.session` is the only
  // reliable way to know which actually happened (a truthy result from
  // signUp() alone doesn't say either way).
  // `transformError` (optional) lets one specific caller — signUp
  // below — turn a known, specific failure into a friendlier message
  // than whatever Supabase's own error text says; every other caller
  // omits it and keeps today's exact behavior (the raw
  // `error.message`, unchanged).
  const runAuthAction = async (action, transformError) => {
    setAuthError(null)
    const { data, error } = await action()
    if (error) {
      setAuthError(transformError ? transformError(error) : error.message)
      return { success: false }
    }
    return { success: true, data }
  }

  return {
    isSupabaseConfigured,
    isLoadingSession,
    session,
    user: session?.user ?? null,
    authError,
    clearAuthError: () => setAuthError(null),
    isPasswordRecovery,
    // `metadata` (e.g. `{ display_name }`) is stored on the auth user
    // itself (`raw_user_meta_data`) via Supabase's own `options.data` —
    // `handle_new_user()` (see 0001_init.sql) reads it back out when it
    // creates the matching `profiles` row, so no separate profile-write
    // call is needed here.
    // `metadata` now also carries `username` (already normalized —
    // see AuthDialog.jsx) alongside `display_name` — handle_new_user()
    // (0018_profile_usernames.sql) reads it into `profiles.username`
    // the same way it already reads `display_name`. AuthDialog.jsx's
    // own pre-check (profilesRepository.js's isUsernameAvailable)
    // catches the common "already taken" case before this is ever
    // called, but that check isn't the real authority — two people
    // submitting the same username at nearly the same instant could
    // both pass it. The unique index is: the losing signup's insert
    // into `profiles` fails inside handle_new_user()'s own trigger,
    // which rolls back that `auth.users` row too (no orphaned account
    // ever exists without a matching profile) and surfaces here as a
    // genuine `error` from signUp() itself — `isLikelyUsernameConflict`
    // recognizes that specific case so this rare race still gets the
    // same clean "already taken" message the common case does, rather
    // than a raw/generic database error.
    signUp: (email, password, metadata) =>
      runAuthAction(
        () => supabase.auth.signUp({ email, password, options: { data: metadata } }),
        (error) => (isLikelyUsernameConflict(error) ? 'Username is already taken.' : error.message)
      ),
    signIn: (email, password) =>
      runAuthAction(() => supabase.auth.signInWithPassword({ email, password })),
    // `options` is forwarded as-is to Supabase's own signOut — in
    // practice only ever `{ scope: 'local' }`, from
    // App.jsx's handleDeleteAccount: by the time that runs, the
    // account itself is already deleted server-side (see
    // services/profilesRepository.js's deleteOwnAccount), so there is
    // no server-side session left to invalidate — the default global
    // scope's own network call to /auth/v1/logout would just 403
    // ("user not found") for entirely expected reasons every time,
    // pure console noise with no effect on the outcome either way,
    // since this only ever needs to clear the *client's own local*
    // session state. A normal sign-out (ConfirmDialog's "Sign out?")
    // still calls this with no `options`, keeping its existing
    // (correct) global-scope behavior — that account still exists and
    // very much should have its session invalidated server-side too.
    signOut: (options) => runAuthAction(() => supabase.auth.signOut(options)),
    // Sends the recovery email via Supabase's own mechanism — no email
    // provider or Edge Function of this project's own; Supabase handles
    // delivery. `redirectTo` points back at this app's own
    // `/reset-password` route (see utils/routing.js) using the current
    // origin, so this works unmodified in dev, a preview deploy, or
    // production alike. Deliberately never reveals whether `email`
    // actually belongs to an account — this is Supabase's own designed
    // behavior (it resolves the same way either way), not something
    // this app adds; see AuthDialog.jsx's own comment on preserving
    // that at the UI layer too. The Supabase dashboard's Authentication
    // → URL Configuration must have this exact redirect URL allow-
    // listed for each deployed origin, same one-time setup every
    // Supabase auth redirect needs — not something app code can do.
    resetPasswordForEmail: (email) =>
      runAuthAction(() =>
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
      ),
    // Only ever meaningful with an active session — a normal signed-in
    // user changing their own known password would also go through
    // this (not built yet, see PROJECT_CONTEXT.md's Settings-phase
    // plan), and a password-recovery session (see `isPasswordRecovery`
    // above) is *also* a real session, which is exactly what lets
    // ResetPasswordPage.jsx call this the same way.
    updatePassword: (newPassword) =>
      runAuthAction(() => supabase.auth.updateUser({ password: newPassword })),
  }
}
