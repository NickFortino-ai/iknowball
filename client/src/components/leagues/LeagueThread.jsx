import { useState, useRef, useEffect, useMemo } from 'react'
import { useLeagueThread, useSendThreadMessage, useRealtimeLeagueThread, useMarkThreadRead } from '../../hooks/useLeagues'
import { useSearchUsers } from '../../hooks/useInvitations'
import { useAuth } from '../../hooks/useAuth'
import Avatar from '../ui/Avatar'
import LoadingSpinner from '../ui/LoadingSpinner'
import { toast } from '../ui/Toast'

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now - d
  if (diff < 86400000 && d.getDate() === now.getDate()) return 'Today'
  if (diff < 172800000) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function shouldShowDate(current, prev) {
  if (!prev) return true
  const a = new Date(current).toDateString()
  const b = new Date(prev).toDateString()
  return a !== b
}

function shouldShowTimestamp(current, prev) {
  if (!prev) return true
  return new Date(current) - new Date(prev) > 30 * 60 * 1000
}

function renderContent(content, taggedUsers) {
  if (!taggedUsers?.length) return content
  let result = content
  const parts = []
  let lastIdx = 0

  for (const user of taggedUsers) {
    const mention = `@${user.username}`
    const idx = result.indexOf(mention, lastIdx)
    if (idx === -1) continue
    if (idx > lastIdx) parts.push(result.slice(lastIdx, idx))
    parts.push(
      <span key={user.id} className="text-accent font-semibold">{mention}</span>
    )
    lastIdx = idx + mention.length
  }
  if (lastIdx < result.length) parts.push(result.slice(lastIdx))
  return parts.length > 0 ? parts : content
}

export default function LeagueThread({ league }) {
  const { profile } = useAuth()
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useLeagueThread(league.id)
  const sendMessage = useSendThreadMessage()
  const markRead = useMarkThreadRead()
  useRealtimeLeagueThread(league.id)

  // Mark thread as read when opened
  useEffect(() => {
    markRead.mutate(league.id)
  }, [league.id])

  const [input, setInput] = useState('')
  const [isMultiline, setIsMultiline] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionActive, setMentionActive] = useState(false)
  const [taggedUsers, setTaggedUsers] = useState([])
  const bottomRef = useRef(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const { data: searchResults } = useSearchUsers(mentionActive ? mentionQuery : '')

  // Keep thread open for 24 hours after league completes (same window as "active" on My Leagues page)
  const isArchived = league.status === 'completed' && league.updated_at && (Date.now() - new Date(league.updated_at).getTime() > 24 * 60 * 60 * 1000)

  const messages = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((p) => p.messages || [])
  }, [data])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, autoScroll])

  // When the keyboard opens on mobile, scroll to latest message
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    function onResize() {
      if (autoScroll && bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'smooth' })
      }
    }
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [autoScroll])

  function handleInputFocus() {
    setAutoScroll(true)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 400)
  }

  // Detect if user scrolled up
  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setAutoScroll(atBottom)
  }

  function handleInputChange(e) {
    const val = e.target.value
    setInput(val)

    // Check for @mention
    const cursorPos = e.target.selectionStart
    const textBefore = val.slice(0, cursorPos)
    const atMatch = textBefore.match(/@(\w{2,})$/)
    if (atMatch) {
      setMentionQuery(atMatch[1])
      setMentionActive(true)
    } else {
      setMentionActive(false)
    }
  }

  function insertMention(user) {
    const cursorPos = inputRef.current?.selectionStart || input.length
    const textBefore = input.slice(0, cursorPos)
    const textAfter = input.slice(cursorPos)
    const replaced = textBefore.replace(/@\w{2,}$/, `@${user.username} `)
    setInput(replaced + textAfter)
    setMentionActive(false)
    if (!taggedUsers.find((u) => u.id === user.id)) {
      setTaggedUsers([...taggedUsers, user])
    }
    inputRef.current?.focus()
  }

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || sendMessage.isPending) return

    // Extract user_tag IDs from tagged users that are still mentioned in the text
    const userTagIds = taggedUsers
      .filter((u) => trimmed.includes(`@${u.username}`))
      .map((u) => u.id)

    // Clear input immediately so the user sees instant feedback
    setInput('')
    setIsMultiline(false)
    setTaggedUsers([])
    setAutoScroll(true)

    try {
      await sendMessage.mutateAsync({
        leagueId: league.id,
        content: trimmed,
        user_tags: userTagIds.length > 0 ? userTagIds : undefined,
      })
    } catch (err) {
      // Restore input on failure so they can retry
      setInput(trimmed)
      toast(err.message || 'Failed to send message', 'error')
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="flex flex-col h-[50vh] md:h-[60vh] rounded-xl border border-text-primary/20 overflow-hidden">
      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
      >
        {hasNextPage && (
          <div className="text-center py-2">
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="text-xs text-accent hover:text-accent-hover"
            >
              {isFetchingNextPage ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <div className="text-center text-text-muted text-sm py-8">
            No messages yet. Start the conversation!
          </div>
        )}

        {messages.map((msg, i) => {
          const prev = messages[i - 1]
          const sameAuthor = prev && prev.user_id === msg.user_id

          return (
            <div key={msg.id}>
              <div className={`flex gap-2.5 ${sameAuthor ? 'mt-0.5' : 'mt-3'}`}>
                {sameAuthor ? (
                  <div className="w-7 shrink-0" />
                ) : (
                  <Avatar user={msg.user} size="sm" />
                )}
                <div className="flex-1 min-w-0">
                  {!sameAuthor && (
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-text-primary">
                        {msg.user?.display_name || msg.user?.username}
                      </span>
                    </div>
                  )}
                  <div className="text-sm text-text-primary leading-relaxed">
                    {renderContent(msg.content, msg.tagged_users)}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {isArchived ? (
        <div className="border-t border-border px-4 py-3 text-center text-xs text-text-muted">
          This thread is archived
        </div>
      ) : (
        <div className="px-3 py-1.5 bg-bg-primary/60 backdrop-blur-2xl border-t border-text-primary/15 relative">
          {/* Mention autocomplete */}
          {mentionActive && searchResults?.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 bg-bg-primary border border-text-primary/20 rounded-lg shadow-lg mb-1 max-h-40 overflow-y-auto">
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => insertMention(user)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-text-primary/5 text-left"
                >
                  <Avatar user={user} size="xs" />
                  <span className="text-text-primary font-medium">{user.display_name || user.username}</span>
                  <span className="text-text-muted text-xs">@{user.username}</span>
                </button>
              ))}
            </div>
          )}
          <div className={`flex-1 flex items-end border border-text-primary/25 bg-text-primary/5 transition-all ${isMultiline ? 'rounded-2xl' : 'rounded-full'}`}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                handleInputChange(e)
                e.target.style.height = 'auto'
                const h = Math.min(e.target.scrollHeight, 96)
                e.target.style.height = h + 'px'
                setIsMultiline(h > 44)
              }}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              placeholder="Message"
              rows={1}
              className="flex-1 bg-transparent pl-4 pr-1 py-2 text-[16px] text-text-primary placeholder-text-muted resize-none focus:outline-none max-h-24 overflow-y-auto"
              style={{ minHeight: '2.25rem' }}
            />
            <button
              onClick={handleSend}
              onMouseDown={(e) => e.preventDefault()}
              disabled={!input.trim() || sendMessage.isPending}
              className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0 disabled:opacity-0 transition-opacity m-0.5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="none">
                <path d="M3.4 20.4L20.85 12.92a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
