import { useState, useMemo } from 'react'
import { useFantasyUserRoster, useBlurbPlayerIds } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import LoadingSpinner from '../ui/LoadingSpinner'
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

/**
 * Inline roster body for a single user — renders Starters / Bench / IR
 * sections, with player detail modal on tap and trade-icon shortcut for
 * non-self rosters. Used inside the standings table as an expandable row.
 */
export default function RosterList({ league, userId }) {
  const leagueId = league?.id || league
  const { profile } = useAuth()
  const { data: roster, isLoading } = useFantasyUserRoster(leagueId, userId)
  const [detailPlayerId, setDetailPlayerId] = useState(null)
  const [tradePlayerId, setTradePlayerId] = useState(null)
  const { data: blurbIdsList } = useBlurbPlayerIds(leagueId)
  const blurbIds = useMemo(() => new Set(blurbIdsList || []), [blurbIdsList])
  const isMe = userId === profile?.id

  function openPlayerDetail(id) {
    if (id) markBlurbSeen(id)
    setDetailPlayerId(id)
  }

  const sorted = [...(roster || [])].sort((a, b) => {
    const ai = SLOT_ORDER.indexOf((a.slot || '').toLowerCase())
    const bi = SLOT_ORDER.indexOf((b.slot || '').toLowerCase())
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  const starters = sorted.filter((r) => r.slot && r.slot !== 'bench' && r.slot !== 'ir')
  const bench = sorted.filter((r) => r.slot === 'bench')
  const ir = sorted.filter((r) => r.slot === 'ir')

  function PlayerRow({ row, showTradeIcon }) {
    const p = row.nfl_players || {}
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-text-primary/10 bg-bg-primary/40 hover:bg-bg-card-hover transition-colors cursor-pointer"
        onClick={(e) => { e.stopPropagation(); p.id && openPlayerDetail(p.id) }}
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
      <div className="px-3 pb-3" onClick={(e) => e.stopPropagation()}>
        {isLoading ? (
          <div className="py-4 flex justify-center"><LoadingSpinner /></div>
        ) : !sorted.length ? (
          <div className="text-center py-4 text-sm text-text-muted">No roster yet</div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Starters</div>
              <div className="space-y-1">
                {starters.map((row, i) => (
                  <PlayerRow key={row.player_id || i} row={row} showTradeIcon />
                ))}
              </div>
            </div>

            {bench.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Bench</div>
                <div className="space-y-1">
                  {bench.map((row, i) => (
                    <PlayerRow key={row.player_id || i} row={row} showTradeIcon />
                  ))}
                </div>
              </div>
            )}

            {ir.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">IR</div>
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

      {detailPlayerId && (
        <PlayerDetailModal leagueId={leagueId} playerId={detailPlayerId} onClose={() => setDetailPlayerId(null)} />
      )}

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
