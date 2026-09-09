import { useEffect, useState } from 'react'
import { getFriends } from '../services/friendsRepository'
import Avatar from './Avatar'

// How many avatars actually render before folding the rest into a
// quiet "+N" — "such as the first 3–5"; 4 splits the difference and
// matches this component's own worked example (a couple of named
// faces, then a visible remainder).
const PREVIEW_COUNT = 4

// The dashboard's own compact Friends summary — reuses
// services/friendsRepository.js's existing getFriends (the exact same
// call FriendsPage.jsx's own Friends list already makes) and
// Avatar.jsx (the same shared avatar-or-initials component everywhere
// else already uses), rather than a second friends query or a new
// avatar treatment. Deliberately read-only here: every avatar is a
// button, but it always just navigates to /friends — no accept/
// decline/remove affordance belongs on the dashboard.
function DashboardFriendsSummary({ currentUserId, onGoToFriends }) {
  // `null` while loading, distinct from `[]` (genuinely no friends) —
  // so this never flashes the "no friends yet" empty state for a
  // returning user who actually has plenty, only to have it correct
  // itself a moment later.
  const [friends, setFriends] = useState(null)

  useEffect(() => {
    let cancelled = false
    getFriends(currentUserId)
      .then((list) => {
        if (!cancelled) setFriends(list)
      })
      .catch(() => {
        if (!cancelled) setFriends([])
      })
    return () => {
      cancelled = true
    }
  }, [currentUserId])

  if (friends === null) return null

  const preview = friends.slice(0, PREVIEW_COUNT)
  const overflowCount = friends.length - preview.length

  return (
    <section className="dashboard-friends-section">
      <div className="section-heading">
        <div>
          <p className="section-label">FRIENDS</p>
          <h2>{friends.length === 0 ? 'Plan better together.' : 'Your travel circle'}</h2>
        </div>
      </div>

      {friends.length === 0 ? (
        <div className="empty-state">
          <p>Find people to start planning trips together.</p>
          <button className="primary-button" onClick={onGoToFriends}>
            Find friends
          </button>
        </div>
      ) : (
        <div className="dashboard-friends-row">
          <div className="dashboard-friend-chips">
            {preview.map((friendship) => (
              <button
                key={friendship.id}
                type="button"
                className="dashboard-friend-chip"
                onClick={onGoToFriends}
              >
                <Avatar
                  avatarUrl={friendship.otherUser?.avatarUrl}
                  displayName={friendship.otherUser?.displayName}
                  className="friend-avatar"
                />
                <span>{friendship.otherUser?.displayName || 'Voyage user'}</span>
              </button>
            ))}

            {overflowCount > 0 && (
              <span className="dashboard-friend-chip-overflow">+{overflowCount}</span>
            )}
          </div>

          <button type="button" className="profile-friends-link" onClick={onGoToFriends}>
            <span>View all friends</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </section>
  )
}

export default DashboardFriendsSummary
