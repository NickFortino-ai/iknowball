import { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useFantasyMatchupLive, useFantasyMatchupWeek, useBlurbPlayerIds, usePlayoffBracket } from '../../hooks/useLeagues'
import Avatar from '../ui/Avatar'
import { SkeletonCard } from '../ui/Skeleton'
import PlayerDetailModal from './PlayerDetailModal'
import PlayoffBracket from './PlayoffBracket'
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

function buildStatLine(stats, position) {
  if (!stats) return null
  const parts = []
  if (position === 'QB') {
    if (stats.pass_yds) parts.push(`${stats.pass_yds} PaYD`)
    if (stats.pass_td) parts.push(`${stats.pass_td} PaTD`)
    if (stats.int) parts.push(`${stats.int} INT`)
    if (stats.rush_yds) parts.push(`${stats.rush_yds} RuYD`)
    if (stats.rush_td) parts.push(`${stats.rush_td} RuTD`)
  } else if (position === 'K') {
    if (stats.fgm) parts.push(`${stats.fgm} FG`)
    if (stats.fgm_50_plus) parts.push(`${stats.fgm_50_plus} 50+`)
    if (stats.xpm) parts.push(`${stats.xpm} XP`)
  } else if (position === 'DEF') {
    if (stats.def_sack) parts.push(`${stats.def_sack} SK`)
    if (stats.def_int) parts.push(`${stats.def_int} INT`)
    if (stats.def_fum_rec) parts.push(`${stats.def_fum_rec} FR`)
    if (stats.def_td) parts.push(`${stats.def_td} TD`)
  } else {
    if (stats.rush_yds) parts.push(`${stats.rush_yds} RuYD`)
    if (stats.rush_td) parts.push(`${stats.rush_td} RuTD`)
    if (stats.rec) parts.push(`${stats.rec} Rec`)
    if (stats.rec_yds) parts.push(`${stats.rec_yds} ReYD`)
    if (stats.rec_td) parts.push(`${stats.rec_td} ReTD`)
  }
  return parts.length ? parts.join(', ') : null
}

const STARTER_SET = new Set(['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3', 'te', 'flex', 'k', 'def'])

