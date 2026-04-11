import { useState, useMemo } from 'react'
import { useFantasyRoster, useSetFantasyLineup, useDropRosterPlayer, useFantasyTrades, useRespondToTrade, useBlurbPlayerIds, useFantasySettings } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { SkeletonRows, SkeletonBlock } from '../ui/Skeleton'
import { toast } from '../ui/Toast'
import Avatar from '../ui/Avatar'
import PlayerDetailModal from './PlayerDetailModal'
import FantasyGlobalRankModal from './FantasyGlobalRankModal'
import BlurbDot, { markBlurbSeen } from './BlurbDot'

const INJURY_COLORS = {
  Out: 'bg-incorrect/20 text-incorrect',
  IR: 'bg-incorrect/20 text-incorrect',
  Questionable: 'bg-yellow-500/20 text-yellow-500',
  Doubtful: 'bg-yellow-500/20 text-yellow-500',
  Probable: 'bg-correct/20 text-correct',
  'Day-To-Day': 'bg-yellow-500/20 text-yellow-500',
}

const STARTER_SLOTS = [
  { key: 'qb', label: 'QB', positions: ['QB'] },
  { key: 'rb1', label: 'RB', positions: ['RB'] },
  { key: 'rb2', label: 'RB', positions: ['RB'] },
  { key: 'wr1', label: 'WR', positions: ['WR'] },
  { key: 'wr2', label: 'WR', positions: ['WR'] },
  { key: 'wr3', label: 'WR', positions: ['WR'] },
  { key: 'te', label: 'TE', positions: ['TE'] },
  { key: 'flex', label: 'FLEX', positions: ['RB', 'WR', 'TE'] },
  { key: 'k', label: 'K', positions: ['K'] },
  { key: 'def', label: 'DEF', positions: ['DEF'] },
]

function InjuryBadge({ status }) {
  if (!status) return null
  const label = status === 'Day-To-Day' ? 'DTD' : status === 'IR' ? 'IR' : status.charAt(0)
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${INJURY_COLORS[status] || 'bg-text-primary/10 text-text-muted'}`} title={status}>
      {label}
    </span>
  )
}

function PlayerRow({ row, onTap, isSelected, dimmed, onMoveToIR, onMoveOutOfIR, onViewDetail, onDrop, blurbIds }) {
  const canIR = row?.nfl_players?.injury_status === 'Out' || row?.nfl_players?.injury_status === 'IR'
  const isInIR = row?.slot === 'ir'
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onTap}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
          isSelected ? 'border-accent bg-accent/10' : 'border-text-primary/10 bg-bg-primary hover:bg-bg-card-hover'
        } ${dimmed ? 'opacity-40' : ''}`}
      >
        {row?.nfl_players?.headshot_url && (
          <img
            src={row.nfl_players.headshot_url}
            alt=""
            className="w-9 h-9 rounded-full object-cover bg-bg-secondary shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onViewDetail?.(row.player_id) }}
            onError={(e) => { e.target.style.display = 'none' }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-text-primary truncate">{row?.nfl_players?.full_name || 'Empty'}</span>
            <InjuryBadge status={row?.nfl_players?.injury_status} />
            {blurbIds && <BlurbDot playerId={row?.player_id} blurbIds={blurbIds} />}
          </div>
          <div className="text-xs text-text-muted">{row?.nfl_players?.position} · {row?.nfl_players?.team || 'FA'}</div>
        </div>
        {row?.live_points != null && row?.nfl_players && (
          <div className="text-right shrink-0 mr-1">
            <div className="text-base font-display tabular-nums text-text-primary leading-none">{row.live_points.toFixed(2)}</div>
            <div className="text-[9px] uppercase text-text-muted">pts</div>
          </div>
        )}
        {(canIR && !isInIR && onMoveToIR) && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onMoveToIR(row.player_id) }}
            className="text-[10px] font-bold px-2 py-1 rounded bg-incorrect/20 text-incorrect hover:bg-incorrect/30 transition-colors shrink-0 cursor-pointer"
          >
            → IR
          </span>
        )}
        {isInIR && onMoveOutOfIR && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onMoveOutOfIR(row.player_id) }}
            className="text-[10px] font-bold px-2 py-1 rounded bg-bg-card text-text-secondary hover:bg-bg-card-hover transition-colors shrink-0 cursor-pointer"
          >
            ← Bench
          </span>
        )}
        {onDrop && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onDrop(row) }}
            className="text-[10px] font-bold px-2 py-1 rounded bg-incorrect/15 text-incorrect hover:bg-incorrect/25 transition-colors shrink-0 cursor-pointer"
            title="Drop player"
          >
            Drop
          </span>
        )}
      </button>
    </div>
  )
}

