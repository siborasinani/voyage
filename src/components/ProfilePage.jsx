import { useEffect, useState } from 'react'
import { getFriendsCount } from '../services/friendsRepository'
import Avatar from './Avatar'
import EditProfile from './EditProfile'

// Only ever rendered while signed in — App.jsx shows its own auth-
// gated empty state for a signed-out visitor (same pattern as
// FriendsPage), so there's no requireAuth plumbing in here.
//
// The header avatar is clickable — the same "open EditProfile" action
// as the Display Name row's Edit button and the Account Actions "Edit
// profile" button, just reachable directly from the photo itself too
// (the most discoverable place to go looking for "change my photo").
// An earlier version of this page wired "Change photo"/"Remove photo"
// directly here as their own separate flow, disconnected from the
// existing Edit profile modal entirely; that's what made the photo
// preview and the name's own editability both read as broken — see
// EditProfile.jsx's own comment for the real fix. This click handler
// is not a return to that: it still only ever opens the one existing
// modal, never a second edit surface.
function ProfilePage({ currentUser, onGoToFriends, onGoToSettings }) {
  const displayName = currentUser.user_metadata?.display_name || ''
  const avatarUrl = currentUser.user_metadata?.avatar_url || ''
  const avatarFallback = currentUser.email.charAt(0).toUpperCase()

  const [friendsCount, setFriendsCount] = useState(null)
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    let cancelled = false
    getFriendsCount(currentUser.id)
      .then((count) => {
        if (!cancelled) setFriendsCount(count)
      })
      .catch(() => {
        // A failed count just means the summary link falls back to its
        // plain "View your friends" label below — never worth its own
        // error state on an account page.
      })
    return () => {
      cancelled = true
    }
  }, [currentUser.id])

  return (
    <main className="profile-page">
      <section className="profile-header">
        <p className="eyebrow">ACCOUNT</p>

        <div className="profile-header-identity">
          <Avatar
            avatarUrl={avatarUrl}
            displayName={displayName}
            fallback={avatarFallback}
            className="profile-header-avatar"
            onClick={() => setIsEditing(true)}
            ariaLabel={avatarUrl ? 'Change or remove your profile photo' : 'Add a profile photo'}
          />

          <div className="profile-header-text">
            <h1>{displayName || 'Your account'}</h1>
            <p className="profile-header-email">{currentUser.email}</p>
          </div>
        </div>
      </section>

      <section className="profile-info-section">
        <div className="section-heading">
          <div>
            <p className="section-label">ACCOUNT INFORMATION</p>
            <h2>Your details</h2>
          </div>
        </div>

        <div className="profile-info-card">
          <div className="profile-info-row">
            <p className="profile-info-label">DISPLAY NAME</p>
            <div className="profile-info-value-row">
              <p className="profile-info-value">{displayName || '—'}</p>
              <button
                type="button"
                className="edit-activity-button"
                onClick={() => setIsEditing(true)}
              >
                Edit
              </button>
            </div>
          </div>

          <div className="profile-info-row">
            <p className="profile-info-label">EMAIL</p>
            <p className="profile-info-value">{currentUser.email}</p>
          </div>
        </div>
      </section>

      <section className="profile-friends-section">
        <div className="section-heading">
          <div>
            <p className="section-label">FRIENDS</p>
            <h2>Friends</h2>
          </div>
        </div>

        <button
          type="button"
          className="profile-friends-link"
          onClick={onGoToFriends}
        >
          <span>
            {friendsCount === null
              ? 'View your friends'
              : `View your ${friendsCount} friend${friendsCount === 1 ? '' : 's'}`}
          </span>
          <span aria-hidden="true">→</span>
        </button>
      </section>

      <section className="profile-actions-section">
        <div className="section-heading">
          <div>
            <p className="section-label">ACCOUNT ACTIONS</p>
            <h2>Manage account</h2>
          </div>
        </div>

        <div className="profile-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => setIsEditing(true)}
          >
            Edit profile
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={onGoToSettings}
          >
            Settings
          </button>
        </div>
      </section>

      {isEditing && (
        <EditProfile
          userId={currentUser.id}
          currentDisplayName={displayName}
          currentAvatarUrl={avatarUrl}
          avatarFallback={avatarFallback}
          onClose={() => setIsEditing(false)}
          onSaved={() => setIsEditing(false)}
        />
      )}
    </main>
  )
}

export default ProfilePage
