import { useState, useMemo } from 'react'
import { useNbaDfsPlayers, useNbaDfsRoster, useSaveNbaDfsRoster, useNbaDfsStandings, useFantasySettings } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'
import TierBadge from '../ui/TierBadge'
import Avatar from '../ui/Avatar'

const SLOTS = [
  { key: 'PG1', label: 'PG', positions: ['PG', 'PG/SG'] },
  { key: 'PG2', label: 'PG', positions: ['PG', 'PG/SG'] },
  { key: 'SG1', label: 'SG', positions: ['SG', 'PG/SG', 'SG/SF'] },
  { key: 'SG2', label: 'SG', positions: ['SG', 'PG/SG', 'SG/SF'] },
  { key: 'SF1', label: 'SF', positions: ['SF', 'SG/SF', 'SF/PF'] },
  { key: 'SF2', label: 'SF', positions: ['SF', 'SG/SF', 'SF/PF'] },
  { key: 'PF1', label: 'PF', positions: ['PF', 'SF/PF', 'PF/C'] },
  { key: 'PF2', label: 'PF', positions: ['PF', 'SF/PF', 'PF/C'] },
  { key: 'C', label: 'C', positions: ['C', 'PF/C'] },
]

const POSITION_FILTERS = ['All', 'PG', 'SG', 'SF', 'PF', 'C']

function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

