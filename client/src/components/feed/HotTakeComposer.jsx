import { useState, useRef, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCreateHotTake, useHotTakeImageUpload, useHotTakeVideoUpload, useTeamsForSport } from '../../hooks/useHotTakes'
import { useActiveSports } from '../../hooks/useGames'
import { useSearchUsers } from '../../hooks/useInvitations'
import { useProfile } from '../../hooks/useProfile'
import Avatar from '../ui/Avatar'
import InfoTooltip from '../ui/InfoTooltip'
import TeamAutocomplete from './TeamAutocomplete'
import { toast } from '../ui/Toast'

const MAX_CHARS = 280
const IMAGE_URL_REGEX = /(?:https?:\/\/|www\.)[^\s]+\.(jpg|jpeg|png|gif|webp)(\?[^\s]*)?/gi

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

const POST_TYPES = [
  { key: 'post', color: 'bg-purple-500', label: 'Post', placeholder: 'Talk to us.' },
  { key: 'prediction', color: 'bg-green-500', label: 'Prediction', placeholder: "What's your prediction?" },
  { key: 'poll', color: 'bg-orange-500', label: 'Poll', placeholder: 'Create a poll' },
]

export default function HotTakeComposer({ initialTeamTags = [] }) {
  const [content, setContent] = useState('')
  const [postType, setPostType] = useState('post')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [teamTags, setTeamTags] = useState(initialTeamTags)
  const [selectedSport, setSelectedSport] = useState(null)
  const [teamSearch, setTeamSearch] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [userTags, setUserTags] = useState([])
  const [mentionQuery, setMentionQuery] = useState('')
  const createHotTake = useCreateHotTake()
  const queryClient = useQueryClient()
  const { data: profile } = useProfile()
  const { uploading, previewUrls, selectImage, removeImage, uploadImage, hasImage, imageCount } = useHotTakeImageUpload()
  const { uploading: videoUploading, previewUrl: videoPreviewUrl, selectVideo, removeVideo, uploadVideo, hasVideo } = useHotTakeVideoUpload()
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)

  const { data: activeSports } = useActiveSports()
  const { data: teams } = useTeamsForSport(selectedSport)
  const { data: mentionResults } = useSearchUsers(mentionQuery)

  // Sort sport tabs: active sports first
  const sortedSportTabs = useMemo(() => {
    if (!activeSports?.length) return sportTabs
    const activeKeys = new Set(activeSports.map((s) => s.key))
    return [...sportTabs].sort((a, b) => {
      const aActive = activeKeys.has(a.key) ? 0 : 1
      const bActive = activeKeys.has(b.key) ? 0 : 1
      return aActive - bActive
    })
  }, [activeSports])

  // Inline content autocomplete — extract current word at cursor
  const [inlineMatches, setInlineMatches] = useState([])
  const [inlineDropdownPos, setInlineDropdownPos] = useState(null)

  function handleContentChange(e) {
    const val = e.target.value
    const cursorPos = e.target.selectionStart
    setContent(val)

    // Detect @mention at cursor position
    const beforeCursor = val.slice(0, cursorPos)
    const mentionMatch = beforeCursor.match(/(^|\s)@(\w*)$/)
    if (mentionMatch) {
      setMentionQuery(mentionMatch[2].length >= 2 ? mentionMatch[2] : '')
      setInlineMatches([])
      setInlineDropdownPos(null)
      return
    }
    setMentionQuery('')

    if (!teams?.length || !selectedSport) {
      setInlineMatches([])
      setInlineDropdownPos(null)
      return
    }

    // Get the last word being typed (split on whitespace)
    const words = val.split(/\s+/)
    const currentWord = (words[words.length - 1] || '').toLowerCase()

    if (currentWord.length >= 3) {
      const matches = teams.filter((t) => {
        const lower = t.toLowerCase()
        if (lower.includes(currentWord)) return true
        return lower.split(/\s+/).some((w) => w.startsWith(currentWord))
      }).filter((t) => !teamTags.includes(t)).slice(0, 6)
      setInlineMatches(matches)
      setInlineDropdownPos(matches.length > 0 ? { show: true } : null)
    } else {
      setInlineMatches([])
      setInlineDropdownPos(null)
    }
  }

  function handleInlineSelect(teamName) {
    if (teamTags.length < 5 && !teamTags.includes(teamName)) {
      setTeamTags([...teamTags, teamName])
    }
    setInlineMatches([])
    setInlineDropdownPos(null)
    textareaRef.current?.focus()
  }

  function handleMentionSelect(user) {
    if (userTags.length >= 3 || userTags.some((u) => u.id === user.id)) return
    const textarea = textareaRef.current
    const cursorPos = textarea?.selectionStart || content.length
    const beforeCursor = content.slice(0, cursorPos)
    const afterCursor = content.slice(cursorPos)
    const match = beforeCursor.match(/@(\w*)$/)
    if (match) {
      const prefix = beforeCursor.slice(0, beforeCursor.length - match[0].length)
      const inserted = `@${user.username} `
      const newContent = prefix + inserted + afterCursor
      const newPos = prefix.length + inserted.length
      setContent(newContent)
      setUserTags([...userTags, user])
      setMentionQuery('')
      setTimeout(() => {
        if (textarea) {
          textarea.selectionStart = newPos
          textarea.selectionEnd = newPos
          textarea.focus()
        }
      }, 0)
    }
  }

  function addTeamTag(teamName) {
    if (teamTags.length < 5 && !teamTags.includes(teamName)) {
      setTeamTags([...teamTags, teamName])
    }
  }

  function removeTeamTag(teamName) {
    setTeamTags(teamTags.filter((t) => t !== teamName))
  }

  const charCount = content.length
  const pollValid = postType !== 'poll' || pollOptions.filter((o) => o.trim()).length >= 2
  const hasContent = charCount > 0 || hasImage || hasVideo
  const canPost = hasContent && charCount <= MAX_CHARS && !createHotTake.isPending && !uploading && !videoUploading && pollValid

  async function handlePost() {
    if (!canPost) return

    let imageUrl = undefined
    let imageUrls = undefined
    if (hasImage) {
      const urls = await uploadImage()
      if (!urls && hasImage) return // upload failed
      imageUrls = urls
      imageUrl = urls?.[0]
    }

    let videoUrl = undefined
    if (hasVideo) {
      videoUrl = await uploadVideo()
      if (!videoUrl && hasVideo) return // upload failed
    }

    const trimmedPollOptions = postType === 'poll' ? pollOptions.filter((o) => o.trim()).map((o) => o.trim()) : undefined

    createHotTake.mutate(
      { content: content.trim(), team_tags: teamTags.length ? teamTags : undefined, sport_key: selectedSport || undefined, image_url: imageUrl, image_urls: imageUrls, video_url: videoUrl, user_tags: userTags.length ? userTags.map((u) => u.id) : undefined, post_type: postType, poll_options: trimmedPollOptions },
      {
        onSuccess: () => {
          setContent('')
          setPostType('post')
          setPollOptions(['', ''])
          setTeamTags(initialTeamTags)
          setUserTags([])
          setMentionQuery('')
          setSelectedSport(null)
          setTeamSearch('')
          setExpanded(false)
          removeImage()
          removeVideo()
          queryClient.invalidateQueries({ queryKey: ['hotTakes', 'team'] })
          queryClient.invalidateQueries({ queryKey: ['hotTakes', 'sport'] })
        },
        onError: (err) => {
          if (err.status === 403) {
            toast('Your posting privileges have been suspended. Contact support if you believe this is an error.', 'error')
          } else {
            toast(err.message || 'Failed to post', 'error')
          }
        },
      }
    )
  }

  function handleCancel() {
    setExpanded(false)
    setContent('')
    setPostType('post')
    setPollOptions(['', ''])
    setTeamTags(initialTeamTags)
    setUserTags([])
    setMentionQuery('')
    setSelectedSport(null)
    setTeamSearch('')
    removeImage()
    removeVideo()
  }

  function handleFileChange(e) {
    const files = e.target.files
    if (!files?.length) { e.target.value = ''; return }
    for (const file of files) {
      if (file.type.startsWith('video/')) {
        removeImage()
        selectVideo(file)
        break
      } else {
        removeVideo()
        selectImage(file)
      }
    }
    e.target.value = ''
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) selectImage(file)
        return
      }
    }
  }

  const [dragging, setDragging] = useState(false)

  function handleDragOver(e) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave(e) {
    e.preventDefault()
    setDragging(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    if (file.type.startsWith('video/')) {
      removeImage()
      selectVideo(file)
    } else if (file.type.startsWith('image/')) {
      removeVideo()
      selectImage(file)
    }
    if (!expanded) setExpanded(true)
  }

  return (
    <div
      className={`bg-bg-primary border rounded-xl px-4 py-3 mb-4 transition-all ${
        dragging ? 'border-accent border-dashed bg-accent/5' : expanded ? 'border-accent/20' : 'border-text-primary/20'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex gap-3">
        {/* Post type selector */}
        <div className="flex flex-col gap-1.5 pt-1">
          {POST_TYPES.map((type) => (
            <button
              key={type.key}
              onClick={() => { setPostType(type.key); if (!expanded) setExpanded(true) }}
              title={type.label}
              className={`w-7 h-7 rounded-full transition-all ${type.color} ${
                postType === type.key ? 'ring-2 ring-white scale-110' : 'opacity-40 hover:opacity-70'
              }`}
            />
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {/* Textarea with inline autocomplete */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onPaste={handlePaste}
              onFocus={() => setExpanded(true)}
              placeholder={POST_TYPES.find((t) => t.key === postType)?.placeholder || 'Talk to us.'}
              maxLength={MAX_CHARS}
              rows={expanded ? 3 : 1}
              className="w-full bg-transparent text-sm text-text-primary placeholder-text-muted resize-none outline-none transition-all"
            />

            {/* Inline team autocomplete dropdown */}
            {inlineDropdownPos?.show && inlineMatches.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-bg-primary border border-text-primary/20 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {inlineMatches.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleInlineSelect(t)}
                    className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-text-primary/5 truncate"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {/* @mention autocomplete dropdown */}
            {mentionQuery.length >= 2 && mentionResults?.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-bg-primary border border-text-primary/20 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {mentionResults
                  .filter((u) => !userTags.some((t) => t.id === u.id))
                  .slice(0, 5)
                  .map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleMentionSelect(u)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-text-primary/5 transition-colors"
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

          {/* Image URL preview (from pasted URLs in text) */}
          {(() => {
            const matches = content.match(IMAGE_URL_REGEX)
            if (!matches?.length || previewUrls.length > 0) return null
            return (
              <div className="mt-2 space-y-2">
                {matches.slice(0, 2).map((url, i) => (
                  <img
                    key={i}
                    src={url.startsWith('http') ? url : `https://${url}`}
                    alt="Preview"
                    className="max-w-full max-h-48 rounded-lg object-contain"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                ))}
              </div>
            )
          })()}

          {/* Image previews */}
          {previewUrls.length > 0 && (
            <div className="flex gap-2 mt-2 overflow-x-auto">
              {previewUrls.map((url, i) => (
                <div key={url} className="relative shrink-0">
                  <img
                    src={url}
                    alt={`Upload preview ${i + 1}`}
                    className="h-24 w-24 rounded-lg object-cover"
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white text-xs hover:bg-black/90 transition-colors"
                  >
                    ×
                  </button>
                </div>
              ))}
              {imageCount < 4 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="h-24 w-24 rounded-lg border border-dashed border-border flex items-center justify-center text-text-muted hover:border-accent/50 hover:text-accent transition-colors shrink-0"
                >
                  <span className="text-xl">+</span>
                </button>
              )}
            </div>
          )}

          {/* Video preview */}
          {videoPreviewUrl && (
            <div className="relative mt-2 inline-block">
              <video
                src={videoPreviewUrl}
                controls
                className="max-h-48 rounded-lg"
              />
              <button
                onClick={removeVideo}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white text-xs hover:bg-black/90 transition-colors"
              >
                ×
              </button>
            </div>
          )}

          {/* Poll options */}
          {postType === 'poll' && expanded && (
            <div className="mt-2 space-y-1.5">
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={opt}
                    onChange={(e) => {
                      const next = [...pollOptions]
                      next[i] = e.target.value
                      setPollOptions(next)
                    }}
                    placeholder={`Option ${i + 1}`}
                    maxLength={100}
                    className="flex-1 bg-bg-surface border border-text-primary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                      className="text-text-muted hover:text-incorrect text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button
                  onClick={() => setPollOptions([...pollOptions, ''])}
                  className="text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  + Add option
                </button>
              )}
            </div>
          )}

          {expanded && (
            <>
              {/* Sport chips row */}
              <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {sortedSportTabs.map((sport) => (
                  <button
                    key={sport.key}
                    onClick={() => {
                      if (selectedSport === sport.key) {
                        setSelectedSport(null)
                        setTeamSearch('')
                      } else {
                        setSelectedSport(sport.key)
                        setTeamSearch('')
                      }
                    }}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-colors ${
                      selectedSport === sport.key
                        ? 'bg-accent text-white'
                        : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {sport.label}
                  </button>
                ))}
              </div>

              {/* Team tag pills */}
              {teamTags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {teamTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-accent/15 text-accent px-2 py-0.5 rounded-full"
                    >
                      {tag}
                      <button
                        onClick={() => removeTeamTag(tag)}
                        className="hover:text-white transition-colors leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* User tag pills */}
              {userTags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {userTags.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full"
                    >
                      @{u.username}
                      <button
                        onClick={() => setUserTags(userTags.filter((t) => t.id !== u.id))}
                        className="hover:text-white transition-colors leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Team autocomplete (when sport selected) */}
                  {selectedSport && teamTags.length < 5 ? (
                    <div className="w-32">
                      <TeamAutocomplete
                        teams={(teams || []).filter((t) => !teamTags.includes(t))}
                        onSelect={addTeamTag}
                        inputValue={teamSearch}
                        onInputChange={setTeamSearch}
                        placeholder="Tag team..."
                      />
                    </div>
                  ) : !selectedSport ? (
                    <span className="text-[10px] text-text-muted">Pick a sport to tag teams</span>
                  ) : null}

                  {/* Image upload button */}
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
                  <InfoTooltip text="Share posts, predictions, and polls. Tag teams so fans can find them. Your squad can react, comment, and remind you of your predictions later. Bookmark predictions to save receipts." />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
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
                    onClick={handleCancel}
                    className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  {hasContent && (
                    <button
                      onClick={handlePost}
                      disabled={!canPost}
                      className="bg-accent text-white text-xs font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50 transition-opacity"
                    >
                      {createHotTake.isPending || uploading || videoUploading ? 'Posting...' : 'Post'}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
