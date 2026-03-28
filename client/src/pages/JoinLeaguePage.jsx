import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useJoinLeague, useOpenLeagues, useJoinOpenLeague } from '../hooks/useLeagues'
import { toast } from '../components/ui/Toast'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  bracket: 'Bracket',
  squares: 'Squares',
  fantasy: 'Fantasy Football',
  nba_dfs: 'NBA Daily Fantasy',
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

function formatLockDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = d - now
  if (diffMs < 0) return null
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays > 1) return `Locks in ${diffDays} days`
  if (diffHours > 1) return `Locks in ${diffHours}h`
  return 'Locks soon'
}

function formatStartDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
}

function LeagueSettingsPreview({ league }) {
  const s = league.settings || {}
  const items = []

  if (league.starts_at) {
    items.push(['Starts', formatStartDate(league.starts_at)])
  }
  if ((league.format === 'survivor' || league.format === 'pickem') && s.pick_frequency) {
    items.push(['Picks', s.pick_frequency === 'daily' ? 'Daily' : 'Weekly'])
  }
  if (league.format === 'survivor' && s.lives) {
    items.push(['Lives', `${s.lives}`])
  }

  if (!items.length) return null

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
      {items.map(([label, value]) => (
        <span key={label} className="text-xs text-text-muted">
          {label}: <span className="text-text-secondary font-medium">{value}</span>
        </span>
      ))}
    </div>
  )
}

export default function JoinLeaguePage() {
  const [code, setCode] = useState('')
  const joinLeague = useJoinLeague()
  const joinOpen = useJoinOpenLeague()
  const { data: openLeagues, isLoading } = useOpenLeagues()
  const navigate = useNavigate()
  const [joiningId, setJoiningId] = useState(null)

  async function handleCodeSubmit(e) {
    e.preventDefault()
    try {
      const league = await joinLeague.mutateAsync({ inviteCode: code.trim().toUpperCase() })
      toast('Joined league!', 'success')
      navigate(`/leagues/${league.id}`)
    } catch (err) {
      toast(err.message || 'Failed to join league', 'error')
    }
  }

  async function handleJoinOpen(leagueId) {
    setJoiningId(leagueId)
    try {
      const league = await joinOpen.mutateAsync(leagueId)
      toast('Joined league!', 'success')
      navigate(`/leagues/${league.id}`)
    } catch (err) {
      toast(err.message || 'Failed to join league', 'error')
      setJoiningId(null)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-32">
      <Link to="/leagues" className="text-xs text-text-muted hover:text-text-secondary transition-colors">
        &larr; My Leagues
      </Link>
      <h1 className="font-display text-3xl mt-2 mb-6">Join a League</h1>

      {/* Invite Code */}
      <form onSubmit={handleCodeSubmit} className="mb-8">
        <label className="block text-xs text-text-muted mb-1.5">Have an invite code?</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. A3K9F2MX"
            maxLength={8}
            className="flex-1 bg-bg-primary border border-text-primary/20 rounded-lg px-3 py-2 text-center font-display text-sm tracking-widest text-text-primary placeholder-text-muted focus:outline-none focus:border-accent uppercase"
          />
          <button
            type="submit"
            disabled={code.trim().length < 4 || joinLeague.isPending}
            className="px-4 py-2 rounded-lg font-display bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs"
          >
            {joinLeague.isPending ? '...' : 'Join'}
          </button>
        </div>
      </form>

      {/* Open Leagues */}
      <div>
        <h2 className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-4">Open Leagues</h2>

        {isLoading ? (
          <LoadingSpinner />
        ) : !openLeagues?.length ? (
          <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-8 text-center">
            <p className="text-text-secondary text-sm mb-2">No open leagues at the moment.</p>
            <Link
              to="/leagues/create"
              className="text-accent hover:text-accent-hover transition-colors font-semibold text-sm"
            >
              Create one!
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {openLeagues.map((league) => {
              const hasBackdrop = !!league.backdrop_image

              return (
                <div
                  key={league.id}
                  className="relative rounded-xl border border-text-primary/20 bg-bg-primary overflow-hidden"
                >
                  {/* Backdrop image */}
                  {hasBackdrop && (
                    <>
                      <img
                        src={`/backdrops/${league.backdrop_image}`}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-bg-primary/80 via-bg-primary/60 to-bg-primary/80 pointer-events-none" />
                    </>
                  )}

                  <div className="relative z-10 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="font-display text-xl text-white truncate">{league.name}</h3>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-accent/20 text-accent">
                            {FORMAT_LABELS[league.format] || league.format}
                          </span>
                          <span className="text-xs text-text-secondary">{SPORT_LABELS[league.sport] || league.sport}</span>
                          <span className="text-xs text-text-secondary">
                            {league.member_count}{league.max_members ? `/${league.max_members}` : ''} members
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-text-muted">
                          <span className="text-xs">by {league.commissioner}</span>
                          {league.starts_at && (
                            <span className="text-sm text-yellow-500 font-semibold">
                              Starts {formatStartDate(league.starts_at)}
                            </span>
                          )}
                        </div>
                        <LeagueSettingsPreview league={league} />
                      </div>

                      <button
                        onClick={() => handleJoinOpen(league.id)}
                        disabled={joiningId === league.id}
                        className="flex-shrink-0 px-6 py-2.5 rounded-xl font-display text-sm bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {joiningId === league.id ? '...' : 'Join'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
