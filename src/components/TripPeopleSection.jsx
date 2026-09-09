import { useEffect, useState } from 'react'
import {
  getTripMembers,
  removeTripMember,
  updateTripMemberRole,
} from '../services/tripsRepository'
import {
  cancelTripInvitation,
  getSentInvitationsForTrip,
} from '../services/invitationsRepository'
import AddTripFriends from './AddTripFriends'
import Avatar from './Avatar'
import AvatarViewer from './AvatarViewer'
import ConfirmDialog from './ConfirmDialog'

// The compact PEOPLE section on the Trip Detail page — owner first,
// then collaborators, each row reusing the exact same .friend-* row
// language the Friends page already established (same avatar/name/
// status-pill treatment) rather than a parallel style. Add/remove are
// only ever shown to the owner — RLS (0006_trip_sharing.sql/0012's own
// tightened policies) refuses both regardless, this just avoids
// showing a non-owner a control that would only fail.
//
// A collaborator no longer appears here the moment they're invited —
// only once they've actually accepted (see
// services/invitationsRepository.js). While an invitation is still
// pending, it shows in its own "Pending Invitations" list below
// instead, owner-only, with a Cancel action.
function TripPeopleSection({ trip, isOwner, requireAuth }) {
  const [members, setMembers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [pendingInvitations, setPendingInvitations] = useState([])
  const [showAddFriends, setShowAddFriends] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState(null)
  const [removeError, setRemoveError] = useState('')
  const [cancellingInvitationId, setCancellingInvitationId] = useState(null)
  const [cancelError, setCancelError] = useState('')
  // The trip_members.id currently mid role-change, so its role toggle
  // can disable itself while the update is in flight — same "one row
  // busy at a time" idea as AddTripFriends.jsx's invitingUserId.
  const [changingRoleId, setChangingRoleId] = useState(null)
  const [roleChangeError, setRoleChangeError] = useState('')
  // Same view-only-photo-lightbox pattern as FriendsPage.jsx — see its
  // own comment on viewAvatarHandler.
  const [viewingAvatar, setViewingAvatar] = useState(null)
  const viewAvatarHandler = (avatarUrl, displayName) =>
    avatarUrl ? () => setViewingAvatar({ avatarUrl, displayName }) : undefined

  const handleChangeRole = async (member, role) => {
    if (member.role === role) return
    setRoleChangeError('')
    setChangingRoleId(member.id)
    try {
      await updateTripMemberRole(member.id, role)
      setMembers((current) =>
        current.map((m) => (m.id === member.id ? { ...m, role } : m))
      )
    } catch (error) {
      setRoleChangeError(error.message)
    } finally {
      setChangingRoleId(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    // Legitimate initial-load pattern — same established pattern as
    // FriendsPage.jsx's own loadAll effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true)
    setLoadError(null)
    Promise.all([
      getTripMembers(trip.id),
      // Only the owner can actually see any rows here (0012's own
      // RLS) — fetched regardless of `isOwner` for simplicity; a
      // non-owner viewer just always gets an empty array back, not an
      // error, so this doesn't need its own conditional.
      getSentInvitationsForTrip(trip.id),
    ])
      .then(([memberList, invitationList]) => {
        if (cancelled) return
        setMembers(memberList)
        setPendingInvitations(invitationList)
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
  }, [trip.id])

  const owner = members.find((member) => member.role === 'owner')
  const collaborators = members.filter((member) => member.role !== 'owner')

  const handleConfirmRemove = async () => {
    if (!pendingRemoval) return
    setRemoveError('')
    try {
      await removeTripMember(pendingRemoval.id)
      setMembers((current) => current.filter((member) => member.id !== pendingRemoval.id))
      setPendingRemoval(null)
    } catch (error) {
      setRemoveError(error.message)
      setPendingRemoval(null)
    }
  }

  const handleCancelInvitation = async (invitation) => {
    setCancelError('')
    setCancellingInvitationId(invitation.id)
    try {
      await cancelTripInvitation(invitation.id)
      setPendingInvitations((current) => current.filter((i) => i.id !== invitation.id))
    } catch (error) {
      setCancelError(error.message)
    } finally {
      setCancellingInvitationId(null)
    }
  }

  // Re-fetches rather than constructing a synthetic row locally — the
  // real invitation id (needed for Cancel to work before the next
  // natural refetch) only exists once the insert has actually
  // committed; a fabricated placeholder id would make cancelling an
  // invitation sent moments ago silently fail.
  const handleInvited = () => {
    getSentInvitationsForTrip(trip.id)
      .then((list) => setPendingInvitations(list))
      .catch((error) => setCancelError(error.message))
  }

  return (
    <section className="trip-people-section">
      <div className="section-heading">
        <div>
          <p className="section-label">PEOPLE</p>
          <h2>Who's going</h2>
        </div>

        {isOwner && (
          <button
            className="secondary-button"
            onClick={() => requireAuth(() => setShowAddFriends(true))}
          >
            + Invite friends
          </button>
        )}
      </div>

      {removeError && <p className="form-error">{removeError}</p>}
      {roleChangeError && <p className="form-error">{roleChangeError}</p>}
      {cancelError && <p className="form-error">{cancelError}</p>}

      {isLoading ? (
        <div className="empty-state is-loading">
          <h3>Loading people…</h3>
        </div>
      ) : loadError ? (
        <div className="empty-state">
          <h3>Something went wrong</h3>
          <p>We couldn't load this trip's people just now. Please try again.</p>
        </div>
      ) : (
        <ul className="friend-list">
          {owner && (
            <li className="friend-item">
              <div className="friend-identity">
                <Avatar
                  avatarUrl={owner.profile?.avatarUrl}
                  displayName={owner.profile?.displayName}
                  className="friend-avatar"
                  onClick={viewAvatarHandler(owner.profile?.avatarUrl, owner.profile?.displayName)}
                  ariaLabel={`View ${owner.profile?.displayName || 'this person'}'s photo`}
                />
                <span className="friend-name">
                  {owner.profile?.displayName || 'Voyage user'}
                </span>
              </div>
              <span className="friend-status-pill">OWNER</span>
            </li>
          )}

          {collaborators.map((member) => (
            <li className="friend-item" key={member.id}>
              <div className="friend-identity">
                <Avatar
                  avatarUrl={member.profile?.avatarUrl}
                  displayName={member.profile?.displayName}
                  className="friend-avatar"
                  onClick={viewAvatarHandler(member.profile?.avatarUrl, member.profile?.displayName)}
                  ariaLabel={`View ${member.profile?.displayName || 'this person'}'s photo`}
                />
                <span className="friend-name">
                  {member.profile?.displayName || 'Voyage user'}
                </span>
              </div>

              <div className="friend-actions">
                {isOwner ? (
                  <div
                    className="role-toggle"
                    role="group"
                    aria-label={`Role for ${member.profile?.displayName || 'this collaborator'}`}
                  >
                    <button
                      type="button"
                      className={'role-pill' + (member.role === 'editor' ? ' is-active' : '')}
                      disabled={changingRoleId === member.id}
                      onClick={() => requireAuth(() => handleChangeRole(member, 'editor'))}
                    >
                      Editor
                    </button>
                    <button
                      type="button"
                      className={'role-pill' + (member.role === 'viewer' ? ' is-active' : '')}
                      disabled={changingRoleId === member.id}
                      onClick={() => requireAuth(() => handleChangeRole(member, 'viewer'))}
                    >
                      Viewer
                    </button>
                  </div>
                ) : (
                  <span className="friend-status-pill">
                    {member.role === 'viewer' ? 'VIEWER' : 'EDITOR'}
                  </span>
                )}
                {isOwner && (
                  <button
                    type="button"
                    className="delete-activity-button"
                    aria-label={`Remove ${member.profile?.displayName || 'collaborator'}`}
                    onClick={() =>
                      requireAuth(() => setPendingRemoval(member))
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Owner-only, and only once there's actually a pending
          invitation — never an empty section. */}
      {isOwner && pendingInvitations.length > 0 && (
        <div className="trip-people-pending">
          <p className="section-label">PENDING INVITATIONS</p>
          <ul className="friend-list">
            {pendingInvitations.map((invitation) => (
              <li className="friend-item" key={invitation.id}>
                <div className="friend-identity">
                  <Avatar
                    avatarUrl={invitation.inviteeAvatarUrl}
                    displayName={invitation.inviteeName}
                    className="friend-avatar"
                    onClick={viewAvatarHandler(invitation.inviteeAvatarUrl, invitation.inviteeName)}
                    ariaLabel={`View ${invitation.inviteeName}'s photo`}
                  />
                  <span className="friend-name">{invitation.inviteeName}</span>
                </div>

                <div className="friend-actions">
                  <span className="friend-status-pill">{invitation.role.toUpperCase()}</span>
                  <span className="friend-status-pill">PENDING</span>
                  <button
                    type="button"
                    className="edit-activity-button"
                    disabled={cancellingInvitationId === invitation.id}
                    onClick={() => requireAuth(() => handleCancelInvitation(invitation))}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showAddFriends && (
        <AddTripFriends
          tripId={trip.id}
          ownerId={trip.ownerId}
          existingMemberUserIds={members.map((member) => member.userId)}
          pendingInvitedUserIds={pendingInvitations.map((invitation) => invitation.invitedUserId)}
          onClose={() => setShowAddFriends(false)}
          onInvited={handleInvited}
        />
      )}

      {pendingRemoval && (
        <ConfirmDialog
          title="Remove this collaborator?"
          message={`"${pendingRemoval.profile?.displayName || 'This person'}" will lose access to this trip. Your friendship won't be affected.`}
          confirmLabel="Remove"
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
    </section>
  )
}

export default TripPeopleSection
