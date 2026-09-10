import { useState } from 'react'
import { isUsernameAvailable } from '../services/profilesRepository'
import { getUsernameError, normalizeUsername } from '../utils/profile'

// A plausibility check, not an RFC 5322 validator — this can only ever
// catch obviously malformed/fake-looking addresses (no @, an empty
// local part or domain, a domain with no TLD, stray whitespace,
// consecutive/leading/trailing dots), never confirm a mailbox actually
// exists (that needs a real confirmation email, which Supabase's own
// signup flow already sends separately — see handleSubmit's own
// `confirmationSent` handling below). Local to this file, unlike
// getUsernameError: nothing else in the app needs to reuse this, same
// as the last-name length check right above it in handleSubmit.
// `email` must already be trimmed by the caller.
function getEmailError(email) {
  if (!/\s/.test(email)) {
    const atParts = email.split('@')

    if (atParts.length === 2) {
      const [localPart, domain] = atParts
      const domainSegments = domain.split('.')

      const hasValidStructure =
        localPart &&
        domain &&
        !localPart.includes('..') &&
        !localPart.startsWith('.') &&
        !localPart.endsWith('.') &&
        domainSegments.length >= 2 &&
        domainSegments.every(Boolean)

      // A broad, deliberately permissive character allow-list — just
      // enough to reject stray characters a real email never has,
      // while still accepting the common, legitimate shapes this was
      // tested against (a dotted local part, plus-addressing like
      // "test+voyage@example.com", multi-segment domains like
      // "university.edu").
      const allowedLocalPart = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/
      const allowedDomainSegment = /^[A-Za-z0-9-]+$/

      if (
        hasValidStructure &&
        allowedLocalPart.test(localPart) &&
        domainSegments.every((segment) => allowedDomainSegment.test(segment))
      ) {
        return ''
      }
    }
  }

  return 'Please enter a valid email address.'
}

