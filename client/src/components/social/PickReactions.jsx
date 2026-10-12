import { usePickReactions, useToggleReaction } from '../../hooks/useSocial'
import { useAuth } from '../../hooks/useAuth'

const REACTIONS = [
  { type: 'fire', emoji: '\uD83D\uDD25' },
  { type: 'goat', emoji: '\uD83D\uDC10' },
  { type: 'clap', emoji: '\uD83D\uDC4F' },
]

// Clown is retired: it can no longer be ADDED, but 18 of them already exist
// and are still shown. Dropping it from the list outright would have made
// those silently disappear from posts people had already reacted to — and
// left whoever placed one unable to take it back.
const RETIRED = [
  { type: 'clown', emoji: '\uD83E\uDD21' },
]
// Everything that can appear on screen; REACTIONS is what you can pick.
const DISPLAYABLE = [...REACTIONS, ...RETIRED]

export default function PickReactions({ pickId, compact = false, reactions: externalReactions }) {
  const { session } = useAuth()
  const currentUserId = session?.user?.id
  const { data: fetchedReactions } = usePickReactions(compact ? null : pickId)
  const toggleReaction = useToggleReaction()

  const reactions = externalReactions || fetchedReactions || []

  // Build a map of type → { count, hasReacted }
  const reactionMap = {}
  for (const r of reactions) {
    reactionMap[r.type] = {
      count: r.count,
      hasReacted: r.users?.some((u) => u.userId === currentUserId) || false,
    }
  }

  function handleToggle(type) {
    if (!pickId) return
    toggleReaction.mutate({ pickId, reactionType: type })
  }

  if (compact) {
    // Only show reactions that have counts
    const active = DISPLAYABLE.filter((r) => reactionMap[r.type]?.count > 0)
    if (!active.length) return null

    return (
      <div className="flex gap-1.5 flex-wrap">
        {active.map((r) => (
          <span
            key={r.type}
            className="inline-flex items-center gap-0.5 text-xs bg-bg-secondary rounded-full px-1.5 py-0.5"
          >
            {r.emoji} {reactionMap[r.type].count}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-3 flex-wrap">
      {REACTIONS.map((r) => {
        const info = reactionMap[r.type]
        const hasReacted = info?.hasReacted
        const count = info?.count || 0

        return (
          <button
            key={r.type}
            onClick={() => handleToggle(r.type)}
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
