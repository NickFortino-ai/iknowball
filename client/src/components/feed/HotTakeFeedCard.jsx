import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import FeedCardWrapper from './FeedCardWrapper'
import ImageLightbox from './ImageLightbox'
import TeamAutocomplete from './TeamAutocomplete'
import Avatar from '../ui/Avatar'
import { useUpdateHotTake, useHotTakeImageUpload, useHotTakeVideoUpload, useTeamsForSport, useToggleBookmark, useRemindHotTake } from '../../hooks/useHotTakes'
import { useSearchUsers } from '../../hooks/useInvitations'
import { useActiveSports } from '../../hooks/useGames'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../ui/Toast'
import RichContent from './RichContent'
import LinkPreview from './LinkPreview'
import { extractFirstUrl } from '../../lib/urlUtils'

function FeedVideo({ url }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {})
        } else {
          video.pause()
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const toggleMute = useCallback((e) => {
    e.stopPropagation()
    setMuted((m) => !m)
  }, [])

  return (
    <div ref={containerRef} className="relative mt-2 cursor-pointer" onClick={toggleMute}>
      <video
        ref={videoRef}
        src={url}
        muted={muted}
        playsInline
        loop
        preload="metadata"
        className="w-full rounded-lg"
      />
      <div className="absolute bottom-2 right-2 bg-black/60 rounded-full p-1.5">
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
    </div>
  )
}

const MAX_CHARS = 280

const sportTabs = [
  { label: 'NBA', key: 'basketball_nba' },
  { label: 'NCAAB', key: 'basketball_ncaab' },
  { label: 'WNCAAB', key: 'basketball_wncaab' },
  { label: 'MLB', key: 'baseball_mlb' },
  { label: 'NFL', key: 'americanfootball_nfl' },
  { label: 'NHL', key: 'icehockey_nhl' },
  { label: 'MLS', key: 'soccer_usa_mls' },
  { label: 'WNBA', key: 'basketball_wnba' },
  { label: 'NCAAF', key: 'americanfootball_ncaaf' },
]

