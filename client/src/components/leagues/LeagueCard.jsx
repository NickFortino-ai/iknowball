import { Link } from 'react-router-dom'
import { getBackdropUrl } from '../../lib/backdropUrl'

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  squares: 'Squares',
  bracket: 'Bracket',
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
  all: 'All Sports',
}

function formatRunsUntil(league) {
  if (league.format === 'survivor') return 'Last one standing'
  if (league.format === 'squares') return 'End of game'
  if (league.duration === 'full_season') return 'End of season'
  if (league.duration === 'playoffs_only') return 'End of playoffs'
  if (league.ends_at) {
    return new Date(league.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
  }
  return null
}

const STATUS_STYLES = {
  open: 'bg-correct/20 text-correct',
  active: 'bg-accent/20 text-accent',
  completed: 'bg-text-muted/20 text-text-muted',
  archived: 'bg-text-muted/20 text-text-muted',
}

export default function LeagueCard({ league, noLink }) {
  const hasBackdrop = !!league.backdrop_image
  const Wrapper = noLink ? 'div' : Link
  const wrapperProps = noLink ? {} : { to: `/leagues/${league.id}` }

  return (
    <Wrapper
      {...wrapperProps}
      className="block relative bg-bg-primary rounded-xl border border-text-primary/20 overflow-hidden hover:bg-text-primary/5 transition-colors"
    >
      {/* Readiness corner clip — tiny color flag with hover popover */}
      {league.readiness && (
        <div className="absolute top-0 right-0 z-20 group">
          <span
            className={`block w-3 h-3 rounded-bl-md ${
              league.readiness === 'ready'
                ? 'bg-correct'
                : league.readiness === 'attention'
                ? 'bg-yellow-500'
                : 'bg-incorrect'
            }`}
          />
          {/* Hover/touch popover */}
          <div className="hidden group-hover:block group-active:block absolute top-4 right-1 z-30 pointer-events-none">
            <div className={`whitespace-nowrap text-[11px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg border ${
              league.readiness === 'ready'
                ? 'bg-correct/15 border-correct/40 text-correct'
                : league.readiness === 'attention'
                ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-500'
                : 'bg-incorrect/15 border-incorrect/40 text-incorrect'
            }`}>
              {league.readiness_detail || (
                league.readiness === 'ready' ? 'Ready for the next contest'
                : league.readiness === 'attention' ? 'Needs attention'
                : 'Action needed'
              )}
            </div>
          </div>
        </div>
      )}
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
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-lg truncate text-white">{league.name}</h3>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_STYLES[league.status]}`}>
            {league.status}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-text-muted min-h-[3.25rem] sm:min-h-0 content-start">
          <span className="font-semibold px-2 py-0.5 rounded bg-accent/20 text-accent">
            {FORMAT_LABELS[league.format]}
          </span>
          <span>{SPORT_LABELS[league.sport]}</span>
          <span>{league.member_count} {league.member_count === 1 ? 'member' : 'members'}</span>
          {league.my_role === 'commissioner' && (
            <span className="font-semibold px-2 py-0.5 rounded bg-tier-hof/20 text-tier-hof">Commish</span>
          )}
        </div>
        {league.status === 'open' && league.starts_at ? (
          <div className="text-xs text-text-muted mt-1.5">
            Starts <span className="text-yellow-500 font-semibold">{new Date(league.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}</span>
          </div>
        ) : formatRunsUntil(league) ? (
          <div className="text-xs text-text-muted mt-1.5">
            Runs until <span className="text-text-secondary font-medium">{formatRunsUntil(league)}</span>
          </div>
        ) : null}
      </div>
    </Wrapper>
  )
}
