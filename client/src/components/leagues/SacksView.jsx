import { useState, useMemo } from 'react'
import { useSacksPlayers, useSacksPicks, useSacksUsed, useSubmitSacksPicks, useSacksStandings } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'
import Avatar from '../ui/Avatar'
import UserProfileModal from '../profile/UserProfileModal'

const INJURY_COLORS = {
  Out: 'bg-incorrect/20 text-incorrect',
  Questionable: 'bg-yellow-500/20 text-yellow-500',
  Doubtful: 'bg-yellow-500/20 text-yellow-500',
  Probable: 'bg-correct/20 text-correct',
  'Day-To-Day': 'bg-yellow-500/20 text-yellow-500',
}

function InjuryBadge({ status }) {
  if (!status) return null
  const label = status === 'Day-To-Day' ? 'DTD' : status.charAt(0)
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${INJURY_COLORS[status] || 'bg-text-primary/10 text-text-muted'}`} title={status}>
      {label}
    </span>
  )
}

// Singular only when exactly 1 — "1 sack", but "0 sacks", "1.5 sacks", "2 sacks".
function sackLabel(n) {
  return Number(n) === 1 ? 'sack' : 'sacks'
}

function GameStatusBadge({ gameStartsAt, locked }) {
  if (locked) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-text-primary/10 text-text-muted border border-text-primary/15 shrink-0">
        Locked
      </span>
    )
  }
  if (gameStartsAt) {
    const t = new Date(gameStartsAt)
    const day = t.toLocaleDateString('en-US', { weekday: 'short' })
    const time = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider text-accent shrink-0">
        {day} {time}
      </span>
    )
  }
  return null
}

export default function SacksView({ league, tab = 'picks' }) {
  const { profile } = useAuth()

  const { data: poolData, isLoading: playersLoading } = useSacksPlayers()
  const { data: myPicks, isLoading: picksLoading } = useSacksPicks(league.id)
  const { data: usedPlayers } = useSacksUsed(league.id)
  const submitPicks = useSubmitSacksPicks()
  const { data: standingsData } = useSacksStandings(league.id)

  const players = poolData?.players || []
  const week = poolData?.week
  const season = poolData?.season

  const [selected, setSelected] = useState([])
  const [search, setSearch] = useState('')
  const [standingsUserId, setStandingsUserId] = useState(null)
  const [profileUserId, setProfileUserId] = useState(null)
  const [initialized, setInitialized] = useState(false)
  const [editing, setEditing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  if (!initialized && myPicks?.length && players?.length && !selected.length) {
    const loaded = myPicks.map((pick) =>
      players.find((p) => p.sleeper_player_id === pick.sleeper_player_id) || {
        sleeper_player_id: pick.sleeper_player_id,
        player_name: pick.player_name,
        position: pick.position,
        team: pick.team,
        headshot_url: pick.headshot_url,
      }
    ).filter(Boolean)
    if (loaded.length) {
      setSelected(loaded)
      setInitialized(true)
    }
  }

  const hasSavedPicks = myPicks?.length > 0
  const nowMs = Date.now()
  const isPickLocked = (p) => p?.game_starts_at && new Date(p.game_starts_at).getTime() <= nowMs
  const allPicksLocked = hasSavedPicks && (myPicks || []).every(isPickLocked)
  // Defenders fully exhausted given the league's pick_reuse setting
  // (server returns only exhausted; partial usage doesn't appear).
  const usedPlayerIds = new Set((usedPlayers || []).map((u) => u.sleeper_player_id))
  const thisWeekPickIds = new Set((myPicks || []).map((p) => p.sleeper_player_id))
  const selectedIds = new Set(selected.map((p) => p.sleeper_player_id))

  const myHistory = useMemo(() => {
    if (!standingsData?.standings || !profile?.id) return []
    const me = standingsData.standings.find((s) => s.user?.id === profile.id)
    if (!me?.picks?.length) return []
    const byWeek = {}
    for (const p of me.picks) {
      if (!byWeek[p.week]) byWeek[p.week] = []
      byWeek[p.week].push(p)
    }
    return Object.entries(byWeek)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([w, picks]) => ({ week: Number(w), picks }))
  }, [standingsData, profile?.id])

  const filteredPlayers = useMemo(() => {
    if (!players) return []
    return players.filter((p) => {
      if (selectedIds.has(p.sleeper_player_id)) return false
      if (p.injury_status === 'Out') return false
      if (search) {
        const q = search.toLowerCase()
        if (!p.player_name.toLowerCase().includes(q) && !(p.team || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [players, search, selectedIds])

  function addPlayer(player) {
    if (selected.length >= 3) {
      toast('Maximum 3 picks per week', 'error')
      return
    }
    setSelected((prev) => [...prev, player])
  }

  function removePlayer(playerId) {
    setSelected((prev) => prev.filter((p) => p.sleeper_player_id !== playerId))
  }

  async function handleSubmit() {
    if (selected.length === 0) return
    try {
      await submitPicks.mutateAsync({
        league_id: league.id,
        players: selected.map((p) => ({
          sleeper_player_id: p.sleeper_player_id,
          player_name: p.player_name,
          position: p.position,
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

  if (tab === 'standings') {
    const standings = standingsData?.standings || []
    return (
      <div>
        {!standings.length ? (
          <div className="text-center py-8 text-sm text-text-secondary">No results yet.</div>
        ) : (
          <div className="rounded-2xl border border-text-primary/15 bg-bg-primary/15 backdrop-blur-md overflow-hidden">
            <div className="grid grid-cols-[1.5rem_1fr_3rem] lg:grid-cols-[2rem_1fr_3.5rem] gap-1.5 lg:gap-3 px-3 lg:px-5 py-3 border-b border-text-primary/10 text-xs text-text-muted uppercase tracking-wider">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Sacks</span>
            </div>
            {standings.map((s) => {
              const isMe = s.user?.id === profile?.id
              const isExpanded = standingsUserId === s.user?.id
              return (
                <div key={s.user?.id} className="border-b border-text-primary/10 last:border-b-0">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setStandingsUserId(isExpanded ? null : s.user?.id)}
                    className={`w-full grid grid-cols-[1.5rem_1fr_3rem] lg:grid-cols-[2rem_1fr_3.5rem] gap-1.5 lg:gap-3 px-3 lg:px-5 py-3.5 lg:py-4 items-center text-left hover:bg-text-primary/5 transition-colors cursor-pointer ${isMe ? 'bg-accent/5' : ''}`}
                  >
                    <span className={`font-display text-lg lg:text-xl ${s.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>{s.rank}</span>
                    <div className="flex items-center gap-2 lg:gap-3 min-w-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setProfileUserId(s.user?.id) }}
                        className="shrink-0"
                      >
                        <Avatar user={s.user} size="md" className="lg:!w-10 lg:!h-10" />
                      </button>
                      <span className={`font-bold truncate text-sm lg:text-base ${isMe ? 'text-accent' : 'text-text-primary'}`}>
                        {s.user?.display_name || s.user?.username}
                      </span>
                      <svg className={`w-4 h-4 text-accent shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                    <span className="font-display text-lg lg:text-xl text-white text-right">{s.totalSacks}</span>
                  </div>
                  {isExpanded && (() => {
                    const thisWeekPicks = (s.picks || []).filter((p) => p.week === week)
                    const lastWeekPicks = week ? (s.picks || []).filter((p) => p.week === week - 1) : []
                    return (
                      <div className="px-3 lg:px-5 pb-3 space-y-3">
                        <div>
                          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Week {week}</div>
                          {!thisWeekPicks.length ? (
                            <p className="text-xs text-text-muted text-center py-2">No picks for week {week}</p>
                          ) : (
                            <div className="space-y-1.5">
                              {thisWeekPicks.map((pick, i) => (
                                <div key={i} className="flex items-center gap-2 lg:gap-3 bg-bg-primary/10 border border-text-primary/10 rounded-lg px-2.5 lg:px-4 py-2 lg:py-3">
                                  {pick.headshot_url && (
                                    <img src={pick.headshot_url} alt="" className="w-8 h-8 lg:w-10 lg:h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                                      onError={(e) => { e.target.style.display = 'none' }} />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs lg:text-sm font-bold text-text-primary truncate">{pick.player_name}</div>
                                    <div className="text-[10px] lg:text-xs text-text-muted truncate">{pick.position} · {pick.team}</div>
                                  </div>
                                  <span className={`font-display text-sm lg:text-base shrink-0 ${pick.sacks > 0 ? 'text-correct' : 'text-text-muted'}`}>{pick.sacks} {sackLabel(pick.sacks)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {lastWeekPicks.length > 0 && (
                          <div>
                            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Week {week - 1}</div>
                            <div className="space-y-1.5">
                              {lastWeekPicks.map((pick, i) => (
                                <div key={i} className="flex items-center gap-2 lg:gap-3 bg-bg-primary/10 border border-text-primary/10 rounded-lg px-2.5 lg:px-4 py-2 lg:py-3">
                                  {pick.headshot_url && (
                                    <img src={pick.headshot_url} alt="" className="w-8 h-8 lg:w-10 lg:h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                                      onError={(e) => { e.target.style.display = 'none' }} />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs lg:text-sm font-bold text-text-primary truncate">{pick.player_name}</div>
                                    <div className="text-[10px] lg:text-xs text-text-muted truncate">{pick.position} · {pick.team}</div>
                                  </div>
                                  <span className={`font-display text-sm lg:text-base shrink-0 ${pick.sacks > 0 ? 'text-correct' : 'text-text-muted'}`}>{pick.sacks} {sackLabel(pick.sacks)}</span>
                                </div>
                              ))}
                            </div>
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
        {profileUserId && <UserProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />}
      </div>
    )
  }

  if (playersLoading || picksLoading) return <LoadingSpinner />

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-6 pb-24 lg:pb-0">
      <div className="order-1 lg:col-start-1 lg:row-start-1">
        {week && (
          <div className="mb-3 text-xs uppercase tracking-wider text-text-muted">
            Week {week}{season ? ` · ${season}` : ''}
          </div>
        )}

        <div className="rounded-xl border border-text-primary/15 bg-bg-primary/10 backdrop-blur-sm p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">This Week's Picks</h3>
            {!allPicksLocked && (
              <span className="text-xs text-text-muted">{selected.length}/3 picks</span>
            )}
          </div>

          {selected.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">Pick up to 3 defenders who you think will get sacks this week</p>
          ) : (
            <div className="space-y-2">
              {selected.map((player) => {
                const savedPick = (myPicks || []).find((p) => p.sleeper_player_id === player.sleeper_player_id)
                const sacks = Number(savedPick?.sacks) || 0
                return (
                  <div key={player.sleeper_player_id} className="flex items-center gap-2 bg-bg-primary/10 border border-text-primary/15 rounded-lg px-3 py-2.5">
                    {player.headshot_url && (
                      <img src={player.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                        onError={(e) => { e.target.style.display = 'none' }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-bold text-text-primary truncate">{player.player_name}</span>
                        <InjuryBadge status={player.injury_status} />
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-text-muted truncate">{player.position} · {player.team}{player.opponent ? ` ${player.home_away === 'home' ? 'vs' : '@'} ${player.opponent}` : ''}</span>
                        <GameStatusBadge gameStartsAt={player.game_starts_at} />
                      </div>
                    </div>
                    {hasSavedPicks && !editing && (
                      <span className={`font-display text-lg shrink-0 ${sacks > 0 ? 'text-correct' : 'text-text-muted'}`}>{sacks}</span>
                    )}
                    {(!hasSavedPicks || editing) && (
                      <button
                        onClick={() => removePlayer(player.sleeper_player_id)}
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
          const weekSacks = (myPicks || []).reduce((sum, p) => sum + (Number(p.sacks) || 0), 0)
          return (
            <div className="flex items-center justify-end gap-4 pr-7 mb-2 -mt-1">
              <span className="text-sm text-text-muted uppercase tracking-wider font-semibold">This Week</span>
              <span className="font-display flex items-baseline gap-1">
                <span className={`text-lg ${weekSacks > 0 ? 'text-correct' : 'text-text-muted'}`}>{weekSacks}</span>
                <span className="text-sm text-white">{sackLabel(weekSacks)}</span>
              </span>
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

        {usedPlayers?.filter((u) => u.week !== week).length > 0 && (
          <div className="mb-4">
            <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Used This Season</div>
            <div className="flex flex-wrap gap-1.5">
              {usedPlayers.filter((u) => u.week !== week).map((u) => (
                <span key={u.sleeper_player_id} className="text-[10px] bg-bg-primary/30 border border-text-primary/10 text-text-muted px-2 py-1 rounded-full">
                  {u.player_name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="order-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 rounded-xl border border-text-primary/15 bg-bg-primary/15 backdrop-blur-md overflow-hidden lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:sticky lg:top-4">
        <div className="px-4 py-3 border-b border-text-primary/10">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Available Defenders</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players..."
            className="w-full bg-bg-primary/15 border border-text-primary/15 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {filteredPlayers.length > 0 && (
          <div className="flex items-center justify-end px-4 py-2 border-b border-text-primary/10">
            <span className="text-xs font-semibold text-text-primary">Total Sacks</span>
          </div>
        )}

        {!filteredPlayers.length ? (
          <div className="px-4 py-6 text-center text-xs text-text-muted">
            {!players?.length ? 'No defenders available yet — defensive player data syncs after games are played.' : 'No players match your search.'}
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto">
            {filteredPlayers.map((player) => {
              const isExhausted = usedPlayerIds.has(player.sleeper_player_id) && !thisWeekPickIds.has(player.sleeper_player_id)
              return (
              <div
                key={player.sleeper_player_id}
                className={`flex items-center gap-3 px-4 py-2.5 border-b border-text-primary/10 last:border-b-0 transition-colors ${
                  isExhausted ? 'opacity-40' : 'hover:bg-text-primary/5'
                }`}
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
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-bold text-text-primary truncate">{player.player_name}</span>
                      <InjuryBadge status={player.injury_status} />
                    </div>
                    <div className="text-xs text-text-muted">
                      {player.position} · {player.team}{player.opponent ? ` ${player.home_away === 'home' ? 'vs' : '@'} ${player.opponent}` : ''}
                      {isExhausted && <span className="ml-1">· Used up this season</span>}
                    </div>
                  </div>
                  <span className="font-display text-base text-white whitespace-nowrap shrink-0">{player.season_sacks || 0}</span>
                </div>
                {(!hasSavedPicks || editing) && (
                  <button
                    onClick={() => addPlayer(player)}
                    disabled={selected.length >= 3 || isExhausted}
                    className="w-8 h-8 rounded-full border border-accent/40 text-accent hover:bg-accent hover:text-white transition-colors flex items-center justify-center shrink-0 text-lg font-bold leading-none disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                )}
              </div>
              )
            })}
          </div>
        )}
      </div>

      {myHistory.length > 0 && (
        <div className="order-3 lg:col-start-1 lg:row-start-2 rounded-xl border border-text-primary/15 bg-bg-primary/15 backdrop-blur-md overflow-hidden mt-4 lg:mt-0">
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
              {myHistory.map(({ week: w, picks }) => (
                <div key={w} className="px-4 py-3">
                  <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Week {w}</div>
                  <div className="space-y-1.5">
                    {picks.map((pick, i) => (
                      <div key={i} className="flex items-center gap-2 bg-bg-primary/10 border border-text-primary/10 rounded-lg px-2.5 py-2">
                        {pick.headshot_url && (
                          <img src={pick.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0"
                            onError={(e) => { e.target.style.display = 'none' }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-text-primary truncate">{pick.player_name}</div>
                          <div className="text-[10px] text-text-muted">{pick.position} · {pick.team}</div>
                        </div>
                        <span className={`font-display text-sm shrink-0 ${pick.sacks > 0 ? 'text-correct' : 'text-text-muted'}`}>{pick.sacks}</span>
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