export default function NbaDfsView({ league, tab = 'roster' }) {
  const { profile } = useAuth()
  const date = league.starts_at
    ? new Date(league.starts_at).toISOString().split('T')[0]
    : todayET()

  const { data: fantasySettings } = useFantasySettings(league.id)
  const salaryCap = fantasySettings?.salary_cap || 60000
  const { data: players, isLoading: playersLoading } = useNbaDfsPlayers(date)
  const { data: existingRoster, isLoading: rosterLoading } = useNbaDfsRoster(league.id, date)
  const saveRoster = useSaveNbaDfsRoster()
  const { data: standingsData } = useNbaDfsStandings(league.id)

  const [roster, setRoster] = useState({}) // slot key -> player
  const [posFilter, setPosFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [initialized, setInitialized] = useState(false)

  // Initialize roster from existing data
  if (!initialized && existingRoster?.nba_dfs_roster_slots?.length && !Object.keys(roster).length) {
    const loaded = {}
    for (const slot of existingRoster.nba_dfs_roster_slots) {
      const player = players?.find((p) => p.espn_player_id === slot.espn_player_id)
      if (player) {
        loaded[slot.roster_slot] = player
      }
    }
    if (Object.keys(loaded).length) {
      setRoster(loaded)
      setInitialized(true)
    }
  }

  const usedSalary = Object.values(roster).reduce((sum, p) => sum + (p?.salary || 0), 0)
  const remainingSalary = salaryCap - usedSalary
  const filledSlots = Object.keys(roster).length
  const usedPlayerIds = new Set(Object.values(roster).map((p) => p?.espn_player_id).filter(Boolean))

  const filteredPlayers = useMemo(() => {
    if (!players) return []
    return players.filter((p) => {
      if (usedPlayerIds.has(p.espn_player_id)) return false
      if (p.salary > remainingSalary) return false
      if (posFilter !== 'All') {
        const parts = p.position.split('/')
        if (!parts.includes(posFilter)) return false
      }
      if (search) {
        const q = search.toLowerCase()
        if (!p.player_name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [players, posFilter, search, usedPlayerIds, remainingSalary])

  function addPlayer(player) {
    // Find the first empty eligible slot
    for (const slot of SLOTS) {
      if (roster[slot.key]) continue
      const playerParts = player.position.split('/')
      const eligible = slot.positions.some((sp) => {
        if (sp.includes('/')) return sp === player.position
        return playerParts.includes(sp)
      })
      if (eligible) {
        setRoster((prev) => ({ ...prev, [slot.key]: player }))
        return
      }
    }
    toast('No eligible slot available for this player', 'error')
  }

  function removeSlot(slotKey) {
    setRoster((prev) => {
      const next = { ...prev }
      delete next[slotKey]
      return next
    })
  }

  async function handleSubmit() {
    const slots = Object.entries(roster).map(([slotKey, player]) => ({
      roster_slot: slotKey,
      player_name: player.player_name,
      espn_player_id: player.espn_player_id,
      position: player.position,
      salary: player.salary,
    }))

    try {
      await saveRoster.mutateAsync({
        league_id: league.id,
        date,
        season: 2026,
        slots,
      })
      toast('Roster saved!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to save roster', 'error')
    }
  }

  if (tab === 'standings') {
    const standings = standingsData?.standings || []
    return (
      <div>
        {!standings.length ? (
          <div className="text-center py-8 text-sm text-text-secondary">No results yet.</div>
        ) : (
          <div className="bg-bg-card rounded-2xl border border-border overflow-hidden">
            <div className="grid grid-cols-[2.5rem_1fr_auto_auto] gap-2 px-4 py-3 border-b border-border text-xs text-text-muted uppercase tracking-wider">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Wins</span>
              <span className="text-right">Points</span>
            </div>
            {standings.map((s) => {
              const isMe = s.user?.id === profile?.id
              return (
                <div
                  key={s.user?.id}
                  className={`grid grid-cols-[2.5rem_1fr_auto_auto] gap-2 px-4 py-3 items-center border-b border-border last:border-b-0 ${isMe ? 'bg-accent/5' : ''}`}
                >
                  <span className={`font-display text-lg ${s.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>{s.rank}</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar user={s.user} size="md" />
                    <span className={`font-semibold truncate text-sm ${isMe ? 'text-accent' : 'text-text-primary'}`}>
                      {s.user?.display_name || s.user?.username}
                    </span>
                  </div>
                  <span className="text-sm text-text-secondary text-right">{s.nightlyWins}</span>
                  <span className="font-display text-lg text-right">{Math.round(s.totalPoints * 10) / 10}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Roster tab
  if (playersLoading || rosterLoading) return <LoadingSpinner />

  return (
    <div>
      {/* Salary Bar */}
      <div className="bg-bg-card rounded-xl border border-border p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-muted uppercase tracking-wider">Salary Cap</span>
          <span className="text-xs text-text-muted">{filledSlots}/9 slots</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className={`font-display text-2xl ${remainingSalary < 0 ? 'text-incorrect' : 'text-correct'}`}>
            ${remainingSalary.toLocaleString()}
          </span>
          <span className="text-xs text-text-muted">of ${salaryCap.toLocaleString()}</span>
        </div>
        <div className="mt-2 h-1.5 bg-bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${remainingSalary < 0 ? 'bg-incorrect' : 'bg-accent'}`}
            style={{ width: `${Math.min((usedSalary / salaryCap) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* My Roster */}
      <div className="bg-bg-card rounded-xl border border-border overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">My Roster</h3>
        </div>
        {SLOTS.map((slot) => {
          const player = roster[slot.key]
          return (
            <div
              key={slot.key}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0"
            >
              <span className="text-xs font-semibold text-text-muted w-7 shrink-0">{slot.label}</span>
              {player ? (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{player.player_name}</div>
                    <div className="text-xs text-text-muted">{player.team} · {player.opponent}</div>
                  </div>
                  <span className="text-xs font-semibold text-correct">${player.salary.toLocaleString()}</span>
                  <button
                    onClick={() => removeSlot(slot.key)}
                    className="text-text-muted hover:text-incorrect transition-colors text-lg leading-none"
                  >
                    &times;
                  </button>
                </>
              ) : (
                <div className="flex-1 text-xs text-text-muted italic">Empty</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={filledSlots < 9 || remainingSalary < 0 || saveRoster.isPending}
        className="w-full py-3 rounded-xl font-display bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-6"
      >
        {saveRoster.isPending ? 'Saving...' : existingRoster ? 'Update Roster' : 'Submit Roster'}
      </button>

      {/* Player Pool */}
      <div className="bg-bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Available Players</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players..."
            className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent mb-3"
          />
          <div className="flex gap-1.5">
            {POSITION_FILTERS.map((pos) => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  posFilter === pos ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        {!filteredPlayers.length ? (
          <div className="px-4 py-6 text-center text-xs text-text-muted">
            {!players?.length ? 'No players available for this date yet.' : 'No players match your filters.'}
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto">
            {filteredPlayers.map((player) => (
              <button
                key={player.espn_player_id}
                onClick={() => addPlayer(player)}
                className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-bg-card-hover transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">{player.player_name}</div>
                  <div className="text-xs text-text-muted">{player.position} · {player.team} · {player.opponent}</div>
                </div>
                <span className="text-xs font-semibold text-accent shrink-0">${player.salary.toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
