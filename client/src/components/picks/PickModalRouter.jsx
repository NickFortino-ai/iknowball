import { usePickById } from '../../hooks/usePicks'
import { useAuth } from '../../hooks/useAuth'
import GameCenterModal from './GameCenterModal'
import PickDetailModal from '../social/PickDetailModal'

// Given a pick id, opens the right modal based on ownership:
//   own pick     → Game Center (game-centric view with box score)
//   other's pick → PickDetailModal (classic pick-centric view)
//
// Used by callers that hand out pick ids without knowing whose pick
// it is — notifications, profile pick history. Holds rendering until
// the pick resolves so the user doesn't see PickDetailModal flash
// before swapping to Game Center.
export default function PickModalRouter({ pickId, onClose }) {
  const { session } = useAuth()
  const { data: pick, isFetched } = usePickById(pickId)

  if (!pickId) return null
  if (!isFetched) return null

  const isOwn = pick && pick.user_id === session?.user?.id
  const gameId = pick?.game_id || pick?.games?.id

  if (isOwn && gameId) {
    return <GameCenterModal gameId={gameId} onClose={onClose} />
  }
  return <PickDetailModal pickId={pickId} onClose={onClose} />
}
