import { useState, useMemo } from 'react'
import {
  useTdPassQbs,
  useTdPassMyPicks,
  useTdPassStandings,
  useTdPassCurrentWeek,
  useSubmitTdPassPick,
} from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import LoadingSpinner from '../ui/LoadingSpinner'
import Avatar from '../ui/Avatar'
import { toast } from '../ui/Toast'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'

export default function TdPassView({ league, tab = 'picks' }) {
  const { profile } = useAuth()
  const { data: weekData } = useTdPassCurrentWeek()
  const currentWeek = weekData?.week
  const currentSeason = weekData?.season

  const { data: qbs, isLoading: qbsLoading } = useTdPassQbs(league.id)
  const { data: myPicks } = useTdPassMyPicks(league.id)
  const { data: standingsData } = useTdPassStandings(league.id)
  const submit = useSubmitTdPassPick()

  const [search, setSearch] = useState('')
  const [profileUserId, setProfileUserId] = useState(null)

  const myCurrentPick = useMemo(() => {
    if (!currentWeek) return null
    return (myPicks || []).find((p) => p.week === currentWeek) || null
  }, [myPicks, currentWeek])

  const filteredQbs = useMemo(() => {
    if (!qbs) return []
    let list = qbs
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((p) => p.full_name?.toLowerCase().includes(q) || p.team?.toLowerCase().includes(q))
    }
    // Server sorts by season TDs desc; just sink "Out" injuries to bottom
    return [...list].sort((a, b) => {
      const aOut = a.injury_status === 'Out' ? 1 : 0
      const bOut = b.injury_status === 'Out' ? 1 : 0
      if (aOut !== bOut) return aOut - bOut
      return 0 // preserve server order (most TDs first)
    })
  }, [qbs, search])

  async function handlePick(qb) {
    try {
      await submit.mutateAsync({ leagueId: league.id, qbPlayerId: qb.id })
      toast(`Picked ${qb.full_name} for week ${currentWeek}`, 'success')
    } catch (err) {
      toast(err.message || 'Failed to submit pick', 'error')
    }
  }

  // ── Standings tab ───────────────────────────────────────────────
  if (tab === 'standings') {
    const standings = standingsData?.standings || []
    return (
      <div>
        {!standings.length ? (
          <div className="text-center py-8 text-sm text-text-secondary">No picks yet.</div>
        ) : (
          <div className="rounded-2xl border border-text-primary/15 bg-bg-primary/40 backdrop-blur-md overflow-hidden">
            <div className="grid grid-cols-[2rem_1fr_4rem] lg:grid-cols-[2.5rem_1fr_4.5rem] gap-2 px-4 lg:px-5 py-3 border-b border-text-primary/10 text-xs text-text-muted uppercase tracking-wider">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Pass TD</span>
            </div>
            {standings.map((s) => {
              const isMe = s.user?.id === profile?.id
              const isExpanded = profileUserId === s.user?.id
              return (
                <div key={s.user?.id} className="border-b border-text-primary/10 last:border-b-0">
                  <button
                    onClick={() => setProfileUserId(isExpanded ? null : s.user?.id)}
                    className={`w-full grid grid-cols-[2rem_1fr_4rem] lg:grid-cols-[2.5rem_1fr_4.5rem] gap-2 px-4 lg:px-5 py-3.5 lg:py-4 items-center text-left hover:bg-text-primary/5 transition-colors cursor-pointer ${isMe ? 'bg-accent/5' : ''}`}
                  >
                    <span className={`font-display text-lg lg:text-xl ${s.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>{s.rank}</span>
                    <div className="flex items-center gap-2 lg:gap-3 min-w-0">
                      <Avatar user={s.user} size="md" />
                      <span className={`font-bold truncate text-sm lg:text-base ${isMe ? 'text-accent' : 'text-text-primary'}`}>
                        {s.user?.display_name || s.user?.username}
                      </span>
                      <svg className={`w-4 h-4 text-accent shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                    <span className="font-display text-lg lg:text-xl text-white text-right">{s.totalTds}</span>
                  </button>
                  {isExpanded && (
                    <div className="px-4 lg:px-5 pb-3">
                      {!s.history?.length ? (
                        <p className="text-xs text-text-muted text-center py-2">No picks yet</p>
                      ) : (
                        <div className="space-y-1.5">
                          {s.history.map((pick, i) => (
                            <div key={i} className="flex items-center gap-2 lg:gap-3 bg-bg-primary/30 border border-text-primary/10 rounded-lg px-2.5 lg:px-4 py-2 lg:py-2.5">
                              {pick.headshot_url && (
                                <img src={pick.headshot_url} alt="" className="w-8 h-8 lg:w-9 lg:h-9 rounded-full object-cover bg-bg-secondary shrink-0"
                                  onError={(e) => { e.target.style.display = 'none' }} />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-xs lg:text-sm font-bold text-text-primary truncate">{pick.qb_name}</div>
                                <div className="text-[10px] lg:text-xs text-text-muted">{pick.team} · Week {pick.week}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className={`font-display text-sm lg:text-base ${pick.td_count > 0 ? 'text-correct' : 'text-text-muted'}`}>{pick.td_count} TD</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
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

  // ── Picks tab (default) ─────────────────────────────────────────
  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 pb-24 lg:pb-0">
      {/* Left: current pick + my history summary */}
      <div>
        <div className="rounded-xl border border-text-primary/20 bg-bg-primary/40 backdrop-blur-md p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Week {currentWeek || '—'} Pick</h3>
            <span className="text-[10px] text-text-muted">Season {currentSeason || ''}</span>
          </div>
          {myCurrentPick ? (() => {
            const pickedQbData = (qbs || []).find((q) => q.id === myCurrentPick.qb_player_id)
            const matchup = pickedQbData?.matchup
            const seasonTds = pickedQbData?.season_pass_tds || 0
            const weekTds = myCurrentPick.td_count || 0
            // Show week TDs prominently if QB has scored this week (game started or finished)
            const gameStarted = matchup?.starts_at && new Date(matchup.starts_at) <= new Date()
            const showWeekTds = weekTds > 0 || gameStarted
            return (
              <div className="flex flex-col items-center text-center gap-2 py-4">
                {myCurrentPick.headshot_url && (
                  <img src={myCurrentPick.headshot_url} alt="" className="w-28 h-28 rounded-full object-cover bg-bg-secondary border-2 border-accent/30" onError={(e) => { e.target.style.display = 'none' }} />
                )}
                <div className="font-display text-xl text-text-primary">{myCurrentPick.qb_name}</div>
                <div className="text-sm text-text-muted">
                  {myCurrentPick.team}
                  {matchup ? ` ${matchup.home_away === 'home' ? 'vs' : '@'} ${matchup.opponent}` : ''}
                </div>
                {matchup?.starts_at && (
                  <div className="text-xs text-text-muted">
                    {new Date(matchup.starts_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET
                  </div>
                )}
                {matchup?.starts_at && !gameStarted && (
                  <div className="text-[10px] text-accent uppercase tracking-wider font-semibold">
                    Locks at {new Date(matchup.starts_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET
                  </div>
                )}
                {showWeekTds && (
                  <div className="mt-2">
                    <span className="font-display text-4xl text-correct">{weekTds}</span>
                    <span className="text-xs text-correct uppercase ml-1.5">This Week</span>
                  </div>
                )}
                <div className={showWeekTds ? 'mt-0' : 'mt-2'}>
                  <span className={`font-display ${showWeekTds ? 'text-xl text-text-muted' : 'text-3xl text-accent'}`}>{seasonTds}</span>
                  <span className="text-[10px] text-text-muted uppercase ml-1.5">Season Total</span>
                </div>
                {!gameStarted && (
                  <p className="text-xs text-text-muted mt-3">Tap any QB below to swap your pick — locks at kickoff.</p>
                )}
              </div>
            )
          })() : (
            <p className="text-sm text-text-muted text-center py-4">Pick a QB from the pool — you can swap until their game starts.</p>
          )}
        </div>

        {/* My used QBs (so user can see who they've already burned) */}
        {(myPicks?.length || 0) > 0 && (
          <div className="mb-4">
            <div className="text-xs text-text-muted uppercase tracking-wider mb-2">QBs You've Used</div>
            <div className="flex flex-wrap gap-1.5">
              {(myPicks || []).map((p) => (
                <span key={p.id} className="text-[10px] bg-bg-primary/40 border border-text-primary/10 text-text-muted px-2 py-1 rounded-full">
                  W{p.week} · {p.qb_name} · {p.td_count} TD
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: QB pool */}
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary/40 backdrop-blur-md overflow-hidden lg:max-h-[calc(100vh-200px)] lg:overflow-y-auto lg:sticky lg:top-4">
        <div className="px-4 py-3 border-b border-text-primary/10">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Available QBs</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search QBs..."
            className="w-full bg-bg-primary/40 border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {qbsLoading ? (
          <div className="py-8"><LoadingSpinner /></div>
        ) : !filteredQbs.length ? (
          <div className="px-4 py-6 text-center text-xs text-text-muted">
            {!qbs?.length ? 'No QBs available — you may have used them all.' : 'No QBs match your search.'}
          </div>
        ) : (
          <>
          <div className="flex items-center px-4 py-1.5 border-b border-text-primary/10">
            <div className="flex-1" />
            <span className="text-[10px] text-text-muted uppercase tracking-wider mr-2">Season TD</span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {filteredQbs.map((qb) => (
              <button
                key={qb.id}
                type="button"
                onClick={() => !qb.used && handlePick(qb)}
                disabled={submit.isPending || qb.used}
                className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-text-primary/10 last:border-b-0 transition-colors ${qb.used ? 'opacity-40 cursor-not-allowed' : 'hover:bg-text-primary/5 cursor-pointer'} ${!qb.used && (qb.injury_status === 'Out' || !qb.matchup) ? 'opacity-40' : ''}`}
              >
                {qb.headshot_url ? (
                  <img src={qb.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                    onError={(e) => { e.target.style.display = 'none' }} />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-bg-secondary shrink-0 flex items-center justify-center text-xs text-text-muted font-bold">QB</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-text-primary truncate">{qb.full_name}</span>
                    {qb.used && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-text-muted/20 text-text-muted">Used</span>
                    )}
                    {!qb.matchup && !qb.used && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-text-primary/10 text-text-muted">BYE</span>
                    )}
                    {qb.injury_status && !qb.used && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        qb.injury_status === 'Out' ? 'bg-incorrect/20 text-incorrect'
                        : qb.injury_status === 'Questionable' ? 'bg-yellow-500/20 text-yellow-500'
                        : 'bg-text-primary/10 text-text-muted'
                      }`}>
                        {qb.injury_status === 'Questionable' ? 'Q' : qb.injury_status === 'Doubtful' ? 'D' : qb.injury_status}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-muted">
                    {qb.team}
                    {qb.matchup ? ` ${qb.matchup.home_away === 'home' ? 'vs' : '@'} ${qb.matchup.opponent}` : ' · Bye week'}
                    {qb.matchup?.starts_at ? ` · ${new Date(qb.matchup.starts_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET` : ''}
                  </div>
                </div>
                <span className="font-display text-base text-white whitespace-nowrap shrink-0">{qb.season_pass_tds || 0}</span>
              </button>
            ))}
          </div>
          </>
        )}
      </div>

    </div>
  )
}
