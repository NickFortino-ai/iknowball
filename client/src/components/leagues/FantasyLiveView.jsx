import { useState } from 'react'
import { useNflDfsLive, useFantasyMatchupLive } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import Avatar from '../ui/Avatar'
import LoadingSpinner from '../ui/LoadingSpinner'
import { SkeletonCard } from '../ui/Skeleton'
import PlayerDetailModal from './PlayerDetailModal'

const SLOT_LABELS = { QB: 'QB', RB1: 'RB', RB2: 'RB', WR1: 'WR', WR2: 'WR', WR3: 'WR', TE: 'TE', FLEX: 'FLX', DEF: 'DEF' }
const SLOT_ORDER = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'WR3', 'TE', 'FLEX', 'DEF']
const H2H_SLOT_ORDER = ['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3', 'te', 'flex', 'k', 'def']
const H2H_SLOT_LABELS = { qb: 'QB', rb1: 'RB', rb2: 'RB', wr1: 'WR', wr2: 'WR', wr3: 'WR', te: 'TE', flex: 'FLX', k: 'K', def: 'DEF' }

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
    if (stats.def_safety) parts.push(`${stats.def_safety} SAF`)
    if (stats.def_pts_allowed != null) parts.push(`${stats.def_pts_allowed} PA`)
  } else {
    if (stats.rush_yds) parts.push(`${stats.rush_yds} RuYD`)
    if (stats.rush_td) parts.push(`${stats.rush_td} RuTD`)
    if (stats.rec) parts.push(`${stats.rec} REC`)
    if (stats.rec_yds) parts.push(`${stats.rec_yds} ReYD`)
    if (stats.rec_td) parts.push(`${stats.rec_td} ReTD`)
    if (stats.fum) parts.push(`${stats.fum} FUM`)
  }
  return parts.length > 0 ? parts.join(' \u00b7 ') : null
}

function gameClockLabel(slot) {
  if (slot.game_status === 'final') return 'Final'
  if (slot.game_status === 'live') {
    const period = slot.game_period ? `Q${slot.game_period}` : ''
    const clock = slot.game_clock ? slot.game_clock : ''
    return [period, clock].filter(Boolean).join(' ') || 'Live'
  }
  return null
}

function SlotBorder({ status }) {
  if (status === 'live') return 'border-l-accent'
  if (status === 'final') return 'border-l-correct'
  return 'border-l-text-primary/20'
}

