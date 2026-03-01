import { useState } from 'react'
import { useComments, useAddComment, useDeleteComment } from '../../hooks/useSocial'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../ui/Toast'
import { timeAgo } from '../../lib/time'

export default function PickComments({ pickId, targetType = 'pick', targetId, initialExpanded = false, hideForm = false }) {
  // Support both old (pickId) and new (targetType + targetId) API
  const resolvedType = targetType
  const resolvedId = targetId || pickId

  const [expanded, setExpanded] = useState(initialExpanded)
  const [text, setText] = useState('')
  const { session } = useAuth()
  const currentUserId = session?.user?.id
  const { data: comments } = useComments(resolvedType, expanded ? resolvedId : null)
  const addComment = useAddComment()
  const deleteComment = useDeleteComment()

  const commentCount = comments?.length || 0

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim() || !resolvedId) return
    try {
      await addComment.mutateAsync({ targetType: resolvedType, targetId: resolvedId, content: text.trim() })
      setText('')
    } catch (err) {
      toast(err.message || 'Failed to send comment', 'error')
    }
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
                  onClick={() => deleteComment.mutate({ commentId: c.id, targetType: resolvedType, targetId: resolvedId })}
                  className="text-text-muted hover:text-incorrect flex-shrink-0 transition-colors"
                  disabled={deleteComment.isPending}
                >
                  ×
                </button>
              )}
            </div>
          ))}

          {!hideForm && (
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
          )}
        </div>
      )}
    </div>
  )
}
