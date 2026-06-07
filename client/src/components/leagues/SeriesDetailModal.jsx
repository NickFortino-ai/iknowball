import { useState, useEffect } from 'react'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'
import { useSeriesGames } from '../../hooks/useLeagues'

function TeamLogo({ team, sportKey, className }) {
  const [src, setSrc] = useState(() => getTeamLogoUrl(team, sportKey))
  const [hidden, setHidden] = useState(false)
  useEffect(() => { setSrc(getTeamLogoUrl(team, sportKey)); setHidden(false) }, [team, sportKey])
  if (!src || hidden) return null
  return <img src={src} alt="" className={`object-contain ${className}`} onError={() => {
    const fallback = getTeamLogoFallbackUrl(team, sportKey)
    if (fallback && fallback !== src) setSrc(fallback)
    else setHidden(true)
  }} />
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{
        paddingTop: 'max(1.5rem, calc(3.5rem + env(safe-area-inset-top) + 1rem))',
        paddingBottom: 'max(1.5rem, calc(3.5rem + env(safe-area-inset-bottom) + 1rem))',
      }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-bg-primary border border-text-primary/20 rounded-2xl w-full sm:max-w-md max-h-full overflow-y-auto overscroll-contain"
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
                <span className="text-xs text-text-primary mb-0.5">#{matchup.seed_top} seed</span>
              )}
              <span className="text-sm text-text-primary">{topInfo.city}</span>
              <span className="text-base font-bold text-text-primary">{topInfo.name}</span>
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
              <span className="text-xs text-text-primary text-center">{seriesLabel}</span>
            </div>

            {/* Bottom team */}
            <div className="flex flex-col items-center flex-1 min-w-0">
              <TeamLogo team={teamBottom} sportKey={sportKey} className="w-14 h-14 mb-2" />
              {matchup.seed_bottom != null && (
                <span className="text-xs text-text-primary mb-0.5">#{matchup.seed_bottom} seed</span>
              )}
              <span className="text-sm text-text-primary">{bottomInfo.city}</span>
              <span className="text-base font-bold text-text-primary">{bottomInfo.name}</span>
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
                // Accent-insensitive comparisons — games.home_team can be
                // "Montréal Canadiens" while teamTop / game_top_scorers.team
                // store the normalized "Montreal Canadiens". Strict equality
                // ate the Canadiens top scorer; we'd render a Game 1 score
                // but no leading scorer on the side whose name had an accent.
                const stripAccents = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
                const nHome = stripAccents(game.home_team)
                const nAway = stripAccents(game.away_team)
                const nTop = stripAccents(teamTop)
                const topIsHome = nHome === nTop
                const scoreTop = topIsHome ? game.home_score : game.away_score
                const scoreBottom = topIsHome ? game.away_score : game.home_score
                const topWon = (topIsHome && game.winner === 'home') || (!topIsHome && game.winner === 'away')
                const gameDate = new Date(game.starts_at)

                // Find top scorers for each team in this game. Football
                // games carry up to 3 rows per team (passing/rushing/
                // receiving); NBA + NHL carry a single 'overall' row.
                // Sort by a stable category order so the football rows
                // always read passing → rushing → receiving.
                const topScorers = game.top_scorers || []
                const CATEGORY_ORDER = { passing: 0, rushing: 1, receiving: 2, defensive: 3, overall: 4 }
                const sortScorers = (arr) => [...arr].sort((a, b) =>
                  (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99)
                )
                const homeScorers = sortScorers(topScorers.filter((s) => stripAccents(s.team) === nHome))
                const awayScorers = sortScorers(topScorers.filter((s) => stripAccents(s.team) === nAway))
                const scorersForTop = topIsHome ? homeScorers : awayScorers
                const scorersForBottom = topIsHome ? awayScorers : homeScorers
                const maxRows = Math.max(scorersForTop.length, scorersForBottom.length)

                return (
                  <div
                    key={game.id}
                    className="bg-bg-primary/60 border border-text-primary/10 rounded-lg px-4 py-3"
                  >
                    {/* Game label centered */}
                    <div className="text-center mb-2">
                      <span className="text-sm font-semibold text-text-primary">Game {idx + 1}</span>
                      <span className="text-xs text-text-muted ml-2">
                        {gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>

                    {/* Scores aligned under team headers */}
                    <div className="flex items-center">
                      <div className="flex-1 text-center">
                        <span className={`text-2xl font-bold ${topWon ? 'text-text-primary' : 'text-text-muted opacity-60'}`}>{scoreTop}</span>
                      </div>
                      <span className="text-text-muted text-sm px-2">-</span>
                      <div className="flex-1 text-center">
                        <span className={`text-2xl font-bold ${!topWon ? 'text-text-primary' : 'text-text-muted opacity-60'}`}>{scoreBottom}</span>
                      </div>
                    </div>

                    {/* Top performer rows — 3 stacked for football
                        (passing/rushing/receiving), 1 for NBA/NHL. */}
                    {maxRows > 0 && (
                      <div className="mt-2 pt-2 border-t border-text-primary/5 space-y-2">
                        {Array.from({ length: maxRows }).map((_, rowIdx) => {
                          const topRow = scorersForTop[rowIdx]
                          const bottomRow = scorersForBottom[rowIdx]
                          return (
                            <div key={rowIdx} className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                {topRow && (
                                  <div className="flex items-center gap-2">
                                    {topRow.headshot_url && (
                                      <img src={topRow.headshot_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                      <div className="text-sm text-text-primary font-semibold truncate">{topRow.player_name}</div>
                                      <div className="text-xs text-text-primary truncate">{topRow.stat_line || `${topRow.points} pts`}</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                {bottomRow && (
                                  <div className="flex items-center gap-2 justify-end">
                                    <div className="min-w-0 text-right">
                                      <div className="text-sm text-text-primary font-semibold truncate">{bottomRow.player_name}</div>
                                      <div className="text-xs text-text-primary truncate">{bottomRow.stat_line || `${bottomRow.points} pts`}</div>
                                    </div>
                                    {bottomRow.headshot_url && (
                                      <img src={bottomRow.headshot_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
                                    )}
                                  </div>
                                )}
                              </div>
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
      </div>
    </div>
  )
}
