import { useState, useMemo } from 'react'
import {
  useTdPassQbs,
  useTdPassMyPicks,
  useTdPassStandings,
  useTdPassCurrentWeek,
  useSubmitTdPassPick,
} from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { getTeamColor } from '../../lib/teamColors'
import LoadingSpinner from '../ui/LoadingSpinner'
import Avatar from '../ui/Avatar'
import InjuryBadge from '../ui/InjuryBadge'
import UserProfileModal from '../profile/UserProfileModal'
import { toast } from '../ui/Toast'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'
import PlayerHeadshot from '../ui/PlayerHeadshot'

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
  const [expandedUserId, setExpandedUserId] = useState(null)
  const [profileUserId, setProfileUserId] = useState(null)
  // Expanded by default — the whole strategy of TD Pass is not burning a QB
  // twice, so the used list is reference material you want in front of you
  // when picking, not something to go hunting for. Still collapsible.
  const [usedOpen, setUsedOpen] = useState(true)

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
              const isExpanded = expandedUserId === s.user?.id
              return (
                <div key={s.user?.id} className="border-b border-text-primary/10 last:border-b-0">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedUserId(isExpanded ? null : s.user?.id)}
                    className={`w-full grid grid-cols-[2rem_1fr_4rem] lg:grid-cols-[2.5rem_1fr_4.5rem] gap-2 px-4 lg:px-5 py-3.5 lg:py-4 items-center text-left hover:bg-text-primary/5 transition-colors cursor-pointer ${isMe ? 'bg-accent/5' : ''}`}
                  >
                    <span className={`font-display text-lg lg:text-xl ${s.rank <= 3 ? 'text-accent' : 'text-text-muted'}`}>{s.rank}</span>
                    <div className="flex items-center gap-2 lg:gap-3 min-w-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setProfileUserId(s.user?.id) }}
                        className="shrink-0"
                      >
                        <Avatar user={s.user} size="md" />
                      </button>
                      <span className={`font-bold truncate text-sm lg:text-base ${isMe ? 'text-accent' : 'text-text-primary'}`}>
                        {s.user?.display_name || s.user?.username}
                      </span>
                      <svg className={`w-4 h-4 text-accent shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                    <span className="font-display text-lg lg:text-xl text-white text-right">{s.totalTds}</span>
                  </div>
                  {isExpanded && (
                    <div className="px-4 lg:px-5 pb-3">
                      {!s.history?.length ? (
                        <p className="text-xs text-text-muted text-center py-2">No picks yet</p>
                      ) : (
                        <div className="space-y-1.5">
                          {s.history.map((pick, i) => pick.hidden ? (
                            <div key={i} className="flex items-center gap-2 lg:gap-3 bg-bg-primary/15 border border-text-primary/10 border-dashed rounded-lg px-2.5 lg:px-4 py-2 lg:py-2.5">
                              <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-full bg-bg-secondary/40 shrink-0 flex items-center justify-center text-text-muted">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs lg:text-sm italic text-text-muted">Hidden until kickoff</div>
                                <div className="text-[10px] lg:text-xs text-text-muted">Week {pick.week}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-display text-sm lg:text-base text-text-muted">— TD</span>
                              </div>
                            </div>
                          ) : (
                            <div key={i} className="flex items-center gap-2 lg:gap-3 bg-bg-primary/30 border border-text-primary/10 rounded-lg px-2.5 lg:px-4 py-2 lg:py-2.5">
                              <PlayerHeadshot name={pick.qb_name} url={pick.headshot_url} size="sm" className="lg:w-9 lg:h-9" />
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
        {profileUserId && <UserProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />}
      </div>
    )
  }

  // ── Picks tab (default) ─────────────────────────────────────────
  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 pb-24 lg:pb-0">
      {/* Left: current pick + my history summary */}
      <div>
        <div className="rounded-xl border border-text-primary/15 bg-bg-primary/15 backdrop-blur-sm p-4 mb-4">
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
            const teamColor = getTeamColor('americanfootball_nfl', myCurrentPick.team)
            return (
              <div
                className="flex flex-col items-center text-center gap-2 py-4 -mx-4 px-4 rounded-xl"
                style={teamColor ? {
                  background: `linear-gradient(180deg, ${teamColor} 0%, ${teamColor}b3 55%, ${teamColor}00 100%)`,
                } : undefined}
              >
                {/* Hero, not a list row. Restores the w-28 the pre-
                    PlayerHeadshot markup had — the switch to the shared
                    component silently took it to w-10. bg-bg-card is opaque
                    so the team tint behind the card doesn't bleed through. */}
                <PlayerHeadshot
                  name={myCurrentPick.qb_name}
                  url={myCurrentPick.headshot_url}
                  size="xl"
                  bgClass="bg-bg-card"
                  className="border-2 border-text-primary/20"
                />
                <div className="flex items-center justify-center gap-2">
                  <div className={`font-display text-xl ${teamColor ? 'text-white' : 'text-text-primary'}`}>{myCurrentPick.qb_name}</div>
                  <InjuryBadge status={pickedQbData?.injury_status} />
                </div>
                <div className={`text-sm ${teamColor ? 'text-white/80' : 'text-text-muted'}`}>
                  <span className={teamColor ? 'text-white' : 'text-white'}>{myCurrentPick.team}</span>
                  {matchup ? ` ${matchup.home_away === 'home' ? 'vs' : '@'} ${matchup.opponent}` : ''}
                </div>
                {matchup?.starts_at && (
                  <div className={`text-xs ${teamColor ? 'text-white/80' : 'text-text-muted'}`}>
                    {new Date(matchup.starts_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET
                  </div>
                )}
                {matchup?.starts_at && !gameStarted && (
                  <div className={`text-[10px] uppercase tracking-wider font-semibold ${teamColor ? 'text-white' : 'text-accent'}`}>
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
                  <span className={`font-display ${showWeekTds ? `text-xl ${teamColor ? 'text-white/80' : 'text-text-muted'}` : `text-3xl ${teamColor ? 'text-white' : 'text-accent'}`}`}>{seasonTds}</span>
                  <span className={`text-[10px] uppercase ml-1.5 ${teamColor ? 'text-white/80' : 'text-text-muted'}`}>Season Total</span>
                </div>
                {!gameStarted && (
                  <p className={`text-xs mt-3 ${teamColor ? 'text-white/80' : 'text-text-muted'}`}>Tap any QB below to swap your pick — locks at kickoff.</p>
                )}
              </div>
            )
          })() : (
            <p className="text-sm text-text-muted text-center py-4">Pick a QB from the pool — you can swap until their game starts.</p>
          )}
        </div>

        {/* My used QBs — only shows picks whose game is final. Current
            week's active pick lives in the hero above until its game
            wraps, then it drops down here. "Final" is approximated as
            starts_at + 4h < now (NFL games are ~3-3.5h). */}
        {(() => {
          // eslint-disable-next-line react-hooks/purity
          const now = Date.now()
          const startByQb = new Map((qbs || []).map((q) => [q.id, q.matchup?.starts_at]))
          const finalPicks = (myPicks || []).filter((p) => {
            const startsAt = startByQb.get(p.qb_player_id)
            if (!startsAt) return true // past-week pick without a current matchup — treat as final
            return new Date(startsAt).getTime() + 4 * 60 * 60 * 1000 < now
          })
          if (finalPicks.length === 0) return null
          return (
          <div className="mb-4">
            <button
              onClick={() => setUsedOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 mb-2 hover:opacity-80 transition-opacity"
            >
              <span className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                QBs You've Used <span className="text-text-muted">({finalPicks.length})</span>
              </span>
              <svg className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${usedOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {usedOpen && (
              <div className="rounded-xl border border-text-primary/15 overflow-hidden">
                {[...finalPicks].sort((a, b) => (b.week || 0) - (a.week || 0)).map((p) => {
                  const usedColor = getTeamColor('americanfootball_nfl', p.team)
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2 border-b border-text-primary/10 last:border-b-0"
                      style={usedColor ? {
                        background: `linear-gradient(90deg, ${usedColor}40 0%, ${usedColor}1a 100%)`,
                      } : undefined}
                    >
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider w-6 shrink-0">W{p.week}</span>
                      <PlayerHeadshot name={p.qb_name} url={p.headshot_url} size="sm" className="w-9 h-9" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">{p.qb_name}</div>
                        <div className="text-[10px] text-text-muted">{p.team}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`font-display text-lg ${p.td_count > 0 ? 'text-correct' : 'text-text-muted'}`}>{p.td_count}</span>
                        <span className="text-[10px] text-text-muted uppercase ml-1">TD</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          )
        })()}
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
                // text-left: <button> defaults to text-align:center, so the
                // matchup line under the name rendered centred while the name
                // itself looked left-aligned only because it's a flex child.
                className={`w-full text-left flex items-center gap-3 px-4 py-2.5 border-b border-text-primary/10 last:border-b-0 transition-colors ${qb.used ? 'opacity-40 cursor-not-allowed' : 'hover:bg-text-primary/5 cursor-pointer'} ${!qb.used && (qb.injury_status === 'Out' || !qb.matchup) ? 'opacity-40' : ''}`}
              >
                {/* Shared component so a headshot that 404s falls back to initials
                      instead of vanishing — the inline version only had a
                      fallback when the URL was ABSENT, so a broken URL left
                      the row with no avatar at all. */}
                  <PlayerHeadshot name={qb.full_name} url={qb.headshot_url} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-text-primary truncate">{qb.full_name}</span>
                    {qb.used && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-text-muted/20 text-text-muted">Used</span>
                    )}
                    {!qb.matchup && !qb.used && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-text-primary/10 text-text-muted">BYE</span>
                    )}
                    {/* Shared badge — colored letter, no pill. This row had its
                        own inline version with a tinted background, which was
                        the last place an injury status still rendered as a
                        filled chip. It also only knew Out / Questionable /
                        Doubtful, so IR, PUP, DTD and suspensions printed the
                        raw status string in a gray pill. */}
                    {qb.injury_status && !qb.used && (
                      <InjuryBadge status={qb.injury_status} />
                    )}
                  </div>
                  <div className="text-xs text-text-muted">
                    <span className="text-white">{qb.team}</span>
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
