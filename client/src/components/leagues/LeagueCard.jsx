import { Link } from 'react-router-dom'

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

const STATUS_STYLES = {
  open: 'bg-correct/20 text-correct',
  active: 'bg-accent/20 text-accent',
  completed: 'bg-text-muted/20 text-text-muted',
  archived: 'bg-text-muted/20 text-text-muted',
}

export default function LeagueCard({ league }) {
  const hasBackdrop = !!league.backdrop_image

  return (
    <Link
      to={`/leagues/${league.id}`}
      className="block relative bg-bg-primary rounded-xl border border-text-primary/20 overflow-hidden hover:bg-text-primary/5 transition-colors"
    >
      {hasBackdrop && (
        <>
          <img
            src={`/backdrops/${league.backdrop_image}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-bg-primary/80 via-bg-primary/60 to-bg-primary/80 pointer-events-none" />
        </>
      )}
      <div className="relative z-10 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-lg truncate text-white">{league.name}</h3>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_STYLES[league.status]}`}>
            {league.status}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="font-semibold px-2 py-0.5 rounded bg-accent/20 text-accent">
            {FORMAT_LABELS[league.format]}
          </span>
          <span>{SPORT_LABELS[league.sport]}</span>
          <span>{league.member_count} {league.member_count === 1 ? 'member' : 'members'}</span>
          {league.my_role === 'commissioner' && (
            <span className="font-semibold px-2 py-0.5 rounded bg-tier-hof/20 text-tier-hof">Commish</span>
          )}
        </div>
      </div>
    </Link>
  )
}
