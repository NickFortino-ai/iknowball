/**
 * Small indicator dot showing that a player has a published blurb.
 * Filled accent when unseen, hidden after the user opens the player detail.
 *
 * Usage: <BlurbDot playerId={id} blurbIds={setOfPlayerIdsWithBlurbs} />
 *
 * Call BlurbDot.markSeen(playerId) when opening the player detail modal.
 */

const STORAGE_KEY = 'blurb-seen'

function getSeenSet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveSeenSet(set) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
  } catch {}
}

export function markBlurbSeen(playerId) {
  const seen = getSeenSet()
  seen.add(playerId)
  saveSeenSet(seen)
}

export default function BlurbDot({ playerId, blurbIds }) {
  if (!blurbIds || !blurbIds.has(playerId)) return null
  const seen = getSeenSet()
  if (seen.has(playerId)) return null
  return (
    <span className="w-2 h-2 rounded-full bg-accent shrink-0" title="Player notes available" />
  )
}
