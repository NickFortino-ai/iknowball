import FeedCardWrapper from './FeedCardWrapper'

function getFlameSize(length) {
  if (length >= 7) return 'text-3xl'
  if (length >= 4) return 'text-2xl'
  return 'text-xl'
}

export default function StreakFeedCard({ item, reactions, onUserTap }) {
  const { streak } = item

  return (
    <FeedCardWrapper
      item={item}
      borderColor="orange"
      targetType="streak_event"
      targetId={streak.id}
      reactions={reactions}
      onUserTap={onUserTap}
    >
      <div className="flex items-center gap-3">
        <span className={getFlameSize(streak.streak_length)}>
          {'\uD83D\uDD25'}
        </span>
        <div>
          <div className="font-bold text-lg text-orange-400">
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
