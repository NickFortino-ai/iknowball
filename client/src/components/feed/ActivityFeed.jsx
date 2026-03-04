import { useMemo } from 'react'
import { useConnectionActivity } from '../../hooks/useConnections'
import { useFeedReactionsBatch } from '../../hooks/useSocial'
import { getDateKey, formatFeedDate } from '../../lib/time'
import PickFeedCard from './PickFeedCard'
import ParlayFeedCard from './ParlayFeedCard'
import StreakFeedCard from './StreakFeedCard'
import TierUpFeedCard from './TierUpFeedCard'
import RecordFeedCard from './RecordFeedCard'
import UnderdogHitFeedCard from './UnderdogHitFeedCard'
import MultiplierFeedCard from './MultiplierFeedCard'
import BadBeatFeedCard from './BadBeatFeedCard'
import HeadToHeadFeedCard from './HeadToHeadFeedCard'
import HotTakeFeedCard from './HotTakeFeedCard'
import HotTakeReminderFeedCard from './HotTakeReminderFeedCard'
import HotTakeComposer from './HotTakeComposer'
import FeedCardWrapper from './FeedCardWrapper'
import FeedSkeleton from './FeedSkeleton'

export default function ActivityFeed({ onUserTap, scope = 'squad' }) {
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useConnectionActivity(scope)

  // Flatten all pages into a single list
  const activity = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((page) => page.items || [])
  }, [data])

  // Build reaction targets for batch query
  const reactionTargets = useMemo(() => {
    if (!activity?.length) return []
    const targets = []
    for (const item of activity) {
      if (item.type === 'pick') targets.push({ target_type: 'pick', target_id: item.pick.id })
      else if (item.type === 'underdog_hit' || item.type === 'multiplier_hit' || item.type === 'multiplier_miss') {
        targets.push({ target_type: 'pick', target_id: item.pick.id })
      }
      else if (item.type === 'parlay') targets.push({ target_type: 'parlay', target_id: item.parlay.id })
      else if (item.type === 'bad_beat') targets.push({ target_type: 'parlay', target_id: item.parlay.id })
      else if (item.type === 'streak') targets.push({ target_type: 'streak_event', target_id: item.streak.id })
      else if (item.type === 'record') targets.push({ target_type: 'record_history', target_id: item.record.id })
      else if (item.type === 'hot_take') targets.push({ target_type: 'hot_take', target_id: item.hot_take.id })
      else if (item.type === 'head_to_head' && item.pickId) {
        targets.push({ target_type: 'head_to_head', target_id: item.pickId })
      }
    }
    return targets
  }, [activity])

  const { data: reactionsBatch } = useFeedReactionsBatch(reactionTargets)

  function getReactions(targetType, targetId) {
    if (!reactionsBatch) return []
    return reactionsBatch[`${targetType}-${targetId}`] || []
  }

  // Group by date
  const groupedItems = useMemo(() => {
    if (!activity?.length) return []
    const groups = []
    let currentKey = null
    let currentGroup = null

    for (const item of activity) {
      const key = getDateKey(item.timestamp)
      if (key !== currentKey) {
        currentKey = key
        currentGroup = { dateKey: key, label: formatFeedDate(item.timestamp), items: [] }
        groups.push(currentGroup)
      }
      currentGroup.items.push(item)
    }

    return groups
  }, [activity])

  return (
    <div>
      {/* Hot Take Composer */}
      <HotTakeComposer />

      {/* Loading skeleton */}
      {isLoading ? (
        <FeedSkeleton />
      ) : !activity?.length ? (
        /* Empty state */
        <div className="bg-bg-card border border-border rounded-xl px-4 py-10 text-center">
          <div className="text-2xl mb-2">{scope === 'all' ? '\uD83C\uDFC0' : '\uD83D\uDC4B'}</div>
          <div className="text-sm text-text-primary font-medium mb-1">
            {scope === 'all' ? 'No activity yet' : 'Your feed is empty'}
          </div>
          <div className="text-xs text-text-muted">
            {scope === 'all'
              ? 'Be the first to drop a hot take!'
              : 'Connect with other users to see their activity here.'}
          </div>
        </div>
      ) : (
        <div>
          {groupedItems.map((group, groupIdx) => (
            <div key={group.dateKey} className={groupIdx > 0 ? 'mt-6' : ''}>
              <h3 className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-2 px-1">
                {group.label}
              </h3>
              <div className="space-y-3">
                {group.items.map((item) => (
                  <FeedCard
                    key={`${item.type}-${item.id}`}
                    item={item}
                    getReactions={getReactions}
                    onUserTap={onUserTap}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasNextPage && (
            <div className="mt-4 text-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="text-sm text-accent hover:text-accent-hover font-medium px-4 py-2 rounded-lg bg-bg-card border border-border hover:border-accent/30 transition-colors disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FeedCard({ item, getReactions, onUserTap }) {
  switch (item.type) {
    case 'pick':
      return (
        <PickFeedCard
          item={item}
          reactions={getReactions('pick', item.pick.id)}
          onUserTap={onUserTap}
        />
      )
    case 'underdog_hit':
      return (
        <UnderdogHitFeedCard
          item={item}
          reactions={getReactions('pick', item.pick.id)}
          onUserTap={onUserTap}
        />
      )
    case 'multiplier_hit':
    case 'multiplier_miss':
      return (
        <MultiplierFeedCard
          item={item}
          reactions={getReactions('pick', item.pick.id)}
          onUserTap={onUserTap}
        />
      )
    case 'parlay':
      return (
        <ParlayFeedCard
          item={item}
          reactions={getReactions('parlay', item.parlay.id)}
          onUserTap={onUserTap}
        />
      )
    case 'bad_beat':
      return (
        <BadBeatFeedCard
          item={item}
          reactions={getReactions('parlay', item.parlay.id)}
          onUserTap={onUserTap}
        />
      )
    case 'streak':
      return (
        <StreakFeedCard
          item={item}
          reactions={getReactions('streak_event', item.streak.id)}
          onUserTap={onUserTap}
        />
      )
    case 'tier_up':
      return <TierUpFeedCard item={item} onUserTap={onUserTap} />
    case 'record':
      return (
        <RecordFeedCard
          item={item}
          reactions={getReactions('record_history', item.record.id)}
          onUserTap={onUserTap}
        />
      )
    case 'head_to_head':
      return (
        <HeadToHeadFeedCard
          item={item}
          reactions={getReactions('head_to_head', item.pickId)}
          onUserTap={onUserTap}
        />
      )
    case 'hot_take':
      return (
        <HotTakeFeedCard
          item={item}
          reactions={getReactions('hot_take', item.hot_take.id)}
          onUserTap={onUserTap}
        />
      )
    case 'hot_take_reminder':
      return <HotTakeReminderFeedCard item={item} onUserTap={onUserTap} />
    case 'comment':
      return <CommentFeedCard item={item} onUserTap={onUserTap} />
    default:
      return null
  }
}

function CommentFeedCard({ item, onUserTap }) {
  const { comment } = item
  const targetLabel = comment.target_type === 'pick' ? 'pick'
    : comment.target_type === 'parlay' ? 'parlay'
    : comment.target_type === 'prop' ? 'prop pick'
    : comment.target_type === 'streak_event' ? 'streak'
    : comment.target_type === 'record_history' ? 'record'
    : comment.target_type === 'hot_take' ? 'hot take'
    : 'item'

  const ownerText = comment.owner_username
    ? `@${comment.owner_username}'s`
    : 'a'

  return (
    <FeedCardWrapper item={item} onUserTap={onUserTap}>
      <div className="text-sm text-text-secondary">
        Commented on {ownerText} {targetLabel}
      </div>
      <div className="mt-1 text-sm text-text-primary bg-bg-secondary rounded-lg px-3 py-2 italic">
        &ldquo;{comment.content}&rdquo;
      </div>
    </FeedCardWrapper>
  )
}
