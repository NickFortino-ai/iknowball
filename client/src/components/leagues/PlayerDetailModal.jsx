import { useEffect } from 'react'
import { usePlayerDetail } from '../../hooks/useLeagues'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import LoadingSpinner from '../ui/LoadingSpinner'

const INJURY_COLORS = {
  Out: 'bg-incorrect/20 text-incorrect',
  IR: 'bg-incorrect/20 text-incorrect',
  Questionable: 'bg-yellow-500/20 text-yellow-500',
  Doubtful: 'bg-yellow-500/20 text-yellow-500',
  Probable: 'bg-correct/20 text-correct',
  'Day-To-Day': 'bg-yellow-500/20 text-yellow-500',
}

function InjuryBadge({ status }) {
  if (!status) return null
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${INJURY_COLORS[status] || 'bg-text-primary/10 text-text-muted'}`}>
      {status}
    </span>
  )
}

/**
 * Returns the column set used in the per-week stats table for a given position.
 * Skill positions share the same set; QB / K / DEF have their own.
 */
function columnsFor(position) {
  if (position === 'QB') {
    return [
      { key: 'pts', label: 'Pts' },
      { key: 'pass_cmp', label: 'CMP' },
      { key: 'pass_att', label: 'ATT' },
      { key: 'pass_yd', label: 'PaYD' },
      { key: 'pass_td', label: 'PaTD' },
      { key: 'pass_int', label: 'INT' },
      { key: 'rush_yd', label: 'RuYD' },
      { key: 'rush_td', label: 'RuTD' },
      // Trick plays — QB rarely gets these but we show them when they happen
      { key: 'rec_tgt', label: 'TGT' },
      { key: 'rec', label: 'REC' },
      { key: 'rec_yd', label: 'ReYD' },
      { key: 'rec_td', label: 'ReTD' },
    ]
  }
  if (position === 'K') {
    return [
      { key: 'pts', label: 'Pts' },
      { key: 'fgm', label: 'FG' },
      { key: 'fgm_50_plus', label: '50+' },
      { key: 'xpm', label: 'XP' },
    ]
  }
  if (position === 'DEF') {
    return [
      { key: 'pts', label: 'Pts' },
      { key: 'def_sack', label: 'SK' },
      { key: 'def_int', label: 'INT' },
      { key: 'def_fum_rec', label: 'FR' },
      { key: 'def_td', label: 'TD' },
      { key: 'def_safety', label: 'SAF' },
      { key: 'def_pts_allowed', label: 'PA' },
    ]
  }
  if (position === 'RB') {
    // Rushing first for RBs, then receiving since modern RBs catch a lot too
    return [
      { key: 'pts', label: 'Pts' },
      { key: 'rush_yd', label: 'RuYD' },
      { key: 'rush_td', label: 'RuTD' },
      { key: 'rec_tgt', label: 'TGT' },
      { key: 'rec', label: 'REC' },
      { key: 'rec_yd', label: 'ReYD' },
      { key: 'rec_td', label: 'ReTD' },
      { key: 'fum_lost', label: 'FUM' },
    ]
  }
  // WR / TE — receiving first, rushing trailing
  return [
    { key: 'pts', label: 'Pts' },
    { key: 'rec_tgt', label: 'TGT' },
    { key: 'rec', label: 'REC' },
    { key: 'rec_yd', label: 'ReYD' },
    { key: 'rec_td', label: 'ReTD' },
    { key: 'rush_yd', label: 'RuYD' },
    { key: 'rush_td', label: 'RuTD' },
    { key: 'fum_lost', label: 'FUM' },
  ]
}

function CurrentWeekStatLine({ position, week }) {
  if (!week) {
    return <p className="text-xs text-text-muted text-center">No stats yet this week.</p>
  }
  const columns = columnsFor(position)
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
      {columns.map((col) => {
        const val = week[col.key]
        const display = val == null ? '—' : col.key === 'pts' ? Number(val).toFixed(1) : val
        return (
          <div key={col.key} className="bg-bg-card rounded-lg border border-text-primary/10 px-3 py-2 text-center">
            <div className="text-[10px] uppercase text-text-muted tracking-wider">{col.label}</div>
            <div className={`font-display text-base ${col.key === 'pts' ? 'text-accent' : 'text-text-primary'}`}>{display}</div>
          </div>
        )
      })}
    </div>
  )
}

function PreviousGamesTable({ position, weeks, currentWeek }) {
  // Show all weeks that have stats, excluding the current week (which is shown above)
  const previous = (weeks || []).filter((w) => !currentWeek || w.week !== currentWeek.week)
  if (!previous.length) {
    return <p className="text-xs text-text-muted text-center py-3">No previous games.</p>
  }
  const columns = columnsFor(position)
  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase text-text-muted">
            <th className="text-left font-semibold px-2 py-2 sticky left-0 bg-bg-secondary">Wk</th>
            {columns.map((c) => (
              <th key={c.key} className="text-right font-semibold px-2 py-2 whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {previous.map((w) => (
            <tr key={w.week} className="border-t border-text-primary/10">
              <td className="px-2 py-2 font-semibold sticky left-0 bg-bg-secondary">{w.week}</td>
              {columns.map((c) => {
                const val = w[c.key]
                const display = val == null ? '—' : c.key === 'pts' ? Number(val).toFixed(1) : val
                return (
                  <td
                    key={c.key}
                    className={`px-2 py-2 text-right whitespace-nowrap ${c.key === 'pts' ? 'text-accent font-semibold' : 'text-text-primary'}`}
                  >
                    {display}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PlayerDetailModal({ leagueId, playerId, onClose }) {
  const { data, isLoading } = usePlayerDetail(leagueId, playerId)

  useEffect(() => {
    lockScroll()
    return () => unlockScroll()
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-secondary w-full md:max-w-xl rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <div className="sticky top-0 bg-bg-secondary border-b border-text-primary/10 px-4 py-3 flex items-center justify-end z-10">
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {isLoading || !data ? (
          <div className="p-10 flex items-center justify-center"><LoadingSpinner /></div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Headshot + name top center */}
            <div className="flex flex-col items-center text-center">
              {data.player.headshot_url && (
                <img
                  src={data.player.headshot_url}
                  alt={data.player.full_name}
                  className="w-32 h-32 rounded-full object-cover bg-bg-card border-2 border-text-primary/20 mb-3"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              )}
              <h2 className="font-display text-2xl text-text-primary">{data.player.full_name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-text-muted">{data.player.position} · {data.player.team || 'FA'}</span>
                <InjuryBadge status={data.player.injury_status} />
              </div>
              {data.season_summary && data.season_summary.games_played > 0 && (
                <div className="mt-2 text-xs text-text-muted">
                  Season: <span className="text-text-primary font-semibold">{data.season_summary.total_pts} pts</span>
                  {' · '}
                  <span className="text-text-primary font-semibold">{data.season_summary.avg_pts} avg</span>
                  {' · '}
                  <span className="text-text-primary font-semibold">{data.season_summary.games_played} GP</span>
                </div>
              )}
            </div>

            {/* Injury update */}
            {data.injury_detail && (
              <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500 shrink-0">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span className="text-xs uppercase font-semibold tracking-wider text-yellow-500">Injury Update</span>
                  <InjuryBadge status={data.injury_detail.status} />
                </div>
                {data.injury_detail.body_part && (
                  <div className="text-xs text-text-secondary">{data.injury_detail.body_part}</div>
                )}
                {data.injury_detail.detail && (
                  <div className="text-xs text-text-secondary mt-1">{data.injury_detail.detail}</div>
                )}
              </div>
            )}

            {/* Current week stat line */}
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-xs uppercase text-text-muted tracking-wider">
                  {data.current_week ? `Week ${data.current_week.week}` : 'Latest Week'}
                </h3>
                <span className="text-[9px] text-text-muted italic">Pts shown in this league's scoring</span>
              </div>
              <CurrentWeekStatLine position={data.player.position} week={data.current_week} />
            </div>

            {/* Previous games table */}
            <div>
              <h3 className="text-xs uppercase text-text-muted tracking-wider mb-2">Previous Games</h3>
              <PreviousGamesTable
                position={data.player.position}
                weeks={data.weekly_stats}
                currentWeek={data.current_week}
              />
            </div>

            {/* News & Updates */}
            {data.news && data.news.length > 0 && (
              <div>
                <h3 className="text-xs uppercase text-text-muted tracking-wider mb-2">News & Updates</h3>
                <div className="space-y-2">
                  {data.news.map((article, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-text-primary/10 bg-bg-card p-3"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="text-sm font-bold text-text-primary leading-snug">{article.headline}</h4>
                        {article.type && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-accent/20 text-accent shrink-0">{article.type}</span>
                        )}
                      </div>
                      {article.description && (
                        <p className="text-xs text-text-secondary leading-relaxed">{article.description}</p>
                      )}
                      {article.published && (
                        <div className="text-[10px] text-text-muted mt-1.5">
                          {new Date(article.published).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
