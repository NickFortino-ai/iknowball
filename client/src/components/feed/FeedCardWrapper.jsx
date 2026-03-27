import { timeAgo } from '../../lib/time'
import { useAuth } from '../../hooks/useAuth'
import Avatar from '../ui/Avatar'
import FeedReactions from './FeedReactions'
import PickComments from '../social/PickComments'
import ReportButton from '../moderation/ReportButton'

const BORDER_COLORS = {
  green: 'border-l-correct',
  red: 'border-l-incorrect',
  orange: 'border-l-orange-400',
  accent: 'border-l-accent',
  gold: 'border-l-yellow-500',
  purple: 'border-l-purple-500',
}

export default function FeedCardWrapper({
  item,
  borderColor,
  targetType,
  targetId,
  reactions,
  commentCount,
  onUserTap,
  onCardTap,
  onEdit,
  cardClassName = '',
  streakCount,
  children,
}) {
  const { session } = useAuth()
  const isOwnContent = item.userId === session?.user?.id
  const borderClass = BORDER_COLORS[borderColor] || 'border-l-transparent'

  return (
    <div
      className={`bg-bg-primary border border-text-primary/20 rounded-xl overflow-hidden border-l-4 ${borderClass} ${cardClassName} ${onCardTap ? 'cursor-pointer' : ''}`}
      onClick={onCardTap}
    >
      {/* Header: avatar + name + timestamp */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        <button
          onClick={(e) => { if (onCardTap) e.stopPropagation(); onUserTap?.(item.userId) }}
          className="hover:ring-2 hover:ring-accent/30 transition-shadow rounded-full"
        >
          <Avatar user={{ avatar_url: item.avatar_url, avatar_emoji: item.avatar_emoji, username: item.username, display_name: item.display_name }} size="lg" />
        </button>
        <div className="min-w-0 flex-1">
          <button
            onClick={(e) => { if (onCardTap) e.stopPropagation(); onUserTap?.(item.userId) }}
            className="font-semibold text-sm text-accent hover:underline truncate block"
          >
            {item.display_name || item.username}
          </button>
          <span className="text-xs text-text-muted">
            @{item.username}
            {streakCount >= 3 && (
              <span className="ml-1.5 inline-flex items-center text-[10px] font-bold bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full">{'\uD83D\uDD25'}{streakCount}</span>
            )}
          </span>
        </div>
        <span className="text-xs text-text-muted flex-shrink-0">{timeAgo(item.timestamp)}</span>
        {isOwnContent && onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            className="text-text-muted hover:text-text-secondary transition-colors p-1"
            title="Edit"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          </button>
        )}
        {!isOwnContent && targetType === 'hot_take' && targetId && (
          <ReportButton targetType={targetType} targetId={targetId} reportedUserId={item.userId} />
        )}
      </div>

      {/* Card body */}
      <div className="px-4 pb-3">
        {children}
      </div>

      {/* Footer: reactions + comments */}
      {targetType && targetId && (
        <div className="px-4 pb-3 space-y-1.5" onClick={onCardTap ? (e) => e.stopPropagation() : undefined}>
          <FeedReactions targetType={targetType} targetId={targetId} reactions={reactions} />
          <PickComments targetType={targetType} targetId={targetId} commentCount={commentCount} />
        </div>
      )}
    </div>
  )
}
