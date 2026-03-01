import { timeAgo } from '../../lib/time'
import FeedReactions from './FeedReactions'
import PickComments from '../social/PickComments'

const BORDER_COLORS = {
  green: 'border-l-correct',
  red: 'border-l-incorrect',
  orange: 'border-l-orange-400',
  accent: 'border-l-accent',
  gold: 'border-l-yellow-500',
}

export default function FeedCardWrapper({
  item,
  borderColor,
  targetType,
  targetId,
  reactions,
  onUserTap,
  children,
}) {
  const borderClass = BORDER_COLORS[borderColor] || 'border-l-transparent'

  return (
    <div className={`bg-bg-card border border-border rounded-xl overflow-hidden border-l-4 ${borderClass}`}>
      {/* Header: avatar + name + timestamp */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        <button
          onClick={() => onUserTap?.(item.userId)}
          className="w-8 h-8 rounded-full bg-bg-primary flex items-center justify-center text-sm flex-shrink-0 hover:ring-2 hover:ring-accent/30 transition-shadow"
        >
          {item.avatar_emoji || item.username?.[0]?.toUpperCase()}
        </button>
        <div className="min-w-0 flex-1">
          <button
            onClick={() => onUserTap?.(item.userId)}
            className="font-semibold text-sm text-accent hover:underline truncate block"
          >
            {item.display_name || item.username}
          </button>
          <span className="text-xs text-text-muted">@{item.username}</span>
        </div>
        <span className="text-xs text-text-muted flex-shrink-0">{timeAgo(item.timestamp)}</span>
      </div>

      {/* Card body */}
      <div className="px-4 pb-3">
        {children}
      </div>

      {/* Footer: reactions + comments */}
      {targetType && targetId && (
        <div className="px-4 pb-3 space-y-1.5">
          <FeedReactions targetType={targetType} targetId={targetId} reactions={reactions} />
          <PickComments targetType={targetType} targetId={targetId} />
        </div>
      )}
    </div>
  )
}
