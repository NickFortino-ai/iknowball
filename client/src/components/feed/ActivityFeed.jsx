import { useState, useMemo, useRef, useEffect } from 'react'
import { useConnectionActivity } from '../../hooks/useConnections'
import { useFeedReactionsBatch } from '../../hooks/useSocial'
import { useBookmarkStatus, useToggleBookmark } from '../../hooks/useHotTakes'
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
import GroupedPickFeedCard from './GroupedPickFeedCard'
import DailyDigestFeedCard from './DailyDigestFeedCard'
import SweatFeedCard from './SweatFeedCard'
import SweatResultFeedCard from './SweatResultFeedCard'
import CalledShotFeedCard from './CalledShotFeedCard'
import StreakDetailModal from './StreakDetailModal'
import HeadToHeadDetailModal from './HeadToHeadDetailModal'
import HotTakeComposer from './HotTakeComposer'
import FeedCardWrapper from './FeedCardWrapper'
import FeedSkeleton from './FeedSkeleton'

function getFeedItemTargetKey(item) {
  if (item.type === 'pick' || item.type === 'underdog_hit' || item.type === 'multiplier_hit' || item.type === 'multiplier_miss') {
    return `pick-${item.pick.id}`
  } else if (item.type === 'parlay' || item.type === 'bad_beat') {
    return `parlay-${item.parlay.id}`
  } else if (item.type === 'streak') {
    return `streak_event-${item.streak.id}`
  } else if (item.type === 'record') {
    return `record_history-${item.record.id}`
  } else if (item.type === 'hot_take') {
    return `hot_take-${item.hot_take.id}`
  }
  return null
}

export default function ActivityFeed({ onUserTap, scope = 'squad', targetUserId = null, scrollToItemId, onScrollComplete }) {
  const [selectedStreakId, setSelectedStreakId] = useState(null)
  const [selectedH2HItem, setSelectedH2HItem] = useState(null)
  const [highlightedKey, setHighlightedKey] = useState(null)
  const scrollTargetRef = useRef(null)
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useConnectionActivity(scope, targetUserId)

  // Flatten all pages into a single list
  const activity = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((page) => page.items || [])
  }, [data])

  // Scroll to target item when data loads
  useEffect(() => {
    if (!scrollToItemId || !activity.length) return
    // Find the matching item
    const match = activity.find((item) => getFeedItemTargetKey(item) === scrollToItemId)
    if (match && scrollTargetRef.current) {
      setTimeout(() => {
        scrollTargetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 300)
      setHighlightedKey(scrollToItemId)
      const timer = setTimeout(() => setHighlightedKey(null), 3000)
      onScrollComplete?.()
      return () => clearTimeout(timer)
    }
  }, [scrollToItemId, activity])

  // Build reaction targets for batch query
  const reactionTargets = useMemo(() => {
    if (!activity?.length) return []
    const targets = []
    for (const item of activity) {
      if (item.grouped) {
        targets.push({ target_type: 'pick', target_id: item.pick.id })
      } else if (item.type === 'pick') targets.push({ target_type: 'pick', target_id: item.pick.id })
      else if (item.type === 'underdog_hit' || item.type === 'multiplier_hit' || item.type === 'multiplier_miss') {
        targets.push({ target_type: 'pick', target_id: item.pick.id })
      }
      else if (item.type === 'called_shot') targets.push({ target_type: 'pick', target_id: item.pick_id })
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

  // Bookmark status for hot takes
  const hotTakeIds = useMemo(() => {
    return activity.filter((i) => i.type === 'hot_take').map((i) => i.hot_take.id)
  }, [activity])
  const { data: bookmarkStatus } = useBookmarkStatus(hotTakeIds)
  const toggleBookmark = useToggleBookmark()

  function handleBookmarkToggle(hotTakeId) {
    toggleBookmark.mutate(hotTakeId)
  }

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
      {/* Hot Take Composer — hidden when viewing another user's feed */}
      {!targetUserId && <HotTakeComposer />}

      {/* Loading skeleton */}
      {isLoading ? (
        <FeedSkeleton />
      ) : !activity?.length ? (
        /* Empty state */
        <div className="bg-bg-card border border-border rounded-xl px-4 py-10 text-center">
          <div className="text-2xl mb-2">{scope === 'highlights' ? '\u2B50' : scope === 'hot_takes' ? '\uD83D\uDD25' : scope === 'all' ? '\uD83C\uDFC0' : '\uD83D\uDC4B'}</div>
          <div className="text-sm text-text-primary font-medium mb-1">
            {scope === 'highlights' ? 'No highlights yet' : scope === 'hot_takes' ? 'No hot takes yet' : scope === 'all' ? 'No activity yet' : 'Your feed is empty'}
          </div>
          <div className="text-xs text-text-muted">
            {scope === 'highlights'
              ? 'Make some picks and your notable activity will show up here.'
              : scope === 'hot_takes'
              ? 'Be the first to drop a hot take!'
              : scope === 'all'
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
                {group.items.map((item) => {
                  const targetKey = getFeedItemTargetKey(item)
                  const isScrollTarget = scrollToItemId && targetKey === scrollToItemId
                  const isHighlighted = targetKey && targetKey === highlightedKey
                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      ref={isScrollTarget ? scrollTargetRef : undefined}
                      className={`rounded-2xl transition-shadow duration-700 ${isHighlighted ? 'ring-2 ring-accent' : ''}`}
                    >
                      <FeedCard
                        item={item}
                        getReactions={getReactions}
                        onUserTap={onUserTap}
                        onStreakTap={setSelectedStreakId}
                        onH2HTap={setSelectedH2HItem}
                        bookmarkStatus={bookmarkStatus}
                        onBookmarkToggle={handleBookmarkToggle}
                      />
                    </div>
                  )
                })}
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

      <StreakDetailModal streakId={selectedStreakId} onClose={() => setSelectedStreakId(null)} />
      <HeadToHeadDetailModal item={selectedH2HItem} onClose={() => setSelectedH2HItem(null)} />
    </div>
  )
}

function FeedCard({ item, getReactions, onUserTap, onStreakTap, onH2HTap, bookmarkStatus, onBookmarkToggle }) {
  if (item.grouped) {
    return (
      <GroupedPickFeedCard
        item={item}
        reactions={getReactions('pick', item.pick.id)}
        onUserTap={onUserTap}
      />
    )
  }

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
          onStreakTap={onStreakTap}
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
          onH2HTap={onH2HTap}
        />
      )
    case 'hot_take':
      return (
        <HotTakeFeedCard
          item={item}
          reactions={getReactions('hot_take', item.hot_take.id)}
          onUserTap={onUserTap}
          isBookmarked={bookmarkStatus?.[item.hot_take.id] || false}
          onBookmarkToggle={onBookmarkToggle}
        />
      )
    case 'hot_take_reminder':
      return <HotTakeReminderFeedCard item={item} onUserTap={onUserTap} />
    case 'daily_digest':
      return <DailyDigestFeedCard item={item} />
    case 'sweat':
      return <SweatFeedCard item={item} onUserTap={onUserTap} />
    case 'sweat_result':
      return <SweatResultFeedCard item={item} onUserTap={onUserTap} />
    case 'called_shot':
      return (
        <CalledShotFeedCard
          item={item}
          reactions={getReactions('pick', item.pick_id)}
          onUserTap={onUserTap}
        />
      )
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
