import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useJoinLeague, useOpenLeagues, useJoinOpenLeague } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'

const DURATION_LABELS = {
  full_season: 'Full Season',
  playoffs_only: 'Playoffs Only',
  this_week: 'This Week',
}

function formatDateShort(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
}

function LeagueSettingsPreview({ league }) {
  const s = league.settings || {}
  const items = []

  const durLabel = DURATION_LABELS[league.duration]
  if (durLabel) {
    items.push(['Duration', durLabel])
  } else if (league.starts_at || league.ends_at) {
    const start = formatDateShort(league.starts_at)
    const end = formatDateShort(league.ends_at)
    items.push(['Dates', [start, end].filter(Boolean).join(' – ')])
  }

  if ((league.format === 'survivor' || league.format === 'pickem') && s.pick_frequency) {
    items.push(['Picks', s.pick_frequency === 'daily' ? 'Daily' : 'Weekly'])
  }
  if (league.format === 'survivor' && s.lives) {
    items.push(['Lives', `${s.lives}`])
  }
  if (league.format === 'pickem' && s.games_per_week) {
    items.push([`Per ${s.pick_frequency === 'daily' ? 'day' : 'week'}`, `${s.games_per_week} games`])
  }
  if (league.format === 'pickem' && s.lock_odds_at === 'submission') {
    items.push(['Odds', 'Locked at submission'])
  }

  if (!items.length) return <p className="text-xs text-text-muted">No additional settings.</p>

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <span className="text-xs text-text-muted">{label}</span>
          <span className="text-xs text-text-secondary font-medium">{value}</span>
        </div>
      ))}
    </div>
  )
}

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  bracket: 'Bracket',
  squares: 'Squares',
  fantasy: 'Fantasy',
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

export default function JoinLeagueModal({ onClose }) {
  const [code, setCode] = useState('')
  const joinLeague = useJoinLeague()
  const joinOpen = useJoinOpenLeague()
  const { data: openLeagues, isLoading } = useOpenLeagues()
  const navigate = useNavigate()
  const [joiningId, setJoiningId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  async function handleCodeSubmit(e) {
    e.preventDefault()
    try {
      const league = await joinLeague.mutateAsync({ inviteCode: code.trim().toUpperCase() })
      toast('Joined league!', 'success')
      onClose()
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
      onClose()
      navigate(`/leagues/${league.id}`)
    } catch (err) {
      toast(err.message || 'Failed to join league', 'error')
      setJoiningId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-card border border-border w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[90vh] overflow-y-auto scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
        >
          &times;
        </button>

        <h2 className="font-display text-xl mb-5">Join a League</h2>

        {/* Invite Code Section */}
        <form onSubmit={handleCodeSubmit}>
          <label className="block text-xs text-text-muted mb-1.5">Have an invite code?</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. A3K9F2MX"
              maxLength={8}
              className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2 text-center font-display text-sm tracking-widest text-text-primary placeholder-text-muted focus:outline-none focus:border-accent uppercase"
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

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 border-t border-border" />
          <span className="text-xs text-text-muted uppercase tracking-wider">Open Leagues</span>
          <div className="flex-1 border-t border-border" />
        </div>

        {/* Open Leagues List */}
        {isLoading ? (
          <LoadingSpinner />
        ) : !openLeagues?.length ? (
          <div className="text-center py-6">
            <p className="text-text-secondary text-sm">
              No open leagues at the moment.{' '}
              <Link
                to="/leagues/create"
                onClick={onClose}
                className="text-accent hover:text-accent-hover transition-colors font-semibold"
              >
                Create one!
              </Link>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {openLeagues.map((league) => {
              const lockLabel = formatLockDate(league.joins_locked_at)
              const isExpanded = expandedId === league.id
              return (
                <div
                  key={league.id}
                  className="bg-bg-secondary border border-border rounded-xl p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-text-primary truncate">{league.name}</div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-text-muted flex-wrap">
                        <span className="text-accent font-semibold">{FORMAT_LABELS[league.format] || league.format}</span>
                        <span>{SPORT_LABELS[league.sport] || league.sport}</span>
                        <span>{league.member_count}{league.max_members ? `/${league.max_members}` : ''} members</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                        <span>by {league.commissioner}</span>
                        {lockLabel && <span className="text-yellow-500">{lockLabel}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : league.id)}
                        className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-card-hover transition-colors"
                        aria-label="League settings"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleJoinOpen(league.id)}
                        disabled={joiningId === league.id}
                        className="px-4 py-2 rounded-lg font-display text-sm bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                      >
                        {joiningId === league.id ? '...' : 'Join'}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <LeagueSettingsPreview league={league} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
