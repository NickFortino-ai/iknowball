import FeedCardWrapper from './FeedCardWrapper'

function getStreakTier(length) {
  if (length >= 10) return 'legendary'
  if (length >= 5) return 'hot'
  return 'normal'
}

export default function StreakFeedCard({ item, reactions, onUserTap, onStreakTap }) {
  const { streak } = item
  const tier = getStreakTier(streak.streak_length)

  const cardClass = tier === 'legendary'
    ? 'streak-fire-glow bg-orange-500/5'
    : tier === 'hot'
    ? 'bg-orange-500/5'
    : ''

  return (
    <FeedCardWrapper
      item={item}
      borderColor="orange"
      targetType="streak_event"
      targetId={streak.id}
      reactions={reactions}
      onUserTap={onUserTap}
      commentCount={item.commentCount}
      cardClassName={cardClass}
    >
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => onStreakTap?.(streak.id)}
      >
        <span className={tier === 'legendary' ? 'text-4xl' : tier === 'hot' ? 'text-3xl' : 'text-xl'}>
          {'\uD83D\uDD25'}
        </span>
        <div>
          <div className={`font-bold text-orange-400 ${
            tier === 'legendary' ? 'text-2xl' : tier === 'hot' ? 'text-xl' : 'text-lg'
          }`}>
            {streak.streak_length} Win Streak
          </div>
          <div className="text-xs text-text-muted">
            {streak.sport_name || 'Unknown Sport'}
          </div>
        </div>
      </div>
    </FeedCardWrapper>
  )
}
