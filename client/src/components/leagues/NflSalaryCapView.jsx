import { useState, useMemo } from 'react'
import { useNflDfsPlayers, useNflDfsRoster, useSaveNflDfsRoster, useSubmitNflDfsRoster, useFantasySettings, useFantasyWeekProjections } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'
import PlayerHeadshot from '../ui/PlayerHeadshot'
import PlayerDetailModal from './PlayerDetailModal'
import { timeAgo } from '../../lib/time'

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

const POS_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'DEF', 'OUT']

export default function NflSalaryCapView({ league }) {
  const { profile } = useAuth()
  const { data: settings } = useFantasySettings(league.id)
  const currentWeek = settings?.current_week || settings?.single_week || 1
  const season = settings?.season || 2026
  const salaryCap = settings?.salary_cap || 60000

  const { data: players, isLoading: playersLoading } = useNflDfsPlayers(currentWeek, season)
  const { data: roster, isLoading: rosterLoading } = useNflDfsRoster(league.id, currentWeek, season)
  const saveRoster = useSaveNflDfsRoster()
  const submitRoster = useSubmitNflDfsRoster()
  // Per-week opponent map — drives the "vs MIA" / "@ MIA" / BYE
  // marker on both rostered slots and the available-players list.
  // Re-uses the same hook traditional fantasy uses.
  const { data: weekContextData } = useFantasyWeekProjections(league.id, currentWeek || null)
  const oppMap = weekContextData?.opponents
  function oppLabel(team) {
    if (!team || !oppMap) return null
    const op = oppMap[team]
    if (!op) return { text: 'BYE', isBye: true }
    return { text: `${op.is_home ? 'vs' : '@'} ${op.opponent}`, isBye: false }
  }

  // Edit mode: true when the user hasn't submitted yet OR has explicitly
  // tapped "Edit Roster" after submit. Gates the X (remove) and + (add)
  // affordances so the roster doesn't silently mutate after submit.
  const isEditing = !roster?.submitted_at || editingAfterSubmit

  const [posFilter, setPosFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [detailPlayerId, setDetailPlayerId] = useState(null)
  // When user taps "Edit Roster" after submitting, hide the Submitted
  // badge so the Submit Roster button reappears and they can confirm
  // their changes. Resets on successful resubmit (handleSubmit) so the
  // badge comes back when they commit.
  const [editingAfterSubmit, setEditingAfterSubmit] = useState(false)

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

  const hasSavedRoster = roster?.dfs_roster_slots?.length > 0
  const usedPlayerIds = useMemo(() => new Set(Object.values(lineup).filter(Boolean).map((p) => p.player_id || p.id)), [lineup])
  const totalSalary = useMemo(() => Object.values(lineup).reduce((sum, p) => sum + (p?.salary || 0), 0), [lineup])
  const remaining = salaryCap - totalSalary
  const filledCount = Object.values(lineup).filter(Boolean).length

  // Filter available players. Mirrors the NBA DFS pattern: by default
  // exclude players marked Out / IR so a user can't accidentally roster
  // an inactive (whose salary still reflects healthy-FPPG pricing); the
  // dedicated OUT filter lets a curious user inspect who's ruled out.
  const available = useMemo(() => {
    if (!players) return []
    return players
      .filter((p) => !usedPlayerIds.has(p.id))
      .filter((p) => {
        if (posFilter === 'OUT') return p.injury_status === 'Out' || p.injury_status === 'IR'
        if (p.injury_status === 'Out' || p.injury_status === 'IR') return false
        return posFilter === 'All' || p.position === posFilter
      })
      .filter((p) => !searchQuery || p.full_name?.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter((p) => posFilter === 'OUT' || p.salary <= remaining)
      .sort((a, b) => (b.salary || 0) - (a.salary || 0))
      .slice(0, 100)
  }, [players, usedPlayerIds, posFilter, searchQuery, remaining])

  function addPlayer(player) {
    // Find first empty eligible slot
    const slot = SLOTS.find((s) => !lineup[s.key] && s.positions.includes(player.position))
    if (!slot) { toast('No eligible slot available', 'error'); return }
    handleSave(slot.key, player)
  }

  async function handleSave(slotKey, player) {
    const newLineup = { ...lineup, [slotKey]: { ...player, player_id: player.id, salary: player.salary } }
    const slots = SLOTS.map((s) => {
      const p = newLineup[s.key]
      return p ? { roster_slot: s.key, player_id: p.player_id || p.id, salary: p.salary || 0 } : null
    }).filter(Boolean)

    try {
      await saveRoster.mutateAsync({ league_id: league.id, week: currentWeek, season, slots })
      setSearchQuery('')
    } catch (err) {
      toast(err.message || 'Failed to save roster', 'error')
    }
  }

  async function handleSubmit() {
    try {
      await submitRoster.mutateAsync({ league_id: league.id, week: currentWeek, season })
      toast('Roster submitted!', 'success')
      setEditingAfterSubmit(false)
    } catch (err) {
      toast(err.message || 'Failed to submit roster', 'error')
    }
  }

  async function removeSlot(slotKey) {
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
    <div className="lg:grid lg:grid-cols-2 lg:gap-6">
      {/* Left column: roster */}
      <div>
        {/* Salary Bar */}
        <div className="rounded-xl border border-text-primary/20 bg-bg-primary/20 backdrop-blur-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Salary Cap</span>
            <span className="text-xs text-text-primary font-semibold">{filledCount}/{SLOTS.length} slots</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className={`font-display text-2xl ${remaining < 0 ? 'text-incorrect' : 'text-correct'}`}>
              ${remaining.toLocaleString()}
            </span>
            <span className="text-xs text-text-primary">of ${salaryCap.toLocaleString()}</span>
          </div>
          <div className="mt-2 h-1.5 bg-text-primary/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${remaining < 0 ? 'bg-incorrect' : 'bg-accent'}`}
              style={{ width: `${Math.min((totalSalary / salaryCap) * 100, 100)}%` }}
            />
          </div>
          {(SLOTS.length - filledCount) > 0 && (
            <div className="mt-2 text-xs text-text-primary text-right">
              ${Math.round(remaining / (SLOTS.length - filledCount)).toLocaleString()} avg per player
            </div>
          )}
        </div>


        {/* My Roster */}
        <div className="rounded-xl border border-text-primary/20 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-text-primary/10">
            <h3 className="text-sm font-semibold text-text-primary">My Roster</h3>
          </div>
          {SLOTS.map((slot) => {
            const player = lineup[slot.key]
            const isLocked = player?.is_locked
            const pointsEarned = player?.points_earned || 0
            return (
              <div
                key={slot.key}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-text-primary/10 last:border-b-0 bg-bg-primary"
              >
                <span className="text-xs font-bold text-accent w-7 shrink-0">{slot.label}</span>
                {player ? (
                  <>
                    <PlayerHeadshot name={player.full_name} url={player.headshot_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-text-primary truncate">{player.full_name}</span>
                        {isLocked && (
                          <svg className="w-3 h-3 text-text-muted shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div className="text-xs text-text-muted">
                        {player.position} · {player.team || 'FA'}
                        {(() => {
                          const opp = oppLabel(player.team)
                          if (!opp) return null
                          return <span className={`ml-2 ${opp.isBye ? 'text-yellow-400 font-semibold' : ''}`}>{opp.text}</span>
                        })()}
                      </div>
                    </div>
                    {isLocked ? (
                      <span className="text-sm font-display text-text-primary">{Math.round(pointsEarned * 10) / 10}</span>
                    ) : (
                      <span className="text-sm font-bold text-correct">${(player.salary || 0).toLocaleString()}</span>
                    )}
                    {!isLocked && isEditing && (
                      <button
                        onClick={() => removeSlot(slot.key)}
                        className="text-text-muted hover:text-incorrect transition-colors text-lg leading-none"
                      >
                        &times;
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex-1 text-xs text-text-muted italic">Empty</div>
                )}
              </div>
            )
          })}
        </div>
        {/* Action button — matches NBA DFS pattern: subtle Edit Roster
            when the roster is submitted, accent Submit Roster when
            building / changing picks. Auto-save runs on every pick so
            the explicit submit is just the "I commit" moment. */}
        {(() => {
          const isViewMode = roster?.submitted_at && !editingAfterSubmit
          if (isViewMode) {
            return (
              <button
                onClick={() => setEditingAfterSubmit(true)}
                className="w-full mt-3 py-3 rounded-xl font-display bg-bg-card text-text-primary border border-text-primary/20 hover:bg-text-primary/10 transition-colors"
              >
                Edit Roster
              </button>
            )
          }
          if (filledCount === SLOTS.length && remaining >= 0) {
            return (
              <button
                onClick={handleSubmit}
                disabled={submitRoster.isPending}
                className="w-full mt-3 py-3 rounded-xl font-display bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {submitRoster.isPending ? 'Submitting...' : roster?.submitted_at ? 'Resubmit Roster' : 'Submit Roster'}
              </button>
            )
          }
          return null
        })()}
      </div>

      {/* Right column: player pool */}
      <div className="rounded-xl border border-text-primary/20 overflow-hidden lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:sticky lg:top-4">
        <div className="px-4 py-3 border-b border-text-primary/10">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Available Players</h3>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search players..."
            className="w-full bg-bg-primary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent mb-3"
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1.5 flex-wrap">
              {POS_FILTERS.map((pos) => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    pos === 'OUT'
                      ? posFilter === pos
                        ? 'bg-incorrect/20 text-incorrect border border-incorrect/40'
                        : 'border border-incorrect/30 text-incorrect/70 hover:bg-incorrect/10'
                      : posFilter === pos
                        ? 'bg-accent text-white'
                        : 'border border-text-primary/20 text-text-primary hover:bg-text-primary/10'
                  }`}
                >
                  {pos === 'OUT' ? 'O' : pos}
                </button>
              ))}
            </div>
            {(SLOTS.length - filledCount) > 0 && (
              <span
                key={`${remaining}-${filledCount}`}
                className="text-xs text-text-primary shrink-0"
              >
                ${Math.round(remaining / (SLOTS.length - filledCount)).toLocaleString()} avg/player
              </span>
            )}
          </div>
        </div>

        {!available.length ? (
          <div className="px-4 py-6 text-center text-xs text-text-muted">
            {!players?.length ? `Player salaries for Week ${currentWeek} haven't been generated yet. They'll be available closer to game time.` : 'No players match your filters.'}
          </div>
        ) : (
          <div className="max-h-[50vh] lg:max-h-none overflow-y-auto">
            {available.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-text-primary/10 last:border-b-0 bg-bg-primary"
              >
                <button
                  type="button"
                  onClick={() => setDetailPlayerId(player.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-text-primary/5 -mx-1 px-1 py-1 rounded-lg transition-colors"
                >
                  <PlayerHeadshot name={player.full_name} url={player.headshot_url} size="md" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-text-primary truncate block">{player.full_name}</span>
                    <div className="text-xs text-text-muted">
                      {player.position} · {player.team || 'FA'}
                      {(() => {
                        const opp = oppLabel(player.team)
                        if (!opp) return null
                        return <span className={`ml-2 ${opp.isBye ? 'text-yellow-400 font-semibold' : ''}`}>{opp.text}</span>
                      })()}
                    </div>
                  </div>
                  <span className="text-base font-semibold text-accent tabular-nums shrink-0">${(player.salary || 0).toLocaleString()}</span>
                </button>
                {isEditing && (
                  <button
                    onClick={() => addPlayer(player)}
                    className="w-8 h-8 rounded-full border border-accent/40 text-accent hover:bg-accent hover:text-white transition-colors flex items-center justify-center shrink-0 text-lg font-bold leading-none"
                  >
                    +
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {detailPlayerId && (
        <PlayerDetailModal leagueId={league.id} playerId={detailPlayerId} onClose={() => setDetailPlayerId(null)} />
      )}
    </div>
  )
}
