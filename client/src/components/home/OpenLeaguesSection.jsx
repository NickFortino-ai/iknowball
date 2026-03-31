import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenLeagues, useJoinOpenLeague } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  bracket: 'Bracket',
  squares: 'Squares',
  fantasy: 'Fantasy Football',
  nba_dfs: 'NBA Daily Fantasy',
  mlb_dfs: 'MLB Daily Fantasy',
  hr_derby: 'Home Run Derby',
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

export default function OpenLeaguesSection() {
  const { data: leagues, isLoading } = useOpenLeagues()
  const joinOpen = useJoinOpenLeague()
  const navigate = useNavigate()
  const [joiningId, setJoiningId] = useState(null)

  if (isLoading || !leagues?.length) return null

  async function handleJoin(league) {
    setJoiningId(league.id)
    try {
      await joinOpen.mutateAsync(league.id)
      toast(`Joined ${league.name}!`, 'success')
      navigate(`/leagues/${league.id}`)
    } catch (err) {
      toast(err.message || 'Failed to join', 'error')
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="mb-8">
      <h2 className="font-display text-lg text-text-primary mb-3">Join an Open League</h2>
      <div className="space-y-3">
        {leagues.slice(0, 5).map((league) => {
          const hasBackdrop = !!league.backdrop_image
          return (
            <div
              key={league.id}
              className="rounded-xl border border-text-primary/20 overflow-hidden relative"
            >
              {hasBackdrop && (
                <div className="absolute inset-0 pointer-events-none">
                  <img
                    src={`/backdrops/${league.backdrop_image}`}
                    alt=""
                    className="w-full h-full object-cover opacity-20"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-bg-primary/80 to-bg-primary/60" />
                </div>
              )}
              <div className={`relative p-4 flex items-center justify-between gap-3 ${!hasBackdrop ? 'bg-bg-card/50 backdrop-blur-sm' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-display text-base text-white truncate">{league.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-muted">
                    <span className="text-accent font-semibold">{FORMAT_LABELS[league.format] || league.format}</span>
                    <span>{SPORT_LABELS[league.sport] || league.sport}</span>
                    <span>{league.member_count || 0}{league.max_members ? `/${league.max_members}` : ''} members</span>
                    {league.starts_at && (
                      <span>Starts {new Date(league.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleJoin(league)}
                  disabled={joiningId === league.id}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors shrink-0"
                >
                  {joiningId === league.id ? 'Joining...' : 'Join'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
