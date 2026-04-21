import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useThread, useSendMessage, useMarkThreadRead, useRealtimeMessages } from '../hooks/useMessages'
import { useAuth } from '../hooks/useAuth'
import Avatar from '../components/ui/Avatar'
import LoadingSpinner from '../components/ui/LoadingSpinner'

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

function shouldShowTimestamp(current, prev) {
  if (!prev) return true
  return new Date(current) - new Date(prev) > 30 * 60 * 1000 // 30 min gap
}

export default function MessageThreadPage() {
  const { partnerId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useThread(partnerId)
  const sendMessage = useSendMessage()
  const markRead = useMarkThreadRead()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const didMarkRead = useRef(false)
  const textareaRef = useRef(null)

  useRealtimeMessages(profile?.id)

  const messages = data?.pages?.flatMap((p) => p.messages) || []
  const partner = data?.pages?.[0]?.partner

  // Mark thread as read on mount + when new messages arrive
  useEffect(() => {
    if (partnerId && messages.length > 0) {
      markRead.mutate(partnerId)
    }
  }, [partnerId, messages.length])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: didMarkRead.current ? 'smooth' : 'auto' })
    didMarkRead.current = true
  }, [messages.length])

  // When the keyboard opens on mobile, scroll to the latest message
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    function onResize() {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  function handleInputFocus() {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 400)
  }

  function handleSend(e) {
    e.preventDefault()
    const content = input.trim()
    if (!content) return
    sendMessage.mutate({ partnerId, content })
    setInput('')
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = '2.5rem'
    }
  }

  function handleTextareaChange(e) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 128) + 'px'
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Header — centered like iMessage */}
      <div className="flex items-center gap-3 pt-3 pb-2 border-b border-text-primary/10 px-4">
        <button
          onClick={() => navigate('/messages')}
          className="p-1 text-accent hover:text-accent-hover transition-colors shrink-0"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        {partner && (
          <div className="flex-1 flex flex-col items-center min-w-0">
            <Avatar user={partner} size="lg" />
            <div className="text-sm font-semibold text-text-primary mt-1 truncate">{partner.display_name || partner.username}</div>
          </div>
        )}
        {/* Spacer to balance the back button */}
        <div className="w-[30px] shrink-0" />
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pt-2 pb-1 px-4">
        {hasNextPage && (
          <div className="text-center py-2">
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="text-xs text-accent hover:text-accent-hover transition-colors"
            >
              {isFetchingNextPage ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}

        {isLoading ? (
          <LoadingSpinner />
        ) : messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-text-muted">Send the first message</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.sender_id === profile?.id
            const prev = messages[i - 1]
            const next = messages[i + 1]
            const showTime = shouldShowTimestamp(msg.created_at, prev?.created_at)
            const sameSenderAsPrev = prev && prev.sender_id === msg.sender_id && !showTime
            const sameSenderAsNext = next && next.sender_id === msg.sender_id && !shouldShowTimestamp(next.created_at, msg.created_at)

            // iMessage-style corner rounding:
            // Solo or last in group: full tail corner (rounded-br-sm for me, rounded-bl-sm for them)
            // First/middle in group: all corners rounded
            const isLastInGroup = !sameSenderAsNext
            const isFirstInGroup = !sameSenderAsPrev

            let bubbleCorners
            if (isMe) {
              if (isFirstInGroup && isLastInGroup) bubbleCorners = 'rounded-2xl rounded-br-sm'
              else if (isLastInGroup) bubbleCorners = 'rounded-2xl rounded-br-sm'
              else if (isFirstInGroup) bubbleCorners = 'rounded-2xl rounded-br-lg'
              else bubbleCorners = 'rounded-2xl rounded-br-lg'
            } else {
              if (isFirstInGroup && isLastInGroup) bubbleCorners = 'rounded-2xl rounded-bl-sm'
              else if (isLastInGroup) bubbleCorners = 'rounded-2xl rounded-bl-sm'
              else if (isFirstInGroup) bubbleCorners = 'rounded-2xl rounded-bl-lg'
              else bubbleCorners = 'rounded-2xl rounded-bl-lg'
            }

            return (
              <div key={msg.id}>
                {showTime && (
                  <div className="text-center text-[11px] text-text-muted py-3">
                    {formatDate(msg.created_at)} {formatTime(msg.created_at)}
                  </div>
                )}
                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${sameSenderAsPrev ? 'mt-[3px]' : 'mt-2'}`}>
                  <div
                    className={`max-w-[75%] px-4 py-2.5 text-[15px] leading-snug break-words ${bubbleCorners} ${
                      isMe
                        ? 'bg-accent text-white'
                        : 'bg-[#2a2a2e] text-text-primary'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input — glass edge bar like iMessage */}
      <form onSubmit={handleSend} className="flex items-end gap-2 px-2 py-1.5 bg-bg-primary/80 backdrop-blur-xl border-t border-text-primary/10">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextareaChange}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
          onFocus={handleInputFocus}
          placeholder="Message"
          maxLength={2000}
          rows={1}
          className="flex-1 bg-text-primary/10 border border-text-primary/20 rounded-full px-4 py-2 text-[15px] text-text-primary placeholder-text-muted focus:outline-none focus:border-text-primary/40 transition-colors resize-none max-h-32 overflow-y-auto"
          style={{ minHeight: '2.5rem' }}
        />
        <button
          type="submit"
          disabled={!input.trim() || sendMessage.isPending}
          className="w-9 h-9 rounded-full bg-accent flex items-center justify-center shrink-0 disabled:opacity-30 transition-opacity mb-0.5"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="none">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </form>
    </div>
  )
}
