import { useState, useMemo } from 'react'
import { useMlbDfsPlayers, useMlbDfsRoster, useSaveMlbDfsRoster, useMlbDfsStandings, useMlbDfsLive, useFantasySettings } from '../../hooks/useLeagues'
import PlayerDetailModal from '../ui/PlayerDetailModal'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'
import Avatar from '../ui/Avatar'
import UserProfileModal from '../profile/UserProfileModal'
import LeagueReport from './LeagueReport'

const SLOTS = [
  { key: 'SP', label: 'SP', positions: ['SP'] },
  { key: 'C', label: 'C', positions: ['C'] },
  { key: '1B', label: '1B', positions: ['1B'] },
  { key: '2B', label: '2B', positions: ['2B'] },
  { key: 'SS', label: 'SS', positions: ['SS'] },
  { key: '3B', label: '3B', positions: ['3B'] },
  { key: 'OF1', label: 'OF', positions: ['OF'] },
  { key: 'OF2', label: 'OF', positions: ['OF'] },
  { key: 'OF3', label: 'OF', positions: ['OF'] },
  { key: 'UTIL', label: 'UTIL', positions: ['C', '1B', '2B', 'SS', '3B', 'OF', 'UTIL'] },
]

const POSITION_FILTERS = ['All', 'SP', 'C', '1B', '2B', 'SS', '3B', 'OF']

function matchesPositionFilter(playerPos, filter) {
  if (filter === 'All') return true
  return playerPos === filter
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

function LineupBadge({ status }) {
  if (!status) return null
  if (status === 'confirmed') {
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-correct/20 text-correct" title="Confirmed starter">
        ✓
      </span>
    )
  }
  if (status === 'not_starting') {
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-incorrect/20 text-incorrect" title="Not starting">
        NS
      </span>
    )
  }
  return null
}

function getPlayerGameState(player) {
  if (!player?.game_starts_at) return 'upcoming'
  const now = new Date()
  const start = new Date(player.game_starts_at)
  if (start > now) return 'upcoming'
  const approxEnd = new Date(start.getTime() + 4 * 60 * 60 * 1000) // MLB games ~3-4 hours
  if (now < approxEnd) return 'live'
  return 'final'
}

function slotBorderClass(gameState) {
  if (gameState === 'live') return 'border-l-2 border-l-accent'
  if (gameState === 'final') return 'border-l-2 border-l-correct'
  return 'border-l-2 border-l-text-primary/30'
}

function todayLocal() {
  return new Date().toLocaleDateString('en-CA')
}

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

