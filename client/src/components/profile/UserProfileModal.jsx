import { useState, useEffect } from 'react'
import { useUserProfile, useUserPickHistory, useUserParlayHistory, useUserPropPickHistory, useUserBonusHistory, useHeadToHead } from '../../hooks/useUserProfile'
import { useAuth } from '../../hooks/useAuth'
import { useConnectionStatus, useSendConnectionRequest } from '../../hooks/useConnections'
import { getTier } from '../../lib/scoring'
import { toast } from '../ui/Toast'
import TierBadge from '../ui/TierBadge'
import LoadingSpinner from '../ui/LoadingSpinner'
import PickHistoryByMonth from './PickHistoryByMonth'
import SocialLinks from '../ui/SocialLinks'
import PickDetailModal from '../social/PickDetailModal'
import ParlayResultModal from '../picks/ParlayResultModal'
import PropDetailModal from '../picks/PropDetailModal'

export default function UserProfileModal({ userId, onClose }) {
  const { session } = useAuth()
  const { data: user, isLoading } = useUserProfile(userId)
  const { data: picks, isLoading: picksLoading } = useUserPickHistory(userId)
  const { data: parlays, isLoading: parlaysLoading } = useUserParlayHistory(userId)
  const { data: propPicks, isLoading: propsLoading } = useUserPropPickHistory(userId)
  const { data: bonuses, isLoading: bonusesLoading } = useUserBonusHistory(userId)
  const isViewingOther = userId && session?.user?.id !== userId
  const { data: h2h } = useHeadToHead(isViewingOther ? userId : null)
  const { data: connectionStatus } = useConnectionStatus(isViewingOther ? userId : null)
  const sendRequest = useSendConnectionRequest()
  const [justSent, setJustSent] = useState(false)
  const [selectedPickId, setSelectedPickId] = useState(null)
  const [selectedParlayId, setSelectedParlayId] = useState(null)
  const [selectedPropPickId, setSelectedPropPickId] = useState(null)

  useEffect(() => {
    if (!userId) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [userId])

  async function handleConnect() {
    if (!user?.username) return
    try {
      await sendRequest.mutateAsync(user.username)
      setJustSent(true)
      toast(`Connection request sent to @${user.username}`, 'success')
    } catch (err) {
      toast(err.message || 'Failed to send request', 'error')
    }
  }

  const connStatus = justSent ? 'pending_sent' : connectionStatus?.status

  if (!userId) return null

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-card border border-border w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 pb-20 md:pb-6 max-h-[95vh] md:max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
        >
          &times;
        </button>

        {isLoading ? (
          <LoadingSpinner />
        ) : !user ? (
          <p className="text-text-muted text-center">User not found</p>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full bg-bg-primary flex items-center justify-center text-2xl">
                {user.avatar_emoji || (user.display_name || user.username)?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-xl truncate">{user.display_name || user.username}</div>
                <div className="text-text-muted text-sm">@{user.username}</div>
                <SocialLinks user={user} />
              </div>
              {isViewingOther && connStatus === 'none' && (
                <button
                  onClick={handleConnect}
                  disabled={sendRequest.isPending}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  {sendRequest.isPending ? '...' : 'Connect'}
                </button>
              )}
              {isViewingOther && connStatus === 'pending_sent' && (
                <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-bg-primary text-text-muted">
                  Pending
                </span>
              )}
              {isViewingOther && connStatus === 'connected' && (
                <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-bg-primary text-correct">
                  Connected
                </span>
              )}
            </div>

            {/* Bio */}
            {user.bio && (
              <p className="text-text-secondary text-sm mb-4">{user.bio}</p>
            )}

            {/* Sports Interests */}
            {user.sports_interests?.length > 0 && (
              <div className="flex items-center gap-1.5 mb-4">
                {user.sports_interests.map((emoji, i) => (
                  <span key={i} className="text-lg">{emoji}</span>
                ))}
              </div>
            )}

            {/* Tier + Points + Rank */}
            <div className="flex items-center gap-3 mb-4">
              <TierBadge tier={getTier(user.total_points).name} size="md" />
              <span className="font-display text-2xl text-accent">{user.total_points} pts</span>
              <span className="text-text-muted text-sm ml-auto">
                Rank #{user.rank} of {user.total_users}
              </span>
            </div>

            {/* Crowns */}
            {user.crowns?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {user.crowns.map((crown) => {
                  const title = user.title_preference === 'queen' ? 'Queen' : 'King'
                  const label = crown === 'I KNOW BALL'
                    ? `${title} of I KNOW BALL`
                    : `${crown} ${title}`
                  return (
                    <span
                      key={crown}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent/15 text-accent text-xs font-semibold"
                    >
                      <span>👑</span>
                      {label}
                    </span>
                  )
                })}
              </div>
            )}

            {/* Records */}
            {user.records?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {user.records.map((record) => (
                  <span
                    key={record.key}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-500/15 text-yellow-500 text-xs font-semibold"
                  >
                    <span>🏆</span>
                    {record.label} — {record.value}
                  </span>
                ))}
              </div>
            )}

            {/* Pick Record */}
            <div className="bg-bg-primary rounded-xl p-4 mb-4">
              <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">Pick Record</h3>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <div className="font-display text-xl text-text-primary">{user.record.total}</div>
                  <div className="text-xs text-text-muted">Total</div>
                </div>
                <div>
                  <div className="font-display text-xl text-correct">{user.record.wins}</div>
                  <div className="text-xs text-text-muted">Wins</div>
                </div>
                <div>
                  <div className="font-display text-xl text-incorrect">{user.record.losses}</div>
                  <div className="text-xs text-text-muted">Losses</div>
                </div>
                <div>
                  <div className="font-display text-xl text-text-primary">
                    {user.record.total > 0
                      ? `${((user.record.wins / user.record.total) * 100).toFixed(0)}%`
                      : '—'}
                  </div>
                  <div className="text-xs text-text-muted">Win %</div>
                </div>
              </div>
            </div>

            {/* Head-to-Head */}
            {h2h && h2h.total > 0 && (
              <div className="bg-bg-primary rounded-xl p-4 mb-4">
                <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">Head-to-Head</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="font-display text-xl text-correct">{h2h.wins}</div>
                    <div className="text-xs text-text-muted">Your Wins</div>
                  </div>
                  <div>
                    <div className="font-display text-xl text-incorrect">{h2h.losses}</div>
                    <div className="text-xs text-text-muted">Their Wins</div>
                  </div>
                  <div>
                    <div className="font-display text-xl text-text-primary">{h2h.ties}</div>
                    <div className="text-xs text-text-muted">Ties</div>
                  </div>
                </div>
                <div className="text-xs text-text-muted text-center mt-2">
                  {h2h.total} games in common
                </div>
              </div>
            )}

            {/* Sport Breakdown */}
            {user.sport_stats?.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs text-text-muted uppercase tracking-wider mb-1">By Sport</h3>
                <p className="text-xs text-text-muted mb-3">Straight picks only</p>
                <div className="space-y-2">
                  {user.sport_stats.map((stat) => (
                    <div key={stat.id} className="bg-bg-primary rounded-lg px-4 py-3 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-sm">{stat.sports?.name}</span>
                        <span className="text-text-muted text-xs ml-2">
                          {stat.correct_picks}W-{stat.total_picks - stat.correct_picks}L
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {stat.sport_rank && (
                          <span className="text-xs text-text-muted">#{stat.sport_rank}/{stat.sport_total_users}</span>
                        )}
                        <span className="text-xs text-text-muted">Streak: {stat.current_streak}</span>
                        <span className="text-accent font-semibold text-sm">{stat.total_points} pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pick History */}
            <PickHistoryByMonth picks={picks} parlays={parlays} propPicks={propPicks} bonuses={bonuses} isLoading={picksLoading || parlaysLoading || propsLoading || bonusesLoading} allCollapsed onItemTap={(type, id) => {
                if (type === 'pick') setSelectedPickId(id)
                else if (type === 'parlay') setSelectedParlayId(id)
                else if (type === 'prop') setSelectedPropPickId(id)
              }} />

            {/* Member since */}
            <div className="text-text-muted text-xs text-center mt-4">
              Member since {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
          </>
        )}
      </div>
    </div>
    <PickDetailModal pickId={selectedPickId} onClose={() => setSelectedPickId(null)} />
    <ParlayResultModal parlayId={selectedParlayId} onClose={() => setSelectedParlayId(null)} />
    <PropDetailModal propPickId={selectedPropPickId} onClose={() => setSelectedPropPickId(null)} />
    </>
  )
}