/** Salary cap DFS leaderboard with expandable rosters */
function SalaryCapLive({ league, week, season }) {
  const { profile } = useAuth()
  const { data: liveData, isLoading } = useNflDfsLive(league.id, week, season)
  const [expandedUserId, setExpandedUserId] = useState(null)
  const [detailPlayerId, setDetailPlayerId] = useState(null)

  if (isLoading) return (
    <div className="space-y-3">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )

  const { members, all_final } = liveData || {}

  if (!members?.length) {
    return <div className="text-center py-8 text-sm text-text-secondary">No rosters for this week.</div>
  }

  return (
    <div className="space-y-3">
      {members.map((m, idx) => {
        const isMe = m.user_id === profile?.id
        const isWinner = all_final && idx === 0
        const isExpanded = expandedUserId === m.user_id
        const borderColor = m.status === 'final' ? 'border-correct/50' : m.status === 'live' ? 'border-accent/50' : 'border-text-primary/20'

        // Slot status counters for the subtle "yet to play / playing / done" line
        const slots = m.slots || []
        const yetToPlay = slots.filter((s) => s.game_status === 'upcoming').length
        const playing = slots.filter((s) => s.game_status === 'live').length
        const done = slots.filter((s) => s.game_status === 'final').length

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
                  {m.has_roster && slots.length > 0 && (yetToPlay > 0 || playing > 0) && (
                    <div className="text-[10px] text-text-muted mt-0.5">
                      {playing > 0 && <span className="text-accent">{playing} playing</span>}
                      {playing > 0 && yetToPlay > 0 && <span> · </span>}
                      {yetToPlay > 0 && <span>{yetToPlay} yet to play</span>}
                      {done > 0 && (playing > 0 || yetToPlay > 0) && <span> · </span>}
                      {done > 0 && <span>{done} done</span>}
                    </div>
                  )}
                  {!m.has_roster && <div className="text-xs text-text-muted">No roster submitted</div>}
                </div>
                {m.projected_points != null && m.status !== 'final' && (
                  <span className="text-[10px] text-text-muted shrink-0">Proj {m.projected_points.toFixed(1)}</span>
                )}
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
                {[...m.slots].sort((a, b) => SLOT_ORDER.indexOf(a.roster_slot) - SLOT_ORDER.indexOf(b.roster_slot)).map((slot) => {
                  const hidden = slot.player_name === '????'
                  const slotBorder = SlotBorder({ status: slot.game_status })
                  const statLine = buildStatLine(slot.stats, slot.position)

                  return (
                    <div key={slot.roster_slot} className={`flex items-center gap-3 px-4 py-3.5 border-b border-text-primary/10 border-l-2 ${slotBorder} bg-bg-primary`}>
                      <span className="text-sm font-bold text-text-muted w-8 shrink-0">{SLOT_LABELS[slot.roster_slot] || slot.roster_slot}</span>
                      {hidden ? (
                        <span className="flex-1 text-base text-text-muted font-mono">????</span>
                      ) : (
                        <>
                          {slot.headshot_url && (
                            <img
                              src={slot.headshot_url}
                              alt=""
                              className="w-11 h-11 rounded-full object-cover bg-bg-secondary shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                              loading="eager"
                              decoding="async"
                              onClick={() => slot.player_id && setDetailPlayerId(slot.player_id)}
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          )}
                          <div className="flex-1 min-w-0 lg:flex lg:items-center lg:gap-6">
                            <div
                              className="lg:w-44 lg:shrink-0 flex items-center gap-1.5 cursor-pointer"
                              onClick={() => slot.player_id && setDetailPlayerId(slot.player_id)}
                            >
                              <span className="text-base font-bold text-text-primary truncate hover:text-accent transition-colors">{slot.player_name}</span>
                              {slot.injury_status && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                  slot.injury_status === 'Out' || slot.injury_status === 'IR'
                                    ? 'bg-incorrect/20 text-incorrect'
                                    : 'bg-yellow-500/20 text-yellow-500'
                                }`}>
                                  {slot.injury_status === 'Questionable' ? 'Q' : slot.injury_status === 'Doubtful' ? 'D' : slot.injury_status === 'IR' ? 'IR' : 'O'}
                                </span>
                              )}
                            </div>
                            {statLine && (
                              <span className="text-xs text-text-muted block lg:hidden">{statLine}</span>
                            )}
                            <span className="text-sm text-text-secondary hidden lg:block lg:flex-1">{statLine || ''}</span>
                            {(slot.game_status === 'live' || slot.game_status === 'final') && slot.home_team && (
                              <span className="text-[11px] text-text-muted block mt-0.5 lg:mt-0 lg:text-xs lg:w-44 lg:shrink-0 lg:text-right">
                                {slot.away_team} {slot.away_score ?? ''} @ {slot.home_team} {slot.home_score ?? ''}
                                {slot.game_status === 'live' && slot.game_period && (
                                  <span className="text-text-primary ml-1.5">Q{slot.game_period} {slot.game_clock}</span>
                                )}
                                {slot.game_status === 'final' && (
                                  <span className="text-text-primary ml-1.5">Final</span>
                                )}
                              </span>
                            )}
                          </div>
                          {(slot.game_status === 'live' || slot.game_status === 'final') && (
                            <div className="flex flex-col items-end shrink-0 lg:ml-6 lg:w-16 lg:text-right">
                              <span className="text-base lg:text-lg font-display text-white">
                                {Math.round((slot.points_earned || 0) * 10) / 10}
                              </span>
                              {slot.projected != null && slot.game_status !== 'final' && (
                                <span className="text-[9px] text-text-muted">/ {slot.projected.toFixed(1)}</span>
                              )}
                            </div>
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
      {detailPlayerId && (
        <PlayerDetailModal leagueId={league.id} playerId={detailPlayerId} onClose={() => setDetailPlayerId(null)} />
      )}
    </div>
  )
}

/** Traditional H2H matchup live view */
function MatchupLive({ league, week, season }) {
  const { profile } = useAuth()
  const { data, isLoading } = useFantasyMatchupLive(league.id, week, season)
  const [expandedMatchup, setExpandedMatchup] = useState(null)
  const [detailPlayerId, setDetailPlayerId] = useState(null)

  if (isLoading) return (
    <div className="space-y-3">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )

  const matchups = data?.matchups || []

  if (!matchups.length) {
    return <div className="text-center py-8 text-sm text-text-secondary">No matchups for this week.</div>
  }

  // Find the user's matchup and put it first
  const sorted = [...matchups].sort((a, b) => {
    const aIsMe = a.home_user?.id === profile?.id || a.away_user?.id === profile?.id
    const bIsMe = b.home_user?.id === profile?.id || b.away_user?.id === profile?.id
    if (aIsMe && !bIsMe) return -1
    if (bIsMe && !aIsMe) return 1
    return 0
  })

  // My completed matchup result banner — dismiss once seen
  const myMatchup = matchups.find((m) => m.status === 'completed' && (m.home_user?.id === profile?.id || m.away_user?.id === profile?.id))
  const [resultDismissed, setResultDismissed] = useState(() => {
    if (!myMatchup) return false
    return localStorage.getItem(`matchup-result-seen-${myMatchup.id}`) === '1'
  })
  const myResult = !resultDismissed && myMatchup ? (() => {
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
      {/* Weekly matchup result banner — dismissible */}
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
              <div className="font-display text-2xl text-text-primary">{myResult.myPts}</div>
              <div className="text-[10px] text-text-muted">You</div>
            </div>
            <div className="text-text-muted text-sm">vs</div>
            <div className="text-left">
              <div className="font-display text-2xl text-text-secondary">{myResult.oppPts}</div>
              <div className="text-[10px] text-text-muted">{myResult.opponent?.display_name || myResult.opponent?.username || 'Opponent'}</div>
            </div>
          </div>
          <div className="text-xs text-text-muted mt-2">Week {week}</div>
        </div>
      )}

      {sorted.map((matchup) => {
        const isMyMatchup = matchup.home_user?.id === profile?.id || matchup.away_user?.id === profile?.id
        const isExpanded = expandedMatchup === matchup.id
        const homeWinning = matchup.home_points >= matchup.away_points

        const homeProb = matchup.home_win_prob ?? 50
        const awayProb = matchup.away_win_prob ?? 50

        return (
          <div key={matchup.id} className="rounded-xl border border-text-primary/20 overflow-hidden bg-bg-primary">
            {/* Matchup header — tappable */}
            <button
              onClick={() => setExpandedMatchup(isExpanded ? null : matchup.id)}
              className="w-full p-4 text-left"
            >
              {/* Win probability bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-bold ${homeProb >= 50 ? 'text-correct' : 'text-text-muted'}`}>{homeProb}%</span>
                  <span className="text-[10px] text-text-muted uppercase tracking-wider">Win Prob</span>
                  <span className={`text-[10px] font-bold ${awayProb > 50 ? 'text-correct' : 'text-text-muted'}`}>{awayProb}%</span>
                </div>
                <div className="flex h-1.5 rounded-full overflow-hidden bg-text-primary/10">
                  <div
                    className={`transition-all duration-500 ${homeProb >= 50 ? 'bg-correct' : 'bg-text-muted/40'}`}
                    style={{ width: `${homeProb}%` }}
                  />
                  <div
                    className={`transition-all duration-500 ${awayProb > 50 ? 'bg-correct' : 'bg-text-muted/40'}`}
                    style={{ width: `${awayProb}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <Avatar user={matchup.home_user} size="md" />
                  <div className="min-w-0">
                    <span className={`text-sm font-bold truncate block ${homeWinning ? 'text-text-primary' : 'text-text-muted'}`}>
                      {matchup.home_user?.display_name || matchup.home_user?.username}
                    </span>
                    {matchup.home_projected > 0 && (
                      <span className="text-[10px] text-text-muted">Proj: {matchup.home_projected.toFixed(1)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 px-3 shrink-0">
                  <span className={`font-display text-xl ${homeWinning ? 'text-white' : 'text-text-muted'}`}>
                    {matchup.home_points.toFixed(1)}
                  </span>
                  <span className="text-xs text-text-muted">vs</span>
                  <span className={`font-display text-xl ${!homeWinning ? 'text-white' : 'text-text-muted'}`}>
                    {matchup.away_points.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
                  <div className="min-w-0 text-right">
                    <span className={`text-sm font-bold truncate block ${!homeWinning ? 'text-text-primary' : 'text-text-muted'}`}>
                      {matchup.away_user?.display_name || matchup.away_user?.username}
                    </span>
                    {matchup.away_projected > 0 && (
                      <span className="text-[10px] text-text-muted">Proj: {matchup.away_projected.toFixed(1)}</span>
                    )}
                  </div>
                  <Avatar user={matchup.away_user} size="md" />
                </div>
              </div>
            </button>

            {/* Expanded rosters */}
            {isExpanded && (
              <div className="border-t border-text-primary/10">
                <div className="grid grid-cols-2 divide-x divide-text-primary/10">
                  {/* Home roster */}
                  <div>
                    {matchup.home_roster.map((slot) => {
                      const statLine = buildStatLine(slot.stats, slot.position)
                      const slotBorder = slot.game_status === 'live' ? 'border-l-accent' : slot.game_status === 'final' ? 'border-l-correct' : 'border-l-text-primary/20'
                      return (
                        <div key={slot.slot} className={`flex items-center gap-2 px-3 py-2.5 border-b border-text-primary/5 border-l-2 ${slotBorder}`}>
                          <span className="text-[10px] font-bold text-text-muted w-6 shrink-0">{H2H_SLOT_LABELS[slot.slot] || slot.slot.toUpperCase()}</span>
                          {slot.headshot_url && (
                            <img
                              src={slot.headshot_url}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => slot.player_id && setDetailPlayerId(slot.player_id)}
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          )}
                          <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => slot.player_id && setDetailPlayerId(slot.player_id)}
                          >
                            <div className="text-xs font-bold text-text-primary truncate flex items-center gap-1">
                              <span className="truncate hover:text-accent transition-colors">{slot.player_name}</span>
                              {slot.injury_status && (
                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${
                                  slot.injury_status === 'Out' || slot.injury_status === 'IR'
                                    ? 'bg-incorrect/20 text-incorrect'
                                    : 'bg-yellow-500/20 text-yellow-500'
                                }`}>
                                  {slot.injury_status === 'Questionable' ? 'Q' : slot.injury_status === 'Doubtful' ? 'D' : slot.injury_status === 'IR' ? 'IR' : 'O'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-text-muted truncate">
                              {statLine && <span className="truncate">{statLine}</span>}
                              {gameClockLabel(slot) && (
                                <span className={`shrink-0 ${slot.game_status === 'live' ? 'text-accent' : 'text-text-muted'}`}>
                                  {statLine ? '· ' : ''}{gameClockLabel(slot)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end shrink-0">
                            <span className={`text-xs font-display ${slot.points > 0 ? 'text-white' : 'text-text-muted'}`}>
                              {slot.points > 0 ? slot.points.toFixed(1) : '—'}
                            </span>
                            {slot.projected != null && slot.game_status !== 'final' && (
                              <span className="text-[9px] text-text-muted">/ {slot.projected.toFixed(1)}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Away roster */}
                  <div>
                    {matchup.away_roster.map((slot) => {
                      const statLine = buildStatLine(slot.stats, slot.position)
                      const slotBorder = slot.game_status === 'live' ? 'border-l-accent' : slot.game_status === 'final' ? 'border-l-correct' : 'border-l-text-primary/20'
                      return (
                        <div key={slot.slot} className={`flex items-center gap-2 px-3 py-2.5 border-b border-text-primary/5 border-l-2 ${slotBorder}`}>
                          <span className="text-[10px] font-bold text-text-muted w-6 shrink-0">{H2H_SLOT_LABELS[slot.slot] || slot.slot.toUpperCase()}</span>
                          {slot.headshot_url && (
                            <img
                              src={slot.headshot_url}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => slot.player_id && setDetailPlayerId(slot.player_id)}
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          )}
                          <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => slot.player_id && setDetailPlayerId(slot.player_id)}
                          >
                            <div className="text-xs font-bold text-text-primary truncate flex items-center gap-1">
                              <span className="truncate hover:text-accent transition-colors">{slot.player_name}</span>
                              {slot.injury_status && (
                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded shrink-0 ${
                                  slot.injury_status === 'Out' || slot.injury_status === 'IR'
                                    ? 'bg-incorrect/20 text-incorrect'
                                    : 'bg-yellow-500/20 text-yellow-500'
                                }`}>
                                  {slot.injury_status === 'Questionable' ? 'Q' : slot.injury_status === 'Doubtful' ? 'D' : slot.injury_status === 'IR' ? 'IR' : 'O'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-text-muted truncate">
                              {statLine && <span className="truncate">{statLine}</span>}
                              {gameClockLabel(slot) && (
                                <span className={`shrink-0 ${slot.game_status === 'live' ? 'text-accent' : 'text-text-muted'}`}>
                                  {statLine ? '· ' : ''}{gameClockLabel(slot)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end shrink-0">
                            <span className={`text-xs font-display ${slot.points > 0 ? 'text-white' : 'text-text-muted'}`}>
                              {slot.points > 0 ? slot.points.toFixed(1) : '—'}
                            </span>
                            {slot.projected != null && slot.game_status !== 'final' && (
                              <span className="text-[9px] text-text-muted">/ {slot.projected.toFixed(1)}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {detailPlayerId && (
        <PlayerDetailModal leagueId={league.id} playerId={detailPlayerId} onClose={() => setDetailPlayerId(null)} />
      )}
    </div>
  )
}

export default function FantasyLiveView({ league, fantasySettings }) {
  const isSalaryCap = fantasySettings?.format === 'salary_cap'
  const season = 2026
  // TODO: determine current NFL week dynamically
  const week = fantasySettings?.single_week || 1

  if (isSalaryCap) {
    return <SalaryCapLive league={league} week={week} season={season} />
  }

  return <MatchupLive league={league} week={week} season={season} />
}
