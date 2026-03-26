import { useState, useMemo } from 'react'
import { useNbaDfsPlayers, useNbaDfsRoster, useSaveNbaDfsRoster, useNbaDfsStandings, useNbaDfsLive, useFantasySettings } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'
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

const POSITION_FILTERS = ['All', 'PG', 'SG', 'SF', 'PF', 'C', 'OUT']

function matchesPositionFilter(playerPos, filter) {
  if (filter === 'All') return true
  const parts = playerPos.split('/')
  return parts.includes(filter)
}

const INJURY_COLORS = {
  Out: 'bg-incorrect/20 text-incorrect',
  Questionable: 'bg-yellow-500/20 text-yellow-500',
  Probable: 'bg-correct/20 text-correct',
  'Day-To-Day': 'bg-yellow-500/20 text-yellow-500',
}

function InjuryBadge({ status }) {
  if (!status) return null
  const label = status === 'Day-To-Day' ? 'DTD' : status.charAt(0)
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${INJURY_COLORS[status] || 'bg-text-primary/10 text-text-muted'}`} title={status}>
      {label}
    </span>
  )
}

// Get game state for a player: 'upcoming', 'live', or 'final'
function getPlayerGameState(player) {
  if (!player?.game_starts_at) return 'upcoming'
  const now = new Date()
  const start = new Date(player.game_starts_at)
  if (start > now) return 'upcoming'
  // Approximate: NBA games last ~2.5 hours
  const approxEnd = new Date(start.getTime() + 3 * 60 * 60 * 1000)
  if (now < approxEnd) return 'live'
  return 'final'
}

// Border class for roster slot based on game state
function slotBorderClass(gameState) {
  if (gameState === 'live') return 'border-l-2 border-l-accent'
  if (gameState === 'final') return 'border-l-2 border-l-correct'
  return 'border-l-2 border-l-text-primary/30'
}

function todayLocal() {
  return new Date().toLocaleDateString('en-CA')
}

// ============================================
// Live Tab
// ============================================

function LiveView({ league, date }) {
  const { profile } = useAuth()
  const { data: liveData, isLoading } = useNbaDfsLive(league.id, date)
  const [expandedUserId, setExpandedUserId] = useState(null)

  if (isLoading) return <LoadingSpinner />
  if (!liveData?.members?.length) return <div className="text-center py-8 text-sm text-text-secondary">No rosters submitted yet.</div>

  const { members, all_final } = liveData
  const winner = all_final ? members[0] : null

  return (
    <div className="space-y-3">
      {members.map((m, idx) => {
        const isMe = m.user_id === profile?.id
        const isWinner = all_final && idx === 0
        const isExpanded = expandedUserId === m.user_id
        const borderColor = m.status === 'final' ? 'border-correct/50' : m.status === 'live' ? 'border-accent/50' : 'border-text-primary/20'

        return (
          <div key={m.user_id} className={isWinner ? 'mb-4' : ''}>
            <button
              onClick={() => setExpandedUserId(isExpanded ? null : m.user_id)}
              className={`w-full rounded-xl border ${borderColor} bg-bg-primary transition-all text-left ${
                isWinner ? 'p-5 scale-[1.02]' : 'p-4'
              }`}
            >
              <div className="flex items-center gap-3">
                <Avatar user={m.user} size={isWinner ? 'lg' : 'md'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold truncate ${isWinner ? 'text-lg text-accent' : isMe ? 'text-accent text-sm' : 'text-text-primary text-sm'}`}>
                      {m.user?.display_name || m.user?.username}
                    </span>
                    {isWinner && <span className="text-lg">{'\uD83C\uDFC6'}</span>}
                  </div>
                  {!m.has_roster && <div className="text-xs text-text-muted">No roster submitted</div>}
                </div>
                <span className={`font-display ${isWinner ? 'text-2xl' : 'text-lg'} ${m.status === 'live' ? 'text-accent' : 'text-text-primary'}`}>
                  {Math.round(m.total_points * 10) / 10}
                </span>
                <svg
                  className={`w-4 h-4 text-text-muted transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {isExpanded && m.slots?.length > 0 && (
              <div className="mt-1 rounded-xl border border-text-primary/10 overflow-hidden">
                {m.slots.map((slot) => {
                  const hidden = slot.player_name === '????'
                  const slotBorder = slot.game_status === 'live' ? 'border-l-accent' : slot.game_status === 'final' ? 'border-l-correct' : 'border-l-text-primary/20'
                  return (
                    <div key={slot.roster_slot} className={`flex items-center gap-3 px-4 py-2 border-b border-text-primary/10 last:border-b-0 border-l-2 ${slotBorder} bg-bg-primary`}>
                      <span className="text-xs font-bold text-text-muted w-7 shrink-0">{slot.roster_slot.replace(/[12]$/, '')}</span>
                      {hidden ? (
                        <span className="flex-1 text-sm text-text-muted font-mono">????</span>
                      ) : (
                        <>
                          <span className="flex-1 text-sm font-semibold text-text-primary truncate">{slot.player_name}</span>
                          {(slot.game_status === 'live' || slot.game_status === 'final') && (
                            <span className={`text-sm font-display ${slot.game_status === 'live' ? 'text-accent' : 'text-text-primary'}`}>
                              {Math.round((slot.points_earned || 0) * 10) / 10}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================
// Main Component
// ============================================

function tomorrowLocal() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-CA')
}

function formatDateLabel(dateStr) {
  const today = todayLocal()
  const tomorrow = tomorrowLocal()
  if (dateStr === today) return 'Today'
  if (dateStr === tomorrow) return 'Tomorrow'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function NbaDfsView({ league, tab = 'roster' }) {
  const { profile } = useAuth()

  const leagueStart = league.starts_at
    ? new Date(league.starts_at).toISOString().split('T')[0]
    : todayLocal()
  const today = todayLocal()
  const tomorrow = tomorrowLocal()

  // Determine available dates: today and/or tomorrow, but not before league start
  const availableDates = []
  if (today >= leagueStart) availableDates.push(today)
  if (tomorrow >= leagueStart) availableDates.push(tomorrow)
  if (!availableDates.length) availableDates.push(leagueStart)

  const [selectedDate, setSelectedDate] = useState(availableDates[0])
  const date = selectedDate

  const { data: fantasySettings } = useFantasySettings(league.id)
  const salaryCap = fantasySettings?.salary_cap || 60000
  const { data: players, isLoading: playersLoading } = useNbaDfsPlayers(date)
  const { data: existingRoster, isLoading: rosterLoading } = useNbaDfsRoster(league.id, date)
  const saveRoster = useSaveNbaDfsRoster()
  const { data: standingsData } = useNbaDfsStandings(league.id)

  const [roster, setRoster] = useState({})
  const [posFilter, setPosFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [initDate, setInitDate] = useState(null)

  // Reset roster state when date changes
  if (initDate !== date) {
    setInitDate(date)
    setRoster({})
    setInitialized(false)
  }

  // Initialize roster from existing data
  if (!initialized && existingRoster?.nba_dfs_roster_slots?.length && !Object.keys(roster).length) {
    const loaded = {}
    for (const slot of existingRoster.nba_dfs_roster_slots) {
      const player = players?.find((p) => p.espn_player_id === slot.espn_player_id)
      if (player) loaded[slot.roster_slot] = player
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
    const now = new Date()
    return players.filter((p) => {
      if (usedPlayerIds.has(p.espn_player_id)) return false
      if (posFilter === 'OUT') return p.injury_status === 'Out'
      if (p.injury_status === 'Out') return false
      // Hide players whose games have started
      const gameStarted = p.game_starts_at && new Date(p.game_starts_at) <= now
      if (gameStarted && posFilter !== 'OUT') return false
      if (p.salary > remainingSalary) return false
      if (!matchesPositionFilter(p.position, posFilter)) return false
      if (search) {
        const q = search.toLowerCase()
        if (!p.player_name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [players, posFilter, search, usedPlayerIds, remainingSalary])

  function addPlayer(player) {
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
    const player = roster[slotKey]
    if (player) {
      const gs = getPlayerGameState(player)
      if (gs !== 'upcoming') {
        toast(`${player.player_name}'s game has started — locked`, 'error')
        return
      }
    }
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
      await saveRoster.mutateAsync({ league_id: league.id, date, season: 2026, slots })
      toast('Roster saved!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to save roster', 'error')
    }
  }

  // ============================================
  // Live Tab
  // ============================================
  if (tab === 'live') {
    return <LiveView league={league} date={date} />
  }

  // ============================================
  // Standings Tab
  // ============================================
  if (tab === 'standings') {
    const standings = standingsData?.standings || []
    return (
      <div>
        {!standings.length ? (
          <div className="text-center py-8 text-sm text-text-secondary">No results yet.</div>
        ) : (
          <div className="rounded-2xl border border-text-primary/20 overflow-hidden">
            <div className="grid grid-cols-[2.5rem_1fr_auto_auto] gap-2 px-4 py-3 border-b border-text-primary/10 text-xs text-text-muted uppercase tracking-wider">
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
                  className={`grid grid-cols-[2.5rem_1fr_auto_auto] gap-2 px-4 py-3 items-center border-b border-text-primary/10 last:border-b-0 ${isMe ? 'bg-accent/5' : ''}`}
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

  // ============================================
  // Roster Tab
  // ============================================
  if (playersLoading || rosterLoading) return <LoadingSpinner />

  return (
    <div>
      {/* Date sub-tabs */}
      <div className="flex gap-2 mb-4">
        {availableDates.map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDate(d)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              d === date ? 'bg-accent text-white' : 'border border-text-primary/20 text-text-primary hover:bg-text-primary/10'
            }`}
          >
            {formatDateLabel(d)}
          </button>
        ))}
      </div>
      {/* Salary Bar */}
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Salary Cap</span>
          <span className="text-xs text-text-primary font-semibold">{filledSlots}/9 slots</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className={`font-display text-2xl ${remainingSalary < 0 ? 'text-incorrect' : 'text-correct'}`}>
            ${remainingSalary.toLocaleString()}
          </span>
          <span className="text-xs text-text-primary">of ${salaryCap.toLocaleString()}</span>
        </div>
        <div className="mt-2 h-1.5 bg-text-primary/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${remainingSalary < 0 ? 'bg-incorrect' : 'bg-accent'}`}
            style={{ width: `${Math.min((usedSalary / salaryCap) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* My Roster */}
      <div className="rounded-xl border border-text-primary/20 overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-text-primary/10">
          <h3 className="text-sm font-semibold text-text-primary">My Roster</h3>
        </div>
        {SLOTS.map((slot) => {
          const player = roster[slot.key]
          const gameState = player ? getPlayerGameState(player) : null
          const isLocked = gameState === 'live' || gameState === 'final'
          return (
            <div
              key={slot.key}
              className={`flex items-center gap-3 px-4 py-2.5 border-b border-text-primary/10 last:border-b-0 bg-bg-primary ${player ? slotBorderClass(gameState) : ''}`}
            >
              <span className="text-xs font-bold text-accent w-7 shrink-0">{slot.label}</span>
              {player ? (
                <>
                  {player.headshot_url && (
                    <img
                      src={player.headshot_url}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0"
                      onError={(e) => { e.target.style.display = 'none' }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-text-primary truncate">{player.player_name}</span>
                      <InjuryBadge status={player.injury_status} />
                      {isLocked && (
                        <svg className="w-3 h-3 text-text-muted shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div className="text-xs text-text-muted">{player.team} · {player.opponent}</div>
                  </div>
                  <span className="text-xs font-bold text-correct">${player.salary.toLocaleString()}</span>
                  {!isLocked && (
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

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={filledSlots < 9 || remainingSalary < 0 || saveRoster.isPending}
        className="w-full py-3 rounded-xl font-display bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-6"
      >
        {saveRoster.isPending ? 'Saving...' : existingRoster ? 'Update Roster' : 'Submit Roster'}
      </button>

      {/* Player Pool */}
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-text-primary/10">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Available Players</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players..."
            className="w-full bg-bg-primary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent mb-3"
          />
          <div className="flex gap-1.5 flex-wrap">
            {POSITION_FILTERS.map((pos) => (
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
                {pos === 'OUT' ? (
                  <span className="flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    OUT
                  </span>
                ) : pos}
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
                className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-text-primary/10 last:border-b-0 hover:bg-text-primary/5 transition-colors text-left bg-bg-primary"
              >
                {player.headshot_url ? (
                  <img
                    src={player.headshot_url}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                    onError={(e) => { e.target.src = ''; e.target.style.display = 'none' }}
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-bg-secondary shrink-0 flex items-center justify-center text-xs text-text-muted font-bold">
                    {player.position.split('/')[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-text-primary truncate">{player.player_name}</span>
                    <InjuryBadge status={player.injury_status} />
                  </div>
                  <div className="text-xs text-text-muted">{player.position} · {player.team} · {player.opponent}</div>
                </div>
                <span className="text-sm font-semibold text-accent tabular-nums shrink-0">${player.salary.toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
