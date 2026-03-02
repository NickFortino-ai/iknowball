import { useState } from 'react'
import { useCreateHotTake } from '../../hooks/useHotTakes'

const MAX_CHARS = 280

export default function HotTakeComposer() {
  const [content, setContent] = useState('')
  const [teamTag, setTeamTag] = useState('')
  const [expanded, setExpanded] = useState(false)
  const createHotTake = useCreateHotTake()

  const charCount = content.length
  const canPost = charCount > 0 && charCount <= MAX_CHARS && !createHotTake.isPending

  function handlePost() {
    if (!canPost) return
    createHotTake.mutate(
      { content: content.trim(), team_tag: teamTag.trim() || undefined },
      {
        onSuccess: () => {
          setContent('')
          setTeamTag('')
          setExpanded(false)
        },
      }
    )
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl px-4 py-3 mb-4">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onFocus={() => setExpanded(true)}
        placeholder="Drop a hot take..."
        maxLength={MAX_CHARS}
        rows={expanded ? 3 : 1}
        className="w-full bg-transparent text-sm text-text-primary placeholder-text-muted resize-none outline-none"
      />

      {expanded && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              value={teamTag}
              onChange={(e) => setTeamTag(e.target.value)}
              placeholder="Team tag (optional)"
              maxLength={50}
              className="bg-bg-secondary border border-border rounded-lg px-2 py-1 text-xs text-text-primary placeholder-text-muted outline-none w-36"
            />
            <span className={`text-xs flex-shrink-0 ${charCount > MAX_CHARS ? 'text-incorrect' : 'text-text-muted'}`}>
              {charCount}/{MAX_CHARS}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setExpanded(false); setContent(''); setTeamTag('') }}
              className="text-xs text-text-muted hover:text-text-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handlePost}
              disabled={!canPost}
              className="bg-accent text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition-opacity"
            >
              {createHotTake.isPending ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
