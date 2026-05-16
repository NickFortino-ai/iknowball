import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenLeagues, useJoinOpenLeague } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import { getBackdropUrl } from '../../lib/backdropUrl'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import Avatar from '../ui/Avatar'
import TierBadge from '../ui/TierBadge'

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
  tackles: 'Solo Tackles Contest',
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

const FORMAT_DESCRIPTIONS = {
  survivor: "Pick one team to win each period. If they lose, you lose a life. You can't reuse a team. The last manager standing takes the league.",
  pickem: 'Pick the winners of the games. Top of the standings at the end wins.',
  bracket: 'Fill out a postseason bracket and ride your picks all the way through. Most points across all rounds wins.',
  fantasy: 'Draft a team, set your lineup each week, work the waiver wire, and battle your league mates. Standard NFL fantasy with custom scoring.',
  nba_dfs: 'Build a fresh roster every night under a salary cap. No draft, no commitment — just pick the best lineup of the day.',
  mlb_dfs: 'Build a fresh lineup every game day under a salary cap. No long-term commitment — just nightly rosters.',
  hr_derby: 'Pick 3 MLB hitters per day. Each player usable only once per week. Most home runs across the season wins.',
  strikeouts: 'Pick 3 MLB pitchers per day. Each pitcher usable only once per week. Most strikeouts across the season wins.',
  three_point: 'Pick 3 NBA shooters per night. Most made 3-pointers across the season wins.',
  wnba_three_point: 'Pick 3 WNBA shooters per night. Most made 3-pointers across the season wins.',
  sacks: 'Pick 3 NFL defenders per week. Most sacks across the season wins.',
  ints: 'Pick 3 NFL defenders per week. Most interceptions across the season wins.',
  tackles: 'Pick 3 NFL defenders per week. Most solo tackles across the season wins.',
  receptions: 'Pick 3 NFL pass catchers per week. Most receptions across the season wins.',
  squares: 'Pick a square on the grid. When the score lands on your row + column at the end of any quarter, you win that quarter.',
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

function LeagueInfoModal({ league, onClose, onJoin, joining }) {
  // Only lock scroll while the modal is actually open. Locking on every
  // mount (when league=null) leaves the body unscrollable forever.
  useEffect(() => {
    if (!league) return
    lockScroll()
    return () => unlockScroll()
  }, [league])

  if (!league) return null

  const runsUntil = formatRunsUntil(league)
  const runsLine = formatLeagueRuns(league)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-primary border border-text-primary/20 w-full md:max-w-md rounded-t-2xl md:rounded-2xl overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with backdrop */}
        <div className="relative">
          {league.backdrop_image && (
            <>
              <img
                src={getBackdropUrl(league.backdrop_image)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
                style={{ objectPosition: `center ${league.backdrop_y ?? 50}%` }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-bg-primary/40 to-bg-primary/90 pointer-events-none" />
            </>
          )}
          <div className="relative p-6 pb-4">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
            >
              ×
            </button>
            <h2 className="font-display text-xl text-white pr-8 leading-tight break-words">{league.name}</h2>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs font-semibold text-accent">{getLeagueHeadline(league)}</span>
              <span className="text-xs text-text-secondary">
                {league.member_count}{league.max_members ? `/${league.max_members}` : ''} members
              </span>
            </div>
            {runsLine && (
              <div className="text-sm text-yellow-500 font-semibold mt-1.5">
                {runsLine}
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-4">
          {FORMAT_DESCRIPTIONS[league.format] && (
            <p className="text-sm text-text-primary leading-relaxed">
              {FORMAT_DESCRIPTIONS[league.format]}
            </p>
          )}

          {/* Quick facts grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pt-3 border-t border-text-primary/10">
            <div><span className="text-text-muted">Format: </span><span className="text-text-primary font-semibold">{FORMAT_LABELS[league.format] || league.format}</span></div>
            <div><span className="text-text-muted">Sport: </span><span className="text-text-primary">{SPORT_LABELS[league.sport] || league.sport}</span></div>
            {league.starts_at && (
              <div><span className="text-text-muted">Starts: </span><span className="text-text-primary">{formatStartDate(league.starts_at)}</span></div>
            )}
            {runsUntil && (
              <div><span className="text-text-muted">Runs until: </span><span className="text-text-primary">{runsUntil}</span></div>
            )}
            <div><span className="text-text-muted">Members: </span><span className="text-text-primary">{league.member_count}{league.max_members ? ` of ${league.max_members}` : ''}</span></div>
            <div><span className="text-text-muted">Commissioner: </span><span className="text-text-primary">{league.commissioner}</span></div>
            {league.settings?.pick_frequency && (
              <div><span className="text-text-muted">Picks: </span><span className="text-text-primary">{league.settings.pick_frequency === 'daily' ? 'Daily' : 'Weekly'}</span></div>
            )}
            {league.settings?.lives && (
              <div><span className="text-text-muted">Lives: </span><span className="text-text-primary">{league.settings.lives}</span></div>
            )}
          </div>

          {/* Members list (sorted by IKB rank) */}
          {league.top_members?.length > 0 && (
            <div className="pt-3 border-t border-text-primary/10">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Who's already in {league.member_count > 10 ? `(top 10 of ${league.member_count})` : ''}
              </div>
              <div className="space-y-1">
                {league.top_members.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-2 py-1">
                    <span className={`font-display text-xs w-5 text-right ${i < 3 ? 'text-accent' : 'text-text-muted'}`}>{i + 1}</span>
                    <Avatar user={m} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-text-primary truncate">{m.display_name || m.username}</div>
                      <div className="text-[10px] text-text-muted truncate">@{m.username}</div>
                    </div>
                    <TierBadge tier={m.tier} size="xs" />
                    <span className="text-xs text-text-muted tabular-nums w-12 text-right">{m.total_points ?? 0} pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bonus / scoring narrative — subtly persuasive. */}
          <div className="pt-3 border-t border-text-primary/10">
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">How winning pays</div>
            <p className="text-xs text-text-primary leading-relaxed">
              The winner takes a global IKB bonus that scales with league size — <span className="text-accent font-semibold">the bigger the league, the bigger the bonus</span>. Every member's final standing also adjusts their global IKB score: top-half finishers earn positive points, bottom-half finishers lose points. The exact formula is <span className="text-text-secondary font-mono">N + 1 − 2 × rank</span>, where N is the final member count.
            </p>
          </div>
        </div>

        {/* Footer with Join */}
        <div className="border-t border-text-primary/10 p-4 bg-bg-primary">
          <button
            onClick={() => onJoin(league.id)}
            disabled={joining}
            className="w-full px-6 py-3 rounded-xl font-display text-base bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {joining ? 'Joining...' : 'Join League'}
          </button>
        </div>
      </div>
    </div>
  )
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
    <div className="mb-8" data-onboarding="open-leagues">
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
