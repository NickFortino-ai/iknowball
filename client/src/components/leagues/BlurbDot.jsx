/**
 * Small indicator dot showing that a player has an UNREAD published
 * blurb. Filled accent when the user hasn't seen the latest blurb;
 * hidden once they open it.
 *
 * Storage: { [playerId]: latestSeenBlurbId } in localStorage. A new
 * blurb (new id) for the same player brings the dot back — the user's
 * seen entry no longer matches the current latest_id.
 *
 * Usage:
 *   const blurbIds = useMemo(
 *     () => new Map((blurbIdsList || []).map((r) => [r.player_id, r.latest_id])),
 *     [blurbIdsList],
 *   )
 *   <BlurbDot playerId={id} blurbIds={blurbIds} />
 *   // when opening the modal:
 *   markBlurbSeen(playerId, blurbIds.get(playerId))
 */

const STORAGE_KEY = 'blurb-seen-v2'

function getSeenMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveSeenMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {}
}

// Accepts (playerId, latestBlurbId). Pass the current latest id from
// the blurbIds Map so we record which specific blurb was seen.
export function markBlurbSeen(playerId, latestBlurbId) {
  if (!playerId || !latestBlurbId) return
  const map = getSeenMap()
  map[playerId] = latestBlurbId
  saveSeenMap(map)
}

export default function BlurbDot({ playerId, blurbIds }) {
  if (!blurbIds || !playerId) return null
  // Accept either a Map<playerId, latestId> (new shape) or a Set
  // (legacy shape, still shows a dot for any player-with-blurb but
  // can't distinguish new blurbs — callsites should migrate).
  const latestId = typeof blurbIds.get === 'function'
    ? blurbIds.get(playerId)
    : (blurbIds.has(playerId) ? '__legacy__' : null)
  if (!latestId) return null
  const seenMap = getSeenMap()
  if (seenMap[playerId] === latestId) return null
  return (
    <span className="w-2 h-2 rounded-full bg-accent shrink-0" title="Player notes available" />
  )
}
