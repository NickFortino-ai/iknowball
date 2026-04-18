import { useState } from 'react'
import { getTeamLogoUrl } from '../../lib/teamLogos'
import { useSeriesGames } from '../../hooks/useLeagues'

function TeamLogo({ team, sportKey, className }) {
  const [err, setErr] = useState(false)
  const url = getTeamLogoUrl(team, sportKey)
  if (!url || err) return null
  return <img src={url} alt="" className={`object-contain ${className}`} onError={() => setErr(true)} />
}

function splitTeamName(fullName) {
  if (!fullName) return { city: '', name: fullName || 'TBD' }
  const MULTI_WORD_CITIES = new Set([
    'Los Angeles', 'New York', 'New Jersey', 'San Jose', 'San Antonio', 'San Francisco',
    'San Diego', 'St. Louis', 'St Louis', 'Las Vegas', 'New Orleans', 'Oklahoma City',
    'Kansas City', 'Salt Lake', 'Green Bay', 'Tampa Bay', 'Golden State',
  ])
  const words = fullName.split(' ')
  if (words.length <= 1) return { city: '', name: fullName }
  for (const len of [3, 2]) {
    if (words.length > len) {
      const candidate = words.slice(0, len).join(' ')
      if (MULTI_WORD_CITIES.has(candidate)) {
        return { city: candidate, name: words.slice(len).join(' ') }
      }
    }
  }
  return { city: words[0], name: words.slice(1).join(' ') }
}

