import { useEffect, useState } from 'react'
import { getFriends } from '../services/friendsRepository'
import { inviteToTrip } from '../services/invitationsRepository'
import Avatar from './Avatar'
import AvatarViewer from './AvatarViewer'

// Stays open across invites (same pattern as SaveToTripDialog.jsx — a
// "Done" button, not an auto-close after the first action) so an owner
// can invite several friends to a trip in one sitting; each invite
// immediately removes that friend from the list below, no refresh.
//
// Sends an *invitation* now, not an immediate add — the invited friend
// only actually joins the trip once they accept (see
// services/invitationsRepository.js and
// supabase/migrations/0012_trip_invitations_and_notifications.sql for
// the full "why" — a trip owner choosing a role and sending an
// invitation, rather than immediately granting access, is the whole
// point of this feature). `pendingInvitedUserIds` (in addition to
// `existingMemberUserIds`) keeps someone who already has an
// outstanding invitation from being offered again, so a duplicate
// pending invitation is never even reachable from this UI — the
// database's own partial unique index is the real guarantee, this is
// just not making the user hit it.
function AddTripFriends({
  tripId,
  ownerId,
  existingMemberUserIds,
  pendingInvitedUserIds,
  onClose,
  onInvited,
}) {
  const [friends, setFriends] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [invitingUserId, setInvitingUserId] = useState(null)
  const [invitedUserIds, setInvitedUserIds] = useState(new Set())
  const [inviteError, setInviteError] = useState('')
  // Per-friend role choice, keyed by user id — defaults to 'editor'
  // (the existing product convention from before roles were
  // selectable) whenever a friend hasn't had their pill clicked yet, so
  // the choice is always explicit at the moment an invite is sent even
  // though nobody had to touch the toggle for the common case.
  const [roleByUserId, setRoleByUserId] = useState({})
  // Same view-only-photo-lightbox pattern as FriendsPage.jsx.
  const [viewingAvatar, setViewingAvatar] = useState(null)
  const viewAvatarHandler = (avatarUrl, displayName) =>
    avatarUrl ? () => setViewingAvatar({ avatarUrl, displayName }) : undefined

  useEffect(() => {
    let cancelled = false
    getFriends(ownerId)
      .then((list) => {
        if (cancelled) return
        setFriends(list)
        setIsLoading(false)
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(error.message)
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [ownerId])

  const eligibleFriends = friends.filter(
    (friendship) =>
      !existingMemberUserIds.includes(friendship.otherUser?.id) &&
      !pendingInvitedUserIds.includes(friendship.otherUser?.id) &&
      !invitedUserIds.has(friendship.otherUser?.id)
  )

  const handleInvite = async (friend) => {
    setInviteError('')
    setInvitingUserId(friend.id)
    try {
      const role = roleByUserId[friend.id] ?? 'editor'
      await inviteToTrip(tripId, friend.id, ownerId, role)
      // Removed from the eligible list immediately (not just relying
      // on a parent prop update) so it disappears from this dialog the
      // moment the invite is sent, same immediacy every other
      // Voyage action already has.
      setInvitedUserIds((current) => new Set(current).add(friend.id))
      onInvited()
    } catch (error) {
      setInviteError(error.message)
    } finally {
      setInvitingUserId(null)
    }
  }

  return (
    <>
    <div className="modal-overlay">
      {/* Flex-column modal with a scrollable body and a footer that's
          always outside that scroll area (see the .add-trip-friends-*
          rules in App.css) — this is what keeps the Done button from
          ever overlapping the friend list, whether there are 1 friend
          or 30, or the viewport is short. */}
      <div className="modal add-trip-friends-modal">
        <div className="modal-header">
          <div>
            <p className="section-label">SHARE TRIP</p>
            <h2>Invite friends</h2>
          </div>

          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="add-trip-friends-body">
          <p className="confirm-dialog-message">
            Editors can add and edit this trip's itinerary, places, and
            expenses. Viewers can only look. They'll get access once they
            accept your invitation.
          </p>

          {inviteError && <p className="form-error">{inviteError}</p>}

          {isLoading ? (
            <div className="empty-state is-loading">
              <h3>Loading friends…</h3>
            </div>
          ) : loadError ? (
            <div className="empty-state">
              <h3>Something went wrong</h3>
              <p>We couldn't load your friends just now. Please try again.</p>
            </div>
          ) : eligibleFriends.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">☺</div>
              <h3>No friends available to invite</h3>
              <p>
                {friends.length === 0
                  ? "You don't have any friends yet — add some from the Friends page first."
                  : 'Every friend is already on this trip or has a pending invitation.'}
              </p>
            </div>
          ) : (
            <ul className="friend-list">
              {eligibleFriends.map((friendship) => {
                const friend = friendship.otherUser
                const role = roleByUserId[friend?.id] ?? 'editor'
                const isInviting = invitingUserId === friend?.id
                return (
                  <li className="friend-item" key={friendship.id}>
                    <div className="friend-identity">
                      <Avatar
                        avatarUrl={friend?.avatarUrl}
                        displayName={friend?.displayName}
                        className="friend-avatar"
                        onClick={viewAvatarHandler(friend?.avatarUrl, friend?.displayName)}
                        ariaLabel={`View ${friend?.displayName || 'this person'}'s photo`}
                      />
                      <span className="friend-name">
                        {friend?.displayName || 'Voyage user'}
                      </span>
                    </div>

                    <div className="friend-actions">
                      <div className="role-toggle" role="group" aria-label={`Role for ${friend?.displayName || 'this friend'}`}>
                        <button
                          type="button"
                          className={'role-pill' + (role === 'editor' ? ' is-active' : '')}
                          disabled={isInviting}
                          onClick={() =>
                            setRoleByUserId((current) => ({ ...current, [friend.id]: 'editor' }))
                          }
                        >
                          Editor
                        </button>
                        <button
                          type="button"
                          className={'role-pill' + (role === 'viewer' ? ' is-active' : '')}
                          disabled={isInviting}
                          onClick={() =>
                            setRoleByUserId((current) => ({ ...current, [friend.id]: 'viewer' }))
                          }
                        >
                          Viewer
                        </button>
                      </div>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={isInviting}
                        onClick={() => handleInvite(friend)}
                      >
                        {isInviting ? 'Inviting…' : 'Invite'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="confirm-dialog-actions add-trip-friends-footer">
          <button type="button" className="primary-button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>

    {viewingAvatar && (
      <AvatarViewer
        avatarUrl={viewingAvatar.avatarUrl}
        displayName={viewingAvatar.displayName}
        onClose={() => setViewingAvatar(null)}
      />
    )}
    </>
  )
}

export default AddTripFriends
