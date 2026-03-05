import { useState, useEffect } from 'react'
import { useComments, useAddComment, useDeleteComment, useToggleCommentLike } from '../../hooks/useSocial'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../ui/Toast'
import { timeAgo } from '../../lib/time'
import Avatar from '../ui/Avatar'
import ReportButton from '../moderation/ReportButton'

export default function PickComments({ pickId, targetType = 'pick', targetId, commentCount: serverCommentCount, initialExpanded = false, hideForm = false }) {
  const resolvedType = targetType
  const resolvedId = targetId || pickId

  const [expanded, setExpanded] = useState(initialExpanded)
  const [text, setText] = useState('')
  const [optimisticComments, setOptimisticComments] = useState([])
  const [replyingTo, setReplyingTo] = useState(null) // { id, username }
  const { session } = useAuth()
  const currentUserId = session?.user?.id
  // Always fetch comments so we can show the most recent one in collapsed view
  const { data: comments } = useComments(resolvedType, resolvedId)
  const addComment = useAddComment()
  const deleteComment = useDeleteComment()
  const toggleLike = useToggleCommentLike()

  useEffect(() => {
    if (comments?.length) setOptimisticComments([])
  }, [comments])

  const allComments = [...(comments || []), ...optimisticComments]
  const displayCount = serverCommentCount ?? allComments.length

  // Separate top-level and replies
  const topLevel = allComments.filter((c) => !c.parent_id)
  const replies = allComments.filter((c) => c.parent_id)
  const repliesByParent = {}
  for (const r of replies) {
    if (!repliesByParent[r.parent_id]) repliesByParent[r.parent_id] = []
    repliesByParent[r.parent_id].push(r)
  }

  // Most recent comment for collapsed view
  const mostRecent = allComments.length > 0 ? allComments[allComments.length - 1] : null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim() || !resolvedId) return

    const content = text.trim()
    const parentId = replyingTo?.id || null

    const optimistic = {
      id: `optimistic-${Date.now()}`,
      user_id: currentUserId,
      content,
      created_at: new Date().toISOString(),
      users: { username: session?.user?.user_metadata?.username || 'you' },
      parent_id: parentId,
      like_count: 0,
      has_liked: false,
      _optimistic: true,
    }
    setOptimisticComments((prev) => [...prev, optimistic])
    setText('')
    setReplyingTo(null)

    // Auto-expand when posting
    if (!expanded) setExpanded(true)

    try {
      await addComment.mutateAsync({ targetType: resolvedType, targetId: resolvedId, content, parentId })
    } catch (err) {
      setOptimisticComments((prev) => prev.filter((c) => c.id !== optimistic.id))
      toast(err.message || 'Failed to send comment', 'error')
    }
  }

  function handleToggleLike(commentId, currentlyLiked) {
    toggleLike.mutate({ commentId }, {
      onMutate: () => {
        // Optimistic update handled by React Query invalidation
      },
    })
  }

  function renderComment(c, isReply = false) {
    return (
      <div key={c.id} className={`flex items-start gap-2 ${isReply ? 'ml-8 pl-3 border-l border-border' : ''} ${c._optimistic ? 'opacity-60' : ''}`}>
        <Avatar user={c.users} size="xs" />
        <div className="min-w-0 flex-1">
          <div>
            <span className="text-sm font-semibold">{c.users?.username}</span>{' '}
            <span className="text-sm text-text-secondary">{c.content}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-text-muted">{timeAgo(c.created_at)}</span>
            {!c._optimistic && (
              <>
                <button
                  onClick={() => handleToggleLike(c.id, c.has_liked)}
                  className="flex items-center gap-1 text-xs transition-colors"
                >
                  {c.has_liked ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted hover:text-red-400">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  )}
                  {c.like_count > 0 && <span className={c.has_liked ? 'text-red-400' : 'text-text-muted'}>{c.like_count}</span>}
                </button>
                <button
                  onClick={() => setReplyingTo({ id: c.parent_id ? c.parent_id : c.id, username: c.users?.username })}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  Reply
                </button>
              </>
            )}
          </div>
        </div>
        {c.user_id === currentUserId && !c._optimistic ? (
          <button
            onClick={() => deleteComment.mutate({ commentId: c.id, targetType: resolvedType, targetId: resolvedId })}
            className="text-text-muted hover:text-incorrect flex-shrink-0 transition-colors text-sm"
            disabled={deleteComment.isPending}
          >
            ×
          </button>
        ) : c.user_id !== currentUserId && !c._optimistic ? (
          <ReportButton targetType="comment" targetId={c.id} reportedUserId={c.user_id} />
        ) : null}
      </div>
    )
  }

  const commentForm = !hideForm && (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="flex-1 relative">
        {replyingTo && (
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs text-text-muted">Replying to @{replyingTo.username}</span>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-xs text-text-muted hover:text-text-secondary"
            >
              × Cancel
            </button>
          </div>
        )}
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : 'Add a comment...'}
          maxLength={280}
          className="w-full bg-bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
        />
      </div>
      <button
        type="submit"
        disabled={!text.trim() || addComment.isPending}
        className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 self-end"
      >
        Send
      </button>
    </form>
  )

  // Collapsed view: show most recent comment + "View all X comments" link
  if (!expanded) {
    return (
      <div className="space-y-2">
        {displayCount > 1 && (
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            View all {displayCount} comments
          </button>
        )}
        {mostRecent && renderComment(mostRecent)}
        {commentForm}
      </div>
    )
  }

  // Expanded view: all comments threaded
  return (
    <div className="space-y-2">
      {displayCount > 1 && (
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          Hide comments
        </button>
      )}
      {topLevel.map((c) => (
        <div key={c.id}>
          {renderComment(c)}
          {(repliesByParent[c.id] || []).map((r) => renderComment(r, true))}
        </div>
      ))}
      {commentForm}
    </div>
  )
}