export default function SeriesDetailModal({ matchup, sportKey, leagueId, onClose }) {
  const teamTop = matchup.team_top
  const teamBottom = matchup.team_bottom
  const { data: games, isLoading } = useSeriesGames(leagueId, teamTop, teamBottom)

  const topInfo = splitTeamName(teamTop)
  const bottomInfo = splitTeamName(teamBottom)

  const seriesWinsTop = matchup.series_wins_top || 0
  const seriesWinsBottom = matchup.series_wins_bottom || 0
  const seriesOver = seriesWinsTop >= 4 || seriesWinsBottom >= 4
  const topLeading = seriesWinsTop > seriesWinsBottom
  const bottomLeading = seriesWinsBottom > seriesWinsTop
  const tied = seriesWinsTop === seriesWinsBottom

  let seriesLabel = ''
  if (seriesOver) {
    const winnerName = seriesWinsTop >= 4 ? topInfo.name : bottomInfo.name
    seriesLabel = `${winnerName} win ${Math.max(seriesWinsTop, seriesWinsBottom)}-${Math.min(seriesWinsTop, seriesWinsBottom)}`
  } else if (seriesWinsTop === 0 && seriesWinsBottom === 0) {
    seriesLabel = 'Series not started'
  } else if (tied) {
    seriesLabel = `Series tied ${seriesWinsTop}-${seriesWinsBottom}`
  } else {
    const leaderName = topLeading ? topInfo.name : bottomInfo.name
    seriesLabel = `${leaderName} lead ${Math.max(seriesWinsTop, seriesWinsBottom)}-${Math.min(seriesWinsTop, seriesWinsBottom)}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-bg-primary border border-text-primary/20 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-bg-primary/80 text-text-muted hover:text-text-primary transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Team headers */}
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between gap-4">
            {/* Top team */}
            <div className="flex flex-col items-center flex-1 min-w-0">
              <TeamLogo team={teamTop} sportKey={sportKey} className="w-14 h-14 mb-2" />
              {matchup.seed_top != null && (
                <span className="text-[10px] text-text-muted mb-0.5">#{matchup.seed_top} seed</span>
              )}
              <span className="text-xs text-text-muted">{topInfo.city}</span>
              <span className="text-sm font-bold text-text-primary">{topInfo.name}</span>
            </div>

            {/* Series score */}
            <div className="flex flex-col items-center shrink-0">
              <div className="flex items-center gap-3 mb-1">
                <span className={`text-3xl font-bold ${topLeading ? 'text-text-primary' : 'text-text-muted'}`}>
                  {seriesWinsTop}
                </span>
                <span className="text-lg text-text-muted">-</span>
                <span className={`text-3xl font-bold ${bottomLeading ? 'text-text-primary' : 'text-text-muted'}`}>
                  {seriesWinsBottom}
                </span>
              </div>
              <span className="text-[11px] text-text-muted text-center">{seriesLabel}</span>
            </div>

            {/* Bottom team */}
            <div className="flex flex-col items-center flex-1 min-w-0">
              <TeamLogo team={teamBottom} sportKey={sportKey} className="w-14 h-14 mb-2" />
              {matchup.seed_bottom != null && (
                <span className="text-[10px] text-text-muted mb-0.5">#{matchup.seed_bottom} seed</span>
              )}
              <span className="text-xs text-text-muted">{bottomInfo.city}</span>
              <span className="text-sm font-bold text-text-primary">{bottomInfo.name}</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border mx-4" />

        {/* Game-by-game results */}
        <div className="p-4">
          {isLoading ? (
            <div className="text-center text-text-muted text-sm py-4">Loading games...</div>
          ) : !games?.length ? (
            <div className="text-center text-text-muted text-sm py-4">No games played yet</div>
          ) : (
            <div className="space-y-2">
              {games.map((game, idx) => {
                const topIsHome = game.home_team === teamTop
                const scoreTop = topIsHome ? game.home_score : game.away_score
                const scoreBottom = topIsHome ? game.away_score : game.home_score
                const topWon = (topIsHome && game.winner === 'home') || (!topIsHome && game.winner === 'away')
                const gameDate = new Date(game.starts_at)

                // Find top scorers for each team in this game
                const topScorers = game.top_scorers || []
                const homeScorer = topScorers.find((s) => s.team === game.home_team)
                const awayScorer = topScorers.find((s) => s.team === game.away_team)
                const scorerForTop = topIsHome ? homeScorer : awayScorer
                const scorerForBottom = topIsHome ? awayScorer : homeScorer

                return (
                  <div
                    key={game.id}
                    className="bg-bg-primary/60 border border-text-primary/10 rounded-lg px-3 py-2.5"
                  >
                    {/* Score row */}
                    <div className="flex items-center gap-3">
                      {/* Game number */}
                      <div className="shrink-0 w-14">
                        <div className="text-xs font-semibold text-text-secondary">Game {idx + 1}</div>
                        <div className="text-[10px] text-text-muted">
                          {gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>

                      {/* Scores */}
                      <div className="flex-1 flex items-center justify-center gap-2">
                        <div className={`flex items-center gap-1.5 ${topWon ? 'text-text-primary' : 'text-text-muted'}`}>
                          <TeamLogo team={teamTop} sportKey={sportKey} className="w-5 h-5" />
                          <span className={`text-lg font-bold ${topWon ? '' : 'opacity-60'}`}>{scoreTop}</span>
                        </div>
                        <span className="text-text-muted text-xs">-</span>
                        <div className={`flex items-center gap-1.5 ${!topWon ? 'text-text-primary' : 'text-text-muted'}`}>
                          <span className={`text-lg font-bold ${!topWon ? '' : 'opacity-60'}`}>{scoreBottom}</span>
                          <TeamLogo team={teamBottom} sportKey={sportKey} className="w-5 h-5" />
                        </div>
                      </div>

                      {/* Location */}
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] text-text-muted">
                          {topIsHome ? `@${topInfo.name}` : `@${bottomInfo.name}`}
                        </div>
                      </div>
                    </div>

                    {/* Top scorers row */}
                    {(scorerForTop || scorerForBottom) && (
                      <div className="flex items-center justify-between gap-4 mt-2 pt-2 border-t border-text-primary/5 mx-2">
                        {scorerForTop && (
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {scorerForTop.headshot_url && (
                              <img src={scorerForTop.headshot_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="text-xs text-text-secondary font-semibold truncate">{scorerForTop.player_name}</div>
                              <div className="text-[11px] text-text-muted">{scorerForTop.points} pts</div>
                            </div>
                          </div>
                        )}
                        {scorerForBottom && (
                          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                            <div className="min-w-0 text-right">
                              <div className="text-xs text-text-secondary font-semibold truncate">{scorerForBottom.player_name}</div>
                              <div className="text-[11px] text-text-muted">{scorerForBottom.points} pts</div>
                            </div>
                            {scorerForBottom.headshot_url && (
                              <img src={scorerForBottom.headshot_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                            )}
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
      </div>
    </div>
  )
}
