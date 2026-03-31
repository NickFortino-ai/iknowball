const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export function getBackdropUrl(filename) {
  if (!filename) return null
  if (filename.startsWith('custom/')) {
    return `${SUPABASE_URL}/storage/v1/object/public/backdrop-approved/${filename.slice(7)}`
  }
  return `/backdrops/${filename}`
}
