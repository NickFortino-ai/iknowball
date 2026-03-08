import FeedCardWrapper from './FeedCardWrapper'
import { timeAgo } from '../../lib/time'

export default function HotTakeReminderFeedCard({ item, onUserTap }) {
  const { hot_take, reminded_user } = item

  return (
    <FeedCardWrapper
      item={item}
      borderColor="accent"
      onUserTap={onUserTap}
    >
      {/* Header text */}
      <div className="text-sm text-text-secondary mb-2">
        reminded <span className="font-semibold text-accent">@{reminded_user?.username || 'unknown'}</span> of their hot take
      </div>

      {/* Quoted hot take */}
      <div className="bg-bg-secondary rounded-lg px-3 py-2">
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
