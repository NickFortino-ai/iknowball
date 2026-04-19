import { useState, useMemo, useEffect } from 'react'
import { useSurvivorBoard, useUsedTeams, useSubmitSurvivorPick, useDeleteSurvivorPick } from '../../hooks/useLeagues'
import { useGames } from '../../hooks/useGames'
import { useAuthStore } from '../../stores/authStore'
import LoadingSpinner from '../ui/LoadingSpinner'
import EmptyState from '../ui/EmptyState'
import { toast } from '../ui/Toast'
import { formatOdds } from '../../lib/scoring'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'
import Avatar from '../ui/Avatar'
import TouchdownPicker from './TouchdownPicker'

const STATUS_STYLES = {
  survived: 'bg-correct/20 text-correct',
  eliminated: 'bg-incorrect/20 text-incorrect',
  locked: 'bg-accent/20 text-accent',
  pending: 'bg-tier-hof/20 text-tier-hof',
}

export default function SurvivorView({ league }) {
  const isTouchdown = league.settings?.survivor_mode === 'touchdown'
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
  const [localPickGameId, setLocalPickGameId] = useState(null)

  const currentWeek = league.current_week
  // Use pick_week from board (advances past locked picks) with fallback to current_week
  const pickWeek = board?.pick_week || currentWeek
  const usedTeamSet = useMemo(() => new Set(usedTeams || []), [usedTeams])

  // Find current pick: prefer board.current_pick, fall back to user's latest pending pick from member data
  const fallback = useMemo(() => {
    if (board?.current_pick?.team_name) return { team_name: null, game_id: null }
    const myEntry = board?.members?.find((m) => m.users?.id === currentUserId)
    const pendingPick = myEntry?.picks?.find((p) => p.status === 'pending')
    return { team_name: pendingPick?.team_name || null, game_id: pendingPick?.game_id || null }
  }, [board, currentUserId])
  const currentPickTeam = localPickTeam || board?.current_pick?.team_name || fallback.team_name
  const currentPickGameId = localPickGameId || board?.current_pick?.game_id || fallback.game_id

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
      setLocalPickGameId(gameId)
      toast('Survivor pick submitted!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to submit pick', 'error')
    }
  }

  // Clear local pick when board refreshes with server data
  useEffect(() => {
    if (board?.current_pick?.team_name) {
      setLocalPickTeam(null)
      setLocalPickGameId(null)
    }
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
      <div className="flex justify-center gap-2 md:gap-3 mb-4">
        {[
          { value: board.members?.filter((m) => m.is_alive).length || 0, label: 'Alive', color: 'text-correct' },
          { value: board.members?.filter((m) => !m.is_alive).length || 0, label: 'Eliminated', color: 'text-incorrect' },
          { value: board.display_period_number || currentWeek?.week_number || '—', label: periodLabel, color: 'text-text-primary' },
        ].map((stat) => (
          <div key={stat.label} className="bg-bg-card/50 md:bg-bg-card/30 backdrop-blur-sm rounded-xl border border-text-primary/20 w-[5.5rem] md:w-24 py-2 text-center">
            <div className={`font-display text-xl md:text-2xl ${stat.color}`}>{stat.value}</div>
            <div className="text-[10px] text-text-muted">{stat.label}</div>
          </div>
        ))}
      </div>


      {/* No active period */}
      {!pickWeek && (
        <div className="bg-bg-card/50 md:bg-bg-card/30 backdrop-blur-sm rounded-xl border border-text-primary/20 p-4 mb-4 text-center relative z-10">
          <p className="text-sm text-text-primary">No active {periodLabel.toLowerCase()} right now.</p>
          <p className="text-xs text-text-secondary mt-1">Picks will be available when the next {periodLabel.toLowerCase()} begins.</p>
        </div>
      )}

      {/* Make pick button */}
      {pickWeek && !leagueCompleted && (
        <div className="flex justify-center mb-4 relative z-10">
          <button
            onClick={() => setShowPickForm(!showPickForm)}
            className={`px-8 py-3 rounded-xl font-display transition-colors ${
              board.user_has_picked
                ? 'bg-accent/10 backdrop-blur-sm text-text-secondary hover:bg-accent/20 border border-accent'
                : 'bg-accent/80 backdrop-blur-sm text-white hover:bg-accent border border-accent'
            }`}
          >
            {showPickForm
              ? 'Hide Pick Form'
              : board.user_has_picked
                ? `Edit ${periodLabel} ${board.display_period_number || pickWeek.week_number} Pick`
                : `Make ${periodLabel} ${board.display_period_number || pickWeek.week_number} Pick`}
          </button>
        </div>
      )}

      {/* Touchdown pick form */}
      {showPickForm && !leagueCompleted && isTouchdown && pickWeek && (
        <TouchdownPicker
          league={league}
          pickWeek={pickWeek}
          onPick={(playerName) => {
            setLocalPickTeam(playerName)
            setShowPickForm(false)
          }}
        />
      )}

      {/* Standard team pick form */}
      {showPickForm && !leagueCompleted && !isTouchdown && pickWeekGames.length === 0 && (
        <div className="bg-bg-card/50 md:bg-bg-card/30 backdrop-blur-sm rounded-xl border border-text-primary/20 p-4 mb-6 relative z-10">
          <p className="text-sm text-text-primary text-center">No upcoming games available right now. Check back closer to game time.</p>
        </div>
      )}
      {showPickForm && !leagueCompleted && !isTouchdown && pickWeekGames.length > 0 && (() => {
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
          <div className="rounded-xl border border-text-primary/20 p-4 mb-6 relative z-10 bg-bg-primary/30">
            {poolExpanded && (
              <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 mb-3 text-center">
                <div className="text-xs text-text-secondary font-semibold mb-0.5">Pool Expanded</div>
                <div className="text-[11px] text-text-muted leading-snug">
                  You've used every available team — all teams are back in play!
                </div>
              </div>
            )}
            <h3 className="font-display text-sm text-text-primary mb-3">Pick a Team</h3>
            <div className="space-y-3">
              {dateKeys.map((dateKey) => {
                const d = new Date(dateKey + 'T12:00:00')
                const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                return (
                  <div key={dateKey}>
                    <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">{label}</div>
                    {(() => {
                      const gameRows = grouped[dateKey].map((game) => {
                        const homeUsed = !poolExpanded && usedTeamSet.has(game.home_team)
                        const awayUsed = !poolExpanded && usedTeamSet.has(game.away_team)
                        // Only highlight a pick on the EXACT game it was made on —
                        // matching by team name alone visually "picks" the same
                        // team in future games (e.g. consecutive-day matchups).
                        const isThisGamePicked = currentPickGameId === game.id
                        const awayPicked = isThisGamePicked && currentPickTeam === game.away_team
                        const homePicked = isThisGamePicked && currentPickTeam === game.home_team

                        const awayLogo = getTeamLogoUrl(game.away_team, league.sport === 'all' ? game.sport_key : league.sport)
                        const homeLogo = getTeamLogoUrl(game.home_team, league.sport === 'all' ? game.sport_key : league.sport)

                        return (
                          <div key={game.id} className="flex items-center gap-2">
                            <button
                              onClick={() => handlePick(game.id, 'away')}
                              disabled={awayUsed || submitPick.isPending}
                              className={`flex-1 py-3 px-3 rounded-lg text-sm font-semibold transition-colors flex flex-col items-center gap-1.5 ${
                                awayUsed
                                  ? 'bg-bg-primary text-text-muted line-through cursor-not-allowed'
                                  : awayPicked
                                    ? 'bg-accent/20 text-accent ring-2 ring-accent'
                                    : 'bg-black/40 border border-text-primary/20 text-text-primary hover:bg-accent/20 hover:text-accent'
                              }`}
                            >
                              {awayLogo && <img src={awayLogo} alt="" className="w-8 h-8 object-contain" onError={(e) => { const fb = getTeamLogoFallbackUrl(game.away_team, league.sport === 'all' ? game.sport_key : league.sport); if (fb && e.target.src !== fb) e.target.src = fb; else e.target.style.display = 'none' }} />}
                              <span>{game.away_team}</span>
                              {game.away_odds != null && (
                                <span className="text-xs font-normal text-text-muted">{formatOdds(game.away_odds)}</span>
                              )}
                            </button>
                            <span className="text-xs text-text-muted">@</span>
                            <button
                              onClick={() => handlePick(game.id, 'home')}
                              disabled={homeUsed || submitPick.isPending}
                              className={`flex-1 py-3 px-3 rounded-lg text-sm font-semibold transition-colors flex flex-col items-center gap-1.5 ${
                                homeUsed
                                  ? 'bg-bg-primary text-text-muted line-through cursor-not-allowed'
                                  : homePicked
                                    ? 'bg-accent/20 text-accent ring-2 ring-accent'
                                    : 'bg-black/40 border border-text-primary/20 text-text-primary hover:bg-accent/20 hover:text-accent'
                              }`}
                            >
                              {homeLogo && <img src={homeLogo} alt="" className="w-8 h-8 object-contain" onError={(e) => { const fb = getTeamLogoFallbackUrl(game.home_team, league.sport === 'all' ? game.sport_key : league.sport); if (fb && e.target.src !== fb) e.target.src = fb; else e.target.style.display = 'none' }} />}
                              <span>{game.home_team}</span>
                              {game.home_odds != null && (
                                <span className="text-xs font-normal text-text-muted">{formatOdds(game.home_odds)}</span>
                              )}
                            </button>
                          </div>
                        )
                      })

                      const mid = Math.ceil(gameRows.length / 2)
                      const left = gameRows.slice(0, mid)
                      const right = gameRows.slice(mid)

                      return (
                        <>
                          {/* Single column on mobile */}
                          <div className="space-y-2 lg:hidden">{gameRows}</div>
                          {/* Two columns with divider on desktop */}
                          <div className="hidden lg:flex gap-0">
                            <div className="flex-1 space-y-2">{left}</div>
                            {right.length > 0 && (
                              <>
                                <div className="w-px bg-white/20 mx-4" />
                                <div className="flex-1 space-y-2">{right}</div>
                              </>
                            )}
                          </div>
                        </>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Current user's pick row */}
      {(() => {
        const me = board.members?.find((m) => m.user_id === currentUserId)
        if (!me) return null
        const myPicks = (me.picks || []).filter((p) => {
          if (!me.is_alive && me.eliminated_week != null && p.league_weeks?.week_number > me.eliminated_week) return false
          return true
        })
        return (
          <div className={`rounded-xl px-5 py-4 backdrop-blur-sm ${
            me.is_alive ? 'border border-correct/50 bg-correct/5' : 'border border-incorrect/40 bg-incorrect/5'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar user={me.users} size="lg" />
                <div className="min-w-0">
                  <span className="text-base font-bold text-text-primary truncate block">
                    {me.users?.display_name || me.users?.username}
                  </span>
                  {me.is_alive && me.lives_remaining > 0 && (
                    <span className="text-xs text-text-muted">
                      {me.lives_remaining} {me.lives_remaining === 1 ? 'life' : 'lives'}
                    </span>
                  )}
                </div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                me.is_alive ? 'bg-correct/20 text-correct' : 'bg-incorrect/20 text-incorrect'
              }`}>
                {me.is_alive ? 'Alive' : `Out ${isDaily ? 'Day' : 'Wk'} ${me.eliminated_week}`}
              </span>
            </div>
            {myPicks.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide" ref={(el) => { if (el) el.scrollLeft = el.scrollWidth }}>
                {myPicks.map((p) => {
                  const isLocked = p.team_name === 'Locked'
                  const chipStyle = isLocked
                    ? 'bg-white/5 text-text-muted italic border border-white/10'
                    : p.status === 'survived'
                      ? 'bg-correct/20 text-correct border border-correct/30'
                      : p.status === 'eliminated'
                        ? 'bg-incorrect/20 text-incorrect border border-incorrect/30'
                        : 'bg-white/10 text-text-primary border border-white/20'
                  return (
                    <span
                      key={p.id}
                      className={`text-xs font-semibold px-2 py-1 rounded-lg shrink-0 ${chipStyle}`}
                      title={`${periodLabel} ${p.league_weeks?.week_number}: ${isLocked ? 'Hidden' : p.team_name || 'No pick'}`}
                    >
                      {isLocked ? '???' : p.team_name?.split(' ').pop() || 'No pick'}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
