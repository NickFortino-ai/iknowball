import { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useFantasyMatchupLive, useFantasyMatchupWeek, useBlurbPlayerIds } from '../../hooks/useLeagues'
import Avatar from '../ui/Avatar'
import { SkeletonCard } from '../ui/Skeleton'
import PlayerDetailModal from './PlayerDetailModal'
import LeagueReport from './LeagueReport'
import BlurbDot, { markBlurbSeen } from './BlurbDot'

const SLOT_LABELS = { qb: 'QB', rb1: 'RB', rb2: 'RB', wr1: 'WR', wr2: 'WR', wr3: 'WR', te: 'TE', flex: 'FLX', k: 'K', def: 'DEF' }

function InjuryBadge({ status }) {
  if (!status || status === 'Probable') return null
  const colors = {
    Out: 'bg-incorrect/20 text-incorrect',
    IR: 'bg-incorrect/20 text-incorrect',
    Questionable: 'bg-yellow-500/20 text-yellow-500',
    Doubtful: 'bg-yellow-500/20 text-yellow-500',
    'Day-To-Day': 'bg-yellow-500/20 text-yellow-500',
  }
  return <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${colors[status] || 'bg-yellow-500/20 text-yellow-500'}`}>{status[0]}</span>
}

function MatchupCard({ matchup, myId, weekStatus, isExpanded, onToggle, onPlayerClick, blurbIds }) {
  const isMyMatchup = matchup.home_user?.id === myId || matchup.away_user?.id === myId
  const isCompleted = matchup.status === 'completed' || weekStatus === 'past'
  const homeWinning = (matchup.home_points || 0) >= (matchup.away_points || 0)
  const hasScores = (matchup.home_points || 0) > 0 || (matchup.away_points || 0) > 0

  // Win probability from projections
  const hProj = matchup.home_projected || 0
  const aProj = matchup.away_projected || 0
  const totalProj = hProj + aProj
  const homePct = totalProj > 0 ? Math.round((hProj / totalProj) * 100) : 50

  return (
    <div className={`rounded-xl border overflow-hidden ${
      isMyMatchup ? 'border-accent/40' : 'border-text-primary/20'
    }`}>
      {/* Matchup header — always visible */}
      <button onClick={onToggle} className="w-full p-3 hover:bg-text-primary/5 transition-colors">
        <div className="flex items-center gap-3">
          {/* Home user */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <Avatar user={matchup.home_user} size="sm" />
            <div className="min-w-0 text-left">
              <div className={`text-sm font-semibold truncate ${isCompleted && homeWinning ? 'text-correct' : 'text-text-primary'}`}>
                {matchup.home_user?.display_name || matchup.home_user?.username}
              </div>
              {matchup.home_user?.fantasy_team_name && (
                <div className="text-[10px] text-text-muted italic uppercase tracking-wide truncate">{matchup.home_user.fantasy_team_name}</div>
              )}
              {matchup.home_user?.id === myId && !matchup.home_user?.fantasy_team_name && <div className="text-[9px] text-accent font-bold">YOU</div>}
            </div>
          </div>

          {/* Scores */}
          <div className="text-center shrink-0 px-2">
            {hasScores || isCompleted ? (
              <div className="flex items-center gap-2">
                <span className={`font-display text-xl ${isCompleted && homeWinning ? 'text-correct' : 'text-text-primary'}`}>
                  {(matchup.home_points || 0).toFixed(1)}
                </span>
                <span className="text-text-muted text-xs">-</span>
                <span className={`font-display text-xl ${isCompleted && !homeWinning ? 'text-correct' : 'text-text-primary'}`}>
                  {(matchup.away_points || 0).toFixed(1)}
                </span>
              </div>
            ) : weekStatus === 'future' && totalProj > 0 ? (
              <div className="flex items-center gap-2">
                <span className="font-display text-lg text-text-muted">{hProj.toFixed(1)}</span>
                <span className="text-text-muted text-[10px]">proj</span>
                <span className="font-display text-lg text-text-muted">{aProj.toFixed(1)}</span>
              </div>
            ) : (
              <span className="text-text-muted text-sm">vs</span>
            )}
            {isCompleted && (
              <div className="text-[9px] text-text-muted mt-0.5">Final</div>
            )}
          </div>

          {/* Away user */}
          <div className="flex-1 flex items-center gap-2 justify-end min-w-0">
            <div className="min-w-0 text-right">
              <div className={`text-sm font-semibold truncate ${isCompleted && !homeWinning ? 'text-correct' : 'text-text-primary'}`}>
                {matchup.away_user?.display_name || matchup.away_user?.username}
              </div>
              {matchup.away_user?.fantasy_team_name && (
                <div className="text-[10px] text-text-muted italic uppercase tracking-wide truncate">{matchup.away_user.fantasy_team_name}</div>
              )}
              {matchup.away_user?.id === myId && !matchup.away_user?.fantasy_team_name && <div className="text-[9px] text-accent font-bold">YOU</div>}
            </div>
            <Avatar user={matchup.away_user} size="sm" />
          </div>
        </div>

        {/* Win probability bar (current/future only, when projections available) */}
        {!isCompleted && totalProj > 0 && (
          <div className="mt-2 h-1.5 rounded-full bg-bg-card overflow-hidden flex">
            <div className="bg-accent/60 rounded-l-full transition-all" style={{ width: `${homePct}%` }} />
            <div className="bg-text-muted/30 rounded-r-full flex-1" />
          </div>
        )}
      </button>

      {/* Expanded roster comparison */}
      {isExpanded && matchup.home_roster && (
        <div className="border-t border-text-primary/10 p-3">
          <div className="space-y-1">
            {(matchup.home_roster || []).map((hp, i) => {
              const ap = matchup.away_roster?.[i]
              return (
                <div key={i} className="flex items-center gap-1 text-xs">
                  {/* Home player */}
                  <div
                    className="flex-1 flex items-center gap-1.5 min-w-0 py-1 cursor-pointer hover:bg-text-primary/5 rounded px-1"
                    onClick={() => hp?.player_id && onPlayerClick(hp.player_id)}
                  >
                    {hp?.headshot_url ? (
                      <img src={hp.headshot_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                    ) : <div className="w-6 h-6 rounded-full bg-bg-secondary shrink-0" />}
                    <span className="truncate text-text-primary">{hp?.player_name || '--'}</span>
                    {hp?.injury_status && <InjuryBadge status={hp.injury_status} />}
                    {hp?.player_id && <BlurbDot playerId={hp.player_id} blurbIds={blurbIds} />}
                    {hp?.on_bye && <span className="text-[9px] text-text-muted font-bold">BYE</span>}
                  </div>
                  <div className={`w-10 text-right font-semibold shrink-0 ${
                    hp?.game_status === 'live' ? 'text-accent' : hp?.game_status === 'final' ? 'text-text-primary' : 'text-text-muted'
                  }`}>
                    {hp?.game_status === 'upcoming' && weekStatus !== 'past' ? (hp?.projected?.toFixed(1) || '0.0') : (hp?.points?.toFixed(1) || '0.0')}
                  </div>

                  {/* Position label */}
                  <div className="w-8 text-center">
                    <span className="text-[10px] font-semibold text-text-muted bg-bg-secondary rounded px-1 py-0.5">
                      {SLOT_LABELS[hp?.slot] || '?'}
                    </span>
                  </div>

                  {/* Away player */}
                  <div className={`w-10 text-left font-semibold shrink-0 ${
                    ap?.game_status === 'live' ? 'text-accent' : ap?.game_status === 'final' ? 'text-text-primary' : 'text-text-muted'
                  }`}>
                    {ap?.game_status === 'upcoming' && weekStatus !== 'past' ? (ap?.projected?.toFixed(1) || '0.0') : (ap?.points?.toFixed(1) || '0.0')}
                  </div>
                  <div
                    className="flex-1 flex items-center gap-1.5 justify-end min-w-0 py-1 cursor-pointer hover:bg-text-primary/5 rounded px-1"
                    onClick={() => ap?.player_id && onPlayerClick(ap.player_id)}
                  >
                    {ap?.player_id && <BlurbDot playerId={ap.player_id} blurbIds={blurbIds} />}
                    {ap?.injury_status && <InjuryBadge status={ap.injury_status} />}
                    {ap?.on_bye && <span className="text-[9px] text-text-muted font-bold">BYE</span>}
                    <span className="truncate text-text-primary text-right">{ap?.player_name || '--'}</span>
                    {ap?.headshot_url ? (
                      <img src={ap.headshot_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                    ) : <div className="w-6 h-6 rounded-full bg-bg-secondary shrink-0" />}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Totals row */}
          <div className="flex items-center gap-1 text-xs mt-2 pt-2 border-t border-text-primary/10 font-display">
            <div className="flex-1 text-right text-text-muted">Total</div>
            <div className="w-10 text-right font-bold text-text-primary">
              {(matchup.home_points || matchup.home_roster?.reduce((s, r) => s + (r.points || 0), 0) || 0).toFixed(1)}
            </div>
            <div className="w-8" />
            <div className="w-10 text-left font-bold text-text-primary">
              {(matchup.away_points || matchup.away_roster?.reduce((s, r) => s + (r.points || 0), 0) || 0).toFixed(1)}
            </div>
            <div className="flex-1" />
          </div>
        </div>
      )}
    </div>
  )
}

export default function FantasyMatchup({ league, fantasySettings }) {
  const { profile } = useAuth()
  const season = fantasySettings?.season || 2026
  const currentWeek = fantasySettings?.current_week || fantasySettings?.single_week || 1
  const totalWeeks = fantasySettings?.championship_week || 17
  const [viewWeek, setViewWeek] = useState(currentWeek)
  const [matchupView, setMatchupView] = useState('mine') // 'mine' | 'all'
  const [expandedMatchups, setExpandedMatchups] = useState(new Set())
  const [detailPlayerId, setDetailPlayerId] = useState(null)
  const { data: blurbIdsList } = useBlurbPlayerIds(league.id)
  const blurbIds = useMemo(() => new Set(blurbIdsList || []), [blurbIdsList])

  function openPlayerDetail(id) {
    if (id) markBlurbSeen(id)
    setDetailPlayerId(id)
  }
  const [showReport, setShowReport] = useState(false)

  const isCurrent = viewWeek === currentWeek

  // Current week uses the live endpoint (with ESPN polling)
  const liveQuery = useFantasyMatchupLive(league.id, viewWeek, season)
  // Past/future weeks use the static endpoint
  const weekQuery = useFantasyMatchupWeek(league.id, viewWeek, season, currentWeek)

  const data = isCurrent ? liveQuery.data : weekQuery.data
  const isLoading = isCurrent ? liveQuery.isLoading : weekQuery.isLoading
  const matchups = data?.matchups || []
  const weekStatus = isCurrent ? 'current' : (viewWeek < currentWeek ? 'past' : 'future')

  // Sort user's matchup first
  const sorted = [...matchups].sort((a, b) => {
    const aIsMe = a.home_user?.id === profile?.id || a.away_user?.id === profile?.id
    const bIsMe = b.home_user?.id === profile?.id || b.away_user?.id === profile?.id
    if (aIsMe && !bIsMe) return -1
    if (bIsMe && !aIsMe) return 1
    return 0
  })

  // Matchup result banner (current week, completed)
  const myMatchup = matchups.find((m) => m.status === 'completed' && (m.home_user?.id === profile?.id || m.away_user?.id === profile?.id))
  const [resultDismissed, setResultDismissed] = useState(() => {
    if (!myMatchup) return false
    return localStorage.getItem(`matchup-result-seen-${myMatchup?.id}`) === '1'
  })
  const myResult = !resultDismissed && myMatchup && isCurrent ? (() => {
    const isHome = myMatchup.home_user?.id === profile?.id
    const myPts = isHome ? myMatchup.home_points : myMatchup.away_points
    const oppPts = isHome ? myMatchup.away_points : myMatchup.home_points
    const opponent = isHome ? myMatchup.away_user : myMatchup.home_user
    const won = myPts > oppPts
    const tied = myPts === oppPts
    return { won, tied, myPts, oppPts, opponent }
  })() : null

  return (
    <div className="space-y-4">
      {/* Week selector */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setViewWeek((w) => Math.max(1, w - 1))}
          disabled={viewWeek <= 1}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary disabled:opacity-30"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center min-w-[100px]">
          <div className="font-display text-lg text-text-primary">Week {viewWeek}</div>
          <div className={`text-[10px] font-semibold ${weekStatus === 'current' ? 'text-accent' : 'text-text-muted'}`}>
            {weekStatus === 'past' ? 'Final' : weekStatus === 'future' ? 'Upcoming' : 'Current'}
          </div>
        </div>
        <button
          onClick={() => setViewWeek((w) => Math.min(totalWeeks, w + 1))}
          disabled={viewWeek >= totalWeeks}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary disabled:opacity-30"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* League report button */}
      {league.status === 'completed' && (
        <button
          onClick={() => setShowReport(true)}
          className="w-full py-3 rounded-xl bg-accent/10 border border-accent/30 text-accent font-display text-sm flex items-center justify-center gap-2 hover:bg-accent/20 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          View League Report
        </button>
      )}
      {showReport && <LeagueReport leagueId={league.id} leagueName={league.name} memberCount={league.member_count} onClose={() => setShowReport(false)} />}

      {/* Result banner */}
      {myResult && (
        <div className={`relative rounded-xl border p-4 text-center ${
          myResult.won ? 'border-correct/40 bg-correct/10' : myResult.tied ? 'border-accent/40 bg-accent/10' : 'border-incorrect/40 bg-incorrect/10'
        }`}>
          <button
            onClick={() => { localStorage.setItem(`matchup-result-seen-${myMatchup.id}`, '1'); setResultDismissed(true) }}
            className="absolute top-2 right-2 text-text-muted hover:text-text-primary text-lg leading-none"
          >&times;</button>
          <div className={`font-display text-lg ${myResult.won ? 'text-correct' : myResult.tied ? 'text-accent' : 'text-incorrect'}`}>
            {myResult.won ? 'Victory!' : myResult.tied ? 'Tie Game' : 'Defeat'}
          </div>
          <div className="flex items-center justify-center gap-4 mt-2">
            <div className="text-right">
              <div className="font-display text-2xl text-text-primary">{myResult.myPts?.toFixed(1)}</div>
              <div className="text-[10px] text-text-muted">You</div>
            </div>
            <div className="text-text-muted text-sm">vs</div>
            <div className="text-left">
              <div className="font-display text-2xl text-text-secondary">{myResult.oppPts?.toFixed(1)}</div>
              <div className="text-[10px] text-text-muted">{myResult.opponent?.display_name || myResult.opponent?.username}</div>
            </div>
          </div>
        </div>
      )}

      {/* My Matchup / All Matchups toggle */}
      {sorted.length > 0 && (
        <div className="flex gap-1">
          {['mine', 'all'].map((v) => (
            <button
              key={v}
              onClick={() => setMatchupView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                matchupView === v ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
              }`}
            >
              {v === 'mine' ? 'My Matchup' : 'All Matchups'}
            </button>
          ))}
        </div>
      )}

      {/* Matchup cards */}
      {isLoading ? (
        <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>
      ) : !sorted.length ? (
        <div className="text-center py-8 text-sm text-text-muted">Matchups will be generated automatically once the draft is complete.</div>
      ) : matchupView === 'mine' ? (
        // My Matchup view — only show user's matchup, always expanded
        (() => {
          const mine = sorted.find((m) => m.home_user?.id === profile?.id || m.away_user?.id === profile?.id)
          return mine ? (
            <MatchupCard
              matchup={mine}
              myId={profile?.id}
              weekStatus={weekStatus}
              isExpanded={true}
              onToggle={() => {}}
              onPlayerClick={openPlayerDetail}
              blurbIds={blurbIds}
            />
          ) : (
            <div className="text-center py-8 text-sm text-text-muted">No matchup found for you this week.</div>
          )
        })()
      ) : (
        // All Matchups view — user's matchup expanded, others collapsed
        sorted.map((matchup) => {
          const isMyMatchup = matchup.home_user?.id === profile?.id || matchup.away_user?.id === profile?.id
          const isExpanded = isMyMatchup || expandedMatchups.has(matchup.id)
          return (
            <MatchupCard
              key={matchup.id}
              matchup={matchup}
              myId={profile?.id}
              weekStatus={weekStatus}
              isExpanded={isExpanded}
              onToggle={() => setExpandedMatchups((prev) => {
                const next = new Set(prev)
                if (next.has(matchup.id)) next.delete(matchup.id)
                else next.add(matchup.id)
                return next
              })}
              onPlayerClick={openPlayerDetail}
              blurbIds={blurbIds}
            />
          )
        })
      )}

      {detailPlayerId && (
        <PlayerDetailModal leagueId={league.id} playerId={detailPlayerId} onClose={() => setDetailPlayerId(null)} />
      )}
    </div>
  )
}
