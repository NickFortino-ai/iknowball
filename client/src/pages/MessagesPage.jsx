import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useConversations, useRealtimeMessages, useThread, useSendMessage, useMarkThreadRead } from '../hooks/useMessages'
import { useConnections } from '../hooks/useConnections'
import { useAuth } from '../hooks/useAuth'
import Avatar from '../components/ui/Avatar'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { timeAgo } from '../lib/time'

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
  return new Date(current) - new Date(prev) > 30 * 60 * 1000
}

/** Inline thread panel for desktop split view */
function InlineThread({ partnerId, profile }) {
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useThread(partnerId)
  const sendMessage = useSendMessage()
  const markRead = useMarkThreadRead()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)
  const didScroll = useRef(false)

  const messages = data?.pages?.flatMap((p) => p.messages) || []
  const partner = data?.pages?.[0]?.partner

  useEffect(() => {
    if (partnerId && messages.length > 0) markRead.mutate(partnerId)
  }, [partnerId, messages.length])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: didScroll.current ? 'smooth' : 'auto' })
    didScroll.current = true
  }, [messages.length])

  // Reset scroll flag when switching conversations
  useEffect(() => { didScroll.current = false }, [partnerId])

  function handleSend(e) {
    e.preventDefault()
    const content = input.trim()
    if (!content) return
    sendMessage.mutate({ partnerId, content })
    setInput('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {partner && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-text-primary/10">
          <Avatar user={partner} size="md" />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{partner.display_name || partner.username}</div>
            <div className="text-xs text-text-muted">@{partner.username}</div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-1 px-4 py-2">
        {hasNextPage && (
          <div className="text-center py-2">
            <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
              className="text-xs text-accent hover:text-accent-hover transition-colors">
              {isFetchingNextPage ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}
        {isLoading ? <LoadingSpinner /> : messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center h-full">
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
                  <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm break-words ${
                    isMe ? 'bg-accent text-white rounded-br-md' : 'bg-bg-card border border-border text-text-primary rounded-bl-md'
                  }`}>{msg.content}</div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex items-end gap-2 px-4 py-3 border-t border-text-primary/10">
        <textarea
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
          placeholder="Type a message..." maxLength={2000} rows={1}
          className="flex-1 bg-bg-input border border-border rounded-xl px-4 py-2.5 text-base text-text-primary placeholder-text-muted focus:outline-none focus:border-accent/50 transition-colors resize-none max-h-32 overflow-y-auto"
          style={{ height: 'auto', minHeight: '2.5rem' }}
          ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 128) + 'px' } }}
        />
        <button type="submit" disabled={!input.trim() || sendMessage.isPending}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
          Send
        </button>
      </form>
    </div>
  )
}

export default function MessagesPage() {
  const { profile } = useAuth()
  const { data: conversations, isLoading } = useConversations()
  const { data: connections } = useConnections()
  const [showNewMessage, setShowNewMessage] = useState(false)
  const [selectedPartnerId, setSelectedPartnerId] = useState(null)
  const navigate = useNavigate()

  useRealtimeMessages(profile?.id)

  const existingPartnerIds = new Set((conversations || []).map((c) => c.partnerId))
  const newMessageTargets = (connections || []).filter((c) => !existingPartnerIds.has(c.user_id))

  function handleConvoClick(partnerId, e) {
    // Desktop: open inline; Mobile: navigate
    if (window.innerWidth >= 1024) {
      e.preventDefault()
      setSelectedPartnerId(partnerId)
    }
  }

  function handleNewMessageClick(userId) {
    setShowNewMessage(false)
    if (window.innerWidth >= 1024) {
      setSelectedPartnerId(userId)
    } else {
      navigate(`/messages/${userId}`)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4">
      {/* Desktop: split view */}
      <div className="lg:flex lg:gap-6" style={{ height: 'calc(100vh - 8rem)' }}>
        {/* Left: conversation list */}
        <div className="lg:w-[340px] lg:shrink-0 lg:flex lg:flex-col lg:overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-display text-2xl">Messages</h1>
            <button
              onClick={() => setShowNewMessage(!showNewMessage)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              {showNewMessage ? 'Cancel' : 'New Message'}
            </button>
          </div>

          {/* New message picker */}
          {showNewMessage && (
            <div className="bg-bg-primary border border-text-primary/20 rounded-xl mb-4 overflow-hidden">
              <div className="px-4 py-3 border-b border-text-primary/10">
                <p className="text-xs text-text-muted">Select a squad member</p>
              </div>
              {newMessageTargets.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-text-muted">
                  {connections?.length ? 'All your squad members already have conversations' : 'Connect with people first to message them'}
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto">
                  {newMessageTargets.map((conn) => (
                    <button
                      key={conn.user_id}
                      onClick={() => handleNewMessageClick(conn.user_id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-text-primary/5 transition-colors text-left"
                    >
                      <Avatar user={conn} size="md" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{conn.display_name || conn.username}</div>
                        <div className="text-xs text-text-muted">@{conn.username}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <LoadingSpinner />
          ) : !conversations?.length ? (
            <div className="bg-bg-primary border border-text-primary/20 rounded-xl p-8 text-center">
              <div className="text-3xl mb-3">💬</div>
              <p className="text-sm text-text-muted">No messages yet</p>
              <p className="text-xs text-text-muted mt-1">Tap "New Message" to start a conversation with a squad member</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2">
              {conversations.map((convo) => {
                const isActive = selectedPartnerId === convo.partnerId
                return (
                  <Link
                    key={convo.partnerId}
                    to={`/messages/${convo.partnerId}`}
                    onClick={(e) => handleConvoClick(convo.partnerId, e)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                      isActive
                        ? 'bg-accent/10 border-accent/40'
                        : 'bg-bg-primary border-text-primary/20 hover:bg-text-primary/5'
                    }`}
                  >
                    <Avatar user={{ username: convo.username, display_name: convo.displayName, avatar_url: convo.avatarUrl, avatar_emoji: convo.avatarEmoji }} size="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${convo.unreadCount > 0 ? 'font-bold text-text-primary' : 'font-semibold text-text-primary'}`}>
                          {convo.displayName || convo.username}
                        </span>
                        <span className="text-[10px] text-text-muted shrink-0">{timeAgo(convo.lastMessageAt)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className={`text-xs truncate ${convo.unreadCount > 0 ? 'text-text-secondary font-medium' : 'text-text-muted'}`}>
                          {convo.lastMessage}
                        </p>
                        {convo.unreadCount > 0 && (
                          <span className="w-2 h-2 bg-accent rounded-full shrink-0" />
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: inline thread (desktop only) */}
        <div className="hidden lg:flex lg:flex-1 lg:flex-col rounded-xl border border-text-primary/20 bg-bg-primary overflow-hidden">
          {selectedPartnerId ? (
            <InlineThread partnerId={selectedPartnerId} profile={profile} />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-text-muted">Select a conversation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
