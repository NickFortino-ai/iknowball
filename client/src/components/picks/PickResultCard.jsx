import { useState } from 'react'
import { formatOdds } from '../../lib/scoring'
import { getTeamLogoUrl } from '../../lib/teamLogos'

function TeamLogo({ team, sportKey }) {
  const [err, setErr] = useState(false)
  const url = getTeamLogoUrl(team, sportKey)
  if (!url || err) return null
  return <img src={url} alt="" className="w-10 h-10 object-contain mx-auto mb-1" onError={() => setErr(true)} />
}

// Reusable pick result display: matchup card + user pick + ALL PICKS bar
// Used in PickDetailModal and feed FlexTargetCard
export default function PickResultCard({ pick, game, totalCounts }) {
  if (!pick || !game) return null

  const isCorrect = pick.is_correct === true
  const isLost = pick.is_correct === false
  const isPush = pick.is_correct === null && pick.status === 'settled'
  const isSettled = pick.status === 'settled'
  const isLive = game.status === 'live' || game.status === 'in_progress'
  const pickedTeam = pick.picked_team === 'home' ? game.home_team : game.away_team

  const borderColor = isCorrect ? 'border-correct'
    : isLost ? 'border-incorrect'
    : isLive ? 'border-accent'
    : 'border-text-primary/20'

  const ptsColor = pick.points_earned > 0 ? 'text-correct'
    : pick.points_earned < 0 ? 'text-incorrect'
    : 'text-text-muted'

  const awayScore = game.away_score ?? game.live_away_score
  const homeScore = game.home_score ?? game.live_home_score
  const hasScores = awayScore != null && homeScore != null

  const totalPicks = (totalCounts?.home || 0) + (totalCounts?.away || 0)
  const homePct = totalPicks > 0 ? Math.round(((totalCounts.home || 0) / totalPicks) * 100) : 0
  const awayPct = totalPicks > 0 ? 100 - homePct : 0

  return (
    <div className={`rounded-xl border ${borderColor} overflow-hidden`}>
      {/* Matchup */}
      <div className="p-4">
        <div className="text-xs text-text-muted uppercase tracking-wider mb-1">{game.sports?.name || ''}</div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-center flex-1 min-w-0">
            <TeamLogo team={game.away_team} sportKey={game.sports?.key} />
            <div className="text-sm font-semibold text-text-primary truncate">{game.away_team}</div>
            {hasScores && <div className="text-2xl font-display font-bold text-text-primary mt-0.5">{awayScore}</div>}
          </div>
          <div className="text-xs text-text-muted font-semibold shrink-0">
            {isSettled ? 'FINAL' : isLive ? 'LIVE' : '@'}
          </div>
          <div className="text-center flex-1 min-w-0">
            <TeamLogo team={game.home_team} sportKey={game.sports?.key} />
            <div className="text-sm font-semibold text-text-primary truncate">{game.home_team}</div>
            {hasScores && <div className="text-2xl font-display font-bold text-text-primary mt-0.5">{homeScore}</div>}
          </div>
        </div>
      </div>

      {/* Pick row */}
      <div className="border-t border-text-primary/10 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
              isCorrect ? 'bg-correct/20 text-correct' : isLost ? 'bg-incorrect/20 text-incorrect' : 'bg-text-muted/20 text-text-muted'
            }`}>
              {isPush ? '—' : isCorrect ? '✓' : isLost ? '✗' : '?'}
            </span>
            <span className="text-sm text-text-secondary">Picked</span>
            <span className="text-sm font-semibold text-text-primary truncate">{pickedTeam}</span>
          </div>
          {pick.odds_at_pick != null && (
            <span className="text-xs text-text-muted shrink-0">{formatOdds(pick.odds_at_pick)}</span>
          )}
        </div>
        {isSettled && pick.points_earned != null && (
          <div className={`text-center text-lg font-display font-bold mt-2 ${ptsColor}`}>
            {pick.points_earned > 0 ? '+' : ''}{pick.points_earned} pts
            {pick.multiplier > 1 && <span className="text-xs text-accent ml-2">({pick.multiplier}x)</span>}
          </div>
        )}
      </div>

      {/* ALL PICKS bar */}
      {totalPicks > 0 && (
        <div className="border-t border-text-primary/10 px-4 py-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider text-center mb-2">All Picks</div>
          <div className="flex justify-between text-xs font-semibold mb-1">
            <span className="text-text-primary truncate max-w-[45%]">{game.away_team} {awayPct}%</span>
            <span className="text-text-primary truncate max-w-[45%] text-right">{homePct}% {game.home_team}</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-bg-primary/50">
            {awayPct > 0 && <div className="bg-accent" style={{ width: `${awayPct}%` }} />}
            {homePct > 0 && <div className="bg-text-secondary/50" style={{ width: `${homePct}%` }} />}
          </div>
          <div className="flex justify-between text-[10px] text-text-muted mt-1">
            <span>{totalCounts.away || 0}</span>
            <span>{totalCounts.home || 0}</span>
          </div>
        </div>
      )}
    </div>
  )
}
