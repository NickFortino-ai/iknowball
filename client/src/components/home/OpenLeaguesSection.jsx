import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenLeagues, useJoinOpenLeague } from '../../hooks/useLeagues'
import DraftStartsIn from '../leagues/DraftStartsIn'
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

function formatRunsUntil(league) {
  if (league.format === 'survivor') return 'Last one standing'
  if (league.format === 'squares') return 'End of game'
  if (league.duration === 'full_season') return 'End of season'
  if (league.duration === 'playoffs_only') return 'End of playoffs'
  if (league.ends_at) return formatStartDate(league.ends_at)
  return null
}

function LeagueSettingsPreview({ league }) {
  const s = league.settings || {}
  const items = []
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

export default function OpenLeaguesSection() {
  const { data: leagues, isLoading } = useOpenLeagues()
  const joinOpen = useJoinOpenLeague()
  const navigate = useNavigate()
  const [joiningId, setJoiningId] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const [infoLeagueId, setInfoLeagueId] = useState(null)

  if (isLoading || !leagues?.length) return null

  async function handleJoin(leagueId) {
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
        <div className="space-y-4">
          {leagues.slice(0, 5).map((league) => {
            const hasBackdrop = !!league.backdrop_image

            return (
              <div
                key={league.id}
                className="relative rounded-xl border border-text-primary/20 bg-bg-primary overflow-hidden"
              >
                {hasBackdrop && (
                  <>
                    <img
                      src={getBackdropUrl(league.backdrop_image)}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
                      style={{ objectPosition: `center ${league.backdrop_y ?? 50}%` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-bg-primary/80 via-bg-primary/60 to-bg-primary/80 pointer-events-none" />
                  </>
                )}

                <div className="relative z-10 p-5">
                  {/* Title row — full width, info icon inline at end. League name wraps so it's always visible. */}
                  <div className="flex items-start gap-2">
                    <h3 className="font-display text-xl text-white flex-1 leading-tight break-words">
                      {league.name}
                    </h3>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {league.format === 'fantasy' && league.draft_date && league.draft_status !== 'completed' && (
                        <DraftStartsIn draftDate={league.draft_date} draftStatus={league.draft_status} />
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setInfoLeagueId(infoLeagueId === league.id ? null : league.id) }}
                        className="text-text-muted hover:text-text-secondary transition-colors p-1"
                        title="League Details"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="16" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs font-semibold text-accent">
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
                        {formatStartDate(league.starts_at)} – {formatRunsUntil(league) || 'TBD'}
                      </span>
                    )}
                  </div>
                  <LeagueSettingsPreview league={league} />

                  {/* Expanded info card */}
                  {infoLeagueId === league.id && (
                    <div className="mt-3 bg-bg-primary border border-text-primary/20 rounded-lg p-3 text-xs text-text-secondary space-y-2">
                      {/* Format description (the enticing pitch) */}
                      <p className="text-sm text-text-primary leading-relaxed">
                        {league.format === 'survivor' && "Pick one team to win each period. If they lose, you lose a life. You can't reuse a team. The last manager standing takes the league."}
                        {league.format === 'pickem' && "Pick the winner of every game. Underdogs are worth more — points are scaled by real odds. Climb the standings to win."}
                        {league.format === 'bracket' && "Fill out a postseason bracket and ride your picks all the way through. Most points across all rounds wins."}
                        {league.format === 'fantasy' && "Draft a team, set your lineup each week, work the waiver wire, and battle your league mates. Standard NFL fantasy with custom scoring."}
                        {league.format === 'nba_dfs' && "Build a fresh roster every night under a salary cap. No draft, no commitment — just pick the best lineup of the day."}
                        {league.format === 'mlb_dfs' && "Build a fresh lineup every game day under a salary cap. No long-term commitment — just nightly rosters."}
                        {league.format === 'hr_derby' && "Pick 3 MLB hitters per day. Each player usable only once per week. Most home runs across the season wins."}
                        {league.format === 'squares' && "Pick a square on the grid. When the score lands on your row + column at the end of any quarter, you win that quarter."}
                      </p>

                      <div className="border-t border-text-primary/10 pt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                        <div><span className="text-text-muted">Format:</span> <span className="text-text-primary font-semibold">{FORMAT_LABELS[league.format] || league.format}</span></div>
                        <div><span className="text-text-muted">Sport:</span> <span className="text-text-primary">{SPORT_LABELS[league.sport] || league.sport}</span></div>
                        {league.starts_at && <div><span className="text-text-muted">Starts:</span> <span className="text-text-primary">{formatStartDate(league.starts_at)}</span></div>}
                        {formatRunsUntil(league) && <div><span className="text-text-muted">Runs until:</span> <span className="text-text-primary">{formatRunsUntil(league)}</span></div>}
                        <div><span className="text-text-muted">Members:</span> <span className="text-text-primary">{league.member_count}{league.max_members ? ` of ${league.max_members}` : ''}</span></div>
                        <div><span className="text-text-muted">Commissioner:</span> <span className="text-text-primary">{league.commissioner}</span></div>
                        {league.settings?.pick_frequency && <div><span className="text-text-muted">Picks:</span> <span className="text-text-primary">{league.settings.pick_frequency === 'daily' ? 'Daily' : 'Weekly'}</span></div>}
                        {league.settings?.lives && <div><span className="text-text-muted">Lives:</span> <span className="text-text-primary">{league.settings.lives}</span></div>}
                      </div>
                    </div>
                  )}

                  {/* Join button — bottom right */}
                  <div className="flex justify-end mt-4">
                    <button
                      onClick={() => handleJoin(league.id)}
                      disabled={joiningId === league.id}
                      className="px-6 py-2.5 rounded-xl font-display text-sm bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
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
  )
}