function EmptySlot({ slotLabel, onTap, isSelected }) {
  return (
    <button
      type="button"
      onClick={onTap}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed transition-colors text-left ${
        isSelected ? 'border-accent bg-accent/10' : 'border-text-primary/20 bg-bg-primary/40 hover:bg-bg-card-hover'
      }`}
    >
      <div className="w-9 h-9 rounded-full bg-bg-secondary/40 shrink-0" />
      <div className="flex-1 text-xs text-text-muted">Empty {slotLabel} — tap to assign</div>
    </button>
  )
}

export default function FantasyMyTeam({ league }) {
  const { profile } = useAuth()
  const { data: roster, isLoading } = useFantasyRoster(league.id)
  const { data: fantasySettings } = useFantasySettings(league.id)
  const { data: trades } = useFantasyTrades(league.id)
  const { data: blurbIdsList } = useBlurbPlayerIds(league.id)
  const blurbIds = useMemo(() => new Set(blurbIdsList || []), [blurbIdsList])
  const respond = useRespondToTrade(league.id)
  const setLineup = useSetFantasyLineup(league.id)
  const dropPlayer = useDropRosterPlayer(league.id)
  const [confirmDrop, setConfirmDrop] = useState(null) // roster row being dropped
  const [draftSlots, setDraftSlots] = useState(null) // { [player_id]: slot }
  const [selected, setSelected] = useState(null) // { type: 'slot'|'player', key: string }
  const [detailPlayerId, setDetailPlayerId] = useState(null)
  const [showGlobalRank, setShowGlobalRank] = useState(false)
  const [expandedTradeId, setExpandedTradeId] = useState(null)

  function openPlayerDetail(playerId) {
    if (playerId) markBlurbSeen(playerId)
    setDetailPlayerId(playerId)
  }

  // Pending trades where I'm the receiver
  const incomingTrades = (trades || []).filter((t) => t.status === 'pending' && t.receiver_user_id === profile?.id)

  // Build a working slot-by-player map (server slot or draftSlots override)
  const slotByPlayer = useMemo(() => {
    if (!roster) return {}
    const map = {}
    for (const r of roster) {
      map[r.player_id] = (draftSlots && draftSlots[r.player_id]) || r.slot
    }
    return map
  }, [roster, draftSlots])

  if (isLoading) return (
    <div className="space-y-4">
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <SkeletonBlock className="h-4 w-32" />
        </div>
        <div className="p-3">
          <SkeletonRows count={10} imgSize="w-9 h-9" />
        </div>
      </div>
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <SkeletonBlock className="h-4 w-24" />
        </div>
        <div className="p-3">
          <SkeletonRows count={5} imgSize="w-9 h-9" />
        </div>
      </div>
    </div>
  )

  const hasRoster = roster && roster.length > 0
  const isSalaryCap = fantasySettings?.format === 'salary_cap'
  if (!hasRoster) {
    const slots = fantasySettings?.roster_slots || (isSalaryCap
      ? { qb: 1, rb: 2, wr: 3, te: 1, flex: 1, k: 1, def: 1 }
      : { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, k: 1, def: 1, bench: 6 })
    const starterSlots = []
    const slotExpansion = { qb: 'QB', rb: 'RB', wr: 'WR', te: 'TE', flex: 'FLEX', superflex: 'SFLEX', k: 'K', def: 'DEF' }
    for (const [key, label] of Object.entries(slotExpansion)) {
      for (let i = 0; i < (slots[key] || 0); i++) starterSlots.push(label)
    }
    const benchCount = isSalaryCap ? 0 : (slots.bench || 6)
    const irCount = isSalaryCap ? 0 : (slots.ir || 0)
    return (
      <div className="space-y-4">
        <p className="text-sm text-text-secondary text-center">
          {isSalaryCap ? 'Set your lineup each week under the salary cap.' : "You'll see your team here after the draft!"}
        </p>
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">{isSalaryCap ? 'Lineup' : 'Starters'}</h3>
          </div>
          <div className="divide-y divide-text-primary/10">
            {starterSlots.map((label, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-[10px] font-bold text-text-muted w-10 shrink-0">{label}</span>
                <div className="w-9 h-9 rounded-full border border-text-primary/20 shrink-0" />
                <div className="flex-1 text-xs text-text-muted italic">Empty</div>
              </div>
            ))}
          </div>
        </div>
        {benchCount > 0 && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Bench</h3>
          </div>
          <div className="divide-y divide-text-primary/10">
            {Array.from({ length: benchCount }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-[10px] font-bold text-text-muted w-10 shrink-0">BN</span>
                <div className="w-9 h-9 rounded-full border border-text-primary/20 shrink-0" />
                <div className="flex-1 text-xs text-text-muted italic">Empty</div>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>
    )
  }

  async function handleTradeAction(tradeId, action) {
    try {
      await respond.mutateAsync({ tradeId, action })
      toast(`Trade ${action}ed`, 'success')
    } catch (err) {
      toast(err.message || `Failed to ${action} trade`, 'error')
    }
  }

  // Group roster by current (working) slot
  const playersBySlot = {}
  for (const r of roster) {
    const slot = slotByPlayer[r.player_id]
    if (!playersBySlot[slot]) playersBySlot[slot] = []
    playersBySlot[slot].push(r)
  }
  const benchPlayers = playersBySlot.bench || []
  const irPlayers = playersBySlot.ir || []

  function ensureDraft() {
    if (draftSlots) return draftSlots
    const initial = {}
    for (const r of roster) initial[r.player_id] = r.slot
    setDraftSlots(initial)
    return initial
  }

  function swapSelectionWith(target) {
    // target = { type: 'slot', key } or { type: 'player', key: player_id }
    const next = { ...ensureDraft() }
    if (selected?.type === 'player' && target.type === 'slot') {
      // Move selected player INTO this starter slot, sending the existing
      // occupant of that slot back to bench
      const playerId = selected.key
      const slotKey = target.key
      const player = roster.find((r) => r.player_id === playerId)
      const slotDef = STARTER_SLOTS.find((s) => s.key === slotKey)
      if (!slotDef.positions.includes(player?.nfl_players?.position)) {
        toast(`${player?.nfl_players?.position || 'Player'} can't fill ${slotDef.label}`, 'error')
        return
      }
      // Find current occupant of slotKey (other than selected)
      for (const r of roster) {
        if (r.player_id !== playerId && next[r.player_id] === slotKey) {
          next[r.player_id] = 'bench'
        }
      }
      next[playerId] = slotKey
    } else if (selected?.type === 'slot' && target.type === 'player') {
      // Same as above with reversed roles
      const slotKey = selected.key
      const playerId = target.key
      const player = roster.find((r) => r.player_id === playerId)
      const slotDef = STARTER_SLOTS.find((s) => s.key === slotKey)
      if (!slotDef.positions.includes(player?.nfl_players?.position)) {
        toast(`${player?.nfl_players?.position || 'Player'} can't fill ${slotDef.label}`, 'error')
        return
      }
      for (const r of roster) {
        if (r.player_id !== playerId && next[r.player_id] === slotKey) {
          next[r.player_id] = 'bench'
        }
      }
      next[playerId] = slotKey
    } else if (selected?.type === 'player' && target.type === 'player') {
      // Swap two players' slots
      const a = selected.key, b = target.key
      const slotA = next[a], slotB = next[b]
      const playerA = roster.find((r) => r.player_id === a)
      const playerB = roster.find((r) => r.player_id === b)
      const slotADef = STARTER_SLOTS.find((s) => s.key === slotB)
      const slotBDef = STARTER_SLOTS.find((s) => s.key === slotA)
      if (slotADef && !slotADef.positions.includes(playerA?.nfl_players?.position)) {
        toast(`${playerA?.nfl_players?.position} can't fill ${slotADef.label}`, 'error')
        return
      }
      if (slotBDef && !slotBDef.positions.includes(playerB?.nfl_players?.position)) {
        toast(`${playerB?.nfl_players?.position} can't fill ${slotBDef.label}`, 'error')
        return
      }
      next[a] = slotB
      next[b] = slotA
    }
    setDraftSlots(next)
    setSelected(null)
  }

  function handleSlotTap(slotKey) {
    if (selected?.type === 'slot' && selected.key === slotKey) {
      setSelected(null)
      return
    }
    if (selected) {
      swapSelectionWith({ type: 'slot', key: slotKey })
    } else {
      setSelected({ type: 'slot', key: slotKey })
    }
  }

  function handlePlayerTap(playerId) {
    if (selected?.type === 'player' && selected.key === playerId) {
      setSelected(null)
      return
    }
    if (selected) {
      swapSelectionWith({ type: 'player', key: playerId })
    } else {
      setSelected({ type: 'player', key: playerId })
    }
  }

  async function handleSave() {
    if (!draftSlots) return
    const slots = Object.entries(draftSlots).map(([player_id, slot]) => ({ player_id, slot }))
    try {
      await setLineup.mutateAsync(slots)
      toast('Lineup saved', 'success')
      setDraftSlots(null)
      setSelected(null)
    } catch (err) {
      toast(err.message || 'Failed to save lineup', 'error')
    }
  }

  function handleReset() {
    setDraftSlots(null)
    setSelected(null)
  }

  function handleMoveToIR(playerId) {
    const next = { ...ensureDraft() }
    next[playerId] = 'ir'
    setDraftSlots(next)
    setSelected(null)
  }

  function handleMoveOutOfIR(playerId) {
    const next = { ...ensureDraft() }
    next[playerId] = 'bench'
    setDraftSlots(next)
    setSelected(null)
  }

  const isDirty = !!draftSlots && roster.some((r) => draftSlots[r.player_id] !== r.slot)

  return (
    <div className="space-y-4">
      {/* Incoming trade proposals */}
      {incomingTrades.map((trade) => {
        const proposer = trade.proposer || trade.proposer_user
        const isExpanded = expandedTradeId === trade.id
        const proposerItems = (trade.fantasy_trade_items || []).filter((i) => i.from_user_id === trade.proposer_user_id)
        const receiverItems = (trade.fantasy_trade_items || []).filter((i) => i.from_user_id === trade.receiver_user_id)
        return (
          <div key={trade.id} className="rounded-xl border border-accent/40 bg-accent/5 overflow-hidden">
            <button
              onClick={() => setExpandedTradeId(isExpanded ? null : trade.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <Avatar user={proposer} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary">
                  {proposer?.display_name || proposer?.username} proposed a trade
                </div>
                <div className="text-[10px] text-text-muted">Tap to review</div>
              </div>
              <svg className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isExpanded && (
              <div className="px-4 pb-4">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="text-[10px] uppercase text-text-muted mb-1">You receive</div>
                    <div className="space-y-1">
                      {proposerItems.map((item) => (
                        <div key={item.player_id} className="flex items-center gap-2 rounded-lg bg-bg-primary border border-text-primary/10 px-2 py-1.5">
                          {item.nfl_players?.headshot_url && <img src={item.nfl_players.headshot_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />}
                          <div className="text-xs font-semibold text-text-primary truncate">{item.nfl_players?.full_name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-text-muted mb-1">You give up</div>
                    <div className="space-y-1">
                      {receiverItems.map((item) => (
                        <div key={item.player_id} className="flex items-center gap-2 rounded-lg bg-bg-primary border border-text-primary/10 px-2 py-1.5">
                          {item.nfl_players?.headshot_url && <img src={item.nfl_players.headshot_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />}
                          <div className="text-xs font-semibold text-text-primary truncate">{item.nfl_players?.full_name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {trade.message && (
                  <div className="text-xs text-text-secondary italic mb-3">"{trade.message}"</div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleTradeAction(trade.id, 'accept')}
                    disabled={respond.isPending}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-correct text-white hover:bg-correct/90 transition-colors disabled:opacity-50"
                  >Accept</button>
                  <button
                    onClick={() => handleTradeAction(trade.id, 'decline')}
                    disabled={respond.isPending}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-incorrect text-white hover:bg-incorrect/90 transition-colors disabled:opacity-50"
                  >Decline</button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <button
        onClick={() => setShowGlobalRank(true)}
        className="w-full rounded-xl border border-text-primary/20 bg-bg-primary p-3 flex items-center justify-between hover:bg-bg-secondary transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏆</span>
          <div className="text-left">
            <div className="text-sm font-semibold text-text-primary">Global Rank</div>
            <div className="text-[11px] text-text-muted">See how your team stacks up across IKB</div>
          </div>
        </div>
        <span className="text-text-muted">→</span>
      </button>

      {showGlobalRank && (
        <FantasyGlobalRankModal leagueId={league.id} onClose={() => setShowGlobalRank(false)} />
      )}

      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Starting Lineup</h3>
          <span className="text-[10px] text-text-muted">Tap a slot or player to swap</span>
        </div>
        <div className="p-3 space-y-2">
          {STARTER_SLOTS.map((slotDef) => {
            const occupant = playersBySlot[slotDef.key]?.[0]
            const isSlotSelected = selected?.type === 'slot' && selected.key === slotDef.key
            return (
              <div key={slotDef.key} className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-text-muted w-10 shrink-0">{slotDef.label}</span>
                <div className="flex-1">
                  {occupant ? (
                    <PlayerRow
                      row={occupant}
                      isSelected={selected?.type === 'player' && selected.key === occupant.player_id}
                      onTap={() => handlePlayerTap(occupant.player_id)}
                      onViewDetail={openPlayerDetail}
                      onDrop={setConfirmDrop}
                      blurbIds={blurbIds}
                    />
                  ) : (
                    <EmptySlot slotLabel={slotDef.label} isSelected={isSlotSelected} onTap={() => handleSlotTap(slotDef.key)} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Bench ({benchPlayers.length})</h3>
        </div>
        <div className="p-3 space-y-2">
          {benchPlayers.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-2">Bench is empty</p>
          ) : (
            benchPlayers.map((r) => (
              <PlayerRow
                key={r.id}
                row={r}
                isSelected={selected?.type === 'player' && selected.key === r.player_id}
                onTap={() => handlePlayerTap(r.player_id)}
                onViewDetail={openPlayerDetail}
                onMoveToIR={handleMoveToIR}
                onDrop={setConfirmDrop}
                blurbIds={blurbIds}
              />
            ))
          )}
        </div>
      </div>

      {irPlayers.length > 0 && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">IR ({irPlayers.length})</h3>
          </div>
          <div className="p-3 space-y-2">
            {irPlayers.map((r) => (
              <PlayerRow
                key={r.id}
                row={r}
                isSelected={selected?.type === 'player' && selected.key === r.player_id}
                onTap={() => handlePlayerTap(r.player_id)}
                onViewDetail={openPlayerDetail}
                onMoveOutOfIR={handleMoveOutOfIR}
                onDrop={setConfirmDrop}
                blurbIds={blurbIds}
              />
            ))}
          </div>
        </div>
      )}

      {isDirty && (
        <div className="sticky bottom-4 flex gap-2 px-2">
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 py-3 rounded-xl text-sm font-semibold bg-bg-card text-text-secondary border border-border hover:bg-bg-card-hover transition-colors"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={setLineup.isPending}
            className="flex-1 py-3 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {setLineup.isPending ? 'Saving…' : 'Save Lineup'}
          </button>
        </div>
      )}

      {detailPlayerId && (
        <PlayerDetailModal leagueId={league.id} playerId={detailPlayerId} onClose={() => setDetailPlayerId(null)} />
      )}

      {confirmDrop && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center" onClick={() => setConfirmDrop(null)}>
          <div className="bg-bg-secondary w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg mb-2">Drop {confirmDrop.nfl_players?.full_name}?</h3>
            <p className="text-sm text-text-secondary mb-4">
              They'll be placed on waivers until the next clearing (Wednesday 3:00 AM ET). Your roster slot will be left empty.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDrop(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-bg-card text-text-secondary border border-border hover:bg-bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await dropPlayer.mutateAsync(confirmDrop.player_id)
                    toast(`${confirmDrop.nfl_players?.full_name || 'Player'} dropped`, 'success')
                    setConfirmDrop(null)
                  } catch (err) {
                    toast(err.message || 'Failed to drop', 'error')
                  }
                }}
                disabled={dropPlayer.isPending}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-incorrect text-white hover:bg-incorrect/80 transition-colors disabled:opacity-50"
              >
                {dropPlayer.isPending ? 'Dropping…' : 'Drop'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
