import { useEffect, useMemo, useRef, useState } from 'react'
import {
  removeAvatar,
  updateDisplayName,
  uploadAvatar,
} from '../services/profilesRepository'
import { compressImageFile, validateAvatarFile } from '../utils/image'
import Avatar from './Avatar'

// The one Edit profile modal — display name AND photo together, same
// modal-overlay/modal/form pattern as SetBudget.jsx (the app's other
// one-field-ish edit form). This used to be name-only, with photo
// changes handled by a *second*, disconnected modal opened straight
// from a "Change photo" link on the Profile page itself. That split is
// what broke both the "is the name editable?" affordance (the actual
// edit action lived in one place, name and photo in two different
// flows) and the photo preview report (someone opening "Edit profile"
// expecting to see a photo option there found only a name field) — so
// this rewrite merges them into the single flow the rest of this
// comment describes. Email stays out of scope entirely, same as
// before.
//
// Photo state here is *local and pending* until Save — nothing is
// uploaded or removed from Storage the moment a file is chosen or
// Remove is clicked. `selectedFile` (a newly chosen File, not yet
// saved) and `removePhoto` (a pending "clear the saved photo" intent)
// are mutually exclusive booleans-ish: choosing a file clears any
// pending removal, and Remove clears any just-selected file. Whichever
// is showing in the modal's own preview is exactly what Save will
// commit; Cancel (the modal's own × button) touches neither Storage
// nor `profiles` at all — the component just unmounts, discarding
// this local state, which is what "cancelling restores the saved
// photo" means: the saved photo was never touched in the first place.
function EditProfile({
  userId,
  currentDisplayName,
  currentAvatarUrl,
  avatarFallback,
  onClose,
  onSaved,
}) {
  const [displayName, setDisplayName] = useState(currentDisplayName)
  const [nameError, setNameError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const nameInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')

  // Focuses the name field the moment this modal opens — a plain
  // imperative DOM call, not a setState, so this is a legitimate
  // mount-only effect (no react-hooks/set-state-in-effect concern).
  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  // A fresh object URL whenever `selectedFile` changes (including back
  // to null) — computed during render via useMemo, not inside an
  // effect that would call setState, so this never trips
  // react-hooks/set-state-in-effect (same pattern this project already
  // uses wherever a value needs to be *derived* from a changing input
  // rather than fetched). The *cleanup* (revoking the previous URL) is
  // the only part that genuinely needs an effect, since only an effect
  // knows when React is done with the old value.
  const previewUrl = useMemo(
    () => (selectedFile ? URL.createObjectURL(selectedFile) : null),
    [selectedFile]
  )

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // What the modal's own avatar preview shows right now: the just-
  // selected file's local preview, else — if Remove was pressed —
  // nothing (falls back to initials), else whatever's actually saved.
  const previewAvatarUrl = selectedFile ? previewUrl : removePhoto ? null : currentAvatarUrl
  const canRemovePhoto = Boolean(selectedFile) || (Boolean(currentAvatarUrl) && !removePhoto)

  const handleChoosePhoto = () => fileInputRef.current?.click()

  const handleFileSelected = (event) => {
    const file = event.target.files?.[0]
    // Cleared regardless of outcome — without this, choosing the exact
    // same (invalid) file twice in a row wouldn't fire onChange the
    // second time, silently dropping the retry.
    event.target.value = ''
    if (!file) return

    const validationError = validateAvatarFile(file)
    if (validationError) {
      // The previous selection/preview is deliberately left exactly as
      // it was — an invalid pick never clobbers a valid one already
      // staged.
      setPhotoError(validationError)
      return
    }
    setPhotoError('')
    setRemovePhoto(false)
    setSelectedFile(file)
  }

  const handleRemovePhoto = () => {
    setPhotoError('')
    setSelectedFile(null)
    setRemovePhoto(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isSaving) return

    const trimmed = displayName.trim()
    if (!trimmed) {
      setNameError('Enter a display name.')
      return
    }

    setNameError('')
    setSaveError('')
    setIsSaving(true)

    try {
      await updateDisplayName(userId, trimmed)

      if (selectedFile) {
        const blob = await compressImageFile(selectedFile)
        await uploadAvatar(userId, blob)
      } else if (removePhoto) {
        await removeAvatar(userId)
      }

      // No separate "Saved!" banner — this app has no toast/notification
      // system anywhere (matches every other edit form's own behavior).
      // Closing the modal while the new name/photo is already visible
      // everywhere else the moment this resolves (navbar avatar, this
      // page's own header — both read reactively from
      // auth.user_metadata, see profilesRepository.js) *is* the success
      // state here.
      onSaved()
    } catch (error) {
      setSaveError(error.message || 'Something went wrong. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <div>
            <p className="section-label">EDIT PROFILE</p>
            <h2>Edit profile</h2>
          </div>

          <button className="close-button" onClick={onClose} disabled={isSaving}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="edit-profile-avatar-row">
            <Avatar
              avatarUrl={previewAvatarUrl}
              displayName={displayName}
              fallback={avatarFallback}
              className="profile-header-avatar"
            />

            <div className="profile-avatar-actions">
              <button
                type="button"
                className="profile-avatar-link"
                onClick={handleChoosePhoto}
                disabled={isSaving}
              >
                Change photo
              </button>
              {canRemovePhoto && (
                <button
                  type="button"
                  className="profile-avatar-link is-destructive"
                  onClick={handleRemovePhoto}
                  disabled={isSaving}
                >
                  Remove photo
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="profile-avatar-input"
              onChange={handleFileSelected}
            />
          </div>

          {photoError && <p className="form-error">{photoError}</p>}

          <label>
            Display name
            <input
              ref={nameInputRef}
              name="displayName"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Ada Lovelace"
              required
            />
          </label>

          {nameError && <p className="form-error">{nameError}</p>}
          {saveError && <p className="form-error">{saveError}</p>}

          <button
            className="primary-button submit-button"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default EditProfile
