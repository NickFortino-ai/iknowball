import { useState, useRef, useMemo } from 'react'
import { useCreateHotTake, useHotTakeImageUpload, useTeamsForSport } from '../../hooks/useHotTakes'
import { useActiveSports } from '../../hooks/useGames'
import { useProfile } from '../../hooks/useProfile'
import Avatar from '../ui/Avatar'
import TeamAutocomplete from './TeamAutocomplete'
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

export default function HotTakeComposer() {
  const [content, setContent] = useState('')
  const [teamTags, setTeamTags] = useState([])
  const [selectedSport, setSelectedSport] = useState(null)
  const [teamSearch, setTeamSearch] = useState('')
  const [expanded, setExpanded] = useState(false)
  const createHotTake = useCreateHotTake()
  const { data: profile } = useProfile()
  const { uploading, previewUrl, selectImage, removeImage, uploadImage, hasImage } = useHotTakeImageUpload()
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)

  const { data: activeSports } = useActiveSports()
  const { data: teams } = useTeamsForSport(selectedSport)

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
    setContent(val)

    if (!teams?.length || !selectedSport) {
      setInlineMatches([])
      return
    }

    // Get word at cursor
    const cursorPos = e.target.selectionStart
    const textBeforeCursor = val.slice(0, cursorPos)
    const wordMatch = textBeforeCursor.match(/(\S+)$/)
    const currentWord = wordMatch ? wordMatch[1].toLowerCase() : ''

    if (currentWord.length >= 3) {
      const matches = teams.filter((t) => {
        const lower = t.toLowerCase()
        if (lower.includes(currentWord)) return true
        return lower.split(/\s+/).some((w) => w.startsWith(currentWord))
      }).filter((t) => !teamTags.includes(t)).slice(0, 6)
      setInlineMatches(matches)
      if (matches.length > 0) {
        setInlineDropdownPos({ show: true })
      } else {
        setInlineDropdownPos(null)
      }
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

  function addTeamTag(teamName) {
    if (teamTags.length < 5 && !teamTags.includes(teamName)) {
      setTeamTags([...teamTags, teamName])
    }
  }

  function removeTeamTag(teamName) {
    setTeamTags(teamTags.filter((t) => t !== teamName))
  }

  const charCount = content.length
  const canPost = charCount > 0 && charCount <= MAX_CHARS && !createHotTake.isPending && !uploading

  async function handlePost() {
    if (!canPost) return

    let imageUrl = undefined
    if (hasImage) {
      imageUrl = await uploadImage()
      if (!imageUrl && hasImage) return // upload failed
    }

    createHotTake.mutate(
      { content: content.trim(), team_tags: teamTags.length ? teamTags : undefined, image_url: imageUrl },
      {
        onSuccess: () => {
          setContent('')
          setTeamTags([])
          setSelectedSport(null)
          setTeamSearch('')
          setExpanded(false)
          removeImage()
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
    setTeamTags([])
    setSelectedSport(null)
    setTeamSearch('')
    removeImage()
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (file) selectImage(file)
    e.target.value = ''
  }

  return (
    <div className={`bg-bg-card border rounded-xl px-4 py-3 mb-4 transition-all ${
      expanded ? 'border-accent/20' : 'border-border'
    }`}>
      <div className="flex gap-3">
        {/* User avatar */}
        {profile && (
          <div className="flex-shrink-0 pt-0.5">
            <Avatar user={profile} size="md" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Textarea with inline autocomplete */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onFocus={() => setExpanded(true)}
              placeholder="Drop a hot take..."
              maxLength={MAX_CHARS}
              rows={expanded ? 3 : 1}
              className="w-full bg-transparent text-sm text-text-primary placeholder-text-muted resize-none outline-none transition-all"
            />

            {/* Inline autocomplete dropdown */}
            {inlineDropdownPos?.show && inlineMatches.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {inlineMatches.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleInlineSelect(t)}
                    className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-bg-card-hover truncate"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Image preview */}
          {previewUrl && (
            <div className="relative mt-2 inline-block">
              <img
                src={previewUrl}
                alt="Upload preview"
                className="max-h-32 rounded-lg object-cover"
              />
              <button
                onClick={removeImage}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white text-xs hover:bg-black/90 transition-colors"
              >
                ×
              </button>
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
                    onClick={handleCancel}
                    className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  {content.trim() && (
                    <button
                      onClick={handlePost}
                      disabled={!canPost}
                      className="bg-accent text-white text-xs font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50 transition-opacity"
                    >
                      {createHotTake.isPending || uploading ? 'Posting...' : 'Post'}
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
