import { useEffect } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { useHotTakeById } from '../../hooks/useHotTakes'
import { useAuth } from '../../hooks/useAuth'
import { useConnectionStatus } from '../../hooks/useConnections'
import LoadingSpinner from '../ui/LoadingSpinner'
import Avatar from '../ui/Avatar'
import FeedReactions from './FeedReactions'
import PickComments from '../social/PickComments'
import { timeAgo } from '../../lib/time'

export default function HotTakeDetailModal({ hotTakeId, onClose }) {
  const { data: item, isLoading } = useHotTakeById(hotTakeId)
  const { session } = useAuth()
  const ownerId = item?.userId
  const isOwn = ownerId && ownerId === session?.user?.id
  const { data: connData } = useConnectionStatus(!isOwn ? ownerId : null)
  const canComment = isOwn || connData?.status === 'connected'

  useEffect(() => {
    if (!hotTakeId) return
    lockScroll()
    return () => unlockScroll()
  }, [hotTakeId])

  if (!hotTakeId) return null

  const hotTake = item?.hot_take

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-card border border-border w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[95vh] md:max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
        >
          &times;
        </button>

        {isLoading ? (
          <LoadingSpinner />
        ) : !item ? (
          <p className="text-text-muted text-center">Hot take not found</p>
        ) : (
          <div className="space-y-4">
            {/* Author header */}
            <div className="flex items-center gap-3">
              <Avatar
                user={{ avatar_url: item.avatar_url, avatar_emoji: item.avatar_emoji, username: item.username, display_name: item.display_name }}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">{item.display_name || item.username}</div>
                <div className="text-xs text-text-muted">@{item.username}</div>
              </div>
              <span className="text-xs text-text-muted flex-shrink-0">{timeAgo(item.timestamp)}</span>
            </div>

            {/* Hot take content */}
            <div className="bg-bg-primary rounded-xl p-4">
              <div className="text-sm text-text-primary leading-relaxed">{hotTake.content}</div>
              {hotTake.image_url && (
                <img src={hotTake.image_url} alt="" className="w-full rounded-lg mt-2" />
              )}
              {(hotTake.team_tags?.length > 0 || hotTake.tagged_users?.length > 0) && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {hotTake.team_tags?.map((tag) => (
                    <span key={tag} className="text-[10px] font-semibold uppercase tracking-wider bg-accent/15 text-accent px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                  {hotTake.tagged_users?.map((u) => (
                    <span key={u.id} className="inline-flex items-center gap-1 text-[10px] font-semibold bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full">
                      <Avatar user={u} size="xs" />
                      @{u.username}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Reactions */}
            <FeedReactions targetType="hot_take" targetId={hotTake.id} />

            {/* Comments (pre-expanded) */}
            <PickComments targetType="hot_take" targetId={hotTake.id} initialExpanded hideForm={!canComment} />
          </div>
        )}
      </div>
    </div>
  )
}
