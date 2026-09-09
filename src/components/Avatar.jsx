import { getInitials } from '../utils/profile'

// The one shared "has a photo, or falls back to initials" branch —
// every place Voyage shows a person's avatar (navbar, Profile, Friends,
// trip People/collaborator rows) renders through this instead of
// duplicating the check per screen. `className` is applied to whichever
// element actually renders (the <img>/<button>, or the initials <span>),
// so each call site keeps its own existing circular sizing/colors
// (.friend-avatar, .profile-header-avatar, ...) completely unchanged.
//
// `onClick` (optional) is what makes an avatar interactive at all — a
// plain <img>/<span> when omitted (unchanged default), or a real
// <button> wrapping the same content when provided, so click handling,
// focus/hover states, and cursor affordance live in exactly one place
// rather than every call site wrapping this in its own ad-hoc
// clickable container. The *decision* of when an avatar should be
// clickable is deliberately left to each caller, not decided here:
// - ProfilePage.jsx always passes onClick (your own avatar opens
//   EditProfile — the one way to add a photo when you have none, or
//   change/remove one you already have).
// - FriendsPage.jsx/TripPeopleSection.jsx/AddTripFriends.jsx only pass
//   onClick when `avatarUrl` is already truthy (opens a view-only
//   AvatarViewer) — an initials-only avatar for someone else is
//   deliberately left non-interactive, since there's nothing to view
//   and it's not this viewer's photo to edit.
// `ariaLabel` lets each caller say what the click actually does
// ("Change profile photo" vs. "View Ada's photo") — defaults to a
// sensible guess if omitted.
function Avatar({ avatarUrl, displayName, fallback, className = '', onClick, ariaLabel }) {
  const isInteractive = typeof onClick === 'function'
  const label =
    ariaLabel || (avatarUrl ? `View ${displayName || 'profile'} photo` : 'Change profile photo')
  const buttonClassName = (className ? className + ' ' : '') + 'avatar-button'

  if (avatarUrl) {
    if (isInteractive) {
      return (
        <button type="button" className={buttonClassName} onClick={onClick} aria-label={label}>
          <img src={avatarUrl} alt="" className="avatar-image" />
        </button>
      )
    }
    return (
      <img
        src={avatarUrl}
        alt=""
        className={(className ? className + ' ' : '') + 'avatar-image'}
      />
    )
  }

  if (isInteractive) {
    return (
      <button type="button" className={buttonClassName} onClick={onClick} aria-label={label}>
        {getInitials(displayName, fallback)}
      </button>
    )
  }

  return (
    <span className={className} aria-hidden="true">
      {getInitials(displayName, fallback)}
    </span>
  )
}

export default Avatar
