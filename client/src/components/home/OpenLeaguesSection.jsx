import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenLeagues, useJoinOpenLeague } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import { getBackdropUrl } from '../../lib/backdropUrl'

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
  three_point: '3-Point Contest',
  sacks: 'Sacks Contest',
  ints: 'Interceptions Contest',
}

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  basketball_wncaab: 'WNCAAB',
  americanfootball_ncaaf: 'NCAAF',
  basketball_wnba: 'WNBA',
  icehockey_nhl: 'NHL',
  soccer_usa_mls: 'MLS',
  all: 'All Sports',
}

function formatStartDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
}

export default function OpenLeaguesSection() {
  const { data: leagues, isLoading } = useOpenLeagues()
  const joinOpen = useJoinOpenLeague()
  const navigate = useNavigate()
  const [joiningId, setJoiningId] = useState(null)
  const [collapsed, setCollapsed] = useState(false)

  // Sort by start date ascending — soonest to start on the left, later starts
  // to the right. Leagues with no start date sink to the end.
  const sortedLeagues = useMemo(() => {
    if (!leagues?.length) return []
    return [...leagues].sort((a, b) => {
      const aTime = a.starts_at ? new Date(a.starts_at).getTime() : Infinity
      const bTime = b.starts_at ? new Date(b.starts_at).getTime() : Infinity
      return aTime - bTime
    })
  }, [leagues])

  if (isLoading || !sortedLeagues.length) return null

  async function handleJoin(e, leagueId) {
    e.preventDefault()
    e.stopPropagation()
    setJoiningId(leagueId)
    try {
      const league = await joinOpen.mutateAsync(leagueId)
      toast('Joined league!', 'success')
      navigate(`/leagues/${league.id}`)
    } catch (err) {
      toast(err.message || 'Failed to join', 'error')
      setJoiningId(null)
    }
  }

  return (
    <div className="mb-8">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full mb-3"
      >
        <h2 className="font-display text-lg text-text-primary">Join an Open League</h2>
        <svg className={`w-4 h-4 text-text-muted transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          {sortedLeagues.map((league) => (
            <div
              key={league.id}
              className="relative flex-shrink-0 w-56 rounded-xl border border-text-primary/20 bg-bg-primary overflow-hidden flex flex-col"
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
                  <span className="text-accent font-semibold">{FORMAT_LABELS[league.format] || league.format}</span>
                  <span className="text-text-muted"> · {SPORT_LABELS[league.sport] || league.sport}</span>
                </div>
                <div className="text-xs text-text-muted mb-1">
                  {league.member_count}{league.max_members ? `/${league.max_members}` : ''} members
                </div>
                {league.starts_at && (
                  <div className="text-xs text-yellow-500 font-semibold mb-3">
                    Starts {formatStartDate(league.starts_at)}
                  </div>
                )}
                <div className="mt-auto pt-2">
                  <button
                    onClick={(e) => handleJoin(e, league.id)}
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
      )}
    </div>
  )
}
