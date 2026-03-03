import { useState, useEffect } from 'react'
import { useUserProfile, useUserPickHistory, useUserParlayHistory, useUserPropPickHistory, useUserBonusHistory, useHeadToHead } from '../../hooks/useUserProfile'
import { useAuth } from '../../hooks/useAuth'
import { useConnectionStatus, useSendConnectionRequest } from '../../hooks/useConnections'
import { useMemo } from 'react'
import { getTier } from '../../lib/scoring'
import { toast } from '../ui/Toast'
import TierBadge from '../ui/TierBadge'
import LoadingSpinner from '../ui/LoadingSpinner'
import PickHistoryByMonth from './PickHistoryByMonth'
import SocialLinks from '../ui/SocialLinks'
import Avatar from '../ui/Avatar'
import PickDetailModal from '../social/PickDetailModal'
import ParlayResultModal from '../picks/ParlayResultModal'
import PropDetailModal from '../picks/PropDetailModal'

function EventTypeBreakdown({ sportStats, parlays, propPicks, bonuses, picks, onItemTap }) {
  const [expanded, setExpanded] = useState({})

  const parlayStats = useMemo(() => {
    const settled = (parlays || []).filter((p) => p.status === 'settled')
    if (!settled.length) return null
    const wins = settled.filter((p) => p.is_correct === true).length
    const losses = settled.filter((p) => p.is_correct === false).length
    const points = settled.reduce((sum, p) => sum + (p.points_earned || 0), 0)
    return { wins, losses, total: settled.length, points }
  }, [parlays])

  const propStats = useMemo(() => {
    const settled = (propPicks || []).filter((p) => p.status === 'settled')
    if (!settled.length) return null
    const wins = settled.filter((p) => p.is_correct === true).length
    const losses = settled.filter((p) => p.is_correct === false).length
    const points = settled.reduce((sum, p) => sum + (p.points_earned || 0), 0)
    return { wins, losses, total: settled.length, points }
  }, [propPicks])

  const leaguePoints = useMemo(() => {
    if (!bonuses?.length) return 0
    return bonuses.reduce((sum, b) => sum + (b.points || 0), 0)
  }, [bonuses])

  const settledPicksBySport = useMemo(() => {
    const map = {}
    for (const pick of (picks || [])) {
      if (pick.games?.status !== 'settled') continue
      const key = pick.games?.sports?.key
      if (!key) continue
      if (!map[key]) map[key] = []
      map[key].push(pick)
    }
    // Sort each sport's picks by game start time descending
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(b.games?.starts_at) - new Date(a.games?.starts_at))
    }
    return map
  }, [picks])

  const settledParlays = useMemo(() => {
    return (parlays || [])
      .filter((p) => p.status === 'settled')
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  }, [parlays])

  const settledProps = useMemo(() => {
    return (propPicks || [])
      .filter((p) => p.status === 'settled')
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
  }, [propPicks])

  const hasAnything = sportStats?.length > 0 || parlayStats || propStats || leaguePoints !== 0

  if (!hasAnything) return null

  function toggle(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function renderItemPoints(points) {
    return (
      <div className={`font-semibold text-sm shrink-0 ml-3 ${
        points > 0 ? 'text-correct' : points < 0 ? 'text-incorrect' : 'text-text-muted'
      }`}>
        {points > 0 ? '+' : ''}{points ?? 0}
      </div>
    )
  }

  return (
    <div className="mb-4">
      <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">Event Type</h3>
      <div className="space-y-2">
        {(sportStats || []).map((stat) => {
          const key = stat.sports?.key
          const isOpen = expanded[key]
          const sportPicks = (settledPicksBySport[key] || []).slice(0, 10)
          return (
            <div key={stat.id}>
              <button
                onClick={() => toggle(key)}
                className="w-full bg-bg-primary rounded-lg px-4 py-3 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs text-text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9656;</span>
                  <span className="font-semibold text-sm">{stat.sports?.name}</span>
                  <span className="text-text-muted text-xs">
                    {stat.correct_picks}W-{stat.total_picks - stat.correct_picks}L
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {stat.sport_rank && (
                    <span className="text-xs text-text-muted">#{stat.sport_rank}/{stat.sport_total_users}</span>
                  )}
                  <span className="text-xs text-text-muted">Streak: {stat.current_streak}</span>
                  <span className={`font-semibold text-sm ${stat.total_points >= 0 ? 'text-correct' : 'text-incorrect'}`}>{stat.total_points > 0 ? '+' : ''}{stat.total_points} pts</span>
                </div>
              </button>
              {isOpen && sportPicks.length > 0 && (
                <div className="mt-1 space-y-1">
                  {sportPicks.map((pick) => (
                    <div
                      key={pick.id}
                      className="bg-bg-card rounded-lg border border-border px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-bg-card-hover active:bg-bg-card-hover transition-colors"
                      onClick={() => onItemTap?.('pick', pick.id)}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{pick.games?.away_team} @ {pick.games?.home_team}</div>
                        <div className="text-xs text-text-muted truncate">Picked: {pick.picked_team === 'home' ? pick.games?.home_team : pick.games?.away_team}</div>
                      </div>
                      {renderItemPoints(pick.points_earned)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {parlayStats && (() => {
          const isOpen = expanded['parlays']
          const items = settledParlays.slice(0, 10)
          return (
            <div>
              <button
                onClick={() => toggle('parlays')}
                className="w-full bg-bg-primary rounded-lg px-4 py-3 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs text-text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9656;</span>
                  <span className="font-semibold text-sm">Parlays</span>
                  <span className="text-text-muted text-xs">
                    {parlayStats.wins}W-{parlayStats.losses}L
                  </span>
                </div>
                <span className={`font-semibold text-sm ${parlayStats.points >= 0 ? 'text-correct' : 'text-incorrect'}`}>{parlayStats.points > 0 ? '+' : ''}{parlayStats.points} pts</span>
              </button>
              {isOpen && items.length > 0 && (
                <div className="mt-1 space-y-1">
                  {items.map((parlay) => {
                    const legs = parlay.parlay_legs || []
                    const legSummary = legs.map((l) => l.picked_team === 'home' ? l.games?.home_team : l.games?.away_team).join(', ')
                    return (
                      <div
                        key={parlay.id}
                        className="bg-bg-card rounded-lg border border-border px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-bg-card-hover active:bg-bg-card-hover transition-colors"
                        onClick={() => onItemTap?.('parlay', parlay.id)}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{parlay.leg_count}-Leg Parlay</div>
                          <div className="text-xs text-text-muted truncate">{legSummary}</div>
                        </div>
                        {renderItemPoints(parlay.points_earned)}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}
        {propStats && (() => {
          const isOpen = expanded['props']
          const items = settledProps.slice(0, 10)
          return (
            <div>
              <button
                onClick={() => toggle('props')}
                className="w-full bg-bg-primary rounded-lg px-4 py-3 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs text-text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9656;</span>
                  <span className="font-semibold text-sm">Props</span>
                  <span className="text-text-muted text-xs">
                    {propStats.wins}W-{propStats.losses}L
                  </span>
                </div>
                <span className={`font-semibold text-sm ${propStats.points >= 0 ? 'text-correct' : 'text-incorrect'}`}>{propStats.points > 0 ? '+' : ''}{propStats.points} pts</span>
              </button>
              {isOpen && items.length > 0 && (
                <div className="mt-1 space-y-1">
                  {items.map((pp) => (
                    <div
                      key={pp.id}
                      className="bg-bg-card rounded-lg border border-border px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-bg-card-hover active:bg-bg-card-hover transition-colors"
                      onClick={() => onItemTap?.('prop', pp.id)}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{pp.player_props?.player_name} — {pp.player_props?.line} {pp.player_props?.market_label}</div>
                        <div className="text-xs text-text-muted truncate">Picked: {pp.picked_side}</div>
                      </div>
                      {renderItemPoints(pp.points_earned)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
        {leaguePoints !== 0 && (() => {
          const isOpen = expanded['leagues']
          return (
            <div>
              <button
                onClick={() => toggle('leagues')}
                className="w-full bg-bg-primary rounded-lg px-4 py-3 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs text-text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}>&#9656;</span>
                  <span className="font-semibold text-sm">Leagues</span>
                </div>
                <span className={`font-semibold text-sm ${leaguePoints >= 0 ? 'text-correct' : 'text-incorrect'}`}>{leaguePoints > 0 ? '+' : ''}{leaguePoints} pts</span>
              </button>
              {isOpen && bonuses?.length > 0 && (
                <div className="mt-1 space-y-1">
                  {bonuses.map((bonus) => (
                    <div
                      key={bonus.id}
                      className="bg-bg-card rounded-lg border border-border px-4 py-3 flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{bonus.label}</div>
                      </div>
                      {renderItemPoints(bonus.points)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

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
        className="relative bg-bg-card border border-border w-full md:max-w-md rounded-t-2xl md:rounded-2xl max-h-[90vh] md:max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="sticky top-0 self-end shrink-0 z-10 text-text-muted hover:text-text-primary text-xl leading-none p-4"
        >
          &times;
        </button>
        <div className="overflow-y-auto px-6 pb-20 md:pb-6 -mt-4">

        {isLoading ? (
          <LoadingSpinner />
        ) : !user ? (
          <p className="text-text-muted text-center">User not found</p>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <Avatar user={user} size="2xl" />
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

            {/* Pick History */}
            <div className="mb-4">
              <PickHistoryByMonth picks={picks} parlays={parlays} propPicks={propPicks} bonuses={bonuses} isLoading={picksLoading || parlaysLoading || propsLoading || bonusesLoading} allCollapsed onItemTap={(type, id) => {
                  if (type === 'pick') setSelectedPickId(id)
                  else if (type === 'parlay') setSelectedParlayId(id)
                  else if (type === 'prop') setSelectedPropPickId(id)
                }} />
            </div>

            {/* Event Type Breakdown */}
            <EventTypeBreakdown sportStats={user.sport_stats} parlays={parlays} propPicks={propPicks} bonuses={bonuses} picks={picks} onItemTap={(type, id) => {
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
    </div>
    <PickDetailModal pickId={selectedPickId} onClose={() => setSelectedPickId(null)} />
    <ParlayResultModal parlayId={selectedParlayId} onClose={() => setSelectedParlayId(null)} />
    <PropDetailModal propPickId={selectedPropPickId} onClose={() => setSelectedPropPickId(null)} />
    </>
  )
}
