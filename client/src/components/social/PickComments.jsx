import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useComments, useAddComment, useDeleteComment, useToggleCommentLike } from '../../hooks/useSocial'
import { useAuth } from '../../hooks/useAuth'
import { useSearchUsers } from '../../hooks/useInvitations'
import { toast } from '../ui/Toast'
import { timeAgo } from '../../lib/time'
import Avatar from '../ui/Avatar'
import ReportModal from '../moderation/ReportModal'

export default function PickComments({ pickId, targetType = 'pick', targetId, commentCount: serverCommentCount, initialExpanded = false, hideForm = false }) {
  const resolvedType = targetType
  const resolvedId = targetId || pickId

  const [expanded, setExpanded] = useState(initialExpanded)
  const [text, setText] = useState('')
  const [optimisticComments, setOptimisticComments] = useState([])
  const [replyingTo, setReplyingTo] = useState(null) // { id, username }
  const [flagMode, setFlagMode] = useState(false)
  const [reportTarget, setReportTarget] = useState(null) // { commentId, userId }
  // @mention autocomplete, mirroring LeagueThread. The server parses
  // mentions out of the text itself, so this is purely an assist for
  // spelling the username right — a comment typed without it still notifies.
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionActive, setMentionActive] = useState(false)
  const textareaRef = useRef(null)
  const { data: mentionResults } = useSearchUsers(mentionActive ? mentionQuery : '')
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

  function insertMention(user) {
    const el = textareaRef.current
    const cursor = el?.selectionStart ?? text.length
    const before = text.slice(0, cursor).replace(/@\w{2,}$/, `@${user.username} `)
    setText(before + text.slice(cursor))
    setMentionActive(false)
    el?.focus()
  }

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
    const isOwnComment = c.user_id === currentUserId
    const canFlag = flagMode && !isOwnComment && !c._optimistic

    return (
      <div
        key={c.id}
        className={`flex items-start gap-2 ${isReply ? 'ml-8 pl-3 border-l border-border' : ''} ${c._optimistic ? 'opacity-60' : ''} ${canFlag ? 'cursor-pointer rounded-lg -mx-1 px-1 py-0.5 hover:bg-incorrect/10 transition-colors' : ''}`}
        onClick={canFlag ? () => { setReportTarget({ commentId: c.id, userId: c.user_id }); setFlagMode(false) } : undefined}
      >
        <Avatar user={c.users} size="xs" />
        <div className="min-w-0 flex-1">
          <div className="whitespace-pre-wrap">
            <span className="text-sm font-semibold">{c.users?.username}</span>{' '}
            <span className="text-sm text-text-secondary">{c.content}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-text-muted">{timeAgo(c.created_at)}</span>
            {!c._optimistic && !flagMode && (
              <>
                <button
                  onClick={() => handleToggleLike(c.id, c.has_liked)}
                  className={`flex items-center gap-1 text-xs transition-colors ${c.has_liked ? 'text-accent' : 'text-text-muted hover:text-accent'}`}
                  title={c.has_liked ? 'Remove emphasis' : 'Emphasize'}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <rect x="7.6" y="4" width="2.4" height="11" rx="1.2" />
                    <circle cx="8.8" cy="18.5" r="1.4" />
                    <rect x="14" y="4" width="2.4" height="11" rx="1.2" />
                    <circle cx="15.2" cy="18.5" r="1.4" />
                  </svg>
                  {c.like_count > 0 && <span>{c.like_count}</span>}
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
        {isOwnComment && !c._optimistic && !flagMode && (
          <button
            onClick={() => deleteComment.mutate({ commentId: c.id, targetType: resolvedType, targetId: resolvedId })}
            className="text-text-muted hover:text-incorrect flex-shrink-0 transition-colors text-sm"
            disabled={deleteComment.isPending}
          >
            ×
          </button>
        )}
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
        {mentionActive && mentionResults?.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-bg-primary border border-border rounded-lg shadow-lg max-h-44 overflow-y-auto z-20">
            {mentionResults.slice(0, 6).map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => insertMention(u)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-text-primary/5 text-left"
              >
                <Avatar user={u} size="xs" />
                <span className="text-sm text-text-primary">@{u.username}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            const v = e.target.value
            setText(v)
            // Only trigger on a partial @word at the cursor, so an already
            // completed "@nick " doesn't keep the dropdown open.
            const upToCursor = v.slice(0, e.target.selectionStart)
            const m = upToCursor.match(/(^|\s)@(\w{2,})$/)
            if (m) { setMentionQuery(m[2]); setMentionActive(true) }
            else setMentionActive(false)
          }}
          placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : 'Add a comment...'}
          maxLength={280}
          rows={1}
          onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
          className="w-full bg-bg-input border border-border rounded-lg px-3 py-1.5 text-base text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
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

  const flagIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
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
      <div className="flex items-center justify-between">
        {displayCount > 1 && (
          <button
            onClick={() => { setExpanded(false); setFlagMode(false) }}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            Hide comments
          </button>
        )}
        {allComments.some((c) => c.user_id !== currentUserId && !c._optimistic) && (
          <button
            onClick={() => setFlagMode(!flagMode)}
            className={`transition-colors ${flagMode ? 'text-incorrect' : 'text-text-muted hover:text-text-secondary'}`}
            title={flagMode ? 'Cancel report' : 'Report a comment'}
          >
            {flagIcon}
          </button>
        )}
      </div>
      {flagMode && (
        <div className="text-xs text-incorrect">Tap a comment to report it</div>
      )}
      {topLevel.map((c) => (
        <div key={c.id}>
          {renderComment(c)}
          {(repliesByParent[c.id] || []).map((r) => renderComment(r, true))}
        </div>
      ))}
      {commentForm}
      {reportTarget && createPortal(
        <ReportModal
          targetType="comment"
          targetId={reportTarget.commentId}
          reportedUserId={reportTarget.userId}
          onClose={() => setReportTarget(null)}
        />,
        document.body
      )}
    </div>
  )
}
