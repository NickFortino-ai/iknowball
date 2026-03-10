import { useNavigate } from 'react-router-dom'
import FeedCardWrapper from './FeedCardWrapper'
import { timeAgo } from '../../lib/time'

export default function HotTakeReminderFeedCard({ item, reactions, onUserTap }) {
  const { hot_take, reminded_user } = item
  const navigate = useNavigate()

  function handleQuoteTap(e) {
    e.stopPropagation()
    navigate(`/hub?tab=hot_takes&scrollTo=hot_take-${hot_take.id}`)
  }

  return (
    <FeedCardWrapper
      item={item}
      borderColor="accent"
      targetType="hot_take_reminder"
      targetId={item.id}
      reactions={reactions}
      onUserTap={onUserTap}
      commentCount={item.commentCount}
    >
      {/* Header text */}
      <div className="text-sm text-text-secondary mb-2">
        reminded <span className="font-semibold text-accent">@{reminded_user?.username || 'unknown'}</span> of their hot take
      </div>

      {/* Reminder comment */}
      {item.comment && (
        <div className="text-sm text-text-primary leading-relaxed mb-2">
          {item.comment}
        </div>
      )}

      {/* Quoted hot take — tappable */}
      <div
        onClick={handleQuoteTap}
        className="bg-bg-secondary rounded-lg px-3 py-2 cursor-pointer hover:bg-border transition-colors"
      >
        <div className="text-sm text-text-primary leading-relaxed italic">
          &ldquo;{hot_take.content}&rdquo;
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          {hot_take.team_tags?.length > 0 && hot_take.team_tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] font-semibold uppercase tracking-wider bg-accent/15 text-accent px-2 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
          <span className="text-[10px] text-text-muted">
            Originally posted {timeAgo(hot_take.created_at)}
          </span>
        </div>
      </div>
    </FeedCardWrapper>
  )
}
