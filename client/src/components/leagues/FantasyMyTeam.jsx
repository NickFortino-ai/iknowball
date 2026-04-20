import { useState, useMemo, useEffect } from 'react'
import { useFantasyRoster, useSetFantasyLineup, useDropRosterPlayer, useFantasyTrades, useRespondToTrade, useBlurbPlayerIds, useFantasySettings, useGlobalRank, useFantasyLineupHistory, useFantasyWeeklyLineup, useSetFantasyWeeklyLineup } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { SkeletonRows, SkeletonBlock } from '../ui/Skeleton'
import { toast } from '../ui/Toast'
import Avatar from '../ui/Avatar'
import PlayerDetailModal from './PlayerDetailModal'
import FantasyGlobalRankModal from './FantasyGlobalRankModal'
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

function PlayerRow({ row, onTap, isSelected, dimmed, onMoveToIR, onMoveOutOfIR, onViewDetail, blurbIds, editMode }) {
  const canIR = row?.nfl_players?.injury_status === 'Out' || row?.nfl_players?.injury_status === 'IR'
  const isInIR = row?.slot === 'ir'

  function handleRowClick() {
    if (editMode) {
      onTap?.()
    } else {
      onViewDetail?.(row?.player_id)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleRowClick}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg border transition-colors text-left ${
          isSelected ? 'border-accent bg-accent/10' : 'border-text-primary/10 bg-bg-primary hover:bg-bg-card-hover'
        } ${dimmed ? 'opacity-40' : ''}`}
      >
        {row?.nfl_players?.headshot_url && (
          <img
            src={row.nfl_players.headshot_url}
            alt=""
            className="w-11 h-11 rounded-full object-cover bg-bg-secondary shrink-0"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold text-text-primary truncate">{row?.nfl_players?.full_name || 'Empty'}</span>
            <InjuryBadge status={row?.nfl_players?.injury_status} />
            {blurbIds && <BlurbDot playerId={row?.player_id} blurbIds={blurbIds} />}
          </div>
          <div className="text-xs text-text-primary">{row?.nfl_players?.position} · {row?.nfl_players?.team || 'FA'}</div>
        </div>
        {(row?.live_points != null || row?.points != null) && row?.nfl_players && (
          <div className="text-right shrink-0 mr-1">
            <div className="text-lg font-display tabular-nums text-white leading-none">{(row.live_points ?? row.points ?? 0).toFixed(2)}</div>
            <div className="text-[10px] uppercase text-text-muted">pts</div>
          </div>
        )}
        {editMode && (canIR && !isInIR && onMoveToIR) && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onMoveToIR(row.player_id) }}
            className="text-xs font-bold px-2 py-1 rounded bg-incorrect/20 text-incorrect hover:bg-incorrect/30 transition-colors shrink-0 cursor-pointer"
          >
            → IR
          </span>
        )}
        {editMode && isInIR && onMoveOutOfIR && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onMoveOutOfIR(row.player_id) }}
            className="text-xs font-bold px-2 py-1 rounded bg-bg-card text-text-secondary hover:bg-bg-card-hover transition-colors shrink-0 cursor-pointer"
          >
            ← Bench
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
  const { data: fantasySettings } = useFantasySettings(league.id)
  const currentWeek = fantasySettings?.current_week || 1
  const season = fantasySettings?.season || 2026
  const totalWeeks = 17
  const [viewWeek, setViewWeek] = useState(null) // null = current week
  const activeWeek = viewWeek ?? currentWeek
  const isCurrentWeek = activeWeek === currentWeek
  const isPastWeek = activeWeek < currentWeek
  const isFutureWeek = activeWeek > currentWeek

  const { data: roster, isLoading } = useFantasyRoster(league.id)
  const { data: historyData } = useFantasyLineupHistory(league.id, isPastWeek ? activeWeek : null, isPastWeek ? season : null)
  const { data: weeklyLineupData } = useFantasyWeeklyLineup(league.id, isFutureWeek ? activeWeek : null)
  const setWeeklyLineup = useSetFantasyWeeklyLineup(league.id)
  const { data: trades } = useFantasyTrades(league.id)
  const { data: blurbIdsList } = useBlurbPlayerIds(league.id)
  const blurbIds = useMemo(() => new Set(blurbIdsList || []), [blurbIdsList])
  const respond = useRespondToTrade(league.id)
  const setLineup = useSetFantasyLineup(league.id)
  const dropPlayer = useDropRosterPlayer(league.id)
  const [confirmDrop, setConfirmDrop] = useState(null) // roster row being dropped
  const [draftSlots, setDraftSlots] = useState(null) // { [player_id]: slot }
  const [selected, setSelected] = useState(null) // { type: 'slot'|'player', key: string }
  const [editMode, setEditMode] = useState(false)
  const [showCounterTrade, setShowCounterTrade] = useState(null)
  const [detailPlayerId, setDetailPlayerId] = useState(null)
  const [showGlobalRank, setShowGlobalRank] = useState(false)
  const { data: globalRankData } = useGlobalRank(league.id)
  const hasGlobalRank = globalRankData?.status === 'ok' && globalRankData?.format?.team_count > 1
  const [expandedTradeId, setExpandedTradeId] = useState(null)
  const [tradeAcceptedModal, setTradeAcceptedModal] = useState(false)

  // Reset edit state when navigating weeks
  useEffect(() => {
    setEditMode(false)
    setDraftSlots(null)
    setSelected(null)
  }, [activeWeek])

  // For past weeks, use lineup history; for future weeks with saved lineup, use that; otherwise current roster
  const weeklyRoster = weeklyLineupData?.roster
  const hasWeeklyLineup = isFutureWeek && weeklyRoster && weeklyRoster.length > 0
  const displayRoster = isPastWeek && historyData?.roster?.length
    ? historyData.roster
    : hasWeeklyLineup
      ? weeklyRoster
      : roster

  function openPlayerDetail(playerId) {
    if (playerId) markBlurbSeen(playerId)
    setDetailPlayerId(playerId)
  }

  // Pending trades where I'm the receiver
  const incomingTrades = (trades || []).filter((t) => t.status === 'pending' && t.receiver_user_id === profile?.id)

  // Build a working slot-by-player map (server slot or draftSlots override)
  // For future weeks with a saved weekly lineup, use those slots as the base
  const slotByPlayer = useMemo(() => {
    if (!roster) return {}
    const map = {}
    // Start from weekly lineup if viewing a future week with saved data
    if (hasWeeklyLineup) {
      // Initialize all current roster players as bench
      for (const r of roster) map[r.player_id] = 'bench'
      // Override with weekly lineup slots (only players still on roster)
      for (const w of weeklyRoster) {
        if (map[w.player_id] !== undefined) map[w.player_id] = w.slot
      }
    } else {
      for (const r of roster) map[r.player_id] = r.slot
    }
    // Apply draft overrides on top
    if (draftSlots) {
      for (const pid of Object.keys(draftSlots)) {
        if (map[pid] !== undefined) map[pid] = draftSlots[pid]
      }
    }
    return map
  }, [roster, draftSlots, hasWeeklyLineup, weeklyRoster])

  const isDirty = useMemo(() => {
    if (!draftSlots || !roster) return false
    if (hasWeeklyLineup) {
      const weeklyMap = {}
      for (const r of roster) weeklyMap[r.player_id] = 'bench'
      for (const w of weeklyRoster) {
        if (weeklyMap[w.player_id] !== undefined) weeklyMap[w.player_id] = w.slot
      }
      return Object.keys(draftSlots).some((pid) => draftSlots[pid] !== weeklyMap[pid])
    }
    return roster.some((r) => draftSlots[r.player_id] !== r.slot)
  }, [draftSlots, roster, hasWeeklyLineup, weeklyRoster])

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
            <h3 className="text-base font-semibold text-text-primary">{isSalaryCap ? 'Lineup' : 'Starters'}</h3>
          </div>
          <div className="divide-y divide-text-primary/10">
            {starterSlots.map((label, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-xs font-bold text-text-muted w-8 shrink-0">{label}</span>
                <div className="w-9 h-9 rounded-full border border-text-primary/20 shrink-0" />
                <div className="flex-1 text-xs text-text-muted italic">Empty</div>
              </div>
            ))}
          </div>
        </div>
        {benchCount > 0 && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-base font-semibold text-text-primary">Bench</h3>
          </div>
          <div className="divide-y divide-text-primary/10">
            {Array.from({ length: benchCount }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-xs font-bold text-text-muted w-8 shrink-0">BN</span>
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
      if (action === 'accept') {
        setTradeAcceptedModal(true)
      } else {
        toast(`Trade ${action}d`, 'success')
      }
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
  const benchSlots = fantasySettings?.roster_slots?.bench || 6
  const emptyBenchCount = Math.max(0, benchSlots - benchPlayers.length)
  const irPlayers = playersBySlot.ir || []

  function ensureDraft() {
    if (draftSlots) return draftSlots
    const initial = {}
    if (hasWeeklyLineup) {
      // Start from weekly lineup: bench everyone, then overlay saved slots
      for (const r of roster) initial[r.player_id] = 'bench'
      for (const w of weeklyRoster) {
        if (initial[w.player_id] !== undefined) initial[w.player_id] = w.slot
      }
    } else {
      for (const r of roster) initial[r.player_id] = r.slot
    }
    setDraftSlots(initial)
    return initial
  }

  function swapSelectionWith(target) {
    // target = { type: 'slot', key } or { type: 'player', key: player_id }
    const next = { ...ensureDraft() }
    if (selected?.type === 'player' && target.type === 'slot') {
      const playerId = selected.key
      const slotKey = target.key
      // Benching: just move to bench, no position check
      if (slotKey === 'bench') {
        next[playerId] = 'bench'
      } else {
        const player = roster.find((r) => r.player_id === playerId)
        const slotDef = STARTER_SLOTS.find((s) => s.key === slotKey)
        if (!slotDef?.positions.includes(player?.nfl_players?.position)) {
          toast(`${player?.nfl_players?.position || 'Player'} can't fill ${slotDef?.label || slotKey}`, 'error')
          return
        }
        for (const r of roster) {
          if (r.player_id !== playerId && next[r.player_id] === slotKey) {
            next[r.player_id] = 'bench'
          }
        }
        next[playerId] = slotKey
      }
    } else if (selected?.type === 'slot' && target.type === 'player') {
      const slotKey = selected.key
      const playerId = target.key
      if (slotKey === 'bench') {
        next[playerId] = 'bench'
      } else {
        const player = roster.find((r) => r.player_id === playerId)
        const slotDef = STARTER_SLOTS.find((s) => s.key === slotKey)
        if (!slotDef?.positions.includes(player?.nfl_players?.position)) {
          toast(`${player?.nfl_players?.position || 'Player'} can't fill ${slotDef?.label || slotKey}`, 'error')
          return
        }
        for (const r of roster) {
          if (r.player_id !== playerId && next[r.player_id] === slotKey) {
            next[r.player_id] = 'bench'
          }
        }
        next[playerId] = slotKey
      }
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
      if (isFutureWeek) {
        await setWeeklyLineup.mutateAsync({ week: activeWeek, slots })
      } else {
        await setLineup.mutateAsync(slots)
      }
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


  return (
    <div className="space-y-4">
      {/* Week navigator */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setViewWeek(Math.max(1, activeWeek - 1))}
          disabled={activeWeek <= 1}
          className="text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="text-center">
          <span className="font-display text-lg text-text-primary">Week {activeWeek}</span>
          {isCurrentWeek && <span className="text-xs text-accent ml-2">Current</span>}
          {isPastWeek && <span className="text-xs text-text-muted ml-2">Final</span>}
          {isFutureWeek && hasWeeklyLineup && <span className="text-xs text-correct ml-2">Set</span>}
          {isFutureWeek && !hasWeeklyLineup && <span className="text-xs text-text-muted ml-2">Upcoming</span>}
        </div>
        <button
          onClick={() => setViewWeek(Math.min(totalWeeks, activeWeek + 1))}
          disabled={activeWeek >= totalWeeks}
          className="text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Past week: read-only notice + total */}
      {isPastWeek && historyData?.roster?.length > 0 && (
        <div className="text-center text-xs text-text-muted">
          Lineup as locked for Week {activeWeek}
          {historyData.team_total != null && (
            <span className="ml-2 text-text-primary font-semibold">{historyData.team_total.toFixed(2)} pts</span>
          )}
        </div>
      )}
      {isPastWeek && (!historyData?.roster?.length) && (
        <div className="text-center text-sm text-text-muted py-8">No lineup history for this week</div>
      )}

      {/* Future week: invalidation warning if players no longer on roster */}
      {hasWeeklyLineup && weeklyRoster.some((w) => w.still_on_roster === false) && (
        <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent text-center">
          Some players in this lineup are no longer on your roster. Edit to fix.
        </div>
      )}

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
                    <div className="text-sm font-semibold text-text-primary mb-2">You receive</div>
                    <div className="space-y-1.5">
                      {proposerItems.map((item) => (
                        <div key={item.player_id} className="flex items-center gap-2.5 rounded-lg bg-bg-primary border border-text-primary/10 px-3 py-2">
                          {item.nfl_players?.headshot_url && <img src={item.nfl_players.headshot_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />}
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-text-primary truncate">{item.nfl_players?.full_name}</div>
                            <div className="text-xs text-text-primary">{item.nfl_players?.position} · {item.nfl_players?.team}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-text-primary mb-2">You give up</div>
                    <div className="space-y-1.5">
                      {receiverItems.map((item) => (
                        <div key={item.player_id} className="flex items-center gap-2.5 rounded-lg bg-bg-primary border border-text-primary/10 px-3 py-2">
                          {item.nfl_players?.headshot_url && <img src={item.nfl_players.headshot_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />}
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-text-primary truncate">{item.nfl_players?.full_name}</div>
                            <div className="text-xs text-text-primary">{item.nfl_players?.position} · {item.nfl_players?.team}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {trade.message && (
                  <div className="text-sm text-text-primary italic mb-3">"{trade.message}"</div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTradeAction(trade.id, 'accept')}
                    disabled={respond.isPending}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-correct text-white hover:bg-correct/90 transition-colors disabled:opacity-50"
                  >Accept</button>
                  <button
                    onClick={() => { setExpandedTradeId(null); setShowCounterTrade(trade) }}
                    disabled={respond.isPending}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >Counter</button>
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

      {hasGlobalRank && (
        <button
          onClick={() => setShowGlobalRank(true)}
          className="w-full rounded-xl border border-text-primary/20 bg-bg-primary p-3 flex items-center justify-between hover:bg-bg-secondary transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div className="text-left">
              <div className="text-sm font-semibold text-text-primary">Global Rank</div>
              <div className="text-xs text-text-primary">See where your team ranks across all IKB leagues with the same roster and scoring settings.</div>
            </div>
          </div>
          <span className="text-text-muted">→</span>
        </button>
      )}

      {showGlobalRank && (
        <FantasyGlobalRankModal leagueId={league.id} onClose={() => setShowGlobalRank(false)} />
      )}

      {tradeAcceptedModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4" onClick={() => setTradeAcceptedModal(false)}>
          <div className="bg-bg-primary border border-text-primary/20 rounded-2xl p-6 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-3xl mb-3">&#9989;</div>
            <h3 className="font-display text-xl text-text-primary mb-2">Trade Accepted</h3>
            <p className="text-sm text-text-primary leading-relaxed mb-4">
              This trade will be reviewed by the commissioner of this league. Upon approval, the trade will be processed.
            </p>
            <button
              onClick={() => setTradeAcceptedModal(false)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {showCounterTrade && (
        <ProposeTradeModal
          league={league}
          currentUserId={profile?.id}
          initialReceiverId={showCounterTrade.proposer_user_id}
          onClose={() => setShowCounterTrade(null)}
        />
      )}

      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-primary">Starting Lineup</h3>
          {(isCurrentWeek || isFutureWeek) && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors px-3 py-1 rounded-lg border border-accent/30 hover:border-accent"
            >
              Edit
            </button>
          )}
          {editMode && (
            <span className="text-[10px] text-text-muted">Tap a slot or player to swap</span>
          )}
        </div>
        <div className="p-3 space-y-2">
          {STARTER_SLOTS.map((slotDef) => {
            const occupant = playersBySlot[slotDef.key]?.[0]
            const isSlotSelected = selected?.type === 'slot' && selected.key === slotDef.key
            return (
              <div key={slotDef.key} className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-text-muted w-8 shrink-0">{slotDef.label}</span>
                <div className="flex-1">
                  {occupant ? (
                    <PlayerRow
                      row={occupant}
                      isSelected={editMode && selected?.type === 'player' && selected.key === occupant.player_id}
                      onTap={() => handlePlayerTap(occupant.player_id)}
                      onViewDetail={openPlayerDetail}
                      editMode={editMode}
                      blurbIds={blurbIds}
                    />
                  ) : (
                    editMode ? <EmptySlot slotLabel={slotDef.label} isSelected={isSlotSelected} onTap={() => handleSlotTap(slotDef.key)} /> : <EmptySlot slotLabel={slotDef.label} onTap={() => {}} isSelected={false} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-base font-semibold text-text-primary">Bench</h3>
        </div>
        <div className="p-3 space-y-2">
          {benchPlayers.map((r) => (
            <PlayerRow
              key={r.id}
              row={r}
              isSelected={editMode && selected?.type === 'player' && selected.key === r.player_id}
              onTap={() => handlePlayerTap(r.player_id)}
              onViewDetail={openPlayerDetail}
              onMoveToIR={handleMoveToIR}
              editMode={editMode}
              blurbIds={blurbIds}
            />
          ))}
          {Array.from({ length: emptyBenchCount }, (_, i) => (
            <EmptySlot key={`bench-empty-${i}`} slotLabel="BN" onTap={editMode ? () => handleSlotTap('bench') : () => {}} isSelected={editMode && selected?.type === 'slot' && selected.key === 'bench'} />
          ))}
        </div>
      </div>

      {irPlayers.length > 0 && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-base font-semibold text-text-primary">IR ({irPlayers.length})</h3>
          </div>
          <div className="p-3 space-y-2">
            {irPlayers.map((r) => (
              <PlayerRow
                key={r.id}
                row={r}
                isSelected={editMode && selected?.type === 'player' && selected.key === r.player_id}
                onTap={() => handlePlayerTap(r.player_id)}
                onViewDetail={openPlayerDetail}
                onMoveOutOfIR={handleMoveOutOfIR}
                editMode={editMode}
                blurbIds={blurbIds}
              />
            ))}
          </div>
        </div>
      )}

      {editMode && (isCurrentWeek || isFutureWeek) && (
        <div className="sticky bottom-4 flex gap-2 px-2">
          <button
            type="button"
            onClick={() => { handleReset(); setSelected(null); setEditMode(false) }}
            className="flex-1 py-3 rounded-xl text-sm font-semibold bg-bg-card text-text-secondary border border-border hover:bg-bg-card-hover transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => { await handleSave(); setSelected(null); setEditMode(false) }}
            disabled={(isFutureWeek ? setWeeklyLineup.isPending : setLineup.isPending) || !isDirty}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${isDirty ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-text-muted/30 text-text-muted'}`}
          >
            {(isFutureWeek ? setWeeklyLineup.isPending : setLineup.isPending) ? 'Saving…' : 'Save Lineup'}
          </button>
        </div>
      )}

      {detailPlayerId && (
        <PlayerDetailModal
          leagueId={league.id}
          playerId={detailPlayerId}
          onClose={() => setDetailPlayerId(null)}
          playerContext="my_roster"
          onDrop={(pid) => {
            const row = roster?.find((r) => r.player_id === pid)
            if (row) { setDetailPlayerId(null); setConfirmDrop(row) }
          }}
        />
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
