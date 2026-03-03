import { useState, useEffect } from 'react'
import { useComments, useAddComment, useDeleteComment } from '../../hooks/useSocial'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../ui/Toast'
import { timeAgo } from '../../lib/time'
import Avatar from '../ui/Avatar'

export default function PickComments({ pickId, targetType = 'pick', targetId, commentCount: serverCommentCount, initialExpanded = false, hideForm = false }) {
  // Support both old (pickId) and new (targetType + targetId) API
  const resolvedType = targetType
  const resolvedId = targetId || pickId

  // Auto-expand when 1-2 comments
  const shouldAutoExpand = serverCommentCount > 0 && serverCommentCount <= 2
  const [expanded, setExpanded] = useState(initialExpanded || shouldAutoExpand)
  const [text, setText] = useState('')
  const [optimisticComments, setOptimisticComments] = useState([])
  const { session } = useAuth()
  const currentUserId = session?.user?.id
  const { data: comments } = useComments(resolvedType, expanded ? resolvedId : null)
  const addComment = useAddComment()
  const deleteComment = useDeleteComment()

  // Clear optimistic comments when real data arrives
  useEffect(() => {
    if (comments?.length) setOptimisticComments([])
  }, [comments])

  const allComments = [...(comments || []), ...optimisticComments]
  const displayCount = serverCommentCount ?? allComments.length

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim() || !resolvedId) return

    const content = text.trim()

    // Optimistic: add immediately
    const optimistic = {
      id: `optimistic-${Date.now()}`,
      user_id: currentUserId,
      content,
      created_at: new Date().toISOString(),
      users: { username: session?.user?.user_metadata?.username || 'you' },
      _optimistic: true,
    }
    setOptimisticComments((prev) => [...prev, optimistic])
    setText('')

    try {
      await addComment.mutateAsync({ targetType: resolvedType, targetId: resolvedId, content })
    } catch (err) {
      // Remove optimistic on failure
      setOptimisticComments((prev) => prev.filter((c) => c.id !== optimistic.id))
      toast(err.message || 'Failed to send comment', 'error')
    }
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        {displayCount > 0 ? (
          <>
            {'\uD83D\uDCAC'} {expanded ? 'Hide' : `${displayCount} comment${displayCount !== 1 ? 's' : ''}`}
          </>
        ) : (
          <span className="flex items-center gap-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {allComments.map((c) => (
            <div key={c.id} className={`flex items-start gap-2 text-xs ${c._optimistic ? 'opacity-60' : ''}`}>
              <Avatar user={c.users} size="xs" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold">{c.users?.username}</span>{' '}
                <span className="text-text-secondary">{c.content}</span>
                <span className="text-text-muted ml-1">{timeAgo(c.created_at)}</span>
              </div>
              {c.user_id === currentUserId && !c._optimistic && (
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
