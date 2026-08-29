import { useState } from 'react'

// Pre-game preview. Replaces the box score before kickoff, where the line
// score and stat tables are empty by definition.
//
// Every section is independently optional — the server omits whatever ESPN
// doesn't have for that matchup, which varies by sport and by how far out
// the game is (Week 1 has no season leaders, low-profile games have no
// predictor). Rendering nothing beats rendering an empty card.
// Schedule dates are pinned to PT rather than the device's zone so the same
// game never shows a different day for two users. Every football kickoff is
// well clear of the PT midnight boundary, so this matches the ET date fans
// expect while staying consistent with the app's sports-day anchor.
function scheduleDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles',
  })
}

export default function GamePreview({ preview, away, home }) {
  // Which team's schedule is showing. 0 = away, matching the away-then-home
  // order used everywhere else in the modal. Hook runs before the early
  // return below so it isn't conditional.
  const [scheduleTeam, setScheduleTeam] = useState(0)
  if (!preview) return null
  const {
    venue, odds, predictor, leaders, blurb, season,
    last_five: lastFive, season_results: seasonResults,
  } = preview
  // Football sports send the full season SCHEDULE — every game, results
  // filling in as they're played. Everything else sends ESPN's trailing
  // five, which is only ever completed games. Same shape, different heading.
  const formList = seasonResults || lastFive
  const formLabel = seasonResults ? `${season || ''} schedule`.trim() : 'Last 5'

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

      {/* Football sends a full 12-17 game schedule. That's a list, not a row
          of chips — one team at a time, vertically, with a toggle. The chip
          row below is kept for Last 5, where five items genuinely do read
          better side by side. */}
      {seasonResults && formRows.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{formLabel}</span>
            {formRows.length > 1 && (
              <div className="flex rounded-lg border border-text-primary/15 overflow-hidden shrink-0">
                {formRows.map(({ team, entry }, i) => (
                  <button
                    key={team.id}
                    onClick={() => setScheduleTeam(i)}
                    className={`text-[11px] font-bold px-2.5 py-1 transition-colors ${
                      i === scheduleTeam
                        ? 'bg-accent text-white'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {entry.team_abbr || team.abbr || team.short}
                  </button>
                ))}
              </div>
            )}
          </div>
          {(() => {
            const active = formRows[Math.min(scheduleTeam, formRows.length - 1)]
            return (
              <div className="rounded-lg border border-text-primary/10 divide-y divide-text-primary/5">
                {active.entry.games.map((g, i) => {
                  const played = g.played !== false
                  return (
                    <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                      <span className="w-12 shrink-0 text-text-muted tabular-nums">{scheduleDate(g.date)}</span>
                      <span className="flex-1 min-w-0 truncate text-text-primary">
                        <span className="text-text-muted">{g.at_vs === '@' ? '@' : 'vs'}</span> {g.opponent}
                      </span>
                      <span
                        className={`shrink-0 tabular-nums font-semibold ${
                          !played ? 'text-text-muted/50'
                            : g.result === 'W' ? 'text-correct'
                              : g.result === 'L' ? 'text-incorrect'
                                : 'text-text-muted'
                        }`}
                      >
                        {played ? `${g.result || ''} ${g.score || ''}`.trim() : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {!seasonResults && formRows.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">{formLabel}</div>
          <div className="space-y-2">
            {formRows.map(({ team, entry }) => (
              <div key={team.id} className="flex items-center gap-2">
                {/* entry.team_abbr is ESPN's real abbreviation ("SJSU"). Prefer
                    it: Game Center passes a proper abbr, but the Picks modal
                    only knows the full team NAME, so this column was rendering
                    "San Jose State Spartans" clipped to "San Jo...". */}
                <span className="text-[11px] font-bold text-text-primary w-11 shrink-0 tracking-wide">
                  {entry.team_abbr || team.abbr || team.short}
                </span>
                {/* Scroll rather than wrap. Wrapped chips gave the two teams
                    different row heights, so they stopped reading as two
                    comparable timelines — and a football season is 12-17
                    chips, not 5. */}
                <div className="flex gap-1 overflow-x-auto pb-1 -mb-1">
                  {entry.games.map((g, i) => {
                    // Defensive: a row with no `played` flag is a completed
                    // game (that's all last_five ever contains).
                    const played = g.played !== false
                    const tone = !played
                      ? 'border-text-primary/15 text-text-muted'
                      : g.result === 'W'
                        ? 'border-correct/40 text-correct'
                        : g.result === 'L'
                          ? 'border-incorrect/40 text-incorrect'
                          : 'border-text-primary/20 text-text-muted'
                    return (
                      <span
                        key={i}
                        title={played
                          ? `${g.result || ''} ${g.score || ''} ${g.at_vs || ''}${g.opponent || ''}`.trim()
                          : `${g.at_vs || ''}${g.opponent || ''}${g.date ? ` · ${new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`}
                        className={`inline-flex items-baseline gap-1 text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap shrink-0 ${tone}`}
                      >
                        {played && <span className="font-bold">{g.result || '—'}</span>}
                        {/* Opponent sits at lower emphasis so a row of five
                            reads as a W/L sequence first and a fixture list
                            second — the old chips bolded both equally, which
                            is what made the block look like noise. */}
                        <span className="opacity-60">{g.at_vs || ''}{g.opponent || ''}</span>
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
