import { useState, useMemo } from 'react'
import { useFantasyUserRoster, useBlurbPlayerIds, useFantasySettings } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import LoadingSpinner from '../ui/LoadingSpinner'
import PlayerDetailModal from './PlayerDetailModal'
import { ProposeTradeModal } from './FantasyTrades'
import BlurbDot, { markBlurbSeen } from './BlurbDot'

const INJURY_COLORS = {
  Out: 'text-incorrect',
  IR: 'text-incorrect',
  Questionable: 'text-yellow-400',
  Doubtful: 'text-yellow-400',
  Probable: 'text-correct',
  'Day-To-Day': 'text-yellow-400',
}

// Build the list of valid starter slot keys from the league's roster_slots
// config — same source-of-truth that drives My Team and the auto-fill on the
// server. Any roster row whose slot isn't in this list is treated as bench
// (covers orphan slots like 'wr3' left over after a commissioner shrunk the
// position count).
function buildStarterKeyMeta(rosterSlots) {
  const slots = rosterSlots || { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, k: 1, def: 1 }
  const keys = []
  const labels = {}
  if ((slots.qb || 0) >= 1) { keys.push('qb'); labels.qb = 'QB' }
  for (let i = 1; i <= (slots.rb || 0); i++) { keys.push(`rb${i}`); labels[`rb${i}`] = 'RB' }
  for (let i = 1; i <= (slots.wr || 0); i++) { keys.push(`wr${i}`); labels[`wr${i}`] = 'WR' }
  if ((slots.te || 0) >= 1) { keys.push('te'); labels.te = 'TE' }
  if ((slots.flex || 0) >= 1) { keys.push('flex'); labels.flex = 'FLEX' }
  if ((slots.superflex || 0) >= 1) { keys.push('superflex'); labels.superflex = 'SFLX' }
  if ((slots.k || 0) >= 1) { keys.push('k'); labels.k = 'K' }
  if ((slots.def || 0) >= 1) { keys.push('def'); labels.def = 'DEF' }
  return { keys, labels }
}

function InjuryBadge({ status }) {
  if (!status) return null
  const label = status === 'Day-To-Day' ? 'DTD' : status === 'IR' ? 'IR' : status.charAt(0)
  return (
    <span className={`text-[11px] font-mono font-bold shrink-0 ${INJURY_COLORS[status] || 'text-text-muted'}`} title={status}>
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
  const { data: fantasySettings } = useFantasySettings(leagueId)
  const [detailPlayerId, setDetailPlayerId] = useState(null)
  const [tradePlayerId, setTradePlayerId] = useState(null)
  const { data: blurbIdsList } = useBlurbPlayerIds(leagueId)
  const blurbIds = useMemo(() => new Set(blurbIdsList || []), [blurbIdsList])
  const isMe = userId === profile?.id

  const { keys: starterKeys, labels: starterLabels } = useMemo(
    () => buildStarterKeyMeta(fantasySettings?.roster_slots),
    [fantasySettings?.roster_slots]
  )
  const starterKeySet = useMemo(() => new Set(starterKeys), [starterKeys])
  const SLOT_LABELS = useMemo(() => ({ ...starterLabels, bench: 'BN', ir: 'IR' }), [starterLabels])

  function openPlayerDetail(id) {
    if (id) markBlurbSeen(id)
    setDetailPlayerId(id)
  }

  const orderIndex = (slot) => {
    const s = (slot || '').toLowerCase()
    const idx = starterKeys.indexOf(s)
    if (idx !== -1) return idx
    if (s === 'bench' || s.startsWith('bench')) return 1000
    if (s === 'ir' || s.startsWith('ir')) return 2000
    return 999 // orphan slot (e.g. 'wr3' in a wr=2 league) — treat as bench-ish
  }

  const sorted = [...(roster || [])].sort((a, b) => orderIndex(a.slot) - orderIndex(b.slot))

  const isIr = (s) => s === 'ir' || (s && s.startsWith('ir'))
  const starters = sorted.filter((r) => starterKeySet.has((r.slot || '').toLowerCase()))
  const bench = sorted.filter((r) => {
    const s = (r.slot || '').toLowerCase()
    if (starterKeySet.has(s)) return false
    if (isIr(s)) return false
    return true // anything not a current starter slot and not IR shows as bench
  })
  const ir = sorted.filter((r) => isIr((r.slot || '').toLowerCase()))

  function PlayerRow({ row, showTradeIcon, fallbackLabel }) {
    const p = row.nfl_players || {}
    const slotLabel = SLOT_LABELS[(row.slot || '').toLowerCase()] || fallbackLabel || p.position || row.slot
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-text-primary/10 bg-bg-primary/40 hover:bg-bg-card-hover transition-colors cursor-pointer"
        onClick={(e) => { e.stopPropagation(); p.id && openPlayerDetail(p.id) }}
      >
        <span className="text-[10px] font-semibold text-text-muted w-8 shrink-0 text-center bg-bg-secondary rounded px-1 py-0.5">
          {slotLabel}
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
                    <PlayerRow key={row.player_id || i} row={row} showTradeIcon fallbackLabel="BN" />
                  ))}
                </div>
              </div>
            )}

            {ir.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">IR</div>
                <div className="space-y-1">
                  {ir.map((row, i) => (
                    <PlayerRow key={row.player_id || i} row={row} showTradeIcon={false} fallbackLabel="IR" />
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
