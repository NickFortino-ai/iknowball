import { useState } from 'react'
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
  const [showPicker, setShowPicker] = useState(false)

  const reactionMap = {}
  for (const r of reactions) {
    reactionMap[r.type] = {
      count: r.count,
      hasReacted: r.users?.some((u) => u.userId === currentUserId) || false,
      users: r.users || [],
    }
  }

  const hasAnyReactions = reactions.some((r) => r.count > 0)
  const activeReactions = REACTIONS.filter((r) => reactionMap[r.type]?.count > 0)

  function handleToggle(type) {
    if (!targetId) return
    toggleReaction.mutate({ targetType, targetId, reactionType: type })
    setShowPicker(false)
  }

  // Has reactions: show active emojis + "+" button for picker
  if (hasAnyReactions) {
    return (
      <div className="flex gap-1 flex-wrap items-center">
        {activeReactions.map((r) => {
          const info = reactionMap[r.type]
          const hasReacted = info?.hasReacted
          const count = info?.count || 0
          const tooltip = info?.users.map((u) => u.displayName || u.username).join(', ')

          return (
            <button
              key={r.type}
              onClick={(e) => { e.stopPropagation(); handleToggle(r.type) }}
              disabled={toggleReaction.isPending}
              title={tooltip}
              className={`inline-flex items-center gap-0.5 text-xs rounded-full px-2 py-1 transition-colors disabled:opacity-50 ${
                hasReacted
                  ? 'bg-accent/20 border border-accent/40'
                  : 'bg-bg-secondary hover:bg-border border border-transparent'
              }`}
            >
              {r.emoji}<span className="ml-0.5">{count}</span>
            </button>
          )
        })}

        {/* Picker toggle */}
        {showPicker ? (
          REACTIONS.filter((r) => !reactionMap[r.type]?.count).map((r) => (
            <button
              key={r.type}
              onClick={(e) => { e.stopPropagation(); handleToggle(r.type) }}
              disabled={toggleReaction.isPending}
              className="inline-flex items-center text-xs rounded-full px-2 py-1 bg-bg-secondary hover:bg-border border border-transparent transition-colors disabled:opacity-50"
            >
              {r.emoji}
            </button>
          ))
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setShowPicker(true) }}
            className="inline-flex items-center justify-center text-xs rounded-full w-6 h-6 bg-bg-secondary hover:bg-border border border-transparent transition-colors text-text-muted"
          >
            +
          </button>
        )}
      </div>
    )
  }

  // No reactions: show all emojis dimmed
  return (
    <div className="flex gap-1 flex-wrap">
      {REACTIONS.map((r) => (
        <button
          key={r.type}
          onClick={(e) => { e.stopPropagation(); handleToggle(r.type) }}
          disabled={toggleReaction.isPending}
          className="inline-flex items-center text-xs rounded-full px-2 py-1 opacity-50 hover:opacity-100 bg-bg-secondary hover:bg-border border border-transparent transition-all disabled:opacity-30"
        >
          {r.emoji}
        </button>
      ))}
    </div>
  )
}
