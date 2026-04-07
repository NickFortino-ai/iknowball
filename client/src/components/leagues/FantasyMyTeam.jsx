import { useState, useMemo } from 'react'
import { useFantasyRoster, useSetFantasyLineup } from '../../hooks/useLeagues'
import { SkeletonRows, SkeletonBlock } from '../ui/Skeleton'
import { toast } from '../ui/Toast'
import PlayerDetailModal from './PlayerDetailModal'
import FantasyGlobalRankModal from './FantasyGlobalRankModal'

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

function PlayerRow({ row, onTap, isSelected, dimmed, onMoveToIR, onMoveOutOfIR, onViewDetail }) {
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
          </div>
          <div className="text-xs text-text-muted">{row?.nfl_players?.position} · {row?.nfl_players?.team || 'FA'}</div>
        </div>
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
  const { data: roster, isLoading } = useFantasyRoster(league.id)
  const setLineup = useSetFantasyLineup(league.id)
  const [draftSlots, setDraftSlots] = useState(null) // { [player_id]: slot }
  const [selected, setSelected] = useState(null) // { type: 'slot'|'player', key: string }
  const [detailPlayerId, setDetailPlayerId] = useState(null)
  const [showGlobalRank, setShowGlobalRank] = useState(false)

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
  if (!hasRoster) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-text-secondary">No players on your roster yet. Complete the draft to build your team.</p>
      </div>
    )
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
                      onViewDetail={setDetailPlayerId}
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
                onViewDetail={setDetailPlayerId}
                onMoveToIR={handleMoveToIR}
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
                onViewDetail={setDetailPlayerId}
                onMoveOutOfIR={handleMoveOutOfIR}
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
    </div>
  )
}
