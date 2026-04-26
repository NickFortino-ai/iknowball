import { useState, useMemo } from 'react'
import { useFantasyUserRoster, useBlurbPlayerIds } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import Avatar from '../ui/Avatar'
import LoadingSpinner from '../ui/LoadingSpinner'
import UserProfileModal from '../profile/UserProfileModal'
import PlayerDetailModal from './PlayerDetailModal'
import { ProposeTradeModal } from './FantasyTrades'
import BlurbDot, { markBlurbSeen } from './BlurbDot'

const INJURY_COLORS = {
  Out: 'bg-incorrect/20 text-incorrect',
  IR: 'bg-incorrect/20 text-incorrect',
  Questionable: 'bg-yellow-500/20 text-yellow-500',
  Doubtful: 'bg-yellow-500/20 text-yellow-500',
  Probable: 'bg-correct/20 text-correct',
  'Day-To-Day': 'bg-yellow-500/20 text-yellow-500',
}

const SLOT_ORDER = ['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3', 'te', 'flex', 'k', 'def', 'bench', 'ir']
const SLOT_LABELS = { qb: 'QB', rb1: 'RB', rb2: 'RB', wr1: 'WR', wr2: 'WR', wr3: 'WR', te: 'TE', flex: 'FLEX', k: 'K', def: 'DEF', bench: 'BN', ir: 'IR' }

function InjuryBadge({ status }) {
  if (!status) return null
  const label = status === 'Day-To-Day' ? 'DTD' : status === 'IR' ? 'IR' : status.charAt(0)
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${INJURY_COLORS[status] || 'bg-text-primary/10 text-text-muted'}`} title={status}>
      {label}
    </span>
  )
}

function TradeIcon() {
  return (
    <svg className="w-4 h-4 text-accent shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16l-4-4 4-4" />
      <path d="M3 12h18" />
      <path d="M17 8l4 4-4 4" />
      <path d="M21 12H3" />
    </svg>
  )
}

export default function RosterModal({ league, userId, user, fantasyTeamName, onClose }) {
  const leagueId = league?.id || league
  const { profile } = useAuth()
  const { data: roster, isLoading } = useFantasyUserRoster(leagueId, userId)
  const [showProfile, setShowProfile] = useState(false)
  const [detailPlayerId, setDetailPlayerId] = useState(null)
  const [tradePlayerId, setTradePlayerId] = useState(null)
  const { data: blurbIdsList } = useBlurbPlayerIds(leagueId)
  const blurbIds = useMemo(() => new Set(blurbIdsList || []), [blurbIdsList])
  const isMe = userId === profile?.id

  function openPlayerDetail(id) {
    if (id) markBlurbSeen(id)
    setDetailPlayerId(id)
  }

  // Sort roster by slot order
  const sorted = [...(roster || [])].sort((a, b) => {
    const ai = SLOT_ORDER.indexOf((a.slot || '').toLowerCase())
    const bi = SLOT_ORDER.indexOf((b.slot || '').toLowerCase())
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  // Separate starters from bench/IR
  const starters = sorted.filter((r) => r.slot && r.slot !== 'bench' && r.slot !== 'ir')
  const bench = sorted.filter((r) => r.slot === 'bench')
  const ir = sorted.filter((r) => r.slot === 'ir')

  function PlayerRow({ row, showTradeIcon }) {
    const p = row.nfl_players || {}
    return (
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-text-primary/10 bg-bg-primary hover:bg-bg-card-hover transition-colors cursor-pointer"
        onClick={() => p.id && openPlayerDetail(p.id)}
      >
        <span className="text-[10px] font-semibold text-text-muted w-8 shrink-0 text-center bg-bg-secondary rounded px-1 py-0.5">
          {SLOT_LABELS[(row.slot || '').toLowerCase()] || row.slot}
        </span>
        {p.headshot_url ? (
          <img src={p.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
        ) : (
          <div className="w-8 h-8 rounded-full bg-bg-secondary shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-text-primary truncate">{p.full_name || 'Empty'}</span>
            <BlurbDot playerId={p.id} blurbIds={blurbIds} />
          </div>
          <div className="text-[10px] text-text-muted">{p.position} · {p.team || 'FA'}</div>
        </div>
        <InjuryBadge status={p.injury_status} />
        {showTradeIcon && !isMe && p.id && (
          <button
            onClick={(e) => { e.stopPropagation(); setTradePlayerId(p.id) }}
            className="shrink-0 p-1 rounded hover:bg-accent/10 transition-colors"
            title="Propose trade for this player"
          >
            <TradeIcon />
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4 md:py-6"
        style={{ paddingTop: 'max(1.5rem, calc(3.5rem + env(safe-area-inset-top) + 1rem))', paddingBottom: 'max(1.5rem, calc(3.5rem + env(safe-area-inset-bottom) + 1rem))' }}
        onClick={onClose}
      >
        <div
          className="bg-bg-primary border border-text-primary/20 w-full max-w-lg max-h-[90vh] rounded-2xl overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with user avatar */}
          <div className="sticky top-0 bg-bg-primary border-b border-text-primary/20 px-4 py-4 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={(e) => { e.stopPropagation(); setShowProfile(true) }}>
                  <Avatar user={user} size="lg" />
                </button>
                <div className="min-w-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowProfile(true) }}
                    className="font-display text-lg text-text-primary truncate hover:text-accent transition-colors block"
                  >
                    {user?.display_name || user?.username}
                  </button>
                  {fantasyTeamName && (
                    <div className="text-xs italic uppercase tracking-wide text-text-muted truncate">{fantasyTeamName}</div>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl leading-none p-1 shrink-0">
                &times;
              </button>
            </div>
          </div>

          {/* Roster */}
          <div className="p-4">
            {isLoading ? (
              <div className="py-8 flex justify-center"><LoadingSpinner /></div>
            ) : !sorted.length ? (
              <div className="text-center py-8 text-sm text-text-muted">No roster yet</div>
            ) : (
              <div className="space-y-4">
                {/* Starters */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">Starters</div>
                  <div className="space-y-1">
                    {starters.map((row, i) => (
                      <PlayerRow key={row.player_id || i} row={row} showTradeIcon />
                    ))}
                  </div>
                </div>

                {/* Bench */}
                {bench.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">Bench</div>
                    <div className="space-y-1">
                      {bench.map((row, i) => (
                        <PlayerRow key={row.player_id || i} row={row} showTradeIcon />
                      ))}
                    </div>
                  </div>
                )}

                {/* IR */}
                {ir.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">IR</div>
                    <div className="space-y-1">
                      {ir.map((row, i) => (
                        <PlayerRow key={row.player_id || i} row={row} showTradeIcon={false} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* User profile modal — layered on top */}
      {showProfile && (
        <UserProfileModal userId={userId} onClose={() => setShowProfile(false)} />
      )}

      {/* Player detail modal */}
      {detailPlayerId && (
        <PlayerDetailModal leagueId={leagueId} playerId={detailPlayerId} onClose={() => setDetailPlayerId(null)} />
      )}

      {/* Trade proposal modal — prefilled with the selected player */}
      {tradePlayerId && (
        <ProposeTradeModal
          league={typeof league === 'object' ? league : { id: leagueId, members: [] }}
          currentUserId={profile?.id}
          initialReceiverId={userId}
          initialAcquirePlayerId={tradePlayerId}
          onClose={() => setTradePlayerId(null)}
        />
      )}
    </>
  )
}
