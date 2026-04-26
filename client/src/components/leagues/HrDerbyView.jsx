import { useState, useMemo } from 'react'
import { useHrDerbyPlayers, useHrDerbyPicks, useHrDerbyUsed, useSubmitHrDerbyPicks, useHrDerbyStandings } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'
import Avatar from '../ui/Avatar'

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

export default function HrDerbyView({ league, tab = 'picks' }) {
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

  const { data: players, isLoading: playersLoading } = useHrDerbyPlayers(date)
  const { data: myPicks, isLoading: picksLoading } = useHrDerbyPicks(league.id, date)
  const { data: usedPlayers } = useHrDerbyUsed(league.id, date)
  const submitPicks = useSubmitHrDerbyPicks()
  const { data: standingsData } = useHrDerbyStandings(league.id)

  const [selected, setSelected] = useState([])
  const [search, setSearch] = useState('')
  const [standingsUserId, setStandingsUserId] = useState(null)
  const [initialized, setInitialized] = useState(false)
  const [initDate, setInitDate] = useState(null)
  const [editing, setEditing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  if (initDate !== date) {
    setInitDate(date)
    setSelected([])
    setInitialized(false)
    setEditing(false)
  }

  // Initialize from existing picks
  if (!initialized && myPicks?.length && players?.length && !selected.length) {
    const loaded = myPicks.map((pick) =>
      players.find((p) => p.espn_player_id === pick.espn_player_id) || pick
    ).filter(Boolean)
    if (loaded.length) {
      setSelected(loaded)
      setInitialized(true)
    }
  }

  const hasSavedPicks = myPicks?.length > 0
  const usedPlayerIds = new Set((usedPlayers || []).map((u) => u.espn_player_id))
  // Don't exclude today's picks from the "used" set
  const todayPickIds = new Set((myPicks || []).map((p) => p.espn_player_id))
  const selectedIds = new Set(selected.map((p) => p.espn_player_id))

  // My pick history from standings data
  const myHistory = useMemo(() => {
    if (!standingsData?.standings || !profile?.id) return []
    const me = standingsData.standings.find((s) => s.user?.id === profile.id)
    if (!me?.picks?.length) return []
    // Group by date, most recent first
    const byDate = {}
    for (const p of me.picks) {
      if (!byDate[p.game_date]) byDate[p.game_date] = []
      byDate[p.game_date].push(p)
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([d, picks]) => ({ date: d, picks }))
  }, [standingsData, profile?.id])

  const filteredPlayers = useMemo(() => {
    if (!players) return []
    const now = new Date()
    return players.filter((p) => {
      if (selectedIds.has(p.espn_player_id)) return false
      // Used this week (but not if it's today's saved pick — allow re-picking)
      if (usedPlayerIds.has(p.espn_player_id) && !todayPickIds.has(p.espn_player_id)) return false
      if (p.injury_status === 'Out') return false
      const gameStarted = p.game_starts_at && new Date(p.game_starts_at) <= now
      if (gameStarted) return false
      if (search) {
        const q = search.toLowerCase()
        if (!p.player_name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [players, search, selectedIds, usedPlayerIds, todayPickIds])

  function addPlayer(player) {
    if (selected.length >= 3) {
      toast('Maximum 3 picks per day', 'error')
      return
    }
    setSelected((prev) => [...prev, player])
  }

  function removePlayer(espnId) {
    setSelected((prev) => prev.filter((p) => p.espn_player_id !== espnId))
  }

  async function handleSubmit() {
    if (selected.length === 0) return
    try {
      await submitPicks.mutateAsync({
        league_id: league.id,
        date,
        players: selected.map((p) => ({
          player_name: p.player_name,
          espn_player_id: p.espn_player_id,
          team: p.team,
          headshot_url: p.headshot_url,
        })),
      })
      toast('Picks submitted!', 'success')
      setEditing(false)
    } catch (err) {
      toast(err.message || 'Failed to submit picks', 'error')
    }
  }

  // Standings Tab
  if (tab === 'standings') {
    const standings = standingsData?.standings || []
    return (
      <div>
        {!standings.length ? (
          <div className="text-center py-8 text-sm text-text-secondary">No results yet.</div>
        ) : (
          <div className="rounded-2xl border border-text-primary/15 bg-bg-primary/30 backdrop-blur-md overflow-hidden">
            <div className="grid grid-cols-[1.5rem_1fr_3rem] lg:grid-cols-[2rem_1fr_3.5rem] gap-1.5 lg:gap-3 px-3 lg:px-5 py-3 border-b border-text-primary/10 text-xs text-text-muted uppercase tracking-wider">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">HRs</span>
            </div>
            {standings.map((s) => {
              const isMe = s.user?.id === profile?.id
              const isExpanded = standingsUserId === s.user?.id
              return (
                <div key={s.user?.id} className="border-b border-text-primary/10 last:border-b-0">
                  <button
                    onClick={() => setStandingsUserId(isExpanded ? null : s.user?.id)}
                    className={`w-full grid grid-cols-[1.5rem_1fr_3rem] lg:grid-cols-[2rem_1fr_3.5rem] gap-1.5 lg:gap-3 px-3 lg:px-5 py-3.5 lg:py-4 items-center text-left hover:bg-text-primary/5 transition-colors cursor-pointer ${isMe ? 'bg-accent/5' : ''}`}
                  >
                    <span className={`font-display text-lg lg:text-xl ${s.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>{s.rank}</span>
                    <div className="flex items-center gap-2 lg:gap-3 min-w-0">
                      <Avatar user={s.user} size="md" className="lg:!w-10 lg:!h-10" />
                      <span className={`font-bold truncate text-sm lg:text-base ${isMe ? 'text-accent' : 'text-text-primary'}`}>
                        {s.user?.display_name || s.user?.username}
                      </span>
                      <svg className={`w-4 h-4 text-accent shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                    <span className="font-display text-lg lg:text-xl text-white text-right">{s.totalHRs}</span>
                  </button>
                  {isExpanded && (() => {
                    const todayPicks = (s.picks || []).filter((p) => p.game_date === today)
                    return (
                    <div className="px-3 lg:px-5 pb-3">
                      {!todayPicks.length ? (
                        <p className="text-xs text-text-muted text-center py-2">No picks today</p>
                      ) : (
                        <div className="space-y-1.5">
                          {todayPicks.map((pick, i) => (
                            <div key={i} className="flex items-center gap-2 lg:gap-3 bg-bg-primary/20 border border-text-primary/10 rounded-lg px-2.5 lg:px-4 py-2 lg:py-3">
                              {pick.headshot_url && (
                                <img src={pick.headshot_url} alt="" className="w-8 h-8 lg:w-10 lg:h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                                  onError={(e) => { e.target.style.display = 'none' }} />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-xs lg:text-sm font-bold text-text-primary truncate">{pick.player_name}</div>
                                <div className="text-[10px] lg:text-xs text-text-muted">{pick.team}</div>
                              </div>
                              <span className={`font-display text-sm lg:text-base shrink-0 ${pick.home_runs > 0 ? 'text-correct' : 'text-text-muted'}`}>{pick.home_runs} HR</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Picks Tab
  if (playersLoading || picksLoading) return <LoadingSpinner />

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-6 pb-24 lg:pb-0">
      {/* Left: My picks */}
      <div className="order-1 lg:col-start-1 lg:row-start-1">
        {/* Date tabs */}
        <div className="flex gap-2 mb-4">
          {availableDates.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                d === date ? 'border-2 border-accent text-accent bg-accent/10' : 'border border-text-primary/20 bg-bg-primary/30 text-text-primary hover:bg-text-primary/10'
              }`}
            >
              {formatDateLabel(d)}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-text-primary/15 bg-bg-primary/10 backdrop-blur-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Today's HR Picks</h3>
            <span className="text-xs text-text-muted">{selected.length}/3 picks</span>
          </div>

          {selected.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">Pick up to 3 hitters you think will hit a home run today</p>
          ) : (
            <div className="space-y-2">
              {selected.map((player) => {
                // Merge scored data from saved picks (game state lives on saved pick)
                const savedPick = (myPicks || []).find((p) => p.espn_player_id === player.espn_player_id)
                const hrs = savedPick?.home_runs || 0
                const gameState = savedPick?.game_state
                const gamePeriod = savedPick?.game_period
                const gameStartsAt = savedPick?.game_starts_at || player.game_starts_at
                let statusBadge = null
                if (gameState === 'in') {
                  statusBadge = (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-correct/15 text-correct border border-correct/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-correct animate-pulse" />
                      Live{gamePeriod ? ` · ${gamePeriod}` : ''}
                    </span>
                  )
                } else if (gameState === 'post') {
                  statusBadge = (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-text-primary/10 text-text-muted border border-text-primary/15">
                      Final
                    </span>
                  )
                } else if (gameState === 'postponed') {
                  statusBadge = (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-incorrect/10 text-incorrect border border-incorrect/30">
                      Postponed
                    </span>
                  )
                } else if (gameStartsAt) {
                  const t = new Date(gameStartsAt)
                  const label = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                  statusBadge = (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-accent/10 text-accent border border-accent/30">
                      {label}
                    </span>
                  )
                }
                return (
                  <div key={player.espn_player_id} className="flex items-center gap-2 bg-bg-primary/10 border border-text-primary/15 rounded-lg px-3 py-2.5">
                    {player.headshot_url && (
                      <img src={player.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                        onError={(e) => { e.target.style.display = 'none' }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-text-primary truncate">{player.player_name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-text-muted truncate">{player.team} · {player.opponent || ''}</span>
                        {statusBadge}
                      </div>
                    </div>
                    {hasSavedPicks && !editing && (
                      <span className={`font-display text-lg shrink-0 ${hrs > 0 ? 'text-correct' : 'text-text-muted'}`}>{hrs} HR</span>
                    )}
                    {(!hasSavedPicks || editing) && (
                      <button
                        onClick={() => removePlayer(player.espn_player_id)}
                        className="p-2 text-text-muted hover:text-incorrect transition-colors text-lg leading-none"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {hasSavedPicks && !editing && (() => {
          const dayHRs = (myPicks || []).reduce((sum, p) => sum + (p.home_runs || 0), 0)
          return (
            <div className="flex items-center justify-end gap-4 px-1 mb-2 -mt-1">
              <span className="text-xs text-text-muted uppercase tracking-wider">Today</span>
              <span className={`font-display text-sm ${dayHRs > 0 ? 'text-correct' : 'text-text-muted'}`}>{dayHRs} HR</span>
            </div>
          )
        })()}

        {hasSavedPicks && !editing ? (
          <button
            onClick={() => setEditing(true)}
            className="w-full py-3 rounded-xl font-display border-2 border-accent text-accent bg-accent/5 hover:bg-accent/10 transition-colors mb-6"
          >
            Edit Picks
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={selected.length === 0 || submitPicks.isPending}
            className="w-full py-3 rounded-xl font-display bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-6"
          >
            {submitPicks.isPending ? 'Saving...' : hasSavedPicks ? 'Save Picks' : 'Submit Picks'}
          </button>
        )}

        {/* Used this week */}
        {usedPlayers?.length > 0 && (
          <div className="mb-4">
            <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Used This Week</div>
            <div className="flex flex-wrap gap-1.5">
              {usedPlayers.filter((u) => !todayPickIds.has(u.espn_player_id)).map((u) => (
                <span key={u.espn_player_id} className="text-[10px] bg-bg-primary/30 border border-text-primary/10 text-text-muted px-2 py-1 rounded-full">
                  {u.player_name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: Player pool */}
      <div className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 rounded-xl border border-text-primary/15 bg-bg-primary/30 backdrop-blur-md overflow-hidden lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:sticky lg:top-4">
        <div className="px-4 py-3 border-b border-text-primary/10">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Available Hitters</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players..."
            className="w-full bg-bg-primary/30 border border-text-primary/15 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {filteredPlayers.length > 0 && (
          <div className="flex items-center px-4 py-1.5 border-b border-text-primary/10">
            <div className="flex-1" />
            <span className="text-[10px] text-text-muted uppercase tracking-wider mr-10">Season</span>
          </div>
        )}

        {!filteredPlayers.length ? (
          <div className="px-4 py-6 text-center text-xs text-text-muted">
            {!players?.length ? 'No players available for this date yet.' : 'No players match your search.'}
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto">
            {filteredPlayers.map((player) => (
              <div
                key={player.espn_player_id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-text-primary/10 last:border-b-0 hover:bg-text-primary/5 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {player.headshot_url ? (
                    <img src={player.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                      onError={(e) => { e.target.style.display = 'none' }} />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-bg-secondary shrink-0 flex items-center justify-center text-xs text-text-muted font-bold">
                      {player.position}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-text-primary truncate block">{player.player_name}</span>
                    <div className="text-xs text-text-muted">{player.position} · {player.team} · {player.opponent}</div>
                  </div>
                  <span className="font-display text-base text-white whitespace-nowrap shrink-0">{player.season_hrs || 0} HR</span>
                </div>
                {(!hasSavedPicks || editing) && (
                  <button
                    onClick={() => addPlayer(player)}
                    disabled={selected.length >= 3}
                    className="w-8 h-8 rounded-full border border-accent/40 text-accent hover:bg-accent hover:text-white transition-colors flex items-center justify-center shrink-0 text-lg font-bold leading-none disabled:opacity-30"
                  >
                    +
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pick History (collapsible) */}
      {myHistory.length > 0 && (
        <div className="order-3 lg:col-start-1 lg:row-start-2 rounded-xl border border-text-primary/15 bg-bg-primary/30 backdrop-blur-md overflow-hidden mt-4 lg:mt-0">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 border-b border-text-primary/10 hover:bg-text-primary/5 transition-colors"
          >
            <h3 className="text-sm font-semibold text-text-primary">Pick History</h3>
            <svg className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${historyOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {historyOpen && (
            <div className="divide-y divide-text-primary/10">
              {myHistory.map(({ date: d, picks }) => (
                <div key={d} className="px-4 py-3">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{formatDateLabel(d)}</div>
                  <div className="space-y-1.5">
                    {picks.map((pick, i) => (
                      <div key={i} className="flex items-center gap-2 bg-bg-primary/20 border border-text-primary/10 rounded-lg px-2.5 py-2">
                        {pick.headshot_url && (
                          <img src={pick.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0"
                            onError={(e) => { e.target.style.display = 'none' }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-text-primary truncate">{pick.player_name}</div>
                          <div className="text-[10px] text-text-muted">{pick.team}</div>
                        </div>
                        <span className={`font-display text-sm shrink-0 ${pick.home_runs > 0 ? 'text-correct' : 'text-text-muted'}`}>{pick.home_runs} HR</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
