import { usePlayoffBracket } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import Avatar from '../ui/Avatar'
import { SkeletonCard } from '../ui/Skeleton'

const ROUND_LABELS = {
  4: { 1: 'Semifinals', 2: 'Championship' },
  6: { 1: 'Wild Card', 2: 'Semifinals', 3: 'Championship' },
  8: { 1: 'Quarterfinals', 2: 'Semifinals', 3: 'Championship' },
}

function BracketMatchup({ matchup, myId }) {
  if (!matchup) return null

  const isCompleted = matchup.status === 'completed'
  const hasUsers = matchup.home_user && matchup.away_user
  const homeWon = isCompleted && Number(matchup.home_points) > Number(matchup.away_points)
  const awayWon = isCompleted && Number(matchup.away_points) > Number(matchup.home_points)

  function TeamSlot({ user, seed, points, isWinner, isLoser }) {
    const isMe = user?.id === myId
    if (!user) {
      return (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-bg-primary/30">
          <span className="text-xs font-bold text-text-muted w-5 text-center">—</span>
          <span className="text-sm text-text-muted italic">TBD</span>
        </div>
      )
    }
    return (
      <div className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${
        isWinner ? 'bg-correct/10' : isLoser ? 'bg-bg-primary/20 opacity-60' : 'bg-bg-primary/50'
      }`}>
        <span className={`text-[10px] font-bold w-5 text-center ${isMe ? 'text-accent' : 'text-text-muted'}`}>
          {seed || '—'}
        </span>
        <Avatar user={user} size="xs" />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold truncate ${isWinner ? 'text-correct' : isMe ? 'text-accent' : 'text-text-primary'}`}>
            {user.fantasy_team_name || user.display_name || user.username}
          </div>
        </div>
        {points != null && (
          <span className={`text-sm font-display tabular-nums ${isWinner ? 'text-correct' : 'text-text-primary'}`}>
            {Number(points).toFixed(1)}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={`rounded-lg border overflow-hidden ${
      matchup.home_user?.id === myId || matchup.away_user?.id === myId
        ? 'border-accent/40'
        : 'border-text-primary/20'
    }`}>
      <TeamSlot
        user={matchup.home_user}
        seed={matchup.seed_home}
        points={hasUsers ? matchup.home_points : null}
        isWinner={homeWon}
        isLoser={awayWon}
      />
      <div className="border-t border-text-primary/10" />
      <TeamSlot
        user={matchup.away_user}
        seed={matchup.seed_away}
        points={hasUsers ? matchup.away_points : null}
        isWinner={awayWon}
        isLoser={homeWon}
      />
    </div>
  )
}

export default function PlayoffBracket({ leagueId }) {
  const { profile } = useAuth()
  const { data, isLoading } = usePlayoffBracket(leagueId)

  if (isLoading) return <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>
  if (!data?.matchups?.length) return <div className="text-center py-8 text-sm text-text-muted">Playoff bracket not yet generated.</div>

  const { matchups, playoff_teams } = data
  const labels = ROUND_LABELS[playoff_teams] || {}

  // Separate main bracket and consolation
  const mainMatchups = matchups.filter(m => !m.is_consolation)
  const consolMatchups = matchups.filter(m => m.is_consolation)

  // Group by round
  const mainByRound = {}
  for (const m of mainMatchups) {
    if (!mainByRound[m.round]) mainByRound[m.round] = []
    mainByRound[m.round].push(m)
  }
  const consolByRound = {}
  for (const m of consolMatchups) {
    if (!consolByRound[m.round]) consolByRound[m.round] = []
    consolByRound[m.round].push(m)
  }

  const rounds = Object.keys(mainByRound).map(Number).sort((a, b) => a - b)

  return (
    <div className="space-y-6">
      {/* Main bracket */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-3">Playoff Bracket</h3>
        <div className="overflow-x-auto">
          <div className="flex gap-6 min-w-max pb-2">
            {rounds.map((round) => (
              <div key={round} className="flex-shrink-0" style={{ width: `${Math.max(200, 240 - round * 20)}px` }}>
                <div className="text-xs font-semibold text-accent mb-2 text-center">
                  {labels[round] || `Round ${round}`}
                </div>
                <div className="space-y-3 flex flex-col justify-around h-full">
                  {mainByRound[round].map((m) => (
                    <BracketMatchup key={m.id} matchup={m} myId={profile?.id} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Consolation bracket */}
      {Object.keys(consolByRound).length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-3">Consolation</h3>
          <div className="overflow-x-auto">
            <div className="flex gap-6 min-w-max pb-2">
              {Object.keys(consolByRound).map(Number).sort((a, b) => a - b).map((round) => (
                <div key={round} className="flex-shrink-0 w-[220px]">
                  <div className="text-xs font-semibold text-text-muted mb-2 text-center">
                    {round === Math.max(...Object.keys(consolByRound).map(Number)) ? '3rd Place' : `Consolation R${round}`}
                  </div>
                  <div className="space-y-3">
                    {consolByRound[round].map((m) => (
                      <BracketMatchup key={m.id} matchup={m} myId={profile?.id} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