export default function HotTakeFeedCard({ item, reactions, onUserTap, isBookmarked, onBookmarkToggle }) {
  const { hot_take } = item
  const { session } = useAuth()
  const navigate = useNavigate()
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [reminded, setReminded] = useState(false)
  const [showRemindInput, setShowRemindInput] = useState(false)
  const [remindComment, setRemindComment] = useState('')
  const remindHotTake = useRemindHotTake()
  const [editContent, setEditContent] = useState('')
  const [editTeamTags, setEditTeamTags] = useState([])
  const [editSport, setEditSport] = useState(null)
  const [editTeamSearch, setEditTeamSearch] = useState('')
  const [editUserTags, setEditUserTags] = useState([])
  const [editMentionQuery, setEditMentionQuery] = useState('')
  const [existingImageUrl, setExistingImageUrl] = useState(null)
  const [existingVideoUrl, setExistingVideoUrl] = useState(null)
  const updateHotTake = useUpdateHotTake()
  const { uploading, previewUrl, selectImage, removeImage, uploadImage, hasImage } = useHotTakeImageUpload()
  const { uploading: videoUploading, previewUrl: videoPreviewUrl, selectVideo, removeVideo, uploadVideo, hasVideo } = useHotTakeVideoUpload()
  const fileInputRef = useRef(null)
  const editTextareaRef = useRef(null)

  const { data: activeSports } = useActiveSports()
  const { data: editTeams } = useTeamsForSport(editing ? editSport : null)
  const { data: editMentionResults } = useSearchUsers(editing ? editMentionQuery : '')

  const sortedSportTabs = useMemo(() => {
    if (!activeSports?.length) return sportTabs
    const activeKeys = new Set(activeSports.map((s) => s.key))
    return [...sportTabs].sort((a, b) => {
      const aActive = activeKeys.has(a.key) ? 0 : 1
      const bActive = activeKeys.has(b.key) ? 0 : 1
      return aActive - bActive
    })
  }, [activeSports])

  function startEditing() {
    setEditContent(hot_take.content)
    setEditTeamTags(hot_take.team_tags || [])
    setEditUserTags(hot_take.tagged_users || [])
    setEditMentionQuery('')
    setEditSport(null)
    setEditTeamSearch('')
    setExistingImageUrl(hot_take.image_url || null)
    setExistingVideoUrl(hot_take.video_url || null)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setEditContent('')
    setEditTeamTags([])
    setEditUserTags([])
    setEditMentionQuery('')
    setEditSport(null)
    setEditTeamSearch('')
    setExistingImageUrl(null)
    setExistingVideoUrl(null)
    removeImage()
    removeVideo()
  }

  async function handleSave() {
    const trimmed = editContent.trim()
    if (!trimmed || trimmed.length > MAX_CHARS) return

    let imageUrl = existingImageUrl
    if (hasImage) {
      imageUrl = await uploadImage()
      if (!imageUrl && hasImage) return // upload failed
    }

    let videoUrl = existingVideoUrl
    if (hasVideo) {
      videoUrl = await uploadVideo()
      if (!videoUrl && hasVideo) return // upload failed
    }

    updateHotTake.mutate(
      { id: hot_take.id, content: trimmed, team_tags: editTeamTags.length ? editTeamTags : undefined, image_url: imageUrl || undefined, video_url: videoUrl || undefined, user_tags: editUserTags.length ? editUserTags.map((u) => u.id) : undefined },
      {
        onSuccess: () => {
          cancelEditing()
        },
        onError: (err) => {
          if (err.status === 403) {
            toast('Your posting privileges have been suspended.', 'error')
          } else {
            toast(err.message || 'Failed to update', 'error')
          }
        },
      }
    )
  }

  function handleRemoveImage() {
    setExistingImageUrl(null)
    removeImage()
  }

  function handleRemoveVideo() {
    setExistingVideoUrl(null)
    removeVideo()
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) { e.target.value = ''; return }
    if (file.type.startsWith('video/')) {
      setExistingImageUrl(null)
      removeImage()
      setExistingVideoUrl(null)
      selectVideo(file)
    } else {
      setExistingVideoUrl(null)
      removeVideo()
      setExistingImageUrl(null)
      selectImage(file)
    }
    e.target.value = ''
  }

  function handleEditContentChange(e) {
    const val = e.target.value
    const cursorPos = e.target.selectionStart
    setEditContent(val)

    const beforeCursor = val.slice(0, cursorPos)
    const mentionMatch = beforeCursor.match(/(^|\s)@(\w*)$/)
    if (mentionMatch) {
      setEditMentionQuery(mentionMatch[2].length >= 2 ? mentionMatch[2] : '')
    } else {
      setEditMentionQuery('')
    }
  }

  function handleEditMentionSelect(user) {
    if (editUserTags.length >= 3 || editUserTags.some((u) => u.id === user.id)) return
    const textarea = editTextareaRef.current
    const cursorPos = textarea?.selectionStart || editContent.length
    const beforeCursor = editContent.slice(0, cursorPos)
    const afterCursor = editContent.slice(cursorPos)
    const match = beforeCursor.match(/@(\w*)$/)
    if (match) {
      const prefix = beforeCursor.slice(0, beforeCursor.length - match[0].length)
      const inserted = `@${user.username} `
      const newContent = prefix + inserted + afterCursor
      const newPos = prefix.length + inserted.length
      setEditContent(newContent)
      setEditUserTags([...editUserTags, user])
      setEditMentionQuery('')
      setTimeout(() => {
        if (textarea) {
          textarea.selectionStart = newPos
          textarea.selectionEnd = newPos
          textarea.focus()
        }
      }, 0)
    }
  }

  const isOwnTake = item.userId === session?.user?.id

  async function handleRemindSubmit() {
    try {
      await remindHotTake.mutateAsync({ hotTakeId: hot_take.id, comment: remindComment.trim() || undefined })
      setReminded(true)
      setShowRemindInput(false)
      setRemindComment('')
      toast(`@${item.username} has been reminded about this take`, 'success')
    } catch (err) {
      if (err.status === 403) {
        toast('You must be connected to this user to remind them', 'error')
      } else {
        toast(err.message || 'Failed to remind', 'error')
      }
    }
  }

  const charCount = editContent.length
  const canSave = charCount > 0 && charCount <= MAX_CHARS && !updateHotTake.isPending && !uploading && !videoUploading
  const currentPreview = previewUrl || existingImageUrl
  const currentVideoPreview = videoPreviewUrl || existingVideoUrl

  return (
    <FeedCardWrapper
      item={item}
      borderColor="purple"
      targetType="hot_take"
      targetId={hot_take.id}
      reactions={reactions}
      onUserTap={onUserTap}
      commentCount={item.commentCount}
      onEdit={startEditing}
    >
      {editing ? (
        <div className="space-y-2">
          <div className="relative">
            <textarea
              ref={editTextareaRef}
              value={editContent}
              onChange={handleEditContentChange}
              maxLength={MAX_CHARS}
              rows={3}
              className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted resize-none outline-none focus:border-accent/40"
              autoFocus
            />

            {/* @mention autocomplete dropdown */}
            {editMentionQuery.length >= 2 && editMentionResults?.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {editMentionResults
                  .filter((u) => !editUserTags.some((t) => t.id === u.id))
                  .slice(0, 5)
                  .map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleEditMentionSelect(u)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-card-hover transition-colors"
                    >
                      <Avatar user={u} size="xs" />
                      <div className="min-w-0">
                        <div className="text-xs text-text-primary truncate">{u.display_name || u.username}</div>
                        <div className="text-[10px] text-text-muted truncate">@{u.username}</div>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Image preview */}
          {currentPreview && (
            <div className="relative inline-block">
              <img
                src={currentPreview}
                alt="Preview"
                className="max-h-32 rounded-lg object-cover"
              />
              <button
                onClick={handleRemoveImage}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white text-xs hover:bg-black/90 transition-colors"
              >
                ×
              </button>
            </div>
          )}

          {/* Video preview */}
          {currentVideoPreview && (
            <div className="relative inline-block">
              <video
                src={currentVideoPreview}
                controls
                className="max-h-48 rounded-lg"
              />
              <button
                onClick={handleRemoveVideo}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white text-xs hover:bg-black/90 transition-colors"
              >
                ×
              </button>
            </div>
          )}

          {/* Sport chips for editing */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {sortedSportTabs.map((sport) => (
              <button
                key={sport.key}
                onClick={() => {
                  if (editSport === sport.key) {
                    setEditSport(null)
                    setEditTeamSearch('')
                  } else {
                    setEditSport(sport.key)
                    setEditTeamSearch('')
                  }
                }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-colors ${
                  editSport === sport.key
                    ? 'bg-accent text-white'
                    : 'bg-bg-secondary text-text-secondary hover:bg-border'
                }`}
              >
                {sport.label}
              </button>
            ))}
          </div>

          {/* Team tag pills */}
          {editTeamTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {editTeamTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-accent/15 text-accent px-2 py-0.5 rounded-full"
                >
                  {tag}
                  <button
                    onClick={() => setEditTeamTags(editTeamTags.filter((t) => t !== tag))}
                    className="hover:text-white transition-colors leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* User tag pills (edit) */}
          {editUserTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {editUserTags.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full"
                >
                  <Avatar user={u} size="xs" />
                  @{u.username}
                  <button
                    onClick={() => setEditUserTags(editUserTags.filter((t) => t.id !== u.id))}
                    className="hover:text-white transition-colors leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {editSport && editTeamTags.length < 5 ? (
                <div className="w-28">
                  <TeamAutocomplete
                    teams={(editTeams || []).filter((t) => !editTeamTags.includes(t))}
                    onSelect={(t) => setEditTeamTags([...editTeamTags, t])}
                    inputValue={editTeamSearch}
                    onInputChange={setEditTeamSearch}
                    placeholder="Tag team..."
                  />
                </div>
              ) : !editSport && editTeamTags.length < 5 ? (
                <span className="text-[10px] text-text-muted">Pick a sport to tag</span>
              ) : null}

              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-text-muted hover:text-text-secondary transition-colors p-1"
                title="Upload image/video"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                onChange={handleFileChange}
                className="hidden"
              />

              {charCount > 0 && (
                <span className={`text-xs flex-shrink-0 ${charCount > MAX_CHARS ? 'text-incorrect' : 'text-text-muted'}`}>
                  {charCount}/{MAX_CHARS}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={cancelEditing}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="bg-accent text-white text-xs font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50 transition-opacity"
              >
                {updateHotTake.isPending || uploading || videoUploading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Viral badge */}
          {item.viral && (
            <div className="mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded-full">
                {'\uD83D\uDD25'} {item.remindCount}+ reminds
              </span>
            </div>
          )}

          {/* Tweet-style content */}
          <RichContent text={hot_take.content} className="text-sm text-text-primary leading-relaxed" />

          {/* Image */}
          {hot_take.image_url && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxOpen(true) }}
              className="mt-2 block w-full"
            >
              <img
                src={hot_take.image_url}
                alt=""
                className="w-full rounded-lg"
              />
            </button>
          )}

          {/* Video */}
          {hot_take.video_url && <FeedVideo url={hot_take.video_url} />}

          {/* Link preview */}
          {extractFirstUrl(hot_take.content) && (
            <LinkPreview url={extractFirstUrl(hot_take.content)} />
          )}

          {/* Team tags + user tags + remind + bookmark */}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex flex-wrap gap-1">
              {hot_take.team_tags?.length > 0 && hot_take.team_tags.map((tag) => (
                <button
                  key={tag}
                  onClick={(e) => { e.stopPropagation(); navigate(`/hub?tab=team_feed&team=${encodeURIComponent(tag)}`) }}
                  className="text-[10px] font-semibold uppercase tracking-wider bg-accent/15 text-accent px-2 py-0.5 rounded-full hover:bg-accent/25 transition-colors"
                >
                  {tag}
                </button>
              ))}
              {hot_take.tagged_users?.length > 0 && hot_take.tagged_users.map((u) => (
                <button
                  key={u.id}
                  onClick={(e) => { e.stopPropagation(); onUserTap?.(u.id) }}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full hover:bg-purple-500/25 transition-colors"
                >
                  <Avatar user={u} size="xs" />
                  @{u.username}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {!isOwnTake && !reminded && !showRemindInput && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowRemindInput(true) }}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
                >
                  Remind
                </button>
              )}
              {onBookmarkToggle && (
                <button
                  onClick={(e) => { e.stopPropagation(); onBookmarkToggle(hot_take.id) }}
                  className={`p-1 transition-colors ${isBookmarked ? 'text-accent' : 'text-text-muted hover:text-text-secondary'}`}
                  title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Inline remind input */}
          {showRemindInput && (
            <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={remindComment}
                onChange={(e) => setRemindComment(e.target.value)}
                placeholder="Add a comment (optional)"
                maxLength={280}
                className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent/40"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleRemindSubmit() }}
              />
              <button
                onClick={handleRemindSubmit}
                disabled={remindHotTake.isPending}
                className="bg-accent text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-opacity"
              >
                {remindHotTake.isPending ? '...' : 'Send'}
              </button>
              <button
                onClick={() => { setShowRemindInput(false); setRemindComment('') }}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Lightbox */}
          {lightboxOpen && hot_take.image_url && (
            <ImageLightbox
              src={hot_take.image_url}
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </>
      )}
    </FeedCardWrapper>
  )
}
