import { useEffect, useState } from 'react'

// Landed on only one way: the link Supabase's own `resetPasswordForEmail`
// emails out (see useAuth.js's `redirectTo` and utils/routing.js's own
// comment on why `/reset-password` has to exist as a real, cold-load-
// safe URL). Never reachable via in-app navigation — there's no button
// anywhere in Voyage that routes here directly; AuthDialog's own
// recover-mode "Back to sign in"/generic "email sent" message is the
// entire in-app side of this feature (see AuthDialog.jsx).
//
// `isPasswordRecovery` (from useAuth.js) is the one true signal this
// page trusts — never `Boolean(user)` alone, since a valid recovery
// link *does* establish a genuine, otherwise-ordinary session (that's
// what lets `auth.updateUser({ password })` succeed at all), which
// would make an already-signed-in user who simply typed this URL in
// look identical to a real recovery visit if `user` were the check
// instead.
//
// `hasWaited` exists purely to avoid a false "this link is invalid"
// flash: Supabase's client parses the recovery token out of the URL
// asynchronously (`detectSessionInUrl: true`), and the `PASSWORD_
// RECOVERY` event that sets `isPasswordRecovery` can arrive a beat
// after `isLoadingSession` itself has already resolved. Waiting a
// short, fixed grace period before ever concluding "invalid" gives
// that event a fair chance to arrive first; it's irrelevant the
// instant `isPasswordRecovery` actually turns true, whichever comes
// first.
function ResetPasswordPage({
  isLoadingSession,
  isPasswordRecovery,
  authError,
  onUpdatePassword,
  onClearAuthError,
  onGoToDashboard,
  onRequestNewLink,
}) {
  const [hasWaited, setHasWaited] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  useEffect(() => {
    onClearAuthError()
    const timer = setTimeout(() => setHasWaited(true), 400)
    return () => clearTimeout(timer)
    // Mount-only — clearing any stale authError from an earlier,
    // unrelated auth action in this same tab, and starting the one
    // grace-period timer this page ever needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const status = isPasswordRecovery
    ? isSuccess
      ? 'success'
      : 'ready'
    : isLoadingSession || !hasWaited
      ? 'checking'
      : 'invalid'

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isSubmitting) return

    const formData = new FormData(event.target)
    const password = formData.get('password')
    const confirmPassword = formData.get('confirmPassword')

    if (!password) {
      setFieldError('Enter a new password.')
      return
    }

    if (password.length < 6) {
      setFieldError('Password must be at least 6 characters.')
      return
    }

    if (!confirmPassword) {
      setFieldError('Confirm your new password.')
      return
    }

    if (password !== confirmPassword) {
      setFieldError("Passwords don't match.")
      return
    }

    setFieldError('')
    setIsSubmitting(true)
    const result = await onUpdatePassword(password)
    setIsSubmitting(false)

    if (result.success) setIsSuccess(true)
    // On failure, `authError` (set by the same runAuthAction path every
    // other auth call in this app already uses) renders below the form
    // — no separate error state needed here.
  }

  const heading =
    status === 'success' ? 'Password updated' : status === 'invalid' ? 'Link expired' : 'Reset your password'

  return (
    <main className="reset-password-page">
      <div className="modal">
        <div className="modal-header">
          <div>
            <p className="section-label">RESET PASSWORD</p>
            <h2>{heading}</h2>
          </div>
        </div>

        {status === 'checking' && (
          <p className="confirm-dialog-message">Checking your link…</p>
        )}

        {status === 'invalid' && (
          <>
            <p className="confirm-dialog-message">
              This password reset link is invalid or has expired. Reset
              links only work for a short time, and only once.
            </p>
            <button
              type="button"
              className="primary-button submit-button"
              onClick={onRequestNewLink}
            >
              Request a new link
            </button>
          </>
        )}

        {status === 'success' && (
          <>
            <p className="confirm-dialog-message">
              Your password has been updated. You're still signed in —
              pick up right where you left off.
            </p>
            <button
              type="button"
              className="primary-button submit-button"
              onClick={onGoToDashboard}
            >
              Continue to your trips
            </button>
          </>
        )}

        {status === 'ready' && (
          <form onSubmit={handleSubmit} noValidate>
            <label>
              New password
              <input
                name="password"
                type="password"
                placeholder="At least 6 characters"
                minLength={6}
                required
              />
            </label>

            <label>
              Confirm new password
              <input
                name="confirmPassword"
                type="password"
                placeholder="Re-enter your new password"
                minLength={6}
                required
              />
            </label>

            {fieldError && <p className="form-error">{fieldError}</p>}
            {authError && <p className="form-error">{authError}</p>}

            <button
              className="primary-button submit-button"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}

export default ResetPasswordPage
