import { Link } from 'react-router-dom'

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  squares: 'Squares',
  bracket: 'Bracket',
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
  all: 'All Sports',
}

const STATUS_STYLES = {
  open: 'bg-correct/20 text-correct',
  active: 'bg-accent/20 text-accent',
  completed: 'bg-text-muted/20 text-text-muted',
  archived: 'bg-text-muted/20 text-text-muted',
}

export default function LeagueCard({ league }) {
  return (
    <Link
      to={`/leagues/${league.id}`}
      className="block bg-bg-primary rounded-xl border border-text-primary/20 p-4 hover:bg-text-primary/5 transition-colors"
    >
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
    </Link>
  )
}
