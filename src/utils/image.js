// Client-side profile-photo validation + compression — the only place
// Voyage ever touches a raw <input type="file"> image before it goes
// to Supabase Storage (see services/profilesRepository.js's
// uploadAvatar). Keeps every uploaded avatar small and in one
// predictable format without a server-side image pipeline: everything
// that passes through here comes out as a JPEG blob capped at
// AVATAR_MAX_DIMENSION on its longest edge, however large or in
// whatever format it went in.

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
// A generous ceiling on the *original* file, before compression even
// runs — large enough that no ordinary phone photo trips it, small
// enough that an absurd file (a mislabeled video, a multi-hundred-MB
// scan) is rejected outright instead of being handed to the browser's
// image decoder at all.
export const MAX_INPUT_BYTES = 8 * 1024 * 1024 // 8MB
const AVATAR_MAX_DIMENSION = 512
const AVATAR_JPEG_QUALITY = 0.85

// Synchronous, cheap checks before any decoding/network work — the
// same "reject invalid files cleanly, with a clear message" a normal
// form field validates, just for a file input instead of text.
export function validateAvatarFile(file) {
  if (!file) return 'Choose a photo.'
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return 'Please choose a JPEG, PNG, WEBP, or GIF image.'
  }
  if (file.size > MAX_INPUT_BYTES) {
    return 'That image is too large — please choose one under 8MB.'
  }
  return null
}

// Resizes (never upscales — a smaller source stays whatever size it
// already is) and re-encodes as JPEG via an off-DOM <canvas>, the
// standard browser-native way to shrink an image with no extra
// dependency. Returns the compressed Blob directly, ready to hand to
// Storage's upload() — the caller never sees the intermediate
// <img>/<canvas> elements this creates. Rejects if the browser can't
// even decode the file as an image (e.g. a corrupt or mislabeled
// file that passed the MIME-type check above but isn't a real image).
export function compressImageFile(file, {
  maxDimension = AVATAR_MAX_DIMENSION,
  quality = AVATAR_JPEG_QUALITY,
} = {}) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
      const width = Math.round(img.width * scale)
      const height = Math.round(img.height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl)
          if (!blob) {
            reject(new Error("We couldn't process that image. Please try a different file."))
            return
          }
          resolve(blob)
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("We couldn't read that image. Please try a different file."))
    }

    img.src = objectUrl
  })
}
