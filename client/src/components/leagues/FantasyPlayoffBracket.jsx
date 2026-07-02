import { useMemo } from 'react'
import Avatar from '../ui/Avatar'
import LoadingSpinner from '../ui/LoadingSpinner'
import { useFantasyPlayoffBracket } from '../../hooks/useLeagues'

// Column-per-round bracket layout. Main (winners) bracket on top,
// consolation bracket below. Auto-adapts to 4, 6, or 8-team playoffs
// based on the matchups the server returns.
//
// Each round column shows a vertical stack of matchup cards. A card
// renders two team rows (home / away) with seed, name, and points.
// Winner highlighted in green.

function roundLabel(roundNumber, totalRounds, playoffTeams) {
  // Championship is always the final round
  if (roundNumber === totalRounds) return 'Finals'
  if (roundNumber === totalRounds - 1) return 'Semifinals'
  // playoffTeams = 8 with 3 rounds → round 1 is Quarterfinals
  // playoffTeams = 6 with 3 rounds → round 1 is Wild Card
  if (roundNumber === 1) {
    if (playoffTeams === 6) return 'Wild Card'
    return 'Quarterfinals'
  }
  return `Round ${roundNumber}`
}

function MatchupCard({ matchup }) {
  const { home, away, home_points, away_points, seed_home, seed_away, status, is_consolation } = matchup
  const finalized = status === 'completed'
  const homeWon = finalized && Number(home_points) > Number(away_points)
  const awayWon = finalized && Number(away_points) > Number(home_points)
  const tie = finalized && Number(home_points) === Number(away_points)

  const rowClass = (isWinner, isEmpty) =>
    `flex items-center gap-1.5 px-2 py-1.5 ${
      isEmpty ? 'opacity-40' : ''
    } ${isWinner ? 'text-correct font-semibold' : 'text-text-primary'}`

  const emptyPlaceholder = (seed) => (
    <div className="flex items-center gap-1.5 px-2 py-1.5 opacity-40">
      <span className="text-[10px] text-text-muted w-5 text-right tabular-nums">{seed ? `#${seed}` : ''}</span>
      <div className="w-5 h-5 rounded-full bg-bg-secondary shrink-0" />
      <span className="text-[11px] italic text-text-muted flex-1 truncate">TBD</span>
    </div>
  )

  return (
    <div className={`rounded-lg border ${is_consolation ? 'border-text-primary/10 bg-bg-primary/40' : 'border-text-primary/20 bg-bg-primary'} min-w-[170px] max-w-[210px] overflow-hidden`}>
      {home ? (
        <div className={rowClass(homeWon || tie, false)}>
          <span className="text-[10px] text-text-muted w-5 text-right tabular-nums">{seed_home ? `#${seed_home}` : ''}</span>
          <Avatar user={home} size="xs" />
          <span className="text-[11px] flex-1 truncate">{home.display_name || home.username}</span>
          {finalized && (
            <span className="text-[11px] tabular-nums shrink-0">{Number(home_points).toFixed(1)}</span>
          )}
        </div>
      ) : emptyPlaceholder(seed_home)}
      <div className="border-t border-text-primary/10" />
      {away ? (
        <div className={rowClass(awayWon || tie, false)}>
          <span className="text-[10px] text-text-muted w-5 text-right tabular-nums">{seed_away ? `#${seed_away}` : ''}</span>
          <Avatar user={away} size="xs" />
          <span className="text-[11px] flex-1 truncate">{away.display_name || away.username}</span>
          {finalized && (
            <span className="text-[11px] tabular-nums shrink-0">{Number(away_points).toFixed(1)}</span>
          )}
        </div>
      ) : emptyPlaceholder(seed_away)}
    </div>
  )
}

function BracketColumn({ label, matchups }) {
  if (!matchups.length) return null
  return (
    <div className="flex flex-col gap-3 shrink-0">
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold text-center">
        {label}
      </div>
      <div className="flex flex-col gap-3 justify-around min-h-full">
        {matchups.map((m) => (
          <MatchupCard key={m.id} matchup={m} />
        ))}
      </div>
    </div>
  )
}

export default function FantasyPlayoffBracket({ league }) {
  const { data, isLoading } = useFantasyPlayoffBracket(league.id)
  const matchups = data?.matchups || []
  const settings = data?.settings

  const grouped = useMemo(() => {
    const main = {}
    const consolation = {}
    for (const m of matchups) {
      const bucket = m.is_consolation ? consolation : main
      if (!bucket[m.round]) bucket[m.round] = []
      bucket[m.round].push(m)
    }
    return { main, consolation }
  }, [matchups])

  if (isLoading) return <LoadingSpinner />

  if (!matchups.length) {
    return (
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-8 text-center">
        <div className="font-display text-lg text-text-primary mb-2">Playoffs haven't started yet</div>
        <p className="text-sm text-text-secondary">
          The bracket will appear here once the regular season wraps up.
        </p>
      </div>
    )
  }

  const totalRounds = Math.max(...matchups.map((m) => m.round || 0))
  const playoffTeams = settings?.playoff_teams || 4
  const mainRounds = Object.keys(grouped.main).map(Number).sort((a, b) => a - b)
  const consolationRounds = Object.keys(grouped.consolation).map(Number).sort((a, b) => a - b)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-base text-text-primary mb-3">Winners Bracket</h3>
        <div className="overflow-x-auto -mx-4 px-4 pb-2">
          <div className="flex gap-6 items-stretch min-w-max">
            {mainRounds.map((r) => (
              <BracketColumn
                key={`m-${r}`}
                label={roundLabel(r, totalRounds, playoffTeams)}
                matchups={grouped.main[r]}
              />
            ))}
          </div>
        </div>
      </div>

      {consolationRounds.length > 0 && (
        <div>
          <h3 className="font-display text-sm text-text-secondary mb-3">Consolation</h3>
          <div className="overflow-x-auto -mx-4 px-4 pb-2">
            <div className="flex gap-6 items-stretch min-w-max">
              {consolationRounds.map((r) => (
                <BracketColumn
                  key={`c-${r}`}
                  label={roundLabel(r, totalRounds, playoffTeams)}
                  matchups={grouped.consolation[r]}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-text-muted text-center">
        Higher seed advances on a tie. Consolation seeds 5–8 (in 8-team leagues) settled by total points.
      </p>
    </div>
  )
}