function MatchupCard({ matchup, myId, weekStatus, isExpanded, onToggle, onPlayerClick, blurbIds }) {
  const isMyMatchup = matchup.home_user?.id === myId || matchup.away_user?.id === myId
  const isCompleted = matchup.status === 'completed' || weekStatus === 'past'
  const homeWinning = (matchup.home_points || 0) >= (matchup.away_points || 0)
  const hasScores = (matchup.home_points || 0) > 0 || (matchup.away_points || 0) > 0
  const [showBench, setShowBench] = useState(false)

  const homeStarters = (matchup.home_roster || []).filter((r) => STARTER_SET.has(r.slot))
  const awayStarters = (matchup.away_roster || []).filter((r) => STARTER_SET.has(r.slot))
  const homeBench = (matchup.home_roster || []).filter((r) => !STARTER_SET.has(r.slot))
  const awayBench = (matchup.away_roster || []).filter((r) => !STARTER_SET.has(r.slot))

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
      <button onClick={onToggle} className="w-full p-4 hover:bg-text-primary/5 transition-colors">
        <div className="flex items-center gap-3">
          {/* Home user */}
          <div className="flex-1 flex items-center gap-3 min-w-0">
            <Avatar user={matchup.home_user} size="lg" />
            <div className="min-w-0 text-left">
              <div className={`text-base font-bold truncate ${isCompleted && homeWinning ? 'text-correct' : matchup.home_user?.id === myId ? 'text-accent' : 'text-text-primary'}`}>
                {matchup.home_user?.fantasy_team_name || matchup.home_user?.display_name || matchup.home_user?.username}
              </div>
              <div className="text-xs text-text-primary truncate">
                {matchup.home_user?.fantasy_team_name ? (matchup.home_user?.display_name || matchup.home_user?.username) : ''}
                {matchup.home_user?.record && <span className={matchup.home_user?.fantasy_team_name ? ' ml-1' : ''}>{matchup.home_user.record.wins}-{matchup.home_user.record.losses}</span>}
              </div>
            </div>
          </div>

          {/* Scores */}
          <div className="text-center shrink-0 px-3">
            {hasScores || isCompleted ? (
              <div className="flex items-center gap-3">
                <span className={`font-display text-2xl ${isCompleted && homeWinning ? 'text-correct' : 'text-white'}`}>
                  {(matchup.home_points || 0).toFixed(1)}
                </span>
                <span className="text-text-muted text-sm">-</span>
                <span className={`font-display text-2xl ${isCompleted && !homeWinning ? 'text-correct' : 'text-white'}`}>
                  {(matchup.away_points || 0).toFixed(1)}
                </span>
              </div>
            ) : weekStatus === 'future' && totalProj > 0 ? (
              <div className="flex items-center gap-3">
                <span className="font-display text-xl text-text-muted">{hProj.toFixed(1)}</span>
                <span className="text-text-muted text-xs">proj</span>
                <span className="font-display text-xl text-text-muted">{aProj.toFixed(1)}</span>
              </div>
            ) : (
              <span className="text-text-muted text-sm">vs</span>
            )}
            {isCompleted && (
              <div className="text-xs text-text-muted mt-0.5">Final</div>
            )}
          </div>

          {/* Away user */}
          <div className="flex-1 flex items-center gap-3 justify-end min-w-0">
            <div className="min-w-0 text-right">
              <div className={`text-base font-bold truncate ${isCompleted && !homeWinning ? 'text-correct' : matchup.away_user?.id === myId ? 'text-accent' : 'text-text-primary'}`}>
                {matchup.away_user?.fantasy_team_name || matchup.away_user?.display_name || matchup.away_user?.username}
              </div>
              <div className="text-xs text-text-primary truncate">
                {matchup.away_user?.record && <span>{matchup.away_user.record.wins}-{matchup.away_user.record.losses}</span>}
                {matchup.away_user?.fantasy_team_name ? <span className="ml-1">{matchup.away_user?.display_name || matchup.away_user?.username}</span> : ''}
              </div>
            </div>
            <Avatar user={matchup.away_user} size="lg" />
          </div>
        </div>

        {/* Win probability bar (live/future) or result bar (completed) */}
        {isCompleted && hasScores ? (
          <div className="mt-3">
            <div className="h-2 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${homeWinning ? 'bg-correct' : 'bg-correct float-right'}`} style={{ width: '100%' }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className={`text-[9px] font-semibold ${homeWinning ? 'text-correct' : 'text-text-muted'}`}>{homeWinning ? 'Winner' : 'Loser'}</span>
              <span className="text-[9px] text-text-muted">Final</span>
              <span className={`text-[9px] font-semibold ${!homeWinning ? 'text-correct' : 'text-text-muted'}`}>{!homeWinning ? 'Winner' : 'Loser'}</span>
            </div>
          </div>
        ) : !isCompleted && totalProj > 0 ? (
          <div className="mt-2 h-1.5 rounded-full bg-bg-card overflow-hidden flex">
            <div className="bg-accent/60 rounded-l-full transition-all" style={{ width: `${homePct}%` }} />
            <div className="bg-text-muted/30 rounded-r-full flex-1" />
          </div>
        ) : null}
      </button>

      {/* Expanded roster comparison */}
      {isExpanded && matchup.home_roster && (
        <div className="border-t border-text-primary/10 p-3">
          {/* Desktop: full table with stat lines and projections */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-[1fr_3.5rem_4rem_3rem_4rem_3.5rem_1fr] gap-1 text-xs text-text-muted uppercase tracking-wider px-1 pb-2 border-b border-text-primary/10 mb-1">
              <span>Player</span>
              <span className="text-right">Proj</span>
              <span className="text-right font-semibold">Pts</span>
              <span className="text-center">Pos</span>
              <span className="text-left font-semibold">Pts</span>
              <span className="text-left">Proj</span>
              <span className="text-right">Player</span>
            </div>
            {homeStarters.map((hp, i) => {
              const ap = awayStarters[i]
              const hStat = buildStatLine(hp?.stats, hp?.position)
              const aStat = buildStatLine(ap?.stats, ap?.position)
              const hLive = hp?.game_status === 'live' || hp?.game_status === 'final'
              const aLive = ap?.game_status === 'live' || ap?.game_status === 'final'
              return (
                <div key={i} className="grid grid-cols-[1fr_3.5rem_4rem_3rem_4rem_3.5rem_1fr] gap-1 items-center text-sm py-2.5 border-b border-text-primary/5 last:border-0">
                  {/* Home player */}
                  <div
                    className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:bg-text-primary/5 rounded px-1 py-0.5"
                    onClick={() => hp?.player_id && onPlayerClick(hp.player_id)}
                  >
                    {hp?.headshot_url ? (
                      <img src={hp.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                    ) : <div className="w-10 h-10 rounded-full bg-bg-secondary shrink-0 flex items-center justify-center text-xs text-text-muted font-bold">{hp?.player_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-text-primary truncate">{hp?.player_name || '--'}</span>
                        {hp?.injury_status && <InjuryBadge status={hp.injury_status} />}
                      </div>
                      {hStat && <div className="text-xs text-text-primary truncate">{hStat}</div>}
                      {hp?.on_bye && <div className="text-[10px] text-text-muted font-bold">BYE</div>}
                    </div>
                  </div>
                  <div className="text-right text-text-primary/60 text-xs">{hp?.projected?.toFixed(1) || '--'}</div>
                  <div className={`text-right font-bold text-sm ${hp?.game_status === 'live' ? 'text-orange-400' : hp?.game_status === 'final' ? 'text-white' : 'text-text-muted'}`}>
                    {hLive || weekStatus === 'past' ? (hp?.points || 0).toFixed(1) : '--'}
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-semibold text-text-muted bg-bg-secondary rounded px-1.5 py-0.5">
                      {SLOT_LABELS[hp?.slot] || '?'}
                    </span>
                  </div>
                  <div className={`text-left font-bold text-sm ${ap?.game_status === 'live' ? 'text-orange-400' : ap?.game_status === 'final' ? 'text-white' : 'text-text-muted'}`}>
                    {aLive || weekStatus === 'past' ? (ap?.points || 0).toFixed(1) : '--'}
                  </div>
                  <div className="text-left text-text-primary/60 text-xs">{ap?.projected?.toFixed(1) || '--'}</div>
                  {/* Away player */}
                  <div
                    className="flex items-center gap-2.5 justify-end min-w-0 cursor-pointer hover:bg-text-primary/5 rounded px-1 py-0.5"
                    onClick={() => ap?.player_id && onPlayerClick(ap.player_id)}
                  >
                    <div className="min-w-0 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {ap?.injury_status && <InjuryBadge status={ap.injury_status} />}
                        <span className="font-bold text-text-primary truncate">{ap?.player_name || '--'}</span>
                      </div>
                      {aStat && <div className="text-xs text-text-primary truncate">{aStat}</div>}
                      {ap?.on_bye && <div className="text-[10px] text-text-muted font-bold">BYE</div>}
                    </div>
                    {ap?.headshot_url ? (
                      <img src={ap.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                    ) : <div className="w-10 h-10 rounded-full bg-bg-secondary shrink-0 flex items-center justify-center text-xs text-text-muted font-bold">{ap?.player_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>}
                  </div>
                </div>
              )
            })}
            {/* Bench dropdown */}
            {(homeBench.length > 0 || awayBench.length > 0) && (
              <button
                onClick={() => setShowBench(!showBench)}
                className="w-full mt-1 pt-2 border-t border-text-primary/10 flex items-center justify-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors py-1"
              >
                <span className="font-semibold">Bench</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showBench ? 'rotate-180' : ''}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            )}
            {showBench && homeBench.map((hp, i) => {
              const ap = awayBench[i]
              const hStat = buildStatLine(hp?.stats, hp?.position)
              const aStat = buildStatLine(ap?.stats, ap?.position)
              const hLive = hp?.game_status === 'live' || hp?.game_status === 'final'
              const aLive = ap?.game_status === 'live' || ap?.game_status === 'final'
              return (
                <div key={`bench-${i}`} className="grid grid-cols-[1fr_3.5rem_4rem_3rem_4rem_3.5rem_1fr] gap-1 items-center text-sm py-2 opacity-60">
                  <div className="flex items-center gap-2 min-w-0 cursor-pointer hover:bg-text-primary/5 rounded px-1 py-0.5" onClick={() => hp?.player_id && onPlayerClick(hp.player_id)}>
                    {hp?.headshot_url ? <img src={hp.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} /> : <div className="w-8 h-8 rounded-full bg-bg-secondary shrink-0" />}
                    <div className="min-w-0">
                      <span className="font-semibold text-text-primary truncate block text-xs">{hp?.player_name || '--'}</span>
                      {hStat && <div className="text-[10px] text-text-primary truncate">{hStat}</div>}
                    </div>
                  </div>
                  <div className="text-right text-text-primary/40 text-xs">{hp?.projected?.toFixed(1) || '--'}</div>
                  <div className="text-right text-text-muted text-xs">{hLive || weekStatus === 'past' ? (hp?.points || 0).toFixed(1) : '--'}</div>
                  <div className="text-center"><span className="text-[10px] font-semibold text-text-muted">BN</span></div>
                  <div className="text-left text-text-muted text-xs">{aLive || weekStatus === 'past' ? (ap?.points || 0).toFixed(1) : '--'}</div>
                  <div className="text-left text-text-primary/40 text-xs">{ap?.projected?.toFixed(1) || '--'}</div>
                  <div className="flex items-center gap-2 justify-end min-w-0 cursor-pointer hover:bg-text-primary/5 rounded px-1 py-0.5" onClick={() => ap?.player_id && onPlayerClick(ap.player_id)}>
                    <div className="min-w-0 text-right">
                      <span className="font-semibold text-text-primary truncate block text-xs">{ap?.player_name || '--'}</span>
                      {aStat && <div className="text-[10px] text-text-primary truncate">{aStat}</div>}
                    </div>
                    {ap?.headshot_url ? <img src={ap.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} /> : ap ? <div className="w-8 h-8 rounded-full bg-bg-secondary shrink-0" /> : null}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Mobile: enhanced compact view */}
          <div className="lg:hidden">
            <div className="space-y-0.5">
              {homeStarters.map((hp, i) => {
                const ap = awayStarters[i]
                const hLive = hp?.game_status === 'live' || hp?.game_status === 'final'
                const aLive = ap?.game_status === 'live' || ap?.game_status === 'final'
                return (
                  <div key={i} className="flex items-start gap-1 text-xs border-b border-text-primary/5 last:border-0 py-1.5">
                    {/* Home player */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer px-1"
                      onClick={() => hp?.player_id && onPlayerClick(hp.player_id)}
                    >
                      <div className="flex items-center gap-1.5">
                        {hp?.headshot_url ? (
                          <img src={hp.headshot_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                        ) : <div className="w-6 h-6 rounded-full bg-bg-secondary shrink-0 flex items-center justify-center text-[9px] text-text-muted font-bold">{hp?.player_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-text-primary truncate">{hp?.player_name || '--'}</span>
                            {hp?.injury_status && <InjuryBadge status={hp.injury_status} />}
                          </div>
                          <div className="text-[10px] text-text-muted">
                            {hp?.team} - {hp?.position}
                            {hp?.on_bye && <span className="font-bold ml-1">BYE</span>}
                          </div>
                          {(hLive || weekStatus === 'past') && hp?.opponent && (
                            <div className="text-[10px] text-text-muted">
                              {hp.game_status === 'final' ? 'Final' : `Q${hp.game_period || '?'}`}
                              {hp.team_score != null && ` ${hp.team_score > hp.opp_score ? '(W)' : hp.team_score < hp.opp_score ? '(L)' : '(T)'} ${hp.team_score}-${hp.opp_score}`}
                              {hp.is_home ? ` vs ${hp.opponent}` : ` @ ${hp.opponent}`}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Home points + projection */}
                    <div className="w-12 text-right shrink-0 pt-0.5">
                      <div className={`font-bold ${hp?.game_status === 'live' ? 'text-orange-400' : hp?.game_status === 'final' ? 'text-text-primary' : 'text-text-muted'}`}>
                        {hLive || weekStatus === 'past' ? (hp?.points?.toFixed(1) || '0.0') : '--'}
                      </div>
                      {hp?.projected != null && !hp?.on_bye && (
                        <div className="text-[10px] text-text-primary/60">{hp.projected.toFixed(1)}</div>
                      )}
                    </div>
                    {/* Position */}
                    <div className="w-8 text-center pt-1 shrink-0">
                      <span className="text-[10px] font-semibold text-text-muted bg-bg-secondary rounded px-1 py-0.5">
                        {SLOT_LABELS[hp?.slot] || '?'}
                      </span>
                    </div>
                    {/* Away points + projection */}
                    <div className="w-12 text-left shrink-0 pt-0.5">
                      <div className={`font-bold ${ap?.game_status === 'live' ? 'text-orange-400' : ap?.game_status === 'final' ? 'text-text-primary' : 'text-text-muted'}`}>
                        {aLive || weekStatus === 'past' ? (ap?.points?.toFixed(1) || '0.0') : '--'}
                      </div>
                      {ap?.projected != null && !ap?.on_bye && (
                        <div className="text-[10px] text-text-primary/60">{ap.projected.toFixed(1)}</div>
                      )}
                    </div>
                    {/* Away player */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer px-1"
                      onClick={() => ap?.player_id && onPlayerClick(ap.player_id)}
                    >
                      <div className="flex items-center gap-1.5 justify-end">
                        <div className="min-w-0 flex-1 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            {ap?.injury_status && <InjuryBadge status={ap.injury_status} />}
                            <span className="font-semibold text-text-primary truncate">{ap?.player_name || '--'}</span>
                          </div>
                          <div className="text-[10px] text-text-muted">
                            {ap?.team} - {ap?.position}
                            {ap?.on_bye && <span className="font-bold ml-1">BYE</span>}
                          </div>
                          {(aLive || weekStatus === 'past') && ap?.opponent && (
                            <div className="text-[10px] text-text-muted">
                              {ap.game_status === 'final' ? 'Final' : `Q${ap.game_period || '?'}`}
                              {ap.team_score != null && ` ${ap.team_score > ap.opp_score ? '(W)' : ap.team_score < ap.opp_score ? '(L)' : '(T)'} ${ap.team_score}-${ap.opp_score}`}
                              {ap.is_home ? ` vs ${ap.opponent}` : ` @ ${ap.opponent}`}
                            </div>
                          )}
                        </div>
                        {ap?.headshot_url ? (
                          <img src={ap.headshot_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                        ) : <div className="w-6 h-6 rounded-full bg-bg-secondary shrink-0 flex items-center justify-center text-[9px] text-text-muted font-bold">{ap?.player_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
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
  const playoffStartWeek = fantasySettings?.playoff_start_week || 15
  const isPlayoffWeek = viewWeek >= playoffStartWeek
  const [matchupView, setMatchupView] = useState('mine') // 'mine' | 'all' | 'bracket'
  const [expandedMatchups, setExpandedMatchups] = useState(new Set())
  const [detailPlayerId, setDetailPlayerId] = useState(null)
  const { data: blurbIdsList } = useBlurbPlayerIds(league.id)
  const blurbIds = useMemo(() => new Set(blurbIdsList || []), [blurbIdsList])

  function openPlayerDetail(id) {
    if (id) markBlurbSeen(id)
    setDetailPlayerId(id)
  }
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
          <div className={`text-[10px] font-semibold ${isPlayoffWeek ? 'text-accent' : weekStatus === 'current' ? 'text-accent' : 'text-text-muted'}`}>
            {isPlayoffWeek ? 'Playoffs' : weekStatus === 'past' ? 'Final' : weekStatus === 'future' ? 'Upcoming' : 'Current'}
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

      {/* My Matchup / All Matchups / Bracket toggle */}
      {sorted.length > 0 && (
        <div className="flex gap-1">
          {['mine', 'all', ...(isPlayoffWeek ? ['bracket'] : [])].map((v) => (
            <button
              key={v}
              onClick={() => setMatchupView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                matchupView === v ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
              }`}
            >
              {v === 'mine' ? 'My Matchup' : v === 'bracket' ? 'Bracket' : 'All Matchups'}
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
              isExpanded={!expandedMatchups.has('my-collapsed')}
              onToggle={() => setExpandedMatchups((prev) => {
                const next = new Set(prev)
                if (next.has('my-collapsed')) next.delete('my-collapsed')
                else next.add('my-collapsed')
                return next
              })}
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
          const isExpanded = (isMyMatchup && !expandedMatchups.has(`collapse-${matchup.id}`)) || expandedMatchups.has(matchup.id)
          return (
            <MatchupCard
              key={matchup.id}
              matchup={matchup}
              myId={profile?.id}
              weekStatus={weekStatus}
              isExpanded={isExpanded}
              onToggle={() => setExpandedMatchups((prev) => {
                const next = new Set(prev)
                if (isMyMatchup) {
                  const key = `collapse-${matchup.id}`
                  if (next.has(key)) next.delete(key)
                  else next.add(key)
                } else {
                  if (next.has(matchup.id)) next.delete(matchup.id)
                  else next.add(matchup.id)
                }
                return next
              })}
              onPlayerClick={openPlayerDetail}
              blurbIds={blurbIds}
            />
          )
        })
      )}

      {/* Bracket view */}
      {matchupView === 'bracket' && (
        <PlayoffBracket leagueId={league.id} />
      )}

      {detailPlayerId && (
        <PlayerDetailModal leagueId={league.id} playerId={detailPlayerId} onClose={() => setDetailPlayerId(null)} />
      )}
    </div>
  )
}
