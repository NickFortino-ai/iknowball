import { useState, useMemo, useEffect } from 'react'
import { useSurvivorBoard, useUsedTeams, useSubmitSurvivorPick, useDeleteSurvivorPick, useSettleSurvivorLeague } from '../../hooks/useLeagues'
import { useGames } from '../../hooks/useGames'
import { useAuthStore } from '../../stores/authStore'
import LoadingSpinner from '../ui/LoadingSpinner'
import EmptyState from '../ui/EmptyState'
import { toast } from '../ui/Toast'
import { formatOdds } from '../../lib/scoring'
import Avatar from '../ui/Avatar'
import LeagueWinModal from './LeagueWinModal'

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
  const settleMutation = useSettleSurvivorLeague()
  const session = useAuthStore((s) => s.session)
  const currentUserId = session?.user?.id
  const [showPickForm, setShowPickForm] = useState(false)
  const [settleModalData, setSettleModalData] = useState(null)

  const currentWeek = league.current_week
  // Use pick_week from board (advances past locked picks) with fallback to current_week
  const pickWeek = board?.pick_week || currentWeek
  const usedTeamSet = useMemo(() => new Set(usedTeams || []), [usedTeams])
  const currentPickTeam = board?.current_pick?.team_name

  // Winner detection
  const isWinner = board?.survivor_winner?.user_id === currentUserId
  const leagueCompleted = league.status === 'completed'
  const winSeenKey = `survivor_win_seen_${league.id}`
  const [winSeen, setWinSeen] = useState(() => localStorage.getItem(winSeenKey) === '1')

  async function handleSettle() {
    try {
      const result = await settleMutation.mutateAsync(league.id)
      setSettleModalData({
        format: 'survivor',
        mode: 'settled',
        leagueName: league.name,
        points: result.points,
        outlasted: result.outlasted,
      })
    } catch (err) {
      toast(err.message || 'Failed to settle league', 'error')
    }
  }

  function handleKeepGoing() {
    localStorage.setItem(winSeenKey, '1')
    setWinSeen(true)
  }

  // If user hasn't picked for the current period, only show games within that period.
  // Once they've picked, show all upcoming games so they can pick a day ahead.
  const pickWeekGames = useMemo(() => {
    if (!games?.length) return []
    if (!board?.user_has_picked && pickWeek?.starts_at && pickWeek?.ends_at) {
      return games.filter((g) => g.starts_at >= pickWeek.starts_at && g.starts_at <= pickWeek.ends_at)
    }
    return games
  }, [games, pickWeek, board?.user_has_picked])

  async function handlePick(gameId, pickedTeam) {
    if (!pickWeek) return
    try {
      await submitPick.mutateAsync({
        leagueId: league.id,
        weekId: pickWeek.id,
        gameId,
        pickedTeam,
      })
      toast('Survivor pick submitted!', 'success')
      setShowPickForm(false)
    } catch (err) {
      toast(err.message || 'Failed to submit pick', 'error')
    }
  }

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

      {/* Winner celebration / settle banner */}
      {isWinner && !leagueCompleted && !winSeen && (
        <div className="bg-bg-card rounded-xl border border-correct p-5 mb-4 survivor-winner-glow">
          <div className="text-center space-y-3">
            <div className="text-4xl">{'\uD83D\uDC51'}</div>
            <h3 className="font-display text-xl font-bold text-correct">You Won!</h3>
            <p className="text-sm text-text-secondary">
              You're the last one standing in <span className="text-text-primary font-semibold">{league.name}</span>
            </p>
            <div className="flex justify-center gap-6">
              <div className="text-center">
                <div className="text-xl font-bold text-correct">+{board.survivor_winner.points}</div>
                <div className="text-[10px] text-text-muted">Points Earned</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-text-primary">{board.survivor_winner.outlasted}</div>
                <div className="text-[10px] text-text-muted">Outlasted</div>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleKeepGoing}
                className="flex-1 py-2.5 rounded-xl font-display text-sm bg-bg-card-hover text-text-secondary hover:bg-bg-primary border border-border transition-colors"
              >
                Keep Going
              </button>
              <button
                onClick={handleSettle}
                disabled={settleMutation.isPending}
                className="flex-1 py-2.5 rounded-xl font-display text-sm bg-correct text-white hover:bg-correct/90 transition-colors"
              >
                {settleMutation.isPending ? 'Settling...' : 'Settle League'}
              </button>
            </div>
            <p className="text-[10px] text-text-muted">
              Keep going to chase the record, or settle to lock in your points
            </p>
          </div>
        </div>
      )}

      {/* Compact settle banner for subsequent visits */}
      {isWinner && !leagueCompleted && winSeen && (
        <div className="bg-bg-card rounded-xl border border-correct/30 px-4 py-3 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{'\uD83D\uDC51'}</span>
            <span className="text-sm text-correct font-semibold">Winner — +{board.survivor_winner.points} pts</span>
          </div>
          <button
            onClick={handleSettle}
            disabled={settleMutation.isPending}
            className="px-4 py-1.5 rounded-lg font-display text-xs bg-correct text-white hover:bg-correct/90 transition-colors"
          >
            {settleMutation.isPending ? 'Settling...' : 'Settle League'}
          </button>
        </div>
      )}

      {/* Completed winner badge */}
      {isWinner && leagueCompleted && (
        <div className="bg-bg-card rounded-xl border border-correct/30 px-4 py-3 mb-4 flex items-center gap-2">
          <span className="text-lg">{'\uD83D\uDC51'}</span>
          <span className="text-sm text-correct font-semibold">You won this league! +{board.survivor_winner.points} pts</span>
        </div>
      )}

      {/* Settle modal */}
      <LeagueWinModal data={settleModalData} onClose={() => setSettleModalData(null)} />

      {/* No active period */}
      {!pickWeek && (
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-4 text-center">
          <p className="text-sm text-text-secondary">No active {periodLabel.toLowerCase()} right now.</p>
          <p className="text-xs text-text-muted mt-1">Picks will be available when the next {periodLabel.toLowerCase()} begins.</p>
        </div>
      )}

      {/* Make pick button */}
      {pickWeek && (
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
      {showPickForm && pickWeekGames.length === 0 && (
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
          <p className="text-sm text-text-muted text-center">No upcoming games available right now. Check back closer to game time.</p>
        </div>
      )}
      {showPickForm && pickWeekGames.length > 0 && (() => {
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
                        const homeUsed = usedTeamSet.has(game.home_team)
                        const awayUsed = usedTeamSet.has(game.away_team)
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
