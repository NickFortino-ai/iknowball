import { useNavigate } from 'react-router-dom'
import FeedCardWrapper from './FeedCardWrapper'
import Avatar from '../ui/Avatar'
import RichContent from './RichContent'
import { timeAgo } from '../../lib/time'
import { getPronouns } from '../../lib/pronouns'

export default function HotTakeReminderFeedCard({ item, reactions, onUserTap }) {
  const { hot_take, reminded_user } = item
  const navigate = useNavigate()
  const { possessive } = getPronouns(reminded_user?.title_preference)

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
        reminded <span className="font-semibold text-accent">@{reminded_user?.username || 'unknown'}</span> of {possessive} prediction
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
        <RichContent text={`\u201C${hot_take.content}\u201D`} className="text-sm text-text-primary leading-relaxed italic" />
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {hot_take.team_tags?.length > 0 && hot_take.team_tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] font-semibold uppercase tracking-wider text-accent px-2 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
          {hot_take.tagged_users?.length > 0 && hot_take.tagged_users.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 text-[10px] font-semibold bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full"
            >
              <Avatar user={u} size="xs" />
              @{u.username}
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
