import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import TierBadge from '../ui/TierBadge'
import { getTier } from '../../lib/scoring'
import EmptyState from '../ui/EmptyState'
import GameCard from '../picks/GameCard'
import InjuryReportModal from '../picks/InjuryReportModal'
import { toast } from '../ui/Toast'
import {
  useLeagueWeeks,
  useLeaguePicks,
  useLeagueGames,
  useSubmitLeaguePick,
  useDeleteLeaguePick,
  useUserLeaguePicks,
} from '../../hooks/useLeagues'
import { useMyPicks } from '../../hooks/usePicks'

const INTEL_SPORTS = new Set(['basketball_nba', 'basketball_wnba', 'americanfootball_nfl'])

function SettledPicksList({ leagueId, userId }) {
  const { data: picks, isLoading } = useUserLeaguePicks(leagueId, userId)

  if (isLoading) {
    return <div className="px-4 py-3 text-xs text-text-muted text-center">Loading picks...</div>
  }

  if (!picks?.length) {
    return <div className="px-4 py-3 text-xs text-text-muted text-center">No settled picks yet</div>
  }

  return (
    <div className="px-4 pb-3 space-y-1.5">
      {picks.map((pick) => {
        const game = pick.games
        const pickedHome = pick.picked_team === 'home'
        const teamName = pickedHome ? game.home_team : game.away_team
        const oppName = pickedHome ? game.away_team : game.home_team
        const teamScore = pickedHome ? game.home_score : game.away_score
        const oppScore = pickedHome ? game.away_score : game.home_score
        const pts = pick.points_earned || 0

        return (
          <div
            key={pick.id}
            className="flex items-center justify-between text-xs bg-bg-page/50 rounded-lg px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pick.is_correct ? 'bg-correct' : 'bg-incorrect'}`} />
              <span className="font-semibold truncate">{teamName}</span>
              {teamScore != null && (
                <span className="text-text-muted">
                  {teamScore}-{oppScore} vs {oppName}
                </span>
              )}
            </div>
            <span className={`font-semibold flex-shrink-0 ml-2 ${pts > 0 ? 'text-correct' : pts < 0 ? 'text-incorrect' : 'text-text-muted'}`}>
              {pts > 0 ? '+' : ''}{pts}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function StandingsTable({ standings, leagueId }) {
  const [expandedUser, setExpandedUser] = useState(null)

  if (!standings?.length) {
    return <EmptyState title="No standings yet" message="Make some picks to see standings" />
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border overflow-hidden text-sm">
      {/* Header */}
      <div className="flex items-center border-b border-border text-text-muted text-xs">
        <span className="px-4 py-3 font-medium w-10">#</span>
        <span className="px-4 py-3 font-medium flex-1">Player</span>
        <span className="px-4 py-3 font-medium text-right">Record</span>
        <span className="px-4 py-3 font-medium text-right w-16">Points</span>
      </div>
      {/* Rows */}
      {standings.map((s, i) => (
        <div key={s.user_id} className={i < standings.length - 1 ? 'border-b border-border' : ''}>
          <button
            onClick={() => setExpandedUser(expandedUser === s.user_id ? null : s.user_id)}
            className="w-full text-left hover:bg-bg-card-hover cursor-pointer transition-colors"
          >
            <div className="flex items-center">
              <span className="px-4 py-3 text-text-muted font-semibold w-10">{s.rank}</span>
              <div className="px-4 py-3 flex-1 min-w-0 flex items-center gap-2">
                <TierBadge tier={getTier(s.user?.total_points || 0).name} size="xs" />
                <span className="font-semibold truncate">
                  {s.user?.display_name || s.user?.username}
                </span>
                <svg
                  className={`w-3.5 h-3.5 text-text-muted transition-transform flex-shrink-0 ${expandedUser === s.user_id ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <span className="px-4 py-3 text-right text-text-muted whitespace-nowrap">
                {s.correct_picks}W-{s.total_picks - s.correct_picks}L
              </span>
              <span className="px-4 py-3 text-right font-semibold text-accent whitespace-nowrap w-16">{s.total_points}</span>
            </div>
          </button>
          {expandedUser === s.user_id && (
            <SettledPicksList leagueId={leagueId} userId={s.user_id} />
          )}
        </div>
      ))}
    </div>
  )
}

function MiniLeaderboard({ standings, leagueId }) {
  const [expandedUser, setExpandedUser] = useState(null)

  if (!standings?.length) return null
  const top3 = standings.slice(0, 3)

  return (
    <div className="bg-bg-card rounded-xl border border-border p-3 mt-6">
      <div className="text-xs font-semibold text-text-muted mb-2">Leaderboard</div>
      <div className="space-y-1">
        {top3.map((s) => (
          <div key={s.user_id}>
            <button
              onClick={() => setExpandedUser(expandedUser === s.user_id ? null : s.user_id)}
              className="w-full flex items-center justify-between text-sm py-1 hover:bg-bg-card-hover rounded-lg px-1 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-text-muted font-semibold w-4">{s.rank}</span>
                <span className="font-semibold truncate">
                  {s.user?.display_name || s.user?.username}
                </span>
                <svg
                  className={`w-3 h-3 text-text-muted transition-transform flex-shrink-0 ${expandedUser === s.user_id ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <span className="font-semibold text-accent">{s.total_points}</span>
            </button>
            {expandedUser === s.user_id && (
              <div className="mt-1">
                <SettledPicksList leagueId={leagueId} userId={s.user_id} />
              </div>
            )}
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

  // Auto-select current week (or nearest upcoming if between periods)
  useEffect(() => {
    if (!weeks?.length || selectedWeekId) return
    const now = new Date().toISOString()
    const current = weeks.find((w) => w.starts_at <= now && w.ends_at >= now)
    if (current) {
      setSelectedWeekId(current.id)
    } else {
      // Between periods (e.g. before 6 AM ET) — pick the nearest upcoming week
      const upcoming = weeks.find((w) => w.starts_at > now)
      setSelectedWeekId(upcoming?.id || weeks[weeks.length - 1]?.id)
    }
  }, [weeks, selectedWeekId])

  const selectedWeek = weeks?.find((w) => w.id === selectedWeekId)
  const isDaily = league.settings?.pick_frequency === 'daily'

  const { data: leaguePicks } = useLeaguePicks(league.id, selectedWeekId)
  const { data: games, isLoading: gamesLoading } = useLeagueGames(league.id, selectedWeekId)
  const { data: globalPicks } = useMyPicks()
  const submitPick = useSubmitLeaguePick()
  const deletePick = useDeleteLeaguePick()
  const [injuryGameId, setInjuryGameId] = useState(null)

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
    // Warn if user already has a global pick on the same game + team
    const globalPick = globalPicksByGame[gameId]
    if (globalPick && globalPick.picked_team === side) {
      if (!window.confirm(
        "You've already picked this game globally. This league's points also count toward your global score when the league ends. Continue?"
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
              hasInjuryData={INTEL_SPORTS.has(game.sports?.key)}
              onInjuryClick={() => setInjuryGameId(game.id)}
            />
          ))}
        </div>
      )}

      {/* Mini leaderboard */}
      <MiniLeaderboard standings={standings} leagueId={league.id} />

      <InjuryReportModal gameId={injuryGameId} onClose={() => setInjuryGameId(null)} />
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

        <StandingsTable standings={standings} leagueId={league.id} />
      </div>
    )
  }

  return null
}
