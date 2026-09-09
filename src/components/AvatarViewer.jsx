// A compact, view-only image preview for someone else's profile photo
// — opened by clicking their avatar in Friends/trip People/Share
// dialogs (see Avatar.jsx's own onClick contract; every one of those
// call sites only ever opens this when `avatarUrl` is already truthy,
// so this never needs to handle a missing photo itself). Not an editor
// — there's no Change/Remove action here, only a close button; editing
// only ever exists for your *own* photo, via ProfilePage's existing
// EditProfile flow. Same modal-overlay backdrop as every other Voyage
// dialog, but a much smaller card — a lightbox-style preview, not a
// full modal with a header/form.
function AvatarViewer({ avatarUrl, displayName, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="avatar-viewer">
        <button className="close-button" onClick={onClose} aria-label="Close">
          ×
        </button>

        <img src={avatarUrl} alt="" className="avatar-viewer-image" />

        {displayName && <p className="avatar-viewer-name">{displayName}</p>}
      </div>
    </div>
  )
}

export default AvatarViewer
