import { useEffect, useState } from 'react'
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  getFriends,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  removeFriend,
  searchUsers,
  sendFriendRequest,
} from '../services/friendsRepository'
import { useDebouncedValue } from '../utils/useDebouncedValue'
import Avatar from './Avatar'
import AvatarViewer from './AvatarViewer'
import ConfirmDialog from './ConfirmDialog'

// Only ever rendered while signed in — App.jsx shows its own auth-
// gated empty state (matching the dashboard's existing "Sign in to see
// your trips" treatment) instead of this component for a signed-out
// visitor, so there's no `requireAuth` plumbing in here at all.
// `onNotificationsChanged` (optional) — called every time loadAll()
// resolves, so the navbar's unified NotificationBell (see
// App.jsx/NotificationBell.jsx) stays in sync the moment a friend
// request is accepted/declined/cancelled here, without its own
// separate poll. A no-arg refresh signal, not a count: the bell owns
// its own combined friend-request/trip-invitation/notification totals,
// which this page has no reason to know about.
function FriendsPage({ currentUserId, onNotificationsChanged }) {
  const [friends, setFriends] = useState([])
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [searchInput, setSearchInput] = useState('')
  const searchTerm = useDebouncedValue(searchInput, 300)
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)

  // The friendship object pending a "Remove friend?" confirmation, or
  // null while the dialog is closed — same conditional-render pattern
  // every other destructive-action dialog in the app already uses.
  const [pendingRemoval, setPendingRemoval] = useState(null)
  const [actionError, setActionError] = useState(null)

  // The { avatarUrl, displayName } currently open in the view-only
  // AvatarViewer lightbox, or null — every Avatar below only ever
  // passes an onClick that opens this when the person actually has a
  // photo (see Avatar.jsx's own contract); an initials-only avatar
  // never reaches this state at all.
  const [viewingAvatar, setViewingAvatar] = useState(null)

  // `undefined` (not a function) when there's no photo — that's what
  // makes Avatar.jsx render a plain, non-interactive initials span for
  // someone with no photo, exactly per its own contract.
  const viewAvatarHandler = (avatarUrl, displayName) =>
    avatarUrl ? () => setViewingAvatar({ avatarUrl, displayName }) : undefined

  const loadAll = async () => {
    setLoadError(null)
    try {
      const [friendsList, incomingList, outgoingList] = await Promise.all([
        getFriends(currentUserId),
        getIncomingFriendRequests(currentUserId),
        getOutgoingFriendRequests(currentUserId),
      ])
      setFriends(friendsList)
      setIncoming(incomingList)
      setOutgoing(outgoingList)
      onNotificationsChanged?.()
    } catch (error) {
      setLoadError(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Legitimate initial-load pattern — there's no user event to hang
    // this off of instead (same established pattern as
    // DestinationSearch.jsx's/PlaceCard.jsx's own effect-driven
    // fetches). Only ever needs to re-run if the signed-in user itself
    // changes — loadAll is otherwise re-invoked directly after every
    // mutating action below, not via a dependency change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId])

  useEffect(() => {
    if (!searchTerm.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([])
      setIsSearching(false)
      setSearchError(null)
      return undefined
    }

    let cancelled = false
    // Legitimate loading-flag pattern for a debounced-search fetch —
    // same established pattern as PlaceCard.jsx's own image lookup.
    setIsSearching(true)
    setSearchError(null)

    searchUsers(searchTerm, currentUserId)
      .then((results) => {
        if (cancelled) return
        setSearchResults(results)
        setIsSearching(false)
      })
      .catch((error) => {
        if (cancelled) return
        setSearchError(error.message)
        setIsSearching(false)
      })

    return () => {
      cancelled = true
    }
  }, [searchTerm, currentUserId])

  // Cross-referenced against the three lists already loaded above — no
  // extra query per search result just to know whether "Add friend"
  // is actually the right thing to show for it.
  const getRelationshipState = (userId) => {
    if (friends.some((friendship) => friendship.otherUser?.id === userId)) return 'friends'
    if (outgoing.some((friendship) => friendship.otherUser?.id === userId)) return 'outgoing'
    if (incoming.some((friendship) => friendship.otherUser?.id === userId)) return 'incoming'
    return 'none'
  }

  const handleSendRequest = async (userId) => {
    setActionError(null)
    try {
      await sendFriendRequest(currentUserId, userId)
      await loadAll()
    } catch (error) {
      setActionError(error.message)
    }
  }

  const handleAccept = async (friendshipId) => {
    setActionError(null)
    try {
      await acceptFriendRequest(friendshipId, currentUserId)
      await loadAll()
    } catch (error) {
      setActionError(error.message)
    }
  }

  const handleDecline = async (friendshipId) => {
    setActionError(null)
    try {
      await declineFriendRequest(friendshipId)
      await loadAll()
    } catch (error) {
      setActionError(error.message)
    }
  }

  // Only ever called from the Sent Requests section below, which only
  // ever lists pending outgoing requests in the first place
  // (getOutgoingFriendRequests filters to status = 'pending') — so
  // there's no separate "is this still pending" check needed here: an
  // already-accepted/declined request is simply never reachable through
  // this button.
  const handleCancel = async (friendshipId) => {
    setActionError(null)
    try {
      await cancelFriendRequest(friendshipId)
      await loadAll()
    } catch (error) {
      setActionError(error.message)
    }
  }

  const handleConfirmRemove = async () => {
    if (!pendingRemoval) return
    setActionError(null)
    try {
      await removeFriend(pendingRemoval.id)
      setPendingRemoval(null)
      await loadAll()
    } catch (error) {
      setActionError(error.message)
      setPendingRemoval(null)
    }
  }

  return (
    <main className="friends-page">
      <section className="friends-header">
        <p className="eyebrow">FRIENDS</p>
        <h1>Friends</h1>
        <p className="hero-text">
          Connect with other Voyage users, manage requests, and keep
          track of who you travel with.
        </p>
      </section>

      {actionError && <p className="form-error friends-action-error">{actionError}</p>}

      <section className="friends-search-section">
        <div className="section-heading">
          <div>
            <p className="section-label">ADD FRIENDS</p>
            <h2>Find people</h2>
          </div>
        </div>

        <input
          type="search"
          className="explore-search"
          placeholder="Search by name…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          aria-label="Search for people"
        />

        {searchTerm.trim() &&
          (isSearching ? (
            <div className="empty-state is-loading">
              <h3>Searching…</h3>
            </div>
          ) : searchError ? (
            <div className="empty-state">
              <h3>Something went wrong</h3>
              <p>We couldn't search just now. Please try again.</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="empty-state">
              <h3>No matching people</h3>
              <p>Try a different name.</p>
            </div>
          ) : (
            <ul className="friend-list">
              {searchResults.map((user) => {
                const state = getRelationshipState(user.id)
                return (
                  <li className="friend-item" key={user.id}>
                    <div className="friend-identity">
                      <Avatar
                        avatarUrl={user.avatarUrl}
                        displayName={user.displayName}
                        className="friend-avatar"
                        onClick={viewAvatarHandler(user.avatarUrl, user.displayName)}
                        ariaLabel={`View ${user.displayName || 'this person'}'s photo`}
                      />
                      <span className="friend-name">
                        {user.displayName || 'Voyage user'}
                      </span>
                    </div>

                    {state === 'friends' ? (
                      <span className="friend-status-pill">FRIENDS</span>
                    ) : state === 'outgoing' ? (
                      <span className="friend-status-pill">REQUEST SENT</span>
                    ) : state === 'incoming' ? (
                      <span className="friend-status-pill">SENT YOU A REQUEST</span>
                    ) : (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleSendRequest(user.id)}
                      >
                        + Add friend
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          ))}
      </section>

      {isLoading ? (
        <div className="empty-state is-loading">
          <h3>Loading your friends…</h3>
        </div>
      ) : loadError ? (
        <div className="empty-state">
          <h3>Something went wrong</h3>
          <p>We couldn't load your friends just now. Please try again.</p>
        </div>
      ) : (
        <>
          {incoming.length > 0 && (
            <section className="friends-list-section">
              <div className="section-heading">
                <div>
                  <p className="section-label">INCOMING REQUESTS</p>
                  <h2>Wants to connect</h2>
                </div>
              </div>

              <ul className="friend-list">
                {incoming.map((request) => (
                  <li className="friend-item" key={request.id}>
                    <div className="friend-identity">
                      <Avatar
                        avatarUrl={request.otherUser?.avatarUrl}
                        displayName={request.otherUser?.displayName}
                        className="friend-avatar"
                        onClick={viewAvatarHandler(request.otherUser?.avatarUrl, request.otherUser?.displayName)}
                        ariaLabel={`View ${request.otherUser?.displayName || 'this person'}'s photo`}
                      />
                      <span className="friend-name">
                        {request.otherUser?.displayName || 'Voyage user'}
                      </span>
                    </div>

                    <div className="friend-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleAccept(request.id)}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="edit-activity-button"
                        onClick={() => handleDecline(request.id)}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {outgoing.length > 0 && (
            <section className="friends-list-section">
              <div className="section-heading">
                <div>
                  <p className="section-label">SENT REQUESTS</p>
                  <h2>Awaiting response</h2>
                </div>
              </div>

              <ul className="friend-list">
                {outgoing.map((request) => (
                  <li className="friend-item" key={request.id}>
                    <div className="friend-identity">
                      <Avatar
                        avatarUrl={request.otherUser?.avatarUrl}
                        displayName={request.otherUser?.displayName}
                        className="friend-avatar"
                        onClick={viewAvatarHandler(request.otherUser?.avatarUrl, request.otherUser?.displayName)}
                        ariaLabel={`View ${request.otherUser?.displayName || 'this person'}'s photo`}
                      />
                      <span className="friend-name">
                        {request.otherUser?.displayName || 'Voyage user'}
                      </span>
                    </div>

                    <div className="friend-actions">
                      <span className="friend-status-pill">PENDING</span>
                      <button
                        type="button"
                        className="edit-activity-button"
                        onClick={() => handleCancel(request.id)}
                      >
                        Cancel
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="friends-list-section">
            <div className="section-heading">
              <div>
                <p className="section-label">YOUR FRIENDS</p>
                <h2>Friends</h2>
              </div>
            </div>

            {friends.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">☺</div>
                <h3>No friends yet</h3>
                <p>
                  Search for other Voyage users above and send a friend
                  request to get started.
                </p>
              </div>
            ) : (
              <ul className="friend-list">
                {friends.map((friendship) => (
                  <li className="friend-item" key={friendship.id}>
                    <div className="friend-identity">
                      <Avatar
                        avatarUrl={friendship.otherUser?.avatarUrl}
                        displayName={friendship.otherUser?.displayName}
                        className="friend-avatar"
                        onClick={viewAvatarHandler(friendship.otherUser?.avatarUrl, friendship.otherUser?.displayName)}
                        ariaLabel={`View ${friendship.otherUser?.displayName || 'this person'}'s photo`}
                      />
                      <span className="friend-name">
                        {friendship.otherUser?.displayName || 'Voyage user'}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="delete-activity-button"
                      onClick={() => setPendingRemoval(friendship)}
                      aria-label={`Remove ${friendship.otherUser?.displayName || 'friend'}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title="Remove this friend?"
          message={`"${pendingRemoval.otherUser?.displayName || 'This person'}" will be removed from your friends. This won't affect any trips.`}
          confirmLabel="Remove friend"
          destructive
          onCancel={() => setPendingRemoval(null)}
          onConfirm={handleConfirmRemove}
        />
      )}

      {viewingAvatar && (
        <AvatarViewer
          avatarUrl={viewingAvatar.avatarUrl}
          displayName={viewingAvatar.displayName}
          onClose={() => setViewingAvatar(null)}
        />
      )}
    </main>
  )
}

export default FriendsPage
