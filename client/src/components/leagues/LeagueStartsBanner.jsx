import { todaySportsDay, leagueStartSportsDay } from '../../lib/sportsDay'

// Reusable pre-start countdown card for league detail tabs. Renders a
// prominent glass-edge card with an accent-bordered countdown pill,
// bold date/headline, format-specific subtitle, and optional extra CTA
// (e.g. a "Try Mock Draft" link for fantasy).
//
// Callers own the "should we show this at all?" gating — the banner just
// renders whatever it's given. That keeps format-specific status checks
// (draft_status, isBracketLocked, etc.) where they belong.
export default function LeagueStartsBanner({
  countdownTo,
  headline,
  subtitle,
  extra,
}) {
  const startPtDay = leagueStartSportsDay(countdownTo)
  const todayPtDay = todaySportsDay()
  const daysUntil = startPtDay && todayPtDay
    ? Math.round((new Date(`${startPtDay}T00:00Z`).getTime() - new Date(`${todayPtDay}T00:00Z`).getTime()) / 86400000)
    : null
  const countdownLabel = daysUntil == null ? null
    : daysUntil <= 0 ? 'Starts today'
    : daysUntil === 1 ? 'Starts tomorrow'
    : `Starts in ${daysUntil} days`

  return (
    <div className="rounded-2xl border border-text-primary/20 bg-bg-primary/25 backdrop-blur-sm p-8 mb-4 text-center max-w-md mx-auto">
      {countdownLabel && (
        <div className="inline-flex items-center justify-center px-5 py-2 rounded-full border border-accent/60 bg-accent/10 text-accent text-sm font-bold tracking-wide mb-5 shadow-lg shadow-accent/10">
          {countdownLabel}
        </div>
      )}
      {headline && (
        <div className="font-display text-2xl text-text-primary">{headline}</div>
      )}
      {subtitle && (
        <div className="text-sm text-text-muted mt-3">{subtitle}</div>
      )}
      {extra && (
        <div className="mt-4">{extra}</div>
      )}
    </div>
  )
}
