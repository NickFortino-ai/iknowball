import { useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import FeedCardWrapper from './FeedCardWrapper'
import ImageLightbox from './ImageLightbox'
import TeamAutocomplete from './TeamAutocomplete'
import { useUpdateHotTake, useHotTakeImageUpload, useTeamsForSport, useToggleBookmark, useRemindHotTake } from '../../hooks/useHotTakes'
import { useActiveSports } from '../../hooks/useGames'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../ui/Toast'

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
  const remindHotTake = useRemindHotTake()
  const [editContent, setEditContent] = useState('')
  const [editTeamTags, setEditTeamTags] = useState([])
  const [editSport, setEditSport] = useState(null)
  const [editTeamSearch, setEditTeamSearch] = useState('')
  const [existingImageUrl, setExistingImageUrl] = useState(null)
  const updateHotTake = useUpdateHotTake()
  const { uploading, previewUrl, selectImage, removeImage, uploadImage, hasImage } = useHotTakeImageUpload()
  const fileInputRef = useRef(null)

  const { data: activeSports } = useActiveSports()
  const { data: editTeams } = useTeamsForSport(editing ? editSport : null)

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
    setEditSport(null)
    setEditTeamSearch('')
    setExistingImageUrl(hot_take.image_url || null)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setEditContent('')
    setEditTeamTags([])
    setEditSport(null)
    setEditTeamSearch('')
    setExistingImageUrl(null)
    removeImage()
  }

  async function handleSave() {
    const trimmed = editContent.trim()
    if (!trimmed || trimmed.length > MAX_CHARS) return

    let imageUrl = existingImageUrl
    if (hasImage) {
      imageUrl = await uploadImage()
      if (!imageUrl && hasImage) return // upload failed
    }

    updateHotTake.mutate(
      { id: hot_take.id, content: trimmed, team_tags: editTeamTags.length ? editTeamTags : undefined, image_url: imageUrl || undefined },
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

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (file) {
      setExistingImageUrl(null)
      selectImage(file)
    }
    e.target.value = ''
  }

  const isOwnTake = item.userId === session?.user?.id

  async function handleRemind() {
    try {
      await remindHotTake.mutateAsync(hot_take.id)
      setReminded(true)
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
  const canSave = charCount > 0 && charCount <= MAX_CHARS && !updateHotTake.isPending && !uploading
  const currentPreview = previewUrl || existingImageUrl

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
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            maxLength={MAX_CHARS}
            rows={3}
            className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted resize-none outline-none focus:border-accent/40"
            autoFocus
          />

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
                title="Add image"
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
                accept="image/jpeg,image/png,image/webp"
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
                {updateHotTake.isPending || uploading ? 'Saving...' : 'Save'}
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
          <div className="text-sm text-text-primary leading-relaxed">
            {hot_take.content}
          </div>

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

          {/* Team tags + remind + bookmark */}
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
            </div>
            <div className="flex items-center gap-2">
              {!isOwnTake && !reminded && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemind() }}
                  disabled={remindHotTake.isPending}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-50 transition-colors"
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
