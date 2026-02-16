import { useState } from 'react'
import { usePickComments, useAddComment, useDeleteComment } from '../../hooks/useSocial'
import { useAuth } from '../../hooks/useAuth'

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export default function PickComments({ pickId }) {
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState('')
  const { session } = useAuth()
  const currentUserId = session?.user?.id
  const { data: comments } = usePickComments(expanded ? pickId : null)
  const addComment = useAddComment()
  const deleteComment = useDeleteComment()

  const commentCount = comments?.length || 0

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim() || !pickId) return
    await addComment.mutateAsync({ pickId, content: text.trim() })
    setText('')
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        {'\uD83D\uDCAC'} {expanded ? 'Hide' : commentCount > 0 ? commentCount : 'Comment'}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {comments?.map((c) => (
            <div key={c.id} className="flex items-start gap-2 text-xs">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-bg-primary flex items-center justify-center text-[10px]">
                {c.users?.avatar_emoji || c.users?.username?.[0]?.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-semibold">{c.users?.username}</span>{' '}
                <span className="text-text-secondary">{c.content}</span>
                <span className="text-text-muted ml-1">{timeAgo(c.created_at)}</span>
              </div>
              {c.user_id === currentUserId && (
                <button
                  onClick={() => deleteComment.mutate({ commentId: c.id, pickId })}
                  className="text-text-muted hover:text-incorrect flex-shrink-0 transition-colors"
                  disabled={deleteComment.isPending}
                >
                  ×
                </button>
              )}
            </div>
          ))}

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a comment..."
              maxLength={280}
              className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={!text.trim() || addComment.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
