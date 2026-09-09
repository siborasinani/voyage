import { useEffect, useRef, useState } from 'react'
import { acceptFriendRequest, declineFriendRequest } from '../services/friendsRepository'
import {
  acceptTripInvitation,
  declineTripInvitation,
} from '../services/invitationsRepository'
import { markNotificationsRead } from '../services/notificationsRepository'
import { formatRelativeTime } from '../utils/date'
import Avatar from './Avatar'

// Voyage's one notification surface — incoming friend requests,
// incoming trip invitations, and informational "your invitation was
// accepted/declined" notices, all merged into one popover. Replaces
// the old Friends-nav-only badge entirely (see App.jsx's own comment
// on notificationSummary) so there's exactly one notification system,
// not two competing ones. `summary`/`onRefresh` are owned by App.jsx,
// not this component, specifically so FriendsPage.jsx's own accept/
// decline/cancel actions (a different screen entirely) can keep this
// badge in sync too — this component only ever renders what it's
// given and calls back up after its own actions.
function NotificationBell({ currentUserId, summary, onRefresh, onTripAccepted, onGoToFriends }) {
  const [isOpen, setIsOpen] = useState(false)
  const [processingId, setProcessingId] = useState(null)
  const [actionError, setActionError] = useState('')
  // Locally hides the informational notifications from the *badge*
  // count the moment the popover is opened (they're marked read in
  // the database then too — see the effect below) without needing an
  // extra round trip just to re-render a lower number; the popover's
  // own content still shows them for this viewing regardless, exactly
  // the same "seen, but still visible until you navigate away" feel
  // most notification bells already have.
  const [notificationsSeen, setNotificationsSeen] = useState(false)
  const containerRef = useRef(null)

  const badgeCount =
    summary.friendRequests.length +
    summary.tripInvitations.length +
    (notificationsSeen ? 0 : summary.notifications.length)

  useEffect(() => {
    if (!isOpen) return undefined

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Marks whatever informational notifications are currently loaded as
  // read the moment the popover opens — a background call; a failure
  // here just means they'll still count next time, never worth its own
  // error state for this.
  useEffect(() => {
    if (!isOpen) return
    // Legitimate "respond to the user opening this" pattern — same
    // established precedent as FriendsPage.jsx's own initial-load
    // effects citing this exact justification: there's no other event
    // to hang "the popover was just opened" off of.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotificationsSeen(true)
    if (summary.notifications.length > 0) {
      markNotificationsRead(summary.notifications.map((notification) => notification.id)).catch(
        () => {}
      )
    }
    // Deliberately only reacts to `isOpen` — this should fire once per
    // open, not every time `summary` itself happens to change while
    // already open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const hasAnything =
    summary.friendRequests.length > 0 ||
    summary.tripInvitations.length > 0 ||
    summary.notifications.length > 0

  const handleAcceptFriend = async (id) => {
    setActionError('')
    setProcessingId(id)
    try {
      await acceptFriendRequest(id, currentUserId)
      await onRefresh()
    } catch (error) {
      setActionError(error.message)
    } finally {
      setProcessingId(null)
    }
  }

  const handleDeclineFriend = async (id) => {
    setActionError('')
    setProcessingId(id)
    try {
      await declineFriendRequest(id)
      await onRefresh()
    } catch (error) {
      setActionError(error.message)
    } finally {
      setProcessingId(null)
    }
  }

  const handleAcceptInvitation = async (id) => {
    setActionError('')
    setProcessingId(id)
    try {
      await acceptTripInvitation(id)
      await Promise.all([onRefresh(), onTripAccepted()])
    } catch (error) {
      setActionError(error.message)
    } finally {
      setProcessingId(null)
    }
  }

  const handleDeclineInvitation = async (id) => {
    setActionError('')
    setProcessingId(id)
    try {
      await declineTripInvitation(id)
      await onRefresh()
    } catch (error) {
      setActionError(error.message)
    } finally {
      setProcessingId(null)
    }
  }

  const describeNotification = (notification) => {
    if (notification.type === 'invitation_accepted') {
      return `${notification.actorName} accepted your invitation to ${notification.tripName}`
    }
    return `${notification.actorName} declined your invitation to ${notification.tripName}`
  }

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="notification-bell-button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={badgeCount > 0 ? `Notifications, ${badgeCount} new` : 'Notifications'}
        onClick={() => setIsOpen((open) => !open)}
      >
        {/* Plain inline outline SVG — no icon library is installed in
            this project (see package.json), and one glyph doesn't
            justify adding one; currentColor picks up
            .notification-bell-icon's color in App.css. */}
        <svg
          className="notification-bell-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {badgeCount > 0 && <span className="nav-badge">{badgeCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-popover" role="dialog" aria-label="Notifications">
          <div className="notification-popover-header">
            <h3>Notifications</h3>
          </div>

          {actionError && <p className="form-error">{actionError}</p>}

          {!hasAnything ? (
            <div className="empty-state notification-popover-empty">
              <h3>You're all caught up.</h3>
              <p>New friend requests and trip invitations will show up here.</p>
            </div>
          ) : (
            <ul className="notification-list">
              {summary.tripInvitations.map((invitation) => (
                <li className="notification-item" key={`invitation-${invitation.id}`}>
                  <Avatar
                    avatarUrl={invitation.inviterAvatarUrl}
                    displayName={invitation.inviterName}
                    className="friend-avatar"
                  />
                  <div className="notification-item-body">
                    <p className="notification-item-text">
                      <strong>{invitation.inviterName}</strong> invited you to join{' '}
                      <strong>{invitation.tripName}</strong>
                    </p>
                    <span className="friend-status-pill">{invitation.role.toUpperCase()}</span>
                    <div className="notification-item-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={processingId === invitation.id}
                        onClick={() => handleAcceptInvitation(invitation.id)}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="edit-activity-button"
                        disabled={processingId === invitation.id}
                        onClick={() => handleDeclineInvitation(invitation.id)}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                </li>
              ))}

              {summary.friendRequests.map((request) => (
                <li className="notification-item" key={`friend-${request.id}`}>
                  <Avatar
                    avatarUrl={request.otherUser?.avatarUrl}
                    displayName={request.otherUser?.displayName}
                    className="friend-avatar"
                  />
                  <div className="notification-item-body">
                    <p className="notification-item-text">
                      <strong>{request.otherUser?.displayName || 'Voyage user'}</strong> sent you
                      a friend request
                    </p>
                    <div className="notification-item-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={processingId === request.id}
                        onClick={() => handleAcceptFriend(request.id)}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="edit-activity-button"
                        disabled={processingId === request.id}
                        onClick={() => handleDeclineFriend(request.id)}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                </li>
              ))}

              {summary.notifications.map((notification) => (
                <li className="notification-item is-informational" key={`note-${notification.id}`}>
                  <div className="notification-item-body">
                    <p className="notification-item-text">{describeNotification(notification)}</p>
                    <p className="notification-item-time">
                      {formatRelativeTime(notification.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="notification-popover-footer-link"
            onClick={() => {
              setIsOpen(false)
              onGoToFriends()
            }}
          >
            View Friends →
          </button>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
