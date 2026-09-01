/**
 * Small indicator dot showing that a player has an UNREAD published
 * blurb. Filled accent when the user hasn't seen the latest blurb;
 * hidden once they open it.
 *
 * Read state is per-USER and synced across devices — see
 * hooks/useReadState.js. It used to be a per-DEVICE localStorage map, so
 * reading an update on your phone left the dot showing on your laptop.
 * localStorage is still written synchronously as a local mirror, which
 * is what keeps dismissal instant and carries over state from before
 * the sync existed.
 *
 * Storing the blurb ID (not a boolean) is what makes a NEW blurb for the
 * same player bring the dot back: the seen id no longer matches latest.
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
import { useReadState, markRead, READ_KINDS } from '../../hooks/useReadState'

// Kept as a standalone export so the existing call sites
// (FantasyPlayerBrowser, FantasyMyTeam, FantasyMatchup, RosterList) keep
// working unchanged — they already pass exactly these two arguments.
//
// queryClient is optional: without it the local mirror and the POST
// still happen, only the in-memory cache nudge is skipped, so the dot
// clears on the next render either way.
export function markBlurbSeen(playerId, latestBlurbId, queryClient) {
  if (!playerId || !latestBlurbId) return
  markRead(queryClient, READ_KINDS.BLURB, playerId, latestBlurbId)
}

export default function BlurbDot({ playerId, blurbIds }) {
  // Called before the early returns so hook order stays stable. React
  // Query dedupes every dot on the page down to one request.
  const readState = useReadState()

  if (!blurbIds || !playerId) return null
  // Accept either a Map<playerId, latestId> (new shape) or a Set
  // (legacy shape, still shows a dot for any player-with-blurb but
  // can't distinguish new blurbs — callsites should migrate).
  const latestId = typeof blurbIds.get === 'function'
    ? blurbIds.get(playerId)
    : (blurbIds.has(playerId) ? '__legacy__' : null)
  if (!latestId) return null
  if (readState[READ_KINDS.BLURB]?.[playerId] === latestId) return null
  return (
    <span className="w-2 h-2 rounded-full bg-accent shrink-0" title="Player notes available" />
  )
}