// Sign in / sign up / password recovery modal — one form, one mode
// switch, following the same modal/form conventions as CreateTrip.jsx
// (modal-overlay > modal > modal-header + <form>) rather than
// introducing a new pattern. 'recover' is a third mode alongside the
// original 'sign-in'/'sign-up' — reachable only from 'sign-in' (via
// the "Forgot password?" link next to the Password field, hidden on
// sign-up per its own product spec), never its own separate dialog.
function AuthDialog({
  isSupabaseConfigured,
  authError,
  onClose,
  onSignIn,
  onSignUp,
  onResetPassword,
  initialMode = 'sign-in',
}) {
  // 'sign-in' | 'sign-up' | 'recover' — `initialMode` (App.jsx's
  // `authDialogMode`) only matters at the moment this mounts, since
  // this whole dialog is conditionally rendered and remounts fresh
  // every time it opens (see App.jsx's `openAuthDialog`); it lets
  // ResetPasswordPage's "Request a new link" open straight into
  // recover mode instead of making that user re-click "Forgot
  // password?" a second time right after already hitting an expired
  // one.
  const [mode, setMode] = useState(initialMode)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)
  // Whether a password-reset request was just submitted — gates the
  // recover form vs. its own generic confirmation message (see
  // handleRecoverSubmit's own comment on why that message is always
  // the same regardless of whether the email actually matches an
  // account).
  const [resetEmailSent, setResetEmailSent] = useState(false)
  // Client-side "this field is required" — kept separate from
  // `authError` (Supabase's own, server-side response) since this one
  // never even reaches the network.
  const [fieldError, setFieldError] = useState('')

  const isSignUp = mode === 'sign-up'
  const isRecover = mode === 'recover'

  // The one place `mode` ever changes — always resets the two pieces of
  // local, mode-specific state that would otherwise read as stale in
  // the newly-entered mode (a leftover field error from the previous
  // form, or the recover form's own "email sent" confirmation still
  // showing the next time "Forgot password?" is clicked).
  const switchMode = (nextMode) => {
    setMode(nextMode)
    setFieldError('')
    setResetEmailSent(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!isSupabaseConfigured || isSubmitting) return

    const formData = new FormData(event.target)
    const firstName = (formData.get('firstName') || '').trim()
    const lastName = (formData.get('lastName') || '').trim()
    const username = normalizeUsername(formData.get('username'))
    const email = (formData.get('email') || '').trim()
    const password = formData.get('password')

    if (isSignUp && !firstName) {
      setFieldError('Enter your first name.')
      return
    }

    if (isSignUp && !lastName) {
      setFieldError('Enter your last name.')
      return
    }

    // `lastName` is already trimmed above, so " A " and "A" are
    // already the same thing by the time this runs — trimming first,
    // then checking length, is what actually prevents padding a
    // single real character with whitespace to slip past this.
    if (isSignUp && lastName.length < 2) {
      setFieldError('Last name must be at least 2 characters.')
      return
    }

    if (isSignUp) {
      const usernameError = getUsernameError(username)
      if (usernameError) {
        setFieldError(usernameError)
        return
      }
    }

    if (!email) {
      setFieldError('Enter your email.')
      return
    }

    // Sign-up only, run before ever attempting the real Supabase
    // signup call below — sign-in's own email handling is untouched
    // (a previously-accepted account email should still be able to
    // sign in exactly as before; this only ever gates *new* accounts).
    if (isSignUp) {
      const emailError = getEmailError(email)
      if (emailError) {
        setFieldError(emailError)
        return
      }
    }

    if (!password) {
      setFieldError('Enter your password.')
      return
    }

    setFieldError('')

    // A best-effort pre-check only, ahead of ever attempting signup —
    // see profilesRepository.js's own comment on why the real
    // authority is the database's unique index, not this. Skipped
    // entirely if it fails to load (a network hiccup) rather than
    // blocking signup on a check that isn't the actual authority
    // anyway — the unique index still catches a genuine duplicate
    // either way, just without this early, friendlier message.
    if (isSignUp) {
      setIsSubmitting(true)
      try {
        const available = await isUsernameAvailable(username)
        if (!available) {
          setIsSubmitting(false)
          setFieldError('Username is already taken.')
          return
        }
      } catch {
        // Fall through to the real signup attempt below.
      }
      setIsSubmitting(false)
    }

    setIsSubmitting(true)
    const result = isSignUp
      ? await onSignUp(email, password, {
          display_name: `${firstName} ${lastName}`,
          username,
        })
      : await onSignIn(email, password)
    setIsSubmitting(false)

    if (!result.success) return
    if (isSignUp && !result.data?.session) {
      // A project with email confirmation on has no session yet at
      // this point — checked via the actual response, not assumed,
      // since a project with confirmation *off* (or an already-
      // confirmed re-signup) gets a real session back immediately and
      // should close straight away instead of claiming one's needed.
      setConfirmationSent(true)
      return
    }
    onClose()
  }

  // Deliberately shows the exact same outcome (`resetEmailSent`)
  // whether or not `email` actually belongs to a Voyage account —
  // Supabase's own `resetPasswordForEmail` already never reveals that
  // either way (it resolves the same way regardless), so this only
  // needs to not accidentally undo that by wording a *request-level*
  // failure any differently than a genuine send. A real failure here
  // (network, rate-limited) still surfaces through the normal
  // `authError` path below the form — never a fabricated "no account
  // with that email" message, since Supabase never produces one to
  // begin with.
  const handleRecoverSubmit = async (event) => {
    event.preventDefault()
    if (!isSupabaseConfigured || isSubmitting) return

    const formData = new FormData(event.target)
    const email = formData.get('email')

    if (!email) {
      setFieldError('Enter your email.')
      return
    }

    setFieldError('')
    setIsSubmitting(true)
    const result = await onResetPassword(email)
    setIsSubmitting(false)

    if (result.success) setResetEmailSent(true)
  }

  const sectionLabel = isRecover ? 'RESET PASSWORD' : isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'
  const heading = isRecover ? 'Reset your password' : isSignUp ? 'Create your account' : 'Welcome back'

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <p className="section-label">{sectionLabel}</p>
            <h2>{heading}</h2>
          </div>

          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        {!isSupabaseConfigured ? (
          <p className="form-error">
            Accounts aren't set up yet — add VITE_SUPABASE_URL and
            VITE_SUPABASE_ANON_KEY to your local .env file (see
            .env.example). Everything else in Voyage works fine without
            this.
          </p>
        ) : isRecover ? (
          resetEmailSent ? (
            <>
              <p className="confirm-dialog-message">
                If an account exists for that email, we've sent a
                password reset link. Check your inbox to continue.
              </p>

              <button
                type="button"
                className="secondary-button auth-mode-toggle"
                onClick={() => switchMode('sign-in')}
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              <form onSubmit={handleRecoverSubmit} noValidate>
                <label>
                  Email
                  <input name="email" type="email" placeholder="you@example.com" required />
                </label>

                {fieldError && <p className="form-error">{fieldError}</p>}
                {authError && <p className="form-error">{authError}</p>}

                <button className="primary-button submit-button" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <button
                type="button"
                className="secondary-button auth-mode-toggle"
                onClick={() => switchMode('sign-in')}
              >
                Back to sign in
              </button>
            </>
          )
        ) : confirmationSent ? (
          <p className="confirm-dialog-message">
            Check your email to confirm your account, then sign in.
          </p>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {isSignUp && (
              <div className="date-row">
                <label>
                  First name
                  <input name="firstName" type="text" placeholder="Ada" required />
                </label>

                <label>
                  Last name
                  <input name="lastName" type="text" placeholder="Lovelace" required />
                </label>
              </div>
            )}

            {isSignUp && (
              <label>
                Username
                <input
                  name="username"
                  type="text"
                  placeholder="adalovelace"
                  autoComplete="off"
                  required
                />
              </label>
            )}

            <label>
              Email
              <input name="email" type="email" placeholder="you@example.com" required />
            </label>

            <label>
              {/* Same "label text on the left, a quiet action on the
                  right" row .profile-info-value-row already established
                  for Profile's Display Name/Edit — reused verbatim, not
                  a new layout. Sign-up only: forgotten passwords are a
                  sign-*in* concern, per this feature's own spec. */}
              <div className="profile-info-value-row">
                <span>Password</span>
                {!isSignUp && (
                  <button
                    type="button"
                    className="profile-avatar-link"
                    onClick={() => switchMode('recover')}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                name="password"
                type="password"
                placeholder={isSignUp ? 'At least 6 characters' : 'Your password'}
                minLength={6}
                required
              />
            </label>

            {fieldError && <p className="form-error">{fieldError}</p>}
            {authError && <p className="form-error">{authError}</p>}

            <button className="primary-button submit-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>
        )}

        {isSupabaseConfigured && !confirmationSent && !isRecover && (
          <button
            type="button"
            className="secondary-button auth-mode-toggle"
            onClick={() => switchMode(isSignUp ? 'sign-in' : 'sign-up')}
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        )}
      </div>
    </div>
  )
}

export default AuthDialog
