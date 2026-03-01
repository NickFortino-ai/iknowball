import { useToggleFeedReaction } from '../../hooks/useSocial'
import { useAuth } from '../../hooks/useAuth'

const REACTIONS = [
  { type: 'fire', emoji: '\uD83D\uDD25' },
  { type: 'clown', emoji: '\uD83E\uDD21' },
  { type: 'goat', emoji: '\uD83D\uDC10' },
  { type: 'clap', emoji: '\uD83D\uDC4F' },
]

export default function FeedReactions({ targetType, targetId, reactions = [] }) {
  const { session } = useAuth()
  const currentUserId = session?.user?.id
  const toggleReaction = useToggleFeedReaction()

  const reactionMap = {}
  for (const r of reactions) {
    reactionMap[r.type] = {
      count: r.count,
      hasReacted: r.users?.some((u) => u.userId === currentUserId) || false,
    }
  }

  function handleToggle(type) {
    if (!targetId) return
    toggleReaction.mutate({ targetType, targetId, reactionType: type })
  }

  return (
    <div className="flex gap-1 flex-wrap">
      {REACTIONS.map((r) => {
        const info = reactionMap[r.type]
        const hasReacted = info?.hasReacted
        const count = info?.count || 0

        return (
          <button
            key={r.type}
            onClick={(e) => { e.stopPropagation(); handleToggle(r.type) }}
            disabled={toggleReaction.isPending}
            className={`inline-flex items-center gap-0.5 text-xs rounded-full px-2 py-1 transition-colors disabled:opacity-50 ${
              hasReacted
                ? 'bg-accent/20 border border-accent/40'
                : 'bg-bg-secondary hover:bg-border border border-transparent'
            }`}
          >
            {r.emoji}{count > 0 && <span className="ml-0.5">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
