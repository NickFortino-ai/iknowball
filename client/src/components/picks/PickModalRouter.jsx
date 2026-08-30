import { createPortal } from 'react-dom'
import { usePickById } from '../../hooks/usePicks'
import { useAuth } from '../../hooks/useAuth'
import GameCenterModal from './GameCenterModal'

// Given a pick id, opens Game Center on that pick's game — for your own
// pick and for anyone else's.
//
// This used to fork: own pick → Game Center, someone else's →
// PickDetailModal, a thinner card that predated the Game Center revamp.
// So tapping a pick from another user's profile dropped you into a
// different, worse view of the same game — no box score, no records,
// no injuries, no leaders, and a bare "LIVE" with no period or clock.
//
// For someone else's pick we pass focusPick, which names whose call it
// is and keeps the reaction/comment thread anchored to THEIR pick rather
// than silently re-anchoring it to yours.
//
// Used by callers that hand out pick ids without knowing whose pick it
// is — notifications, profile pick history. Holds rendering until the
// pick resolves so the game id is known before we mount.
export default function PickModalRouter({ pickId, onClose }) {
  const { session } = useAuth()
  const { data: pick, isFetched } = usePickById(pickId)

  if (!pickId) return null
  if (!isFetched) return null

  const isOwn = pick && pick.user_id === session?.user?.id
  const gameId = pick?.game_id || pick?.games?.id

  // A pick id that doesn't resolve (deleted pick, stale notification)
  // used to land on PickDetailModal's "Pick not found". Without this the
  // tap would just do nothing, which reads as a broken notification.
  // Portalled — an inline overlay inherits the host's stacking context.
  if (!gameId) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/60" />
        <div
          className="relative w-full max-w-sm rounded-2xl border border-text-primary/20 bg-bg-primary p-6 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-text-muted">Pick not found</p>
          <button onClick={onClose} className="mt-4 text-sm font-semibold text-accent">Close</button>
        </div>
      </div>,
      document.body
    )
  }

  return (
    <GameCenterModal
      gameId={gameId}
      onClose={onClose}
      focusPick={isOwn ? null : pick}
    />
  )
}
