import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenLeagues, useJoinOpenLeague } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import { getBackdropUrl } from '../../lib/backdropUrl'
import LeagueInfoModal from '../leagues/LeagueInfoModal'

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  bracket: 'Bracket',
  squares: 'Squares',
  fantasy: 'Fantasy Football',
  nba_dfs: 'NBA Daily Fantasy',
  mlb_dfs: 'MLB Daily Fantasy',
  hr_derby: 'Home Run Derby',
  strikeouts: 'Strikeouts Contest',
  three_point: 'NBA 3-Point Contest',
  wnba_three_point: 'WNBA 3-Point Contest',
  sacks: 'Sacks Contest',
  ints: 'Interceptions Contest',
  tackles: 'Tackles Contest',
  receptions: 'Receptions Contest',
  td_pass: 'TD Pass Competition',
}

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
  all: 'All Sports',
}

// Sport-agnostic formats — prefix the sport in the card label
// ("UFL Pick'em League", "NFL Survivor League"). Sport-specific formats
// like nba_dfs already include the sport in their label.
const PREFIX_SPORT_FORMATS = new Set(['pickem', 'survivor', 'bracket', 'squares'])

function getLeagueHeadline(league) {
  const formatLabel = FORMAT_LABELS[league.format] || league.format
  const sportLabel = SPORT_LABELS[league.sport] || league.sport
  if (PREFIX_SPORT_FORMATS.has(league.format) && sportLabel && league.sport !== 'all') {
    return `${sportLabel} ${formatLabel} League`
  }
  return `${formatLabel} League`
}

function formatStartDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
}

function formatRunsUntil(league) {
  if (league.format === 'survivor') return 'Last one standing'
  if (league.format === 'squares') return 'End of game'
  if (league.duration === 'full_season') return 'End of season'
  if (league.duration === 'playoffs_only') return 'End of playoffs'
  if (league.ends_at) return formatStartDate(league.ends_at)
  return null
}

// Pre-start: "Runs May 17 – Last one standing" so users see the full window.
// Already underway: just "Runs until Last one standing" — the start date stops
// being useful once the league is rolling.
function formatLeagueRuns(league) {
  const start = formatStartDate(league.starts_at)
  const end = formatRunsUntil(league)
  const notStartedYet = league.starts_at && new Date(league.starts_at) > new Date()
  if (notStartedYet && start && end) return `Runs ${start} – ${end}`
  if (notStartedYet && start) return `Starts ${start}`
  if (end) return `Runs until ${end}`
  return null
}

export default function OpenLeaguesSection() {
  const { data: leagues, isLoading } = useOpenLeagues()
  const joinOpen = useJoinOpenLeague()
  const navigate = useNavigate()
  const [joiningId, setJoiningId] = useState(null)
  const [infoLeague, setInfoLeague] = useState(null)

  const sortedLeagues = useMemo(() => {
    if (!leagues?.length) return []
    return [...leagues].sort((a, b) => {
      const aTime = a.starts_at ? new Date(a.starts_at).getTime() : Infinity
      const bTime = b.starts_at ? new Date(b.starts_at).getTime() : Infinity
      return aTime - bTime
    })
  }, [leagues])

  if (isLoading || !sortedLeagues.length) return null

  async function handleJoin(leagueId) {
    setJoiningId(leagueId)
    try {
      const league = await joinOpen.mutateAsync(leagueId)
      toast('Joined league!', 'success')
      setInfoLeague(null)
      navigate(`/leagues/${league.id}`)
    } catch (err) {
      toast(err.message || 'Failed to join', 'error')
      setJoiningId(null)
    }
  }

  function handleCardJoin(e, leagueId) {
    e.preventDefault()
    e.stopPropagation()
    handleJoin(leagueId)
  }

  return (
    <div className="mb-8 xl:-mx-24" data-onboarding="open-leagues">
      <h2 className="font-display text-lg text-text-primary mb-3">Join an Open League</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        {sortedLeagues.map((league) => (
          <div
            key={league.id}
            role="button"
            tabIndex={0}
            onClick={() => setInfoLeague(league)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setInfoLeague(league) }}
            className="relative flex-shrink-0 w-64 rounded-xl border border-text-primary/20 bg-bg-primary overflow-hidden flex flex-col text-left hover:border-accent/40 transition-colors cursor-pointer"
          >
            {league.backdrop_image && (
              <>
                <img
                  src={getBackdropUrl(league.backdrop_image)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none"
                  style={{ objectPosition: `center ${league.backdrop_y ?? 50}%` }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-bg-primary/40 to-bg-primary/85 pointer-events-none" />
              </>
            )}
            <div className="relative p-4 flex flex-col flex-1">
              <div className="font-semibold text-sm text-white mb-1 line-clamp-2 leading-snug">{league.name}</div>
              <div className="text-xs mb-1.5">
                <span className="text-accent font-semibold">{getLeagueHeadline(league)}</span>
              </div>
              <div className="text-xs text-text-muted mb-1">
                {league.member_count}{league.max_members ? `/${league.max_members}` : ''} members
              </div>
              {formatLeagueRuns(league) && (
                <div className="text-xs text-yellow-500 font-semibold mb-3">
                  {formatLeagueRuns(league)}
                </div>
              )}
              <div className="mt-auto pt-2">
                <button
                  type="button"
                  onClick={(e) => handleCardJoin(e, league.id)}
                  disabled={joiningId === league.id}
                  className="w-full px-3 py-2 rounded-lg font-display text-sm bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {joiningId === league.id ? '...' : 'Join'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {infoLeague && (
        <LeagueInfoModal
          league={infoLeague}
          onClose={() => setInfoLeague(null)}
          onJoin={handleJoin}
          joining={joiningId === infoLeague?.id}
        />
      )}
    </div>
  )
}
