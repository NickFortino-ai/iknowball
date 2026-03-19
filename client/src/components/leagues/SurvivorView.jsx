import { useState, useMemo, useEffect } from 'react'
import { useSurvivorBoard, useUsedTeams, useSubmitSurvivorPick, useDeleteSurvivorPick } from '../../hooks/useLeagues'
import { useGames } from '../../hooks/useGames'
import { useAuthStore } from '../../stores/authStore'
import LoadingSpinner from '../ui/LoadingSpinner'
import EmptyState from '../ui/EmptyState'
import { toast } from '../ui/Toast'
import { formatOdds } from '../../lib/scoring'
import Avatar from '../ui/Avatar'

const STATUS_STYLES = {
  survived: 'bg-correct/20 text-correct',
  eliminated: 'bg-incorrect/20 text-incorrect',
  locked: 'bg-accent/20 text-accent',
  pending: 'bg-tier-hof/20 text-tier-hof',
}

export default function SurvivorView({ league }) {
  const isDaily = league.settings?.pick_frequency === 'daily'
  const periodLabel = isDaily ? 'Day' : 'Week'
  const { data: board, isLoading } = useSurvivorBoard(league.id)
  const { data: usedTeams } = useUsedTeams(league.id)
  const { data: games } = useGames(league.sport === 'all' ? null : league.sport, 'upcoming', isDaily ? 2 : 3)
  const submitPick = useSubmitSurvivorPick()
  const deletePick = useDeleteSurvivorPick()
  const session = useAuthStore((s) => s.session)
  const currentUserId = session?.user?.id
  const [showPickForm, setShowPickForm] = useState(false)
  const [localPickTeam, setLocalPickTeam] = useState(null)

  const currentWeek = league.current_week
  // Use pick_week from board (advances past locked picks) with fallback to current_week
  const pickWeek = board?.pick_week || currentWeek
  const usedTeamSet = useMemo(() => new Set(usedTeams || []), [usedTeams])
  const currentPickTeam = localPickTeam || board?.current_pick?.team_name

  // Winner detection
  const isWinner = board?.survivor_winner?.user_id === currentUserId
  const leagueCompleted = league.status === 'completed'

  // If user hasn't picked for the current period, only show games within that period.
  // Once they've picked, show all upcoming games so they can pick a day ahead.
  const pickWeekGames = useMemo(() => {
    if (!games?.length) return []
    if (!board?.user_has_picked && pickWeek?.starts_at && pickWeek?.ends_at) {
      return games.filter((g) => g.starts_at >= pickWeek.starts_at && g.starts_at <= pickWeek.ends_at)
    }
    return games
  }, [games, pickWeek, board?.user_has_picked])

  // Detect when user has used every available team in current period (pool expansion)
  const poolExpanded = useMemo(() => {
    if (!pickWeekGames?.length || !usedTeamSet.size) return false
    return pickWeekGames.every(
      (g) => usedTeamSet.has(g.home_team) && usedTeamSet.has(g.away_team)
    )
  }, [pickWeekGames, usedTeamSet])

  async function handlePick(gameId, pickedTeam) {
    if (!pickWeek) return
    const game = pickWeekGames.find((g) => g.id === gameId)
    const teamName = pickedTeam === 'home' ? game?.home_team : game?.away_team
    try {
      await submitPick.mutateAsync({
        leagueId: league.id,
        weekId: pickWeek.id,
        gameId,
        pickedTeam,
      })
      setLocalPickTeam(teamName)
      toast('Survivor pick submitted!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to submit pick', 'error')
    }
  }

  // Clear local pick when board refreshes with server data
  useEffect(() => {
    if (board?.current_pick?.team_name) setLocalPickTeam(null)
  }, [board?.current_pick?.team_name])

  // Auto-expand pick form if user hasn't picked yet
  useEffect(() => {
    if (board && pickWeek && !board.user_has_picked) {
      setShowPickForm(true)
    }
  }, [board, pickWeek])

  if (isLoading) return <LoadingSpinner />
  if (!board) return <EmptyState title="No data" message="Board not available" />

  return (
    <div>
      {/* Status summary */}
      <div className="flex gap-4 mb-4">
        <div className="bg-bg-card rounded-xl border border-border p-3 flex-1 text-center">
          <div className="font-display text-2xl text-correct">
            {board.members?.filter((m) => m.is_alive).length || 0}
          </div>
          <div className="text-xs text-text-muted">Alive</div>
        </div>
        <div className="bg-bg-card rounded-xl border border-border p-3 flex-1 text-center">
          <div className="font-display text-2xl text-incorrect">
            {board.members?.filter((m) => !m.is_alive).length || 0}
          </div>
          <div className="text-xs text-text-muted">Eliminated</div>
        </div>
        <div className="bg-bg-card rounded-xl border border-border p-3 flex-1 text-center">
          <div className="font-display text-2xl text-text-primary">
            {board.display_period_number || currentWeek?.week_number || '—'}
          </div>
          <div className="text-xs text-text-muted">{periodLabel}</div>
        </div>
      </div>

      {/* Winner badge */}
      {isWinner && board.survivor_winner && (
        <div className="bg-bg-card rounded-xl border border-correct/30 px-4 py-3 mb-4 flex items-center gap-2">
          <span className="text-lg">{'\uD83D\uDC51'}</span>
          <span className="text-sm text-correct font-semibold">You won this league! +{board.survivor_winner.points} pts</span>
        </div>
      )}

      {/* No active period */}
      {!pickWeek && (
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-4 text-center">
          <p className="text-sm text-text-secondary">No active {periodLabel.toLowerCase()} right now.</p>
          <p className="text-xs text-text-muted mt-1">Picks will be available when the next {periodLabel.toLowerCase()} begins.</p>
        </div>
      )}

      {/* Make pick button */}
      {pickWeek && !leagueCompleted && (
        <button
          onClick={() => setShowPickForm(!showPickForm)}
          className={`w-full py-3 rounded-xl font-display transition-colors mb-4 ${
            board.user_has_picked
              ? 'bg-bg-card-hover text-text-secondary hover:bg-bg-card border border-border'
              : 'bg-accent text-white hover:bg-accent-hover'
          }`}
        >
          {showPickForm
            ? 'Hide Pick Form'
            : board.user_has_picked
              ? `Edit ${periodLabel} ${board.display_period_number || pickWeek.week_number} Pick`
              : `Make ${periodLabel} ${board.display_period_number || pickWeek.week_number} Pick`}
        </button>
      )}

      {/* Pick form */}
      {showPickForm && !leagueCompleted && pickWeekGames.length === 0 && (
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
          <p className="text-sm text-text-muted text-center">No upcoming games available right now. Check back closer to game time.</p>
        </div>
      )}
      {showPickForm && !leagueCompleted && pickWeekGames.length > 0 && (() => {
        // Group games by date
        const grouped = pickWeekGames.reduce((acc, game) => {
          const d = new Date(game.starts_at)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          if (!acc[key]) acc[key] = []
          acc[key].push(game)
          return acc
        }, {})
        const dateKeys = Object.keys(grouped).sort()

        return (
          <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
            {poolExpanded && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 mb-3 text-center">
                <div className="text-xs text-text-secondary font-semibold mb-0.5">Pool Expanded</div>
                <div className="text-[11px] text-text-muted leading-snug">
                  You've used every available team — all teams are back in play!
                </div>
              </div>
            )}
            <h3 className="font-display text-sm text-text-secondary mb-3">Pick a Team</h3>
            <div className="space-y-3">
              {dateKeys.map((dateKey) => {
                const d = new Date(dateKey + 'T12:00:00')
                const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                return (
                  <div key={dateKey}>
                    <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">{label}</div>
                    <div className="space-y-2">
                      {grouped[dateKey].map((game) => {
                        const homeUsed = !poolExpanded && usedTeamSet.has(game.home_team)
                        const awayUsed = !poolExpanded && usedTeamSet.has(game.away_team)
                        const awayPicked = currentPickTeam === game.away_team
                        const homePicked = currentPickTeam === game.home_team

                        return (
                          <div key={game.id} className="flex items-center gap-2">
                            <button
                              onClick={() => handlePick(game.id, 'away')}
                              disabled={awayUsed || submitPick.isPending}
                              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors ${
                                awayUsed
                                  ? 'bg-bg-primary text-text-muted line-through cursor-not-allowed'
                                  : awayPicked
                                    ? 'bg-accent/20 text-accent ring-2 ring-accent'
                                    : 'bg-bg-card-hover text-text-primary hover:bg-accent/20 hover:text-accent'
                              }`}
                            >
                              {game.away_team}
                              {game.away_odds != null && (
                                <span className="ml-1.5 text-xs font-normal text-text-muted">{formatOdds(game.away_odds)}</span>
                              )}
                            </button>
                            <span className="text-xs text-text-muted">@</span>
                            <button
                              onClick={() => handlePick(game.id, 'home')}
                              disabled={homeUsed || submitPick.isPending}
                              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors ${
                                homeUsed
                                  ? 'bg-bg-primary text-text-muted line-through cursor-not-allowed'
                                  : homePicked
                                    ? 'bg-accent/20 text-accent ring-2 ring-accent'
                                    : 'bg-bg-card-hover text-text-primary hover:bg-accent/20 hover:text-accent'
                              }`}
                            >
                              {game.home_team}
                              {game.home_odds != null && (
                                <span className="ml-1.5 text-xs font-normal text-text-muted">{formatOdds(game.home_odds)}</span>
                              )}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Member board */}
      <div className="space-y-2">
        {board.members?.map((m) => (
          <div
            key={m.id}
            className={`bg-bg-card rounded-xl border px-4 py-3 ${
              m.is_alive ? 'border-border' : 'border-incorrect/30 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar user={m.users} size="md" />
                <span className="font-semibold text-sm truncate">
                  {m.users?.display_name || m.users?.username}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {m.lives_remaining > 0 && m.is_alive && (
                  <span className="text-xs text-text-muted">
                    {m.lives_remaining} {m.lives_remaining === 1 ? 'life' : 'lives'}
                  </span>
                )}
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                  m.is_alive ? 'bg-correct/20 text-correct' : 'bg-incorrect/20 text-incorrect'
                }`}>
                  {m.is_alive ? 'Alive' : `Out ${isDaily ? 'Day' : 'Wk'} ${m.eliminated_week}`}
                </span>
              </div>
            </div>
            {/* Pick history */}
            {m.picks?.length > 0 && (
              <div className="flex gap-1 overflow-x-auto scrollbar-hide" ref={(el) => { if (el) el.scrollLeft = el.scrollWidth }}>
                {m.picks.map((p) => {
                  const isLocked = p.team_name === 'Locked'
                  const isPostElimination = !m.is_alive && m.eliminated_week != null && p.league_weeks?.week_number > m.eliminated_week
                  const chipStyle = isLocked
                    ? 'bg-white/5 text-text-muted italic'
                    : isPostElimination
                      ? 'bg-white/5 text-text-muted opacity-50'
                      : STATUS_STYLES[p.status] || 'bg-bg-primary text-text-muted'
                  const tooltip = isLocked
                    ? `${periodLabel} ${p.league_weeks?.week_number}: Hidden`
                    : isPostElimination
                      ? `${periodLabel} ${p.league_weeks?.week_number}: ${p.team_name} (after elimination)`
                      : `${periodLabel} ${p.league_weeks?.week_number}: ${p.team_name}`
                  return (
                    <span
                      key={p.id}
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${chipStyle}`}
                      title={tooltip}
                    >
                      {isLocked ? '???' : p.team_name?.split(' ').pop()}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
