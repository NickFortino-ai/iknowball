import { useState, useMemo } from 'react'
import { useHrDerbyPlayers, useHrDerbyPicks, useHrDerbyUsed, useSubmitHrDerbyPicks, useHrDerbyStandings } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'
import Avatar from '../ui/Avatar'
import UserProfileModal from '../profile/UserProfileModal'

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
          <div className="rounded-2xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm overflow-hidden">
            <div className="grid grid-cols-[1.5rem_1fr_2.5rem_3rem] gap-1.5 px-3 py-3 border-b border-text-primary/10 text-xs text-text-muted uppercase tracking-wider">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">HRs</span>
              <span className="text-right">Dist</span>
            </div>
            {standings.map((s) => {
              const isMe = s.user?.id === profile?.id
              return (
                <button
                  key={s.user?.id}
                  onClick={() => setStandingsUserId(s.user?.id)}
                  className={`w-full grid grid-cols-[1.5rem_1fr_2.5rem_3rem] gap-1.5 px-3 py-3.5 items-center border-b border-text-primary/10 last:border-b-0 text-left hover:bg-text-primary/5 transition-colors cursor-pointer ${isMe ? 'bg-accent/5' : ''}`}
                >
                  <span className={`font-display text-lg ${s.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>{s.rank}</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar user={s.user} size="md" />
                    <span className={`font-bold truncate text-sm ${isMe ? 'text-accent' : 'text-text-primary'}`}>
                      {s.user?.display_name || s.user?.username}
                    </span>
                  </div>
                  <span className="font-display text-lg text-white text-right">{s.totalHRs}</span>
                  <span className="text-[11px] text-text-muted text-right">{s.totalDistance ? `${s.totalDistance}ft` : '\u2014'}</span>
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

  // Picks Tab
  if (playersLoading || picksLoading) return <LoadingSpinner />

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 pb-24 lg:pb-0">
      {/* Left: My picks */}
      <div>
        {/* Date tabs */}
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

        <div className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Today's HR Picks</h3>
            <span className="text-xs text-text-muted">{selected.length}/3 picks</span>
          </div>

          {selected.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">Pick up to 3 hitters you think will hit a home run today</p>
          ) : (
            <div className="space-y-2">
              {selected.map((player) => (
                <div key={player.espn_player_id} className="flex items-center gap-3 bg-bg-primary/40 border border-text-primary/20 rounded-lg px-3 py-2.5">
                  {player.headshot_url && (
                    <img src={player.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                      onError={(e) => { e.target.style.display = 'none' }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-text-primary truncate">{player.player_name}</div>
                    <div className="text-xs text-text-muted">{player.team} · {player.opponent || ''}</div>
                  </div>
                  {(!hasSavedPicks || editing) && (
                    <button
                      onClick={() => removePlayer(player.espn_player_id)}
                      className="p-2 text-text-muted hover:text-incorrect transition-colors text-lg leading-none"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {hasSavedPicks && !editing ? (
          <button
            onClick={() => setEditing(true)}
            className="w-full py-3 rounded-xl font-display border-2 border-accent text-accent hover:bg-accent/10 transition-colors mb-6"
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
                <span key={u.espn_player_id} className="text-[10px] bg-text-primary/10 text-text-muted px-2 py-1 rounded-full">
                  {u.player_name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: Player pool */}
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm overflow-hidden lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:sticky lg:top-4">
        <div className="px-4 py-3 border-b border-text-primary/10">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Available Hitters</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players..."
            className="w-full bg-bg-primary/40 border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
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
                className="flex items-center gap-3 px-4 py-2.5 border-b border-text-primary/10 last:border-b-0"
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
    </div>
  )
}
