import { useMemo } from 'react'
import { useSurvivorBoard } from '../../hooks/useLeagues'
import { useAuthStore } from '../../stores/authStore'
import Avatar from '../ui/Avatar'
import LoadingSpinner from '../ui/LoadingSpinner'

const FOOTBALL_SPORTS = ['americanfootball_nfl', 'americanfootball_ncaaf']
const BASEBALL_SPORTS = ['baseball_mlb']

function pickVariant(id, count) {
  let hash = 0
  for (let i = 0; i < (id || '').length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i)
  return (Math.abs(hash) % count) + 1
}

function getTrophyImage(memberCount, sport, leagueId) {
  if (memberCount >= 14) {
    if (FOOTBALL_SPORTS.includes(sport)) return '/trophies/large-football.webp'
    if (BASEBALL_SPORTS.includes(sport)) return '/trophies/large-baseball.webp'
    return '/trophies/large-basketball.webp'
  }
  if (memberCount >= 9) return `/trophies/medium-${pickVariant(leagueId, 3)}.webp`
  if (memberCount >= 5) return `/trophies/small-${pickVariant(leagueId, 3)}.webp`
  return `/trophies/medal-${pickVariant(leagueId, 3)}.webp`
}

const PICK_STYLES = {
  survived: 'bg-correct/20 text-correct border border-correct/30',
  eliminated: 'bg-incorrect/20 text-incorrect border border-incorrect/30',
  locked: 'bg-white/10 text-text-primary border border-white/20',
  pending: 'bg-white/10 text-text-primary border border-white/20',
  missed: 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30',
}

