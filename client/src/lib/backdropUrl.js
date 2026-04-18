const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

// Bump when any preset backdrop image is added, renamed, or re-encoded
// so browsers invalidate their cached copies. Custom (user-uploaded)
// backdrops have unique UUID filenames and don't need versioning.
const BACKDROP_VERSION = 'v3'

export function getBackdropUrl(filename) {
  if (!filename) return null
  if (filename.startsWith('custom/')) {
    return `${SUPABASE_URL}/storage/v1/object/public/backdrop-approved/${filename.slice(7)}`
  }
  return `/backdrops/${filename}?v=${BACKDROP_VERSION}`
}
