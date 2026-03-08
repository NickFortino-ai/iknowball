import { useMemo } from 'react'
import { useBookmarkedHotTakes, useToggleBookmark } from '../../hooks/useHotTakes'
import { useFeedReactionsBatch } from '../../hooks/useSocial'
import HotTakeFeedCard from './HotTakeFeedCard'
import FeedSkeleton from './FeedSkeleton'

export default function ReceiptsTab({ onUserTap }) {
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useBookmarkedHotTakes()
  const toggleBookmark = useToggleBookmark()

  const items = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((page) => page.items || [])
  }, [data])

  // Batch reactions for displayed items
  const reactionTargets = useMemo(() => {
    return items.map((item) => ({ target_type: 'hot_take', target_id: item.hot_take.id }))
  }, [items])

  const { data: reactionsBatch } = useFeedReactionsBatch(reactionTargets)

  function getReactions(targetType, targetId) {
    if (!reactionsBatch) return []
    return reactionsBatch[`${targetType}-${targetId}`] || []
  }

  function handleBookmarkToggle(hotTakeId) {
    toggleBookmark.mutate(hotTakeId)
  }

  if (isLoading) return <FeedSkeleton />

  if (!items.length) {
    return (
      <div className="bg-bg-card border border-border rounded-xl px-4 py-10 text-center">
        <div className="text-2xl mb-2">{'\uD83D\uDD16'}</div>
        <div className="text-sm text-text-primary font-medium mb-1">No receipts yet</div>
        <div className="text-xs text-text-muted">Bookmark hot takes to save them here for later</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <HotTakeFeedCard
          key={item.id}
          item={item}
          reactions={getReactions('hot_take', item.hot_take.id)}
          onUserTap={onUserTap}
          isBookmarked={true}
          onBookmarkToggle={handleBookmarkToggle}
        />
      ))}

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
  )
}
