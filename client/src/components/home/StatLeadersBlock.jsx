import { useState } from 'react'
import { useSportLeaders } from '../../hooks/useScoresStrip'
import LoadingSpinner from '../ui/LoadingSpinner'

// Reusable stat-leaders block. Two modes:
//   compact: top 3 with mini rows (headshot + name + value). Used on
//     the landing card under Final.
//   full: top 10 with headshots + rank column. Used on the drill-in
//     page under Standings.
//
// Both modes render tabs across category labels (HR, RBI, AVG, ...)
// so the user can flip which stat is showing without loading a
// separate view. Server returns all categories up front, so the tabs
// switch is a client-only state change.
export default function StatLeadersBlock({ sport, mode = 'full' }) {
  const { data, isLoading } = useSportLeaders(sport)
  const [activeIdx, setActiveIdx] = useState(0)

  if (isLoading) return mode === 'compact' ? null : <LoadingSpinner />
  const cats = data?.categories || []
  if (!cats.length) return null

  const active = cats[Math.min(activeIdx, cats.length - 1)]
  const rowCount = mode === 'compact' ? 5 : 10
  const rows = (active?.leaders || []).slice(0, rowCount)

  return (
    <div>
      {mode === 'full' && (
        <h2 className="font-display text-xl text-text-primary mb-3">Stat Leaders</h2>
      )}
      {mode === 'compact' && (
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Leaders</span>
          {data?.season && data.season !== new Date().getFullYear() && (
            <span className="text-[9px] text-text-muted">({data.season} season)</span>
          )}
        </div>
      )}
      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide mb-2">
        {cats.map((c, i) => (
          <button
            key={c.name}
            onClick={() => setActiveIdx(i)}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${
              i === activeIdx
                ? 'bg-accent text-white'
                : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {mode === 'full' ? (
        <div className="rounded-xl border border-text-primary/15 bg-bg-primary/20 backdrop-blur-md overflow-hidden">
          {rows.map((r) => (
            <div key={`${r.athlete_id}-${r.rank}`} className="flex items-center gap-3 px-3 py-2 border-b border-text-primary/5 last:border-0">
              <span className="w-6 text-center text-xs text-text-muted tabular-nums shrink-0">{r.rank}</span>
              {r.headshot ? (
                <img src={r.headshot} alt="" width="32" height="32" className="w-8 h-8 rounded-full object-cover shrink-0 bg-bg-secondary" loading="lazy" onError={(e) => e.currentTarget.style.visibility = 'hidden'} />
              ) : <span className="w-8 h-8 rounded-full bg-bg-secondary shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary truncate">{r.athlete_name}</div>
                <div className="text-[11px] text-text-muted flex items-center gap-1.5">
                  {r.team_abbr && <span>{r.team_abbr}</span>}
                  {r.position && <span>· {r.position}</span>}
                </div>
              </div>
              <div className="text-sm font-semibold tabular-nums text-text-primary shrink-0">
                {r.display_value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={`${r.athlete_id}-${r.rank}`} className="rounded-lg border border-text-primary/10 bg-bg-primary/20 backdrop-blur-md px-3 py-2 flex items-center gap-2.5">
              <span className="w-4 text-center text-xs text-text-muted tabular-nums shrink-0">{r.rank}</span>
              {r.headshot ? (
                <img src={r.headshot} alt="" width="24" height="24" className="w-6 h-6 rounded-full object-cover shrink-0 bg-bg-secondary" loading="lazy" onError={(e) => e.currentTarget.style.visibility = 'hidden'} />
              ) : <span className="w-6 h-6 rounded-full bg-bg-secondary shrink-0" />}
              <div className="flex-1 min-w-0 flex items-baseline gap-2">
                <span className="text-sm text-text-primary truncate">{r.athlete_name}</span>
                {r.team_abbr && <span className="text-[10px] text-text-muted shrink-0">{r.team_abbr}</span>}
              </div>
              <div className="text-sm font-semibold tabular-nums text-text-primary shrink-0">
                {r.display_value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
