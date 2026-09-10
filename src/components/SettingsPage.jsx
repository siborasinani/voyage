import { useRef, useState } from 'react'
import { CURRENCIES } from '../utils/budget'
import CategorySelect from './CategorySelect'

// Settings — reached only from Profile (see ProfilePage.jsx's own
// "Settings" action), never a top-level navbar destination. Only ever
// rendered while signed in — App.jsx shows its own auth-gated empty
// state for a signed-out visitor, same pattern as Profile/Friends, so
// there's no requireAuth plumbing in here.
//
// Phase 1 gave this page Account (read-only email), Account Actions
// (Sign out), and Danger Zone (Delete account) — the two account
// actions relocated verbatim from Profile. Phase 3 added Change
// password. Phase 4 (this one) adds Preferences — a single Default
// currency selector, `CURRENCIES` reused as-is from utils/budget.js
// (the exact list SetBudget.jsx's own currency picker already uses,
// not a second list). Every earlier section's own props/behavior is
// completely untouched by this addition.
function SettingsPage({
  currentUser,
  onBack,
  onVerifyCurrentPassword,
  onUpdatePassword,
  authError,
  onClearAuthError,
  defaultCurrency,
  onUpdateDefaultCurrency,
  onSignOutClick,
  onDeleteAccountClick,
  deleteAccountError,
}) {
  const passwordFormRef = useRef(null)
  const [passwordFieldError, setPasswordFieldError] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordChanged, setPasswordChanged] = useState(false)

  // Only ever holds a value while a save is actually in flight (or has
  // just failed) — the instant it resolves, this clears back to `null`
  // and `displayedCurrency` below falls back to the `defaultCurrency`
  // prop itself, which by then either already reflects the new value
  // (App.jsx only updates it once Supabase confirms the write — see
  // its own handleUpdateDefaultCurrency) or was never touched at all
  // (a failed save). That's the entire mechanism behind "never pretend
  // it saved" below — there's no separate revert step because the
  // authoritative value is never optimistically overwritten in the
  // first place, only *displayed* optimistically while the request is
  // still pending.
  const [pendingCurrency, setPendingCurrency] = useState(null)
  const [currencyError, setCurrencyError] = useState('')
  const [currencySaved, setCurrencySaved] = useState(false)
  const displayedCurrency = pendingCurrency ?? defaultCurrency ?? 'USD'

  const handleChangeCurrency = async (nextCurrency) => {
    setPendingCurrency(nextCurrency)
    setCurrencyError('')
    setCurrencySaved(false)

    const result = await onUpdateDefaultCurrency(nextCurrency)
    setPendingCurrency(null)

    if (result.success) {
      setCurrencySaved(true)
    } else {
      setCurrencyError(
        result.error || "Couldn't save your default currency. Please try again."
      )
    }
  }

  // A valid session alone doesn't prove the person at the keyboard
  // actually knows the account's *current* password (someone walking up
  // to an already-signed-in, unattended browser could otherwise set a
  // new one with no proof of the old) — so this re-authenticates with
  // exactly the current-password field first, via the same `signIn`
  // every normal sign-in already uses (`onVerifyCurrentPassword`, wired
  // to `auth.signIn` in App.jsx — not a new auth call of any kind).
  // Only once that succeeds does this call `onUpdatePassword`
  // (`auth.updatePassword`, the same helper Phase 2's recovery flow
  // already added to useAuth.js and uses unchanged). Re-authenticating
  // as the same already-signed-in user is inert for the rest of the
  // app: `App.jsx`'s trips/notifications effects are keyed on the
  // user's id, which never changes here, so neither re-fires.
  const handleChangePassword = async (event) => {
    event.preventDefault()
    if (isChangingPassword) return

    const formData = new FormData(event.target)
    const currentPassword = formData.get('currentPassword')
    const newPassword = formData.get('newPassword')
    const confirmPassword = formData.get('confirmPassword')

    setPasswordChanged(false)

    if (!currentPassword) {
      setPasswordFieldError('Enter your current password.')
      return
    }

    if (!newPassword) {
      setPasswordFieldError('Enter a new password.')
      return
    }

    if (newPassword.length < 6) {
      setPasswordFieldError('New password must be at least 6 characters.')
      return
    }

    if (!confirmPassword) {
      setPasswordFieldError('Confirm your new password.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordFieldError("New passwords don't match.")
      return
    }

    setPasswordFieldError('')
    onClearAuthError()
    setIsChangingPassword(true)

    const verifyResult = await onVerifyCurrentPassword(currentUser.email, currentPassword)
    if (!verifyResult.success) {
      // `authError` (parent-owned, rendered below) now holds Supabase's
      // own message for a wrong current password — the same "Invalid
      // login credentials" wording a failed sign-in already shows
      // elsewhere, never a fabricated one, and never anything more
      // specific than that.
      setIsChangingPassword(false)
      return
    }

    const updateResult = await onUpdatePassword(newPassword)
    setIsChangingPassword(false)

    if (updateResult.success) {
      passwordFormRef.current?.reset()
      setPasswordChanged(true)
    }
  }

  return (
    <main className="profile-page">
      <button className="back-button" onClick={onBack}>
        ← Back to profile
      </button>

      <section className="profile-header">
        <p className="eyebrow">SETTINGS</p>
        <h1>Settings</h1>
      </section>

      <section className="profile-info-section">
        <div className="section-heading">
          <div>
            <p className="section-label">ACCOUNT</p>
            <h2>Your account</h2>
          </div>
        </div>

        <div className="profile-info-card">
          <div className="profile-info-row">
            <p className="profile-info-label">EMAIL</p>
            <p className="profile-info-value">{currentUser.email}</p>
          </div>
        </div>
      </section>

      <section className="profile-info-section">
        <div className="section-heading">
          <div>
            <p className="section-label">SECURITY</p>
            <h2>Change your password</h2>
          </div>
        </div>

        <div className="profile-info-card">
          <form
            className="settings-password-form"
            ref={passwordFormRef}
            onSubmit={handleChangePassword}
            noValidate
          >
            <label>
              Current password
              <input name="currentPassword" type="password" placeholder="Your current password" required />
            </label>

            <label>
              New password
              <input
                name="newPassword"
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

            {passwordFieldError && <p className="form-error">{passwordFieldError}</p>}
            {authError && <p className="form-error">{authError}</p>}
            {passwordChanged && (
              <p className="confirm-dialog-message">Your password has been updated.</p>
            )}

            <button
              className="primary-button submit-button"
              type="submit"
              disabled={isChangingPassword}
            >
              {isChangingPassword ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </section>

      <section className="profile-info-section">
        <div className="section-heading">
          <div>
            <p className="section-label">PREFERENCES</p>
            <h2>Default currency</h2>
          </div>
        </div>

        {/* `profile-info-card--currency` on top of the usual
            `profile-info-card` — this one card's own opened
            CategorySelect menu needs to float free of the card's
            rounded-corner `overflow: hidden` (see that rule's own
            comment in App.css); every other `.profile-info-card`
            elsewhere on Profile/Settings keeps that clipping exactly
            as before. */}
        <div className="profile-info-card profile-info-card--currency">
          <div className="profile-info-row">
            <p className="profile-info-label">DEFAULT CURRENCY</p>
            <CategorySelect
              name="defaultCurrency"
              value={displayedCurrency}
              onChange={handleChangeCurrency}
              options={CURRENCIES}
            />

            {currencyError && <p className="form-error">{currencyError}</p>}
            {currencySaved && <p className="confirm-dialog-message">Saved.</p>}
          </div>
        </div>
      </section>

      <section className="profile-actions-section">
        <div className="section-heading">
          <div>
            <p className="section-label">ACCOUNT ACTIONS</p>
            <h2>Manage account</h2>
          </div>
        </div>

        <div className="profile-actions">
          <button type="button" className="secondary-button" onClick={onSignOutClick}>
            Sign out
          </button>
        </div>
      </section>

      <section className="profile-danger-section">
        <div className="section-heading">
          <div>
            <p className="section-label">DANGER ZONE</p>
            <h2>Delete account</h2>
          </div>
        </div>

        <div className="profile-danger-card">
          {deleteAccountError && <p className="form-error">{deleteAccountError}</p>}
          <p>
            Permanently deletes your Voyage account, profile, and
            friendships. Any trips you own are deleted too, along with
            their itinerary, saved places, and expenses. This can't be
            undone.
          </p>

          <button type="button" className="destructive-button" onClick={onDeleteAccountClick}>
            Delete account
          </button>
        </div>
      </section>
    </main>
  )
}

export default SettingsPage
