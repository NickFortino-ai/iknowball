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

  // When the input is focused (keyboard opens on mobile), scroll to bottom
  // so the latest message stays visible above the keyboard
  function handleInputFocus() {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 300) // Delay to let keyboard animation finish
  }

  function handleSend(e) {
    e.preventDefault()
    const content = input.trim()
    if (!content) return
    sendMessage.mutate({ partnerId, content })
    setInput('')
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col px-4" style={{ height: 'calc(100vh - 8rem)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 pt-4 pb-3 border-b border-border mb-3">
        <button
          onClick={() => navigate('/messages')}
          className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
        {partner && (
          <>
            <Avatar user={partner} size="md" />
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{partner.display_name || partner.username}</div>
              <div className="text-xs text-text-muted">@{partner.username}</div>
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto space-y-1 pb-2">
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
            const showTime = shouldShowTimestamp(msg.created_at, prev?.created_at)

            return (
              <div key={msg.id}>
                {showTime && (
                  <div className="text-center text-[10px] text-text-muted py-2">
                    {formatDate(msg.created_at)} {formatTime(msg.created_at)}
                  </div>
                )}
                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm break-words ${
                      isMe
                        ? 'bg-accent text-white rounded-br-md'
                        : 'bg-bg-card border border-border text-text-primary rounded-bl-md'
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

      {/* Input */}
      <form onSubmit={handleSend} className="flex items-end gap-2 pt-3 border-t border-border">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
          onFocus={handleInputFocus}
          placeholder="Type a message..."
          maxLength={2000}
          rows={1}
          className="flex-1 bg-bg-input border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/50 transition-colors resize-none max-h-32 overflow-y-auto"
          style={{ height: 'auto', minHeight: '2.5rem' }}
          ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 128) + 'px' } }}
        />
        <button
          type="submit"
          disabled={!input.trim() || sendMessage.isPending}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          Send
        </button>
      </form>
    </div>
  )
}
