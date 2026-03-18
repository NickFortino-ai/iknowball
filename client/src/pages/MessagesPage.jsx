import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useConversations, useRealtimeMessages } from '../hooks/useMessages'
import { useConnections } from '../hooks/useConnections'
import { useAuth } from '../hooks/useAuth'
import Avatar from '../components/ui/Avatar'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { timeAgo } from '../lib/time'

export default function MessagesPage() {
  const { profile } = useAuth()
  const { data: conversations, isLoading } = useConversations()
  const { data: connections } = useConnections()
  const [showNewMessage, setShowNewMessage] = useState(false)
  const navigate = useNavigate()

  useRealtimeMessages(profile?.id)

  // Filter connections not already in conversations for new message picker
  const existingPartnerIds = new Set((conversations || []).map((c) => c.partnerId))
  const newMessageTargets = (connections || []).filter((c) => !existingPartnerIds.has(c.user_id))

  return (
    <div className="max-w-lg mx-auto">
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
        <div className="bg-bg-card border border-border rounded-xl mb-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
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
                  onClick={() => { setShowNewMessage(false); navigate(`/messages/${conn.user_id}`) }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-card-hover transition-colors text-left"
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
        <div className="bg-bg-card border border-border rounded-xl p-8 text-center">
          <div className="text-3xl mb-3">💬</div>
          <p className="text-sm text-text-muted">No messages yet</p>
          <p className="text-xs text-text-muted mt-1">Tap "New Message" to start a conversation with a squad member</p>
        </div>
      ) : (
        <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
          {conversations.map((convo, i) => (
            <Link
              key={convo.partnerId}
              to={`/messages/${convo.partnerId}`}
              className={`flex items-center gap-3 px-4 py-3 hover:bg-bg-card-hover transition-colors ${
                i < conversations.length - 1 ? 'border-b border-border' : ''
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
          ))}
        </div>
      )}
    </div>
  )
}
