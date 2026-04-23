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
  const [isMultiline, setIsMultiline] = useState(false)
  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)
  const didMarkRead = useRef(false)
  const textareaRef = useRef(null)

  useRealtimeMessages(profile?.id)

  // Scroll to top on mount so the header isn't pushed off-screen
  useEffect(() => { window.scrollTo(0, 0) }, [])

  // Keep input visible when iOS keyboard opens — resize the container to visual viewport
  useEffect(() => {
    const vv = window.visualViewport
    const container = scrollContainerRef.current?.parentElement
    if (!vv || !container) return
    function syncHeight() {
      container.style.height = `${vv.height}px`
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    vv.addEventListener('resize', syncHeight)
    return () => vv.removeEventListener('resize', syncHeight)
  }, [])

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
    setIsMultiline(false)
    if (textareaRef.current) {
      textareaRef.current.style.height = '2.5rem'
    }
  }

  function handleTextareaChange(e) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    const h = Math.min(el.scrollHeight, 128)
    el.style.height = h + 'px'
    setIsMultiline(h > 44) // more than one line
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col bg-bg-primary overflow-hidden" style={{ height: '100dvh' }}>
      {/* Header — centered like iMessage, pinned with transparency */}
      <div className="flex items-center gap-3 pt-3 pb-2 border-b border-text-primary/10 px-4 shrink-0 bg-bg-primary/80 backdrop-blur-md">
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pt-2 pb-1 px-4 overscroll-contain">
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

      {/* Input — iMessage style: textarea + send inside one bordered container */}
      <form onSubmit={handleSend} className="flex items-end px-2 py-1 pb-[env(safe-area-inset-bottom,4px)] bg-bg-primary border-t border-text-primary/15 shrink-0">
        <div className={`flex-1 flex items-end border border-text-primary/25 bg-text-primary/5 transition-all ${isMultiline ? 'rounded-2xl' : 'rounded-full'}`}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
            onFocus={handleInputFocus}
            placeholder="Message"
            maxLength={2000}
            rows={1}
            className="flex-1 bg-transparent pl-4 pr-1 py-2 text-[16px] text-text-primary placeholder-text-muted focus:outline-none resize-none max-h-32 overflow-y-auto"
            style={{ minHeight: '2.25rem' }}
          />
          <button
            type="submit"
            onMouseDown={(e) => e.preventDefault()}
            disabled={!input.trim() || sendMessage.isPending}
            className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0 disabled:opacity-0 transition-opacity m-0.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" stroke="none">
              <path d="M3.4 20.4L20.85 12.92a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  )
}
