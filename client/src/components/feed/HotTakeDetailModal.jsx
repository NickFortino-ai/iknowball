import { useEffect, useRef, useState, useCallback } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { useHotTakeById } from '../../hooks/useHotTakes'
import { useAuth } from '../../hooks/useAuth'
import { useConnectionStatus } from '../../hooks/useConnections'
import LoadingSpinner from '../ui/LoadingSpinner'
import Avatar from '../ui/Avatar'
import RichContent from './RichContent'
import LinkPreview from './LinkPreview'
import FeedReactions from './FeedReactions'
import PickComments from '../social/PickComments'
import { timeAgo } from '../../lib/time'
import { extractFirstUrl } from '../../lib/urlUtils'

function DetailVideo({ url }) {
  const videoRef = useRef(null)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (video) video.play().catch(() => {})
  }, [])

  // Sync muted property imperatively (React doesn't reliably update video.muted via JSX)
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  const togglePlayPause = useCallback((e) => {
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => {})
      setPaused(false)
    } else {
      video.pause()
      setPaused(true)
    }
  }, [])

  const toggleMute = useCallback((e) => {
    e.stopPropagation()
    setMuted((m) => !m)
  }, [])

  const expandVideo = useCallback((e) => {
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return
    if (video.requestFullscreen) {
      video.requestFullscreen()
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen()
    }
  }, [])

  return (
    <div className="relative mt-2 cursor-pointer" onClick={togglePlayPause}>
      <video
        ref={videoRef}
        src={url}
        muted={muted}
        playsInline
        loop
        preload="metadata"
        className="w-full rounded-lg"
      />
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-black/50 rounded-full p-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 bg-black/60 rounded-full p-1.5" onClick={toggleMute}>
        {muted ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
      </div>
      <div className="absolute bottom-2 right-2 bg-black/60 rounded-full p-1.5" onClick={expandVideo}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </div>
    </div>
  )
}

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
        className="relative bg-bg-primary border border-text-primary/20 w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[95vh] md:max-h-[85vh] overflow-y-auto"
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
              <RichContent text={hotTake.content} className="text-sm text-text-primary leading-relaxed" />
              {hotTake.image_url && (
                <img src={hotTake.image_url} alt="" className="w-full rounded-lg mt-2" />
              )}
              {hotTake.video_url && <DetailVideo url={hotTake.video_url} />}
              {extractFirstUrl(hotTake.content) && (
                <LinkPreview url={extractFirstUrl(hotTake.content)} />
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
