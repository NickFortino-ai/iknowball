const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

// Bump when any preset backdrop image is added, renamed, or re-encoded
// so browsers invalidate their cached copies. Custom (user-uploaded)
// backdrops have unique UUID filenames and don't need versioning.
const BACKDROP_VERSION = 'v5'

// Some league formats have their own exclusive backdrop set (e.g. legends
// of the 3-point shot, sack leaders, etc.) tagged with a synthetic format
// key in the league_backdrops table. The picker on the league settings
// modal needs to honor those keys instead of the league's raw sport, so
// users see the right backdrop set. Mirrors CreateLeaguePage logic.
export function getBackdropFilterKey(league) {
  if (!league) return undefined
  const { format, settings } = league
  if (format === 'wnba_dfs') return 'wnba_dfs_contest'
  if (format === 'three_point') return 'three_point_contest'
  if (format === 'wnba_three_point') return 'wnba_three_point_contest'
  if (format === 'sacks') return 'sacks_contest'
  if (format === 'ints') return 'ints_contest'
  if (format === 'tackles') return 'tackles_contest'
  if (format === 'receptions') return 'receptions_contest'
  if (format === 'strikeouts') return 'strikeouts_contest'
  if (format === 'hr_derby') return 'hr_derby_contest'
  if (format === 'td_pass') return 'td_pass_competition'
  if (format === 'survivor' && settings?.survivor_mode === 'touchdown') return 'touchdown_survivor'
  if (league.sport === 'all') return undefined
  return league.sport
}

export function getBackdropUrl(filename) {
  if (!filename) return null
  if (filename.startsWith('custom/')) {
    return `${SUPABASE_URL}/storage/v1/object/public/backdrop-approved/${filename.slice(7)}`
  }
  return `/backdrops/${filename}?v=${BACKDROP_VERSION}`
}