export default function SurvivorStandings({ league, onUserTap }) {
  const { data: board, isLoading } = useSurvivorBoard(league.id)
  const session = useAuthStore((s) => s.session)
  const currentUserId = session?.user?.id
  const isDaily = league.settings?.pick_frequency === 'daily'
  const periodLabel = isDaily ? 'Day' : 'Wk'

  const { alive, eliminated, winner, aliveCount } = useMemo(() => {
    if (!board?.members) return { alive: [], eliminated: [], winner: null, aliveCount: 0 }

    const aliveMembers = []
    const eliminatedMembers = []
    let winnerMember = null

    for (const m of board.members) {
      if (m.is_alive) {
        aliveMembers.push(m)
      } else {
        eliminatedMembers.push(m)
      }
    }

    // Current user first among alive
    aliveMembers.sort((a, b) => {
      if (a.user_id === currentUserId) return -1
      if (b.user_id === currentUserId) return 1
      return 0
    })

    // Eliminated: most recently eliminated first, first eliminated last
    eliminatedMembers.sort((a, b) => (b.eliminated_week || 0) - (a.eliminated_week || 0))

    // Winner detection
    if (board.survivor_winner) {
      winnerMember = aliveMembers.find((m) => m.user_id === board.survivor_winner.user_id) || null
    }

    return { alive: aliveMembers, eliminated: eliminatedMembers, winner: winnerMember, aliveCount: aliveMembers.length }
  }, [board, currentUserId])

  if (isLoading) return <LoadingSpinner />
  if (!board) return null

  // Scale factor for alive rows when competition narrows
  function getAliveScale() {
    if (aliveCount <= 2) return 'scale-[1.04]'
    if (aliveCount <= 3) return 'scale-[1.02]'
    if (aliveCount <= 4) return 'scale-[1.01]'
    return ''
  }

  function PickChain({ member }) {
    const picks = member.picks || []
    const weeks = board?.weeks || []

    // Build a chain: for every week that has been processed (missed_picks_processed
    // or past ends_at), include either the user's pick for that week, or a
    // "missed" placeholder if they have no pick. Weeks with no pick before
    // elimination = life lost.
    const pickByWeekId = new Map(picks.map((p) => [p.league_week_id, p]))
    const nowMs = Date.now()

    const chain = []
    for (const week of weeks) {
      const weekEndedMs = new Date(week.ends_at).getTime()
      const isPast = week.missed_picks_processed || weekEndedMs < nowMs
      if (!isPast) continue

      const isPostElimination = !member.is_alive && member.eliminated_week != null && week.week_number > member.eliminated_week
      if (isPostElimination) continue

      const pick = pickByWeekId.get(week.id)
      if (pick) {
        chain.push({ kind: 'pick', week, pick })
      } else if (week.missed_picks_processed) {
        // Week has been processed by missed-pick job and user has no pick → life lost
        chain.push({ kind: 'missed', week })
      }
    }

    // Also include any picks for weeks that aren't yet past (e.g. current pending/locked)
    for (const p of picks) {
      if (!chain.some((c) => c.kind === 'pick' && c.pick.id === p.id)) {
        chain.push({ kind: 'pick', week: { week_number: p.league_weeks?.week_number }, pick: p })
      }
    }

    if (!chain.length) return null

    return (
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mt-2" ref={(el) => { if (el) el.scrollLeft = el.scrollWidth }}>
        {chain.map((item, i) => {
          if (item.kind === 'missed') {
            return (
              <span
                key={`missed-${item.week.id}`}
                className={`text-xs font-semibold px-2 py-1 rounded-lg shrink-0 ${PICK_STYLES.missed}`}
                title={`${periodLabel} ${item.week.week_number}: Missed pick — lost a life`}
              >
                Missed
              </span>
            )
          }

          const p = item.pick
          const isLocked = p.team_name === 'Locked'
          const chipStyle = isLocked
            ? 'bg-white/5 text-text-muted italic border border-white/10'
            : PICK_STYLES[p.status] || 'bg-white/5 text-text-muted border border-white/10'

          return (
            <span
              key={p.id}
              className={`text-xs font-semibold px-2 py-1 rounded-lg shrink-0 ${chipStyle}`}
              title={`${periodLabel} ${p.league_weeks?.week_number || item.week?.week_number}: ${isLocked ? 'Hidden' : p.team_name || 'No pick'}`}
            >
              {isLocked ? '???' : p.team_name?.split(' ').pop() || 'No pick'}
            </span>
          )
        })}
      </div>
    )
  }

  function MemberRow({ member, variant }) {
    const isAlive = variant === 'alive'
    const isWinner = variant === 'winner'
    const scaleClass = (isAlive || isWinner) ? getAliveScale() : ''

    const borderClass = isWinner || isAlive
      ? 'border border-correct/50'
      : 'border border-incorrect/40'

    const bgClass = isWinner || isAlive
      ? 'bg-correct/5 backdrop-blur-sm'
      : 'bg-incorrect/5 backdrop-blur-sm'

    const rowSize = isAlive || isWinner ? 'px-4 py-4' : 'px-4 py-3'
    const avatarSize = isAlive || isWinner ? 'lg' : 'md'
    const nameSize = isAlive || isWinner ? 'text-base font-bold' : 'text-sm font-semibold'

    return (
      <div
        onClick={() => onUserTap?.(member.user_id)}
        className={`rounded-xl ${borderClass} ${bgClass} ${rowSize} ${scaleClass} cursor-pointer hover:brightness-110 transition-all origin-center`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar user={member.users} size={avatarSize} />
            <div className="min-w-0">
              <span className={`${nameSize} text-text-primary truncate block`}>
                {member.users?.display_name || member.users?.username}
              </span>
              {isAlive && member.lives_remaining > 0 && (
                <span className="text-xs text-text-muted">
                  {member.lives_remaining} {member.lives_remaining === 1 ? 'life' : 'lives'}
                </span>
              )}
            </div>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
            isWinner || isAlive
              ? 'bg-correct/20 text-correct'
              : 'bg-incorrect/20 text-incorrect'
          }`}>
            {isWinner ? 'Champion' : isAlive ? 'Alive' : `Out ${periodLabel} ${member.eliminated_week}`}
          </span>
        </div>
        <PickChain member={member} />
      </div>
    )
  }

  return (
    <div>
      {/* Alive tier */}
      <div className="space-y-2">
        {alive.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            variant={winner?.user_id === m.user_id ? 'winner' : 'alive'}
          />
        ))}
      </div>

      {/* Eliminated tier */}
      {eliminated.length > 0 && (
        <>
          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-incorrect/20" />
            <span className="text-xs text-incorrect/60 font-semibold uppercase tracking-wider">Eliminated</span>
            <div className="flex-1 h-px bg-incorrect/20" />
          </div>
          <div className="space-y-2">
            {eliminated.map((m) => (
              <MemberRow key={m.id} member={m} variant="eliminated" />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
