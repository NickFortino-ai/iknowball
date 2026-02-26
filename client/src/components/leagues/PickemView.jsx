import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import TierBadge from '../ui/TierBadge'
import { getTier } from '../../lib/scoring'
import EmptyState from '../ui/EmptyState'
import GameCard from '../picks/GameCard'
import { toast } from '../ui/Toast'
import {
  useLeagueWeeks,
  useLeaguePicks,
  useLeagueGames,
  useSubmitLeaguePick,
  useDeleteLeaguePick,
} from '../../hooks/useLeagues'
import { useMyPicks } from '../../hooks/usePicks'

function StandingsTable({ standings }) {
  if (!standings?.length) {
    return <EmptyState title="No standings yet" message="Make some picks to see standings" />
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-text-muted text-xs">
            <th className="text-left px-4 py-3 font-medium">#</th>
            <th className="text-left px-4 py-3 font-medium">Player</th>
            <th className="text-right px-4 py-3 font-medium">Record</th>
            <th className="text-right px-4 py-3 font-medium">Points</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.user_id} className="border-b border-border last:border-0 hover:bg-bg-card-hover">
              <td className="px-4 py-3 text-text-muted font-semibold">{s.rank}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <TierBadge tier={getTier(s.user?.total_points || 0).name} size="xs" />
                  <span className="font-semibold truncate">
                    {s.user?.display_name || s.user?.username}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-right text-text-muted">
                {s.correct_picks}W-{s.total_picks - s.correct_picks}L
              </td>
              <td className="px-4 py-3 text-right font-semibold text-accent">{s.total_points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MiniLeaderboard({ standings }) {
  if (!standings?.length) return null
  const top3 = standings.slice(0, 3)

  return (
    <div className="bg-bg-card rounded-xl border border-border p-3 mt-6">
      <div className="text-xs font-semibold text-text-muted mb-2">Leaderboard</div>
      <div className="space-y-1.5">
        {top3.map((s) => (
          <div key={s.user_id} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-text-muted font-semibold w-4">{s.rank}</span>
              <span className="font-semibold truncate">
                {s.user?.display_name || s.user?.username}
              </span>
            </div>
            <span className="font-semibold text-accent">{s.total_points}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LeaguePicksView({ league, standings }) {
  const { data: weeks } = useLeagueWeeks(league.id)
  const [selectedWeekId, setSelectedWeekId] = useState(null)
  const scrollRef = useRef(null)

  // Auto-select current week
  useEffect(() => {
    if (!weeks?.length || selectedWeekId) return
    const now = new Date().toISOString()
    const current = weeks.find((w) => w.starts_at <= now && w.ends_at >= now)
    setSelectedWeekId(current?.id || weeks[weeks.length - 1]?.id)
  }, [weeks, selectedWeekId])

  const selectedWeek = weeks?.find((w) => w.id === selectedWeekId)
  const isDaily = league.settings?.pick_frequency === 'daily'

  const { data: leaguePicks } = useLeaguePicks(league.id, selectedWeekId)
  const { data: games, isLoading: gamesLoading } = useLeagueGames(league.id, selectedWeekId)
  const { data: globalPicks } = useMyPicks()

  const submitPick = useSubmitLeaguePick()
  const deletePick = useDeleteLeaguePick()

  // Build lookup of league picks by game_id
  const picksByGame = {}
  for (const pick of leaguePicks || []) {
    picksByGame[pick.game_id] = pick
  }

  // Build lookup of global picks by game_id
  const globalPicksByGame = {}
  for (const pick of globalPicks || []) {
    globalPicksByGame[pick.game_id] = pick
  }

  const gamesPerWeek = league.settings?.games_per_week
  const pickCount = (leaguePicks || []).length

  async function handlePick(gameId, side) {
    // Check if user has a global pick on same game + same team
    const globalPick = globalPicksByGame[gameId]
    if (globalPick && globalPick.picked_team === side) {
      if (!window.confirm(
        "You've already picked this game globally. Double down? Points will count in both places."
      )) {
        return
      }
    }

    try {
      await submitPick.mutateAsync({
        leagueId: league.id,
        weekId: selectedWeekId,
        gameId,
        pickedTeam: side,
      })
    } catch (err) {
      toast(err.message || 'Failed to submit pick', 'error')
    }
  }

  async function handleUndoPick(gameId) {
    try {
      await deletePick.mutateAsync({
        leagueId: league.id,
        gameId,
      })
    } catch (err) {
      toast(err.message || 'Failed to undo pick', 'error')
    }
  }

  function formatWeekLabel(week) {
    if (isDaily) {
      const d = new Date(week.starts_at)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    }
    return `Wk ${week.week_number}`
  }

  return (
    <div>
      {/* Period navigator */}
      {weeks?.length > 0 && (
        <div className="mb-4 -mx-1 overflow-x-auto" ref={scrollRef}>
          <div className="flex gap-1.5 px-1 pb-1">
            {weeks.map((week) => (
              <button
                key={week.id}
                onClick={() => setSelectedWeekId(week.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  selectedWeekId === week.id
                    ? 'bg-accent text-white'
                    : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
                }`}
              >
                {formatWeekLabel(week)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pick counter */}
      {gamesPerWeek && (
        <div className="bg-bg-card rounded-xl border border-border p-3 mb-4 text-center">
          <span className="text-sm font-semibold text-accent">{pickCount}</span>
          <span className="text-xs text-text-muted">/{gamesPerWeek} picks this {isDaily ? 'day' : 'week'}</span>
        </div>
      )}

      {/* Games list */}
      {gamesLoading ? (
        <div className="text-center text-text-muted text-sm py-8">Loading games...</div>
      ) : !games?.length ? (
        <EmptyState title="No games" message={`No games scheduled for this ${isDaily ? 'day' : 'week'}`} />
      ) : (
        <div className="space-y-3">
          {games.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              userPick={picksByGame[game.id]}
              onPick={handlePick}
              onUndoPick={handleUndoPick}
              isSubmitting={submitPick.isPending || deletePick.isPending}
            />
          ))}
        </div>
      )}

      {/* Mini leaderboard */}
      <MiniLeaderboard standings={standings} />
    </div>
  )
}

export default function PickemView({ league, standings, mode }) {
  // New league picks mode
  if (league.use_league_picks && mode === 'picks') {
    return <LeaguePicksView league={league} standings={standings} />
  }

  // Standings mode (both legacy and new)
  if (mode === 'standings' || !league.use_league_picks) {
    const gamesPerWeek = league.settings?.games_per_week
    const useSubmissionOdds = league.settings?.lock_odds_at === 'submission'

    return (
      <div>
        {gamesPerWeek && (
          <div className="bg-bg-card rounded-xl border border-border p-3 mb-4 text-center">
            <span className="text-xs text-text-muted">Pick </span>
            <span className="text-sm font-semibold text-accent">{gamesPerWeek}</span>
            <span className="text-xs text-text-muted"> games per {league.settings?.pick_frequency === 'daily' ? 'day' : 'week'}</span>
          </div>
        )}

        {useSubmissionOdds && (
          <div className="bg-bg-card rounded-xl border border-border p-3 mb-4 text-center">
            <span className="text-xs text-text-muted">Odds locked </span>
            <span className="text-sm font-semibold text-accent">at submission</span>
          </div>
        )}

        {!league.use_league_picks && (
          <div className="bg-bg-card rounded-xl border border-border p-3 mb-4 text-center text-xs text-text-muted">
            Your regular picks on the{' '}
            <Link to="/picks" className="text-accent hover:underline">Picks page</Link>
            {' '}automatically count in this league
          </div>
        )}

        <StandingsTable standings={standings} />
      </div>
    )
  }

  return null
}
