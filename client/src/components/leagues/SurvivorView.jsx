import { useState, useMemo, useEffect } from 'react'
import { useSurvivorBoard, useUsedTeams, useSubmitSurvivorPick, useDeleteSurvivorPick } from '../../hooks/useLeagues'
import { useGames } from '../../hooks/useGames'
import { useAuthStore } from '../../stores/authStore'
import LoadingSpinner from '../ui/LoadingSpinner'
import EmptyState from '../ui/EmptyState'
import { toast } from '../ui/Toast'
import { formatOdds } from '../../lib/scoring'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'
import { shortTeamLabel } from '../../lib/teamShort'
import Avatar from '../ui/Avatar'
import TouchdownPicker from './TouchdownPicker'

// Sport labels for the All-Sports survivor sub-grouping. Falls back to the
// raw sport_key if a sport isn't in the map.
const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  basketball_wncaab: 'WNCAAB',
  americanfootball_ncaaf: 'NCAAF',
  americanfootball_ufl: 'UFL',
  basketball_wnba: 'WNBA',
  icehockey_nhl: 'NHL',
  soccer_usa_mls: 'MLS',
  soccer_world_cup: 'World Cup',
}
function sportLabel(key) {
  return SPORT_LABELS[key] || key || 'Other'
}

const STATUS_STYLES = {
  survived: 'bg-correct/20 text-correct',
  survived_wrong: 'bg-yellow-500/20 text-yellow-500',
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
  // Optimistic removal: the game_id of a pick the user just toggled off, so
  // the highlight clears immediately before the board refetch lands.
  const [localRemovedGameId, setLocalRemovedGameId] = useState(null)
  // Explicit opt-in to pre-pick the next period. When false and the user
  // has already settled the current-period pick, we show a completion
  // state instead of silently auto-advancing to the next period's pick
  // form (which felt premature — from the user's perspective the current
  // day/week hasn't ended yet). When true, the pick form renders using
  // board.pick_week (which the server already advanced). Applies to both
  // daily and weekly frequencies; only the labels differ.
  const [showPreNextDay, setShowPreNextDay] = useState(false)
  // Collapsed sport sub-sections for All-Sports survivor. Stored as
  // "${dateKey}|${sportKey}" so collapsing one sport on Mar 5 doesn't
  // collapse the same sport on Mar 6.
  const [collapsedSportSections, setCollapsedSportSections] = useState(new Set())

  const currentWeek = league.current_week
  // Use pick_week from board (advances past locked picks) with fallback to current_week
  const pickWeek = board?.pick_week || currentWeek

  // The TRUE current calendar day, before any server-side advance logic.
  // Used to detect "user settled today's pick and server advanced pickWeek
  // to tomorrow" — the state where we want the completion card + pre-pick
  // opt-in, not the pick form.
  const actualCurrentWeek = useMemo(() => {
    const weeks = board?.weeks || []
    if (!weeks.length) return null
    const nowIso = new Date().toISOString()
    return weeks.find((w) => w.starts_at <= nowIso && w.ends_at >= nowIso) || null
  }, [board?.weeks])

  // User's pick for today (not for pickWeek). If it's settled, we're in the
  // "today's done — show completion" state.
  const todayPick = useMemo(() => {
    if (!actualCurrentWeek?.id) return null
    const myEntry = board?.members?.find((m) => m.users?.id === currentUserId || m.user_id === currentUserId)
    return (myEntry?.picks || []).find((p) => p.league_week_id === actualCurrentWeek.id) || null
  }, [board?.members, currentUserId, actualCurrentWeek?.id])

  const todayPickSettled = todayPick && todayPick.status !== 'pending' && todayPick.status !== 'locked'
  // Server auto-advanced past today AND user hasn't opted into the next-day
  // form yet → render completion instead of pick form.
  const showTodayCompletion = todayPickSettled
    && pickWeek?.id !== actualCurrentWeek?.id
    && !showPreNextDay
  const usedTeamSet = useMemo(() => new Set(usedTeams || []), [usedTeams])

  // Build a map of game_id -> { team_name, league_week_id } for ALL of the
  // current user's pending picks across upcoming days. This lets multi-day
  // picks (e.g. Sunday + Monday) each retain their own highlight, and lets a
  // tap-to-remove delete the pick for the right period. Only PENDING picks
  // appear here — locked/settled picks can't be toggled off.
  const userPicksByGameId = useMemo(() => {
    const map = {}
    const myEntry = board?.members?.find((m) => m.users?.id === currentUserId || m.user_id === currentUserId)
    for (const p of myEntry?.picks || []) {
      if (p.status === 'pending' && p.game_id && p.team_name) {
        map[p.game_id] = { team_name: p.team_name, league_week_id: p.league_week_id }
      }
    }
    // Layer in optimistic local state for the just-submitted pick so the UI
    // updates immediately before the board refetch lands.
    if (localPickGameId && localPickTeam) {
      map[localPickGameId] = { team_name: localPickTeam, league_week_id: pickWeek?.id }
    }
    // Optimistically drop a just-removed pick.
    if (localRemovedGameId) delete map[localRemovedGameId]
    return map
  }, [board, currentUserId, localPickGameId, localPickTeam, localRemovedGameId, pickWeek?.id])

  // Winner detection
  const isWinner = board?.survivor_winner?.user_id === currentUserId
  const leagueCompleted = league.status === 'completed'

  // If user hasn't picked for the current period, only show games within that period.
  // Once they've picked, show all upcoming games so they can pick a day ahead.
  // Always drop games that start before the league does — pre-start games
  // belong to no league_week and just clutter the slate with un-pickable rows
  // (especially the "I picked Day 1, league hasn't started yet" case).
  const pickWeekGames = useMemo(() => {
    if (!games?.length) return []
    const upcoming = league?.starts_at
      ? games.filter((g) => g.starts_at >= league.starts_at)
      : games
    if (!board?.user_has_picked && pickWeek?.starts_at && pickWeek?.ends_at) {
      return upcoming.filter((g) => g.starts_at >= pickWeek.starts_at && g.starts_at <= pickWeek.ends_at)
    }
    return upcoming
  }, [games, pickWeek, board?.user_has_picked, league?.starts_at])

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

    // Tapping the team you already have picked for this game removes it
    // (toggle off). Only pending picks land in userPicksByGameId, and the
    // backend rejects deleting a locked/settled pick, so this is safe.
    const existing = userPicksByGameId[gameId]
    if (existing && existing.team_name === teamName) {
      try {
        await deletePick.mutateAsync({ leagueId: league.id, weekId: existing.league_week_id })
        setLocalRemovedGameId(gameId)
        if (localPickGameId === gameId) {
          setLocalPickGameId(null)
          setLocalPickTeam(null)
        }
        toast('Survivor pick removed', 'success')
      } catch (err) {
        toast(err.message || 'Failed to remove pick', 'error')
      }
      return
    }

    try {
      await submitPick.mutateAsync({
        leagueId: league.id,
        weekId: pickWeek.id,
        gameId,
        pickedTeam,
      })
      setLocalPickTeam(teamName)
      setLocalPickGameId(gameId)
      if (localRemovedGameId === gameId) setLocalRemovedGameId(null)
      toast('Survivor pick submitted!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to submit pick', 'error')
    }
  }

  // Clear local optimistic pick once the server-side picks list catches up
  // (the just-submitted pick now appears in the member's picks array).
  useEffect(() => {
    if (!localPickGameId) return
    const myEntry = board?.members?.find((m) => m.users?.id === currentUserId || m.user_id === currentUserId)
    const matched = (myEntry?.picks || []).some(
      (p) => p.game_id === localPickGameId && p.team_name === localPickTeam,
    )
    if (matched) {
      setLocalPickTeam(null)
      setLocalPickGameId(null)
    }
  }, [board, currentUserId, localPickGameId, localPickTeam])

  // Clear optimistic removal once the board no longer shows a pending pick
  // for that game (the delete has landed server-side).
  useEffect(() => {
    if (!localRemovedGameId) return
    const myEntry = board?.members?.find((m) => m.users?.id === currentUserId || m.user_id === currentUserId)
    const stillPending = (myEntry?.picks || []).some(
      (p) => p.game_id === localRemovedGameId && p.status === 'pending',
    )
    if (!stillPending) setLocalRemovedGameId(null)
  }, [board, currentUserId, localRemovedGameId])

  // Auto-expand pick form if user hasn't picked yet
  useEffect(() => {
    if (board && pickWeek && !board.user_has_picked) {
      setShowPickForm(true)
    }
  }, [board, pickWeek])

  if (isLoading) return <LoadingSpinner />
  if (!board) return <EmptyState title="No data" message="Board not available" />

  const me = board.members?.find((m) => m.user_id === currentUserId)
  const userIsAlive = me?.is_alive !== false
  const aliveCount = board.members?.filter((m) => m.is_alive).length || 0

  return (
    <div>
      {/* Status summary */}
      <div className="flex justify-center gap-2 md:gap-3 mb-4">
        {(() => {
          const leagueStarted = !league.starts_at || new Date(league.starts_at).getTime() <= Date.now()
          const periodValue = leagueStarted
            ? (board.display_period_number || currentWeek?.week_number || '—')
            : '—'
          return [
            { value: aliveCount, label: 'Alive', color: 'text-correct' },
            { value: board.members?.filter((m) => !m.is_alive).length || 0, label: 'Eliminated', color: 'text-incorrect' },
            { value: periodValue, label: periodLabel, color: 'text-text-primary' },
          ]
        })().map((stat) => (
          <div key={stat.label} className="bg-bg-card/10 backdrop-blur-sm rounded-xl border border-text-primary/10 w-[5.5rem] md:w-24 py-2 text-center">
            <div className={`font-display text-xl md:text-2xl ${stat.color}`}>{stat.value}</div>
            <div className="text-[10px] text-text-muted">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Eliminated banner — replaces pick form for eliminated users */}
      {!userIsAlive && !leagueCompleted && (
        <div className="bg-bg-primary/60 border border-text-primary/20 rounded-xl p-4 mb-4 text-center relative z-10">
          <div className="text-sm text-text-primary font-semibold mb-1">
            You were eliminated in {isDaily ? 'Day' : 'Week'} {me?.eliminated_week || '?'}
          </div>
          <div className="text-base text-white font-medium">
            {aliveCount === 1 ? '1 player is' : `${aliveCount} players are`} still alive. Check back to see who wins!
          </div>
        </div>
      )}

      {/* No active period */}
      {!pickWeek && userIsAlive && (
        <div className="bg-bg-card/50 md:bg-bg-card/30 backdrop-blur-sm rounded-xl border border-text-primary/20 p-4 mb-4 text-center relative z-10">
          <p className="text-sm text-text-primary">No active {periodLabel.toLowerCase()} right now.</p>
          <p className="text-xs text-text-secondary mt-1">Picks will be available when the next {periodLabel.toLowerCase()} begins.</p>
        </div>
      )}

      {/* Current-period completion state. Shown when the user has settled
          their pick for the actual current period (day or week) AND the
          server has auto-advanced pickWeek to the next period AND the
          user hasn't opted into pre-picking yet. Replaces the pick form
          until the user either clicks the pre-pick button or the period
          naturally advances. */}
      {showTodayCompletion && !leagueCompleted && userIsAlive && (
        <div className="bg-bg-card/50 md:bg-bg-card/30 backdrop-blur-sm rounded-xl border border-text-primary/20 p-4 mb-4 text-center relative z-10">
          <p className="text-sm text-text-primary font-semibold mb-1">
            You've picked {isDaily ? 'today' : 'this week'} ✓
          </p>
          <p className="text-xs text-text-secondary mb-3">
            {todayPick?.team_name}
            {todayPick?.status === 'survived' ? ' — survived' : ''}
            {todayPick?.status === 'survived_wrong' ? ' — pushed (everyone lost)' : ''}
            {todayPick?.status === 'eliminated' ? ' — lost a life' : ''}
          </p>
          <button
            onClick={() => { setShowPreNextDay(true); setShowPickForm(true) }}
            className="px-6 py-2 rounded-xl font-display text-sm bg-accent/10 backdrop-blur-sm text-text-primary hover:bg-accent/20 border border-accent transition-colors"
          >
            Pre-pick {isDaily ? 'tomorrow' : 'next week'} →
          </button>
        </div>
      )}

      {/* Make pick button — only for alive users, and only when we're not in
          the "already picked today" completion state. */}
      {pickWeek && !leagueCompleted && userIsAlive && !showTodayCompletion && (
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
      {showPickForm && !leagueCompleted && userIsAlive && isTouchdown && pickWeek && (
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
      {showPickForm && !leagueCompleted && userIsAlive && !isTouchdown && pickWeekGames.length === 0 && (
        <div className="bg-bg-card/50 md:bg-bg-card/30 backdrop-blur-sm rounded-xl border border-text-primary/20 p-4 mb-6 relative z-10">
          <p className="text-sm text-text-primary text-center">No upcoming games available right now. Check back closer to game time.</p>
        </div>
      )}
      {showPickForm && !leagueCompleted && userIsAlive && !isTouchdown && pickWeekGames.length > 0 && (() => {
        const isAllSports = league.sport === 'all'

        // Group games by date
        const grouped = pickWeekGames.reduce((acc, game) => {
          const d = new Date(game.starts_at)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          if (!acc[key]) acc[key] = []
          acc[key].push(game)
          return acc
        }, {})
        const dateKeys = Object.keys(grouped).sort()

        // Renders one game as the away/home button row.
        function renderGameRow(game) {
          const homeUsed = !poolExpanded && usedTeamSet.has(game.home_team)
          const awayUsed = !poolExpanded && usedTeamSet.has(game.away_team)
          // Highlight per-game so multi-day picks (e.g. Sunday + Monday)
          // each keep their own visual selection.
          const pickedTeamForThisGame = userPicksByGameId[game.id]?.team_name
          const awayPicked = pickedTeamForThisGame === game.away_team
          const homePicked = pickedTeamForThisGame === game.home_team

          const sportForLogo = league.sport === 'all' ? (game.sports?.key || game.sport_key) : league.sport
          const awayLogo = getTeamLogoUrl(game.away_team, sportForLogo)
          const homeLogo = getTeamLogoUrl(game.home_team, sportForLogo)

          return (
            <div key={game.id} className="flex items-center gap-2">
              <button
                onClick={() => handlePick(game.id, 'away')}
                disabled={awayUsed || submitPick.isPending || deletePick.isPending}
                title={awayPicked ? 'Tap again to remove this pick' : undefined}
                className={`flex-1 py-3 px-3 rounded-lg text-sm font-semibold transition-colors flex flex-col items-center gap-1.5 ${
                  awayUsed
                    ? 'bg-bg-primary text-text-muted line-through cursor-not-allowed'
                    : awayPicked
                      ? 'bg-accent/20 text-accent ring-2 ring-accent'
                      : 'bg-black/40 border border-text-primary/20 text-text-primary hover:bg-accent/20 hover:text-accent'
                }`}
              >
                {awayLogo && <img src={awayLogo} alt="" className="w-8 h-8 object-contain" onError={(e) => { const fb = getTeamLogoFallbackUrl(game.away_team, sportForLogo); if (fb && e.target.src !== fb) e.target.src = fb; else e.target.style.display = 'none' }} />}
                <span>{game.away_team}</span>
                {game.away_odds != null && (
                  <span className="text-xs font-normal text-text-muted">{formatOdds(game.away_odds)}</span>
                )}
              </button>
              <span className="text-xs text-text-muted">@</span>
              <button
                onClick={() => handlePick(game.id, 'home')}
                disabled={homeUsed || submitPick.isPending || deletePick.isPending}
                title={homePicked ? 'Tap again to remove this pick' : undefined}
                className={`flex-1 py-3 px-3 rounded-lg text-sm font-semibold transition-colors flex flex-col items-center gap-1.5 ${
                  homeUsed
                    ? 'bg-bg-primary text-text-muted line-through cursor-not-allowed'
                    : homePicked
                      ? 'bg-accent/20 text-accent ring-2 ring-accent'
                      : 'bg-black/40 border border-text-primary/20 text-text-primary hover:bg-accent/20 hover:text-accent'
                }`}
              >
                {homeLogo && <img src={homeLogo} alt="" className="w-8 h-8 object-contain" onError={(e) => { const fb = getTeamLogoFallbackUrl(game.home_team, sportForLogo); if (fb && e.target.src !== fb) e.target.src = fb; else e.target.style.display = 'none' }} />}
                <span>{game.home_team}</span>
                {game.home_odds != null && (
                  <span className="text-xs font-normal text-text-muted">{formatOdds(game.home_odds)}</span>
                )}
              </button>
            </div>
          )
        }

        // Renders a list of games as one or two columns. Single-sport leagues
        // get the existing two-column desktop split; All-Sports stays single
        // column inside each sport sub-group so the per-sport block is tidy.
        function renderGameList(games, { columns = 'two' } = {}) {
          const rows = games.map(renderGameRow)
          if (columns === 'one') {
            return <div className="space-y-2">{rows}</div>
          }
          const mid = Math.ceil(rows.length / 2)
          return (
            <>
              <div className="space-y-2 lg:hidden">{rows}</div>
              <div className="hidden lg:flex gap-0">
                <div className="flex-1 space-y-2">{rows.slice(0, mid)}</div>
                {rows.length > mid && (
                  <>
                    <div className="w-px bg-white/20 mx-4" />
                    <div className="flex-1 space-y-2">{rows.slice(mid)}</div>
                  </>
                )}
              </div>
            </>
          )
        }

        function toggleSportSection(key) {
          setCollapsedSportSections((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key); else next.add(key)
            return next
          })
        }

        return (
          <div className="rounded-xl border border-text-primary/20 p-4 mb-6 relative z-10 bg-bg-primary/20 backdrop-blur-sm">
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
                const dateLabelStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                const gamesOnDate = grouped[dateKey]

                if (!isAllSports) {
                  // Single-sport survivor — original two-column layout.
                  return (
                    <div key={dateKey}>
                      <div className="font-display text-base text-white uppercase tracking-wider mb-2">{dateLabelStr}</div>
                      {renderGameList(gamesOnDate, { columns: 'two' })}
                    </div>
                  )
                }

                // All-Sports survivor: sub-group games by sport_key and render
                // each sport as a collapsible section (expanded by default).
                const bySport = gamesOnDate.reduce((acc, g) => {
                  const k = g.sports?.key || g.sport_key || 'unknown'
                  if (!acc[k]) acc[k] = []
                  acc[k].push(g)
                  return acc
                }, {})
                const sportKeys = Object.keys(bySport).sort((a, b) => sportLabel(a).localeCompare(sportLabel(b)))

                return (
                  <div key={dateKey}>
                    <div className="font-display text-base text-white uppercase tracking-wider mb-2">{dateLabelStr}</div>
                    <div className="space-y-2">
                      {sportKeys.map((sportKey) => {
                        const sectionKey = `${dateKey}|${sportKey}`
                        const collapsed = collapsedSportSections.has(sectionKey)
                        const games = bySport[sportKey]
                        return (
                          <div key={sectionKey} className="rounded-lg border border-text-primary/10 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => toggleSportSection(sectionKey)}
                              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-text-primary/5 transition-colors"
                            >
                              <span className="text-xs font-semibold text-accent uppercase tracking-wider">
                                {sportLabel(sportKey)} <span className="text-text-muted ml-1">({games.length})</span>
                              </span>
                              <svg className={`w-4 h-4 text-text-muted transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {!collapsed && (
                              <div className="p-3 pt-2 border-t border-text-primary/10">
                                {renderGameList(games, { columns: 'one' })}
                              </div>
                            )}
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
                      : p.status === 'survived_wrong'
                        ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30'
                        : p.status === 'eliminated'
                          ? 'bg-incorrect/20 text-incorrect border border-incorrect/30'
                          : 'bg-white/10 text-text-primary border border-white/20'
                  return (
                    <span
                      key={p.id}
                      className={`text-xs font-semibold px-2 py-1 rounded-lg shrink-0 ${chipStyle}`}
                      title={`${periodLabel} ${p.league_weeks?.week_number}: ${isLocked ? 'Hidden' : p.team_name || 'No pick'}`}
                    >
                      {isLocked ? '???' : shortTeamLabel(p.team_name) || 'No pick'}
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