function MlbLiveView({ league, date: leagueDate }) {
  const { profile } = useAuth()
  const [viewDate, setViewDate] = useState(leagueDate)
  const { data: liveData, isLoading } = useMlbDfsLive(league.id, viewDate)
  const [expandedUserId, setExpandedUserId] = useState(null)

  const today = todayLocal()
  const leagueStart = league.starts_at ? new Date(league.starts_at).toISOString().split('T')[0] : today
  const canGoBack = viewDate > leagueStart
  const canGoForward = viewDate < today

  function shiftDate(d, days) {
    const dt = new Date(d + 'T12:00:00')
    dt.setDate(dt.getDate() + days)
    return dt.toLocaleDateString('en-CA')
  }

  if (isLoading) return <LoadingSpinner />

  const { members, all_final, any_live, first_tipoff } = liveData || {}

  return (
    <div>
      {/* Date navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => { if (canGoBack) setViewDate(shiftDate(viewDate, -1)) }} disabled={!canGoBack}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary transition-colors disabled:opacity-20">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-sm font-semibold text-text-primary">{formatDateLabel(viewDate)}</span>
        <button onClick={() => { if (canGoForward) setViewDate(shiftDate(viewDate, 1)) }} disabled={!canGoForward}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary transition-colors disabled:opacity-20">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {!members?.length ? (
        <div className="text-center py-8 text-sm text-text-secondary">No rosters for this date.</div>
      ) : (
        <div className="space-y-3">
          {members.map((m, idx) => {
            const isMe = m.user_id === profile?.id
            const isWinner = all_final && idx === 0
            const isExpanded = expandedUserId === m.user_id
            const borderColor = m.status === 'final' ? 'border-correct/50' : m.status === 'live' ? 'border-accent/50' : 'border-text-primary/20'

            return (
              <div key={m.user_id}>
                <button
                  onClick={() => setExpandedUserId(isExpanded ? null : m.user_id)}
                  className={`w-full rounded-xl border ${borderColor} bg-bg-primary transition-all text-left ${isWinner ? 'p-5' : 'p-4'}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar user={m.user} size={isWinner ? 'xl' : 'lg'} />
                    <div className="flex-1 min-w-0">
                      <span className={`font-bold truncate ${isWinner ? 'text-lg text-accent' : isMe ? 'text-accent text-base' : 'text-text-primary text-base'}`}>
                        {m.user?.display_name || m.user?.username}
                      </span>
                      {!m.has_roster && <div className="text-xs text-text-muted">No roster submitted</div>}
                    </div>
                    <span className={`font-display ${all_final && idx === 0 ? 'text-2xl' : 'text-xl'} text-white`}>
                      {Math.round(m.total_points * 10) / 10}
                    </span>
                    <svg className={`w-4 h-4 text-text-muted transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isExpanded && m.slots?.length > 0 && (
                  <div className="mt-1 rounded-xl border border-text-primary/10 overflow-hidden">
                    {m.slots.map((slot) => {
                      const hidden = slot.player_name === '????'
                      const slotBorder = slot.game_status === 'live' ? 'border-l-accent' : slot.game_status === 'final' ? 'border-l-correct' : 'border-l-text-primary/20'
                      const hasStats = slot.stats && (slot.game_status === 'live' || slot.game_status === 'final')
                      const statLine = hasStats && slot.stats ? [
                        { label: 'H', value: slot.stats.h },
                        { label: 'R', value: slot.stats.r },
                        { label: 'HR', value: slot.stats.hr },
                        { label: 'RBI', value: slot.stats.rbi },
                        { label: 'SB', value: slot.stats.sb },
                        { label: 'BB', value: slot.stats.bb },
                        { label: 'K', value: slot.stats.k },
                      ].filter((s) => s.value > 0).map((s) => `${s.value} ${s.label}`).join(' \u00b7 ') : null

                      return (
                        <div key={slot.roster_slot} className={`flex items-center gap-3 px-4 py-3.5 border-b border-text-primary/10 border-l-2 ${slotBorder} bg-bg-primary`}>
                          <span className="text-sm font-bold text-text-muted w-8 shrink-0">{slot.roster_slot.replace(/[123]$/, '')}</span>
                          {hidden ? (
                            <span className="flex-1 text-base text-text-muted font-mono">????</span>
                          ) : (
                            <>
                              {slot.headshot_url && (
                                <img src={slot.headshot_url} alt="" className="w-11 h-11 rounded-full object-cover bg-bg-secondary shrink-0" loading="eager" decoding="async"
                                  onError={(e) => { e.target.style.display = 'none' }} />
                              )}
                              <div className="flex-1 min-w-0 lg:flex lg:items-center lg:gap-6">
                                <div className="lg:w-44 lg:shrink-0 flex items-center gap-1.5">
                                  <span className="text-base font-bold text-text-primary truncate">{slot.player_name}</span>
                                  {slot.injury_status && <InjuryBadge status={slot.injury_status} />}
                                </div>
                                {statLine && (
                                  <span className="text-xs text-text-muted block lg:hidden">{statLine}</span>
                                )}
                                <span className="text-sm text-text-secondary hidden lg:block lg:flex-1">{statLine || ''}</span>
                                {(slot.game_status === 'live' || slot.game_status === 'final') && slot.away_team && (
                                  <span className="text-[11px] text-text-muted block mt-0.5 lg:mt-0 lg:text-xs lg:w-44 lg:shrink-0 lg:text-right">
                                    {slot.away_team} {slot.away_score ?? ''} @ {slot.home_team} {slot.home_score ?? ''}
                                    {slot.game_status === 'live' && slot.inning && (
                                      <span className="text-text-primary ml-1.5">{slot.inning}</span>
                                    )}
                                    {slot.game_status === 'final' && (
                                      <span className="text-text-primary ml-1.5">Final</span>
                                    )}
                                  </span>
                                )}
                              </div>
                              {(slot.game_status === 'live' || slot.game_status === 'final') && (
                                <span className="text-base lg:text-lg font-display shrink-0 lg:ml-6 lg:w-12 lg:text-right text-white">
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
      )}
    </div>
  )
}

export default function MlbDfsView({ league, tab = 'roster' }) {
  const { profile } = useAuth()

  const leagueStart = league.starts_at
    ? new Date(league.starts_at).toISOString().split('T')[0]
    : todayLocal()
  const today = todayLocal()
  const tomorrow = tomorrowLocal()

  const availableDates = []
  if (today >= leagueStart) availableDates.push(today)
  if (tomorrow >= leagueStart) availableDates.push(tomorrow)
  if (!availableDates.length) availableDates.push(leagueStart)

  const [selectedDate, setSelectedDate] = useState(availableDates[0])
  const date = selectedDate

  const { data: fantasySettings } = useFantasySettings(league.id)
  const salaryCap = fantasySettings?.salary_cap || 50000
  const { data: players, isLoading: playersLoading } = useMlbDfsPlayers(date)
  const { data: existingRoster, isLoading: rosterLoading } = useMlbDfsRoster(league.id, date)
  const saveRoster = useSaveMlbDfsRoster()
  const { data: standingsData } = useMlbDfsStandings(league.id)

  const [roster, setRoster] = useState({})
  const [posFilter, setPosFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [initDate, setInitDate] = useState(null)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [standingsUserId, setStandingsUserId] = useState(null)
  const [showReport, setShowReport] = useState(false)
  const [editing, setEditing] = useState(false)

  if (initDate !== date) {
    setInitDate(date)
    setRoster({})
    setInitialized(false)
  }

  if (!initialized && existingRoster?.mlb_dfs_roster_slots?.length && !Object.keys(roster).length) {
    const loaded = {}
    for (const slot of existingRoster.mlb_dfs_roster_slots) {
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
  const hasSavedRoster = !!existingRoster?.mlb_dfs_roster_slots?.length
  const allLocked = hasSavedRoster && Object.values(roster).length > 0 &&
    Object.values(roster).every((p) => p && getPlayerGameState(p) !== 'upcoming')
  const isViewMode = hasSavedRoster && !editing

  const filteredPlayers = useMemo(() => {
    if (!players) return []
    const now = new Date()
    const filtered = players.filter((p) => {
      if (usedPlayerIds.has(p.espn_player_id)) return false
      if (p.injury_status === 'Out') return false
      const gameStarted = p.game_starts_at && new Date(p.game_starts_at) <= now
      if (gameStarted) return false
      if (!isViewMode && p.salary > remainingSalary) return false
      if (!matchesPositionFilter(p.position, posFilter)) return false
      if (search) {
        const q = search.toLowerCase()
        if (!p.player_name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false
      }
      return true
    })
    // Sort: confirmed starters first, then unconfirmed, then not_starting (NS)
    const statusOrder = { confirmed: 0, not_starting: 2 }
    filtered.sort((a, b) => {
      const aOrder = statusOrder[a.lineup_status] ?? 1
      const bOrder = statusOrder[b.lineup_status] ?? 1
      if (aOrder !== bOrder) return aOrder - bOrder
      return b.salary - a.salary // within same status, sort by salary desc
    })
    return filtered
  }, [players, posFilter, search, usedPlayerIds, remainingSalary, isViewMode])

  function addPlayer(player) {
    for (const slot of SLOTS) {
      if (roster[slot.key]) continue
      if (slot.positions.includes(player.position)) {
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
      setEditing(false)
    } catch (err) {
      toast(err.message || 'Failed to save roster', 'error')
    }
  }

  // Live Tab
  if (tab === 'live') {
    return <MlbLiveView league={league} date={date} />
  }

  // Standings Tab
  if (tab === 'standings') {
    const standings = standingsData?.standings || []
    const gridCols = 'grid-cols-[2.5rem_1fr_3rem_5rem]'
    return (
      <div>
        {league.status === 'completed' && (
          <button
            onClick={() => setShowReport(true)}
            className="w-full mb-4 py-3 rounded-xl bg-accent/10 border border-accent/30 text-accent font-display text-sm flex items-center justify-center gap-2 hover:bg-accent/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View League Report
          </button>
        )}
        {showReport && <LeagueReport leagueId={league.id} onClose={() => setShowReport(false)} />}
        {!standings.length ? (
          <div className="text-center py-8 text-sm text-text-secondary">No results yet.</div>
        ) : (
          <div className="rounded-2xl border border-text-primary/20 overflow-hidden">
            <div className={`grid ${gridCols} gap-2 px-4 py-3 border-b border-text-primary/10 text-xs text-text-muted uppercase tracking-wider`}>
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Wins</span>
              <span className="text-right">Points</span>
            </div>
            {standings.map((s) => {
              const isMe = s.user?.id === profile?.id
              return (
                <button
                  key={s.user?.id}
                  onClick={() => setStandingsUserId(s.user?.id)}
                  className={`w-full grid ${gridCols} gap-2 px-4 py-3.5 items-center border-b border-text-primary/10 last:border-b-0 text-left hover:bg-text-primary/5 transition-colors cursor-pointer ${isMe ? 'bg-accent/5' : ''}`}
                >
                  <span className={`font-display text-xl ${s.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>{s.rank}</span>
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar user={s.user} size="lg" />
                    <span className={`font-bold truncate text-base ${isMe ? 'text-accent' : 'text-text-primary'}`}>
                      {s.user?.display_name || s.user?.username}
                    </span>
                  </div>
                  <span className="font-display text-lg text-text-primary text-right">{s.nightlyWins}</span>
                  <span className="font-display text-xl text-white text-right">{Math.round(s.totalPoints * 10) / 10}</span>
                </button>
              )
            })}
          </div>
        )}
        {standingsUserId && (
          <UserProfileModal userId={standingsUserId} onClose={() => setStandingsUserId(null)} />
        )}
      </div>
    )
  }

  // Roster Tab
  if (playersLoading || rosterLoading) return <LoadingSpinner />

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 pb-24 lg:pb-0">
      {/* Left column: roster */}
      <div>
        {/* Date sub-tabs */}
        <div className="flex gap-2 mb-4">
          {availableDates.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                d === date ? 'border-2 border-accent text-accent bg-transparent' : 'border border-text-primary/20 text-text-primary hover:bg-text-primary/10'
              }`}
            >
              {formatDateLabel(d)}
            </button>
          ))}
        </div>

        {/* Salary Bar */}
        <div className="rounded-xl border border-text-primary/20 bg-bg-primary/50 backdrop-blur-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Salary Cap</span>
            <span className="text-xs text-text-primary font-semibold">{filledSlots}/${SLOTS.length} slots</span>
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
          {(SLOTS.length - filledSlots) > 0 && (
            <div className="mt-2 text-xs text-text-muted text-right">
              ${Math.round(remainingSalary / (SLOTS.length - filledSlots)).toLocaleString()} avg per player
            </div>
          )}
        </div>

        {/* My Roster */}
        <div className="rounded-xl border border-text-primary/20 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-text-primary/10">
            <h3 className="text-sm font-semibold text-text-primary">My Roster</h3>
          </div>
          {SLOTS.map((slot) => {
            const rosterPlayer = roster[slot.key]
            // Refresh injury status from latest players data
            const player = rosterPlayer ? (players?.find((p) => p.espn_player_id === rosterPlayer.espn_player_id) || rosterPlayer) : null
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
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedPlayer(player) }}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-text-primary/5 transition-colors -mx-1 px-1 rounded-lg"
                    >
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
                          <LineupBadge status={player.lineup_status} />
                          <InjuryBadge status={player.injury_status} />
                          {isLocked && (
                            <svg className="w-3 h-3 text-text-muted shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div className="text-xs text-text-muted">{player.position} · {player.team} {player.opponent}</div>
                      </div>
                    </button>
                    <span className="text-xs font-bold text-correct">${player.salary.toLocaleString()}</span>
                    {!isLocked && !isViewMode && (
                      <button
                        onClick={() => removeSlot(slot.key)}
                        className="p-2 text-text-muted hover:text-incorrect transition-colors text-lg leading-none"
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

        {/* Action Button */}
        {isViewMode ? (
          <button
            onClick={() => setEditing(true)}
            disabled={allLocked}
            className="w-full py-3 rounded-xl font-display bg-bg-card text-text-primary border border-text-primary/20 hover:bg-text-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-6"
          >
            {allLocked ? 'Roster Locked' : 'Edit Roster'}
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={filledSlots < SLOTS.length || remainingSalary < 0 || saveRoster.isPending}
            className="w-full py-3 rounded-xl font-display bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-6"
          >
            {saveRoster.isPending ? 'Saving...' : hasSavedRoster ? 'Save Roster' : 'Submit Roster'}
          </button>
        )}
      </div>

      {/* Right column: player pool */}
      <div className={`rounded-xl border border-text-primary/20 overflow-hidden lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:sticky lg:top-4 ${isViewMode ? 'hidden lg:block' : ''}`}>
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
                  posFilter === pos
                    ? 'bg-accent text-white'
                    : 'border border-text-primary/20 text-text-primary hover:bg-text-primary/10'
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
              <div
                key={player.espn_player_id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-text-primary/10 last:border-b-0 bg-bg-primary"
              >
                <button
                  onClick={() => setSelectedPlayer(player)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-text-primary/5 transition-colors -mx-1 px-1 rounded-lg"
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
                      {player.position}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-text-primary truncate">{player.player_name}</span>
                      <LineupBadge status={player.lineup_status} />
                      <InjuryBadge status={player.injury_status} />
                    </div>
                    <div className="text-xs text-text-muted">
                      {player.position} · {player.team} {player.opponent}
                      {player.lineup_status === 'confirmed' && player.batting_order ? ` · #${player.batting_order} in lineup` : ''}
                    </div>
                  </div>
                  <span className="text-base font-semibold text-accent tabular-nums shrink-0">${player.salary.toLocaleString()}</span>
                </button>
                {!isViewMode && (
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

      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
          onAdd={!isViewMode ? addPlayer : null}
          sport="baseball_mlb"
        />
      )}
    </div>
  )
}
