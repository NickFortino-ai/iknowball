import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueHistory, useLineageSeasonStandings } from '../../hooks/useLeagues'
import LoadingSpinner from '../ui/LoadingSpinner'
import Avatar from '../ui/Avatar'
import { MODAL_INSET_STYLE } from '../../lib/modalInset'

// Renders the league's season-over-season lineage: each ancestor +
// current + child. Champion snapshot inline; expand a season to load
// its full final standings.
export default function LeagueHistoryModal({ leagueId, onClose }) {
  const { data: lineage, isLoading } = useLeagueHistory(leagueId)
  const [expandedId, setExpandedId] = useState(null)

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" style={MODAL_INSET_STYLE} onClick={onClose}>
      <div
        className="bg-bg-primary border border-text-primary/20 rounded-2xl w-full max-w-lg max-h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-text-primary/10 sticky top-0 bg-bg-primary z-10 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">League History</div>
            <h2 className="font-display text-xl text-text-primary">All seasons</h2>
            <p className="text-xs text-text-secondary mt-1">Tap a season to see final standings.</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-text-muted hover:text-text-primary text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-secondary transition-colors"
            aria-label="Close"
          >×</button>
        </div>

        <div className="p-5 space-y-2">
          {isLoading ? (
            <LoadingSpinner />
          ) : !lineage?.length ? (
            <div className="text-sm text-text-secondary text-center py-6">No history yet.</div>
          ) : (
            lineage.map((season) => (
              <SeasonRow
                key={season.id}
                leagueId={leagueId}
                season={season}
                expanded={expandedId === season.id}
                onToggle={() => setExpandedId(expandedId === season.id ? null : season.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function SeasonRow({ leagueId, season, expanded, onToggle }) {
  return (
    <div className={`rounded-xl border ${season.isCurrent ? 'border-accent/50 bg-accent/5' : 'border-text-primary/15'} overflow-hidden`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-bg-secondary transition-colors"
      >
        <div className="w-10 shrink-0 text-center">
          <div className="text-[10px] uppercase text-text-muted">Season</div>
          <div className="text-lg font-display text-text-primary leading-none">{season.season_ordinal}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {season.isCurrent ? (
              <span className="text-sm font-semibold text-text-primary truncate">{season.name}</span>
            ) : (
              <Link
                to={`/leagues/${season.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-sm font-semibold text-accent hover:underline truncate"
              >{season.name}</Link>
            )}
            {season.isCurrent && (
              <span className="text-[10px] font-bold text-accent uppercase tracking-wider shrink-0">Current</span>
            )}
          </div>
          {season.champion ? (
            <div className="flex items-center gap-1.5 mt-1 text-xs text-text-secondary">
              <span className="text-tier-hof">🏆</span>
              <span className="truncate">
                {season.champion.display_name || season.champion.username || 'Champion'}
              </span>
            </div>
          ) : (
            <div className="text-[11px] text-text-muted mt-1 capitalize">{season.status || 'pending'}</div>
          )}
        </div>
        <div className="text-text-muted shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>
      {expanded && <ExpandedStandings currentLeagueId={leagueId} seasonLeagueId={season.id} />}
    </div>
  )
}

function ExpandedStandings({ currentLeagueId, seasonLeagueId }) {
  const { data: standings, isLoading } = useLineageSeasonStandings(currentLeagueId, seasonLeagueId, true)

  if (isLoading) {
    return <div className="px-3 pb-3"><LoadingSpinner /></div>
  }
  if (!standings?.length) {
    return (
      <div className="px-3 pb-3 text-xs text-text-muted">
        Final standings will appear once this season completes.
      </div>
    )
  }

  return (
    <div className="border-t border-text-primary/10 divide-y divide-text-primary/10">
      {standings.map((s) => (
        <div key={s.user_id} className="flex items-center gap-3 px-3 py-2">
          <div className={`w-8 text-center text-sm font-bold ${s.rank === 1 ? 'text-tier-hof' : 'text-text-muted'}`}>
            {s.rank === 1 ? '🏆' : `#${s.rank}`}
          </div>
          <Avatar user={s} size="sm" />
          <div className="flex-1 min-w-0 text-sm text-text-primary truncate">
            {s.display_name || s.username || 'Unknown'}
          </div>
        </div>
      ))}
    </div>
  )
}
