import { useState, useMemo } from 'react'
import { useSurvivorBoard, useUsedTeams, useSubmitSurvivorPick, useDeleteSurvivorPick } from '../../hooks/useLeagues'
import { useGames } from '../../hooks/useGames'
import LoadingSpinner from '../ui/LoadingSpinner'
import EmptyState from '../ui/EmptyState'
import { toast } from '../ui/Toast'
import { formatOdds } from '../../lib/scoring'

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
  const { data: games } = useGames(league.sport === 'all' ? null : league.sport, 'upcoming', isDaily ? 1 : 3)
  const submitPick = useSubmitSurvivorPick()
  const deletePick = useDeleteSurvivorPick()
  const [showPickForm, setShowPickForm] = useState(false)

  const currentWeek = league.current_week
  const usedTeamSet = useMemo(() => new Set(usedTeams || []), [usedTeams])

  // Find current user's pick for this week
  const myCurrentPick = useMemo(() => {
    if (!board?.members || !currentWeek) return null
    for (const m of board.members) {
      for (const p of m.picks) {
        if (p.league_week_id === currentWeek.id && m.user_id === league.members?.find(mm => mm.role === 'commissioner' || true)?.user_id) {
          // We can't determine "me" here without auth context, so we return all picks
        }
      }
    }
    return null
  }, [board, currentWeek, league])

  async function handlePick(gameId, pickedTeam) {
    if (!currentWeek) return
    try {
      await submitPick.mutateAsync({
        leagueId: league.id,
        weekId: currentWeek.id,
        gameId,
        pickedTeam,
      })
      toast('Survivor pick submitted!', 'success')
      setShowPickForm(false)
    } catch (err) {
      toast(err.message || 'Failed to submit pick', 'error')
    }
  }

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
            {currentWeek?.week_number || '—'}
          </div>
          <div className="text-xs text-text-muted">{periodLabel}</div>
        </div>
      </div>

      {/* Make pick button */}
      {currentWeek && (
        <button
          onClick={() => setShowPickForm(!showPickForm)}
          className="w-full py-3 rounded-xl font-display bg-accent text-white hover:bg-accent-hover transition-colors mb-4"
        >
          {showPickForm ? 'Hide Pick Form' : `Make ${periodLabel} ${currentWeek.week_number} Pick`}
        </button>
      )}

      {/* Pick form */}
      {showPickForm && games?.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
          <h3 className="font-display text-sm text-text-secondary mb-3">Pick a Team</h3>
          <div className="space-y-2">
            {games.map((game) => {
              const homeUsed = usedTeamSet.has(game.home_team)
              const awayUsed = usedTeamSet.has(game.away_team)

              return (
                <div key={game.id} className="flex items-center gap-2">
                  <button
                    onClick={() => handlePick(game.id, 'away')}
                    disabled={awayUsed || submitPick.isPending}
                    className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors ${
                      awayUsed
                        ? 'bg-bg-primary text-text-muted line-through cursor-not-allowed'
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
      )}

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
                <div className="w-7 h-7 rounded-full bg-bg-primary flex items-center justify-center text-xs flex-shrink-0">
                  {m.users?.avatar_emoji || m.users?.username?.[0]?.toUpperCase()}
                </div>
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
                  {m.is_alive ? 'Alive' : `Out ${isDaily ? 'Dy' : 'Wk'} ${m.eliminated_week}`}
                </span>
              </div>
            </div>
            {/* Pick history */}
            {m.picks?.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {m.picks.map((p) => {
                  const isLocked = p.team_name === 'Locked'
                  return (
                    <span
                      key={p.id}
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isLocked ? 'bg-white/5 text-text-muted italic' : STATUS_STYLES[p.status] || 'bg-bg-primary text-text-muted'}`}
                      title={isLocked ? `${periodLabel} ${p.league_weeks?.week_number}: Hidden` : `${periodLabel} ${p.league_weeks?.week_number}: ${p.team_name}`}
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
