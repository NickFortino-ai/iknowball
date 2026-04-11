import { useState, useMemo } from 'react'
import { useNflDfsPlayers, useNflDfsRoster, useSaveNflDfsRoster, useFantasySettings } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'

const SLOTS = [
  { key: 'QB', label: 'QB', positions: ['QB'] },
  { key: 'RB1', label: 'RB', positions: ['RB'] },
  { key: 'RB2', label: 'RB', positions: ['RB'] },
  { key: 'WR1', label: 'WR', positions: ['WR'] },
  { key: 'WR2', label: 'WR', positions: ['WR'] },
  { key: 'WR3', label: 'WR', positions: ['WR'] },
  { key: 'TE', label: 'TE', positions: ['TE'] },
  { key: 'FLEX', label: 'FLEX', positions: ['RB', 'WR', 'TE'] },
  { key: 'DEF', label: 'DEF', positions: ['DEF'] },
]

const POS_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'DEF']

export default function NflSalaryCapView({ league }) {
  const { profile } = useAuth()
  const { data: settings } = useFantasySettings(league.id)
  const currentWeek = settings?.current_week || settings?.single_week || 1
  const season = settings?.season || 2026
  const salaryCap = settings?.salary_cap || 60000

  const { data: players, isLoading: playersLoading } = useNflDfsPlayers(currentWeek, season)
  const { data: roster, isLoading: rosterLoading } = useNflDfsRoster(league.id, currentWeek, season)
  const saveRoster = useSaveNflDfsRoster()

  const [selectedSlot, setSelectedSlot] = useState(null)
  const [posFilter, setPosFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  // Build current lineup from saved roster
  const lineup = useMemo(() => {
    const map = {}
    for (const s of SLOTS) map[s.key] = null
    if (roster?.dfs_roster_slots) {
      for (const slot of roster.dfs_roster_slots) {
        map[slot.roster_slot] = {
          player_id: slot.player_id,
          salary: slot.salary,
          is_locked: slot.is_locked,
          points_earned: slot.points_earned,
          ...slot.nfl_players,
        }
      }
    }
    return map
  }, [roster])

  const usedPlayerIds = useMemo(() => new Set(Object.values(lineup).filter(Boolean).map((p) => p.player_id || p.id)), [lineup])
  const totalSalary = useMemo(() => Object.values(lineup).reduce((sum, p) => sum + (p?.salary || 0), 0), [lineup])
  const remaining = salaryCap - totalSalary
  const filledCount = Object.values(lineup).filter(Boolean).length

  // Filter available players
  const available = useMemo(() => {
    if (!players) return []
    return players
      .filter((p) => !usedPlayerIds.has(p.id))
      .filter((p) => {
        if (selectedSlot) {
          const slotDef = SLOTS.find((s) => s.key === selectedSlot)
          return slotDef?.positions.includes(p.position)
        }
        return posFilter === 'All' || p.position === posFilter
      })
      .filter((p) => !searchQuery || p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter((p) => p.salary <= remaining + (lineup[selectedSlot]?.salary || 0))
      .sort((a, b) => (b.salary || 0) - (a.salary || 0))
      .slice(0, 100)
  }, [players, usedPlayerIds, posFilter, searchQuery, selectedSlot, remaining, lineup])

  function handleAssign(player) {
    if (!selectedSlot) {
      // Find first empty eligible slot
      const slot = SLOTS.find((s) => !lineup[s.key] && s.positions.includes(player.position))
      if (!slot) { toast('No eligible slot available', 'error'); return }
      handleSave(slot.key, player)
    } else {
      handleSave(selectedSlot, player)
    }
  }

  async function handleSave(slotKey, player) {
    const newLineup = { ...lineup, [slotKey]: { ...player, player_id: player.id, salary: player.salary } }
    const slots = SLOTS.map((s) => {
      const p = newLineup[s.key]
      return p ? { roster_slot: s.key, player_id: p.player_id || p.id, salary: p.salary || 0 } : null
    }).filter(Boolean)

    try {
      await saveRoster.mutateAsync({ league_id: league.id, week: currentWeek, season, slots })
      setSelectedSlot(null)
      setSearchQuery('')
    } catch (err) {
      toast(err.message || 'Failed to save roster', 'error')
    }
  }

  async function handleRemove(slotKey) {
    const newLineup = { ...lineup, [slotKey]: null }
    const slots = SLOTS.map((s) => {
      const p = newLineup[s.key]
      return p ? { roster_slot: s.key, player_id: p.player_id || p.id, salary: p.salary || 0 } : null
    }).filter(Boolean)

    try {
      await saveRoster.mutateAsync({ league_id: league.id, week: currentWeek, season, slots })
    } catch (err) {
      toast(err.message || 'Failed to update roster', 'error')
    }
  }

  if (playersLoading || rosterLoading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      {/* Salary bar */}
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase text-text-muted tracking-wider">Week {currentWeek} Lineup</div>
          <div className="text-xs text-text-muted">{filledCount}/{SLOTS.length} filled</div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-text-muted text-xs">Remaining </span>
            <span className={`font-display text-lg ${remaining < 0 ? 'text-incorrect' : 'text-correct'}`}>
              ${remaining.toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-text-muted">
            ${totalSalary.toLocaleString()} / ${salaryCap.toLocaleString()}
          </div>
        </div>
        <div className="w-full h-1.5 bg-bg-secondary rounded-full mt-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${remaining < 0 ? 'bg-incorrect' : 'bg-accent'}`}
            style={{ width: `${Math.min(100, (totalSalary / salaryCap) * 100)}%` }}
          />
        </div>
      </div>

      {/* Roster slots */}
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        {SLOTS.map((slot) => {
          const player = lineup[slot.key]
          const isSelected = selectedSlot === slot.key
          return (
            <div
              key={slot.key}
              onClick={() => !player?.is_locked && setSelectedSlot(isSelected ? null : slot.key)}
              className={`flex items-center gap-3 px-3 py-2.5 border-b border-text-primary/10 last:border-0 cursor-pointer transition-colors ${
                isSelected ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-text-primary/5'
              }`}
            >
              <span className="text-[10px] font-bold text-text-muted w-10 shrink-0">{slot.label}</span>
              {player ? (
                <>
                  {player.headshot_url && (
                    <img src={player.headshot_url} alt="" className="w-9 h-9 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{player.full_name}</div>
                    <div className="text-[10px] text-text-muted">{player.position} · {player.team || 'FA'} · ${(player.salary || 0).toLocaleString()}</div>
                  </div>
                  {player.is_locked ? (
                    <span className="text-[10px] text-text-muted">Locked</span>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemove(slot.key) }}
                      className="text-incorrect text-xs font-semibold hover:text-incorrect/80 shrink-0"
                    >Drop</button>
                  )}
                </>
              ) : (
                <>
                  <div className="w-9 h-9 rounded-full border border-text-primary/20 shrink-0" />
                  <div className="flex-1 text-xs text-text-muted italic">
                    {isSelected ? 'Select a player below' : `Tap to fill ${slot.label}`}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Player browser */}
      {selectedSlot && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="p-3 border-b border-border">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search players..."
              className="w-full bg-bg-secondary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="max-h-[40vh] overflow-y-auto">
            {available.map((player) => (
              <div
                key={player.id}
                onClick={() => handleAssign(player)}
                className="flex items-center gap-3 px-3 py-2.5 border-b border-text-primary/10 last:border-0 cursor-pointer hover:bg-accent/10 transition-colors"
              >
                {player.headshot_url && (
                  <img src={player.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">{player.full_name}</div>
                  <div className="text-[10px] text-text-muted">{player.position} · {player.team || 'FA'}</div>
                </div>
                <div className="text-sm font-display text-accent shrink-0">${(player.salary || 0).toLocaleString()}</div>
              </div>
            ))}
            {available.length === 0 && (
              <div className="text-center text-sm text-text-muted py-8">No eligible players found</div>
            )}
          </div>
        </div>
      )}

      {/* No players available message */}
      {!players?.length && !playersLoading && (
        <div className="text-center py-8 text-sm text-text-muted">
          Player salaries for Week {currentWeek} haven't been generated yet. They'll be available closer to game time.
        </div>
      )}
    </div>
  )
}
