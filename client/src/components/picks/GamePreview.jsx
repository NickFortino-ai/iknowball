// Pre-game preview. Replaces the box score before kickoff, where the line
// score and stat tables are empty by definition.
//
// Every section is independently optional — the server omits whatever ESPN
// doesn't have for that matchup, which varies by sport and by how far out
// the game is (Week 1 has no season leaders, low-profile games have no
// predictor). Rendering nothing beats rendering an empty card.
export default function GamePreview({ preview, away, home }) {
  if (!preview) return null
  const {
    venue, odds, predictor, leaders, blurb, season,
    season_results: seasonResults,
  } = preview
  // Football sports send the full season SCHEDULE — every game, results
  // filling in as they're played. No other sport sends a form section at
  // all: ESPN's trailing five was dropped because five games says little on
  // its own, and before a season starts it quietly holds LAST season's.
  const formList = seasonResults
  const formLabel = `${season || ''} schedule`.trim()

  // season_results / leaders come keyed by ESPN team id; map to our team objects
  // so the columns line up away-then-home like the rest of the modal.
  //
  // Two callers pass different things: Game Center's team objects carry real
  // ESPN ids, while the Picks Game Intel modal only knows team names and
  // passes {id:'away'} / {id:'home'} — which matched nothing, so form and
  // leaders silently vanished there for every sport. Fall back to the ids the
  // preview now publishes so both callers resolve.
  const byTeam = (list) => [
    { team: away, espnId: preview.away_team_id },
    { team: home, espnId: preview.home_team_id },
  ]
    .filter((p) => p.team)
    .map(({ team, espnId }) => ({
      team,
      entry: (list || []).find((e) => (
        String(e.team_id) === String(team.id)
        || (espnId && String(e.team_id) === String(espnId))
      )),
    }))
    .filter((x) => x.entry)

  const formRows = byTeam(formList)
  const leaderRows = byTeam(leaders)

  return (
    <div className="space-y-4 mb-4">
      {blurb?.headline && (
        <div className="rounded-xl border border-text-primary/15 bg-bg-primary/30 px-4 py-3">
          <p className="text-sm text-text-primary leading-snug">{blurb.headline}</p>
          {blurb.broadcast && (
            <p className="text-[11px] text-text-muted mt-1.5">
              <span className="uppercase tracking-wider">Watch</span> · {blurb.broadcast}
            </p>
          )}
        </div>
      )}

      {(odds || predictor) && (
        <div className="rounded-xl border border-text-primary/15 bg-bg-primary/30 px-4 py-3">
          {odds && (
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className="text-sm font-semibold text-text-primary">{odds.details}</span>
              {odds.over_under != null && (
                <span className="text-xs text-text-muted">O/U {odds.over_under}</span>
              )}
            </div>
          )}
          {predictor && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
                <span>{away?.abbr || away?.short} {predictor.away_pct}%</span>
                <span className="uppercase tracking-wider">Win probability</span>
                <span>{predictor.home_pct}% {home?.abbr || home?.short}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-bg-secondary flex">
                <div className="h-full bg-accent" style={{ width: `${predictor.away_pct}%` }} />
                <div className="h-full bg-text-primary/30" style={{ width: `${predictor.home_pct}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {formRows.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">{formLabel}</div>
          <div className="space-y-2">
            {formRows.map(({ team, entry }) => (
              <div key={team.id} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-text-primary w-12 shrink-0 truncate">
                  {team.abbr || team.short}
                </span>
                {/* A full season is 12-13 chips, far more than the 5 this
                    started as. Scroll the row instead of wrapping it — wrapped
                    chips made the two teams' rows different heights, so they no
                    longer read as comparable timelines. */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1">
                  {entry.games.map((g, i) => {
                    // Defensive: treat a row with no `played` flag as played,
                    // so a cached pre-change payload renders as results
                    // rather than as an all-outlined schedule.
                    const played = g.played !== false
                    return (
                      <span
                        key={i}
                        title={played
                          ? `${g.result || ''} ${g.score || ''} ${g.at_vs || ''}${g.opponent || ''}`.trim()
                          : `${g.at_vs || ''}${g.opponent || ''}${g.date ? ` · ${new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap shrink-0 ${
                          !played
                            ? 'bg-transparent border border-text-primary/15 text-text-muted font-medium'
                            : g.result === 'W'
                              ? 'bg-correct/20 text-correct'
                              : g.result === 'L'
                                ? 'bg-incorrect/20 text-incorrect'
                                : 'bg-text-primary/10 text-text-muted'
                        }`}
                      >
                        {played ? `${g.result || '—'} ` : ''}{g.at_vs || ''}{g.opponent || ''}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {leaderRows.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">Team leaders</div>
          <div className="grid grid-cols-2 gap-3">
            {leaderRows.map(({ team, entry }) => (
              <div key={team.id}>
                <div className="text-xs font-semibold text-text-primary mb-1.5 truncate">{team.abbr || team.short}</div>
                <div className="space-y-1">
                  {entry.categories.map((c, i) => (
                    <div key={i} className="text-[11px] leading-tight">
                      <div className="text-text-muted">{c.label}</div>
                      <div className="text-text-primary truncate">{c.name} <span className="text-text-muted">{c.value}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {venue && (
        <div className="text-[11px] text-text-muted text-center">
          {venue.name}{venue.location ? ` · ${venue.location}` : ''}
        </div>
      )}
    </div>
  )
}
