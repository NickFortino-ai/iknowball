import { useEffect } from 'react'
import { useDraftPlayerDetail, useMockDraftPlayerDetail } from '../../hooks/useLeagues'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import LoadingSpinner from '../ui/LoadingSpinner'

/**
 * Draft-context player detail modal. INTENTIONALLY SEPARATE from
 * PlayerDetailModal so the in-season experience cannot be broken by
 * changes here.
 *
 * Two modes:
 *  - league mode: pass `leagueId` + `playerId`, fetches via league endpoint
 *  - mock mode: pass `playerId` + `mockScoring` (no leagueId), fetches via /mock-draft endpoint
 */

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

function columnsFor(position) {
  if (position === 'QB') return [
    { key: 'pts', label: 'Pts' },
    { key: 'pass_cmp', label: 'CMP' },
    { key: 'pass_att', label: 'ATT' },
    { key: 'pass_yd', label: 'PaYD' },
    { key: 'pass_td', label: 'PaTD' },
    { key: 'pass_int', label: 'INT' },
    { key: 'rush_yd', label: 'RuYD' },
    { key: 'rush_td', label: 'RuTD' },
  ]
  if (position === 'K') return [
    { key: 'pts', label: 'Pts' },
    { key: 'fgm', label: 'FG' },
    { key: 'fgm_50_plus', label: '50+' },
    { key: 'xpm', label: 'XP' },
  ]
  if (position === 'DEF') return [
    { key: 'pts', label: 'Pts' },
    { key: 'def_sack', label: 'SK' },
    { key: 'def_int', label: 'INT' },
    { key: 'def_fum_rec', label: 'FR' },
    { key: 'def_td', label: 'TD' },
    { key: 'def_safety', label: 'SAF' },
    { key: 'def_pts_allowed', label: 'PA' },
  ]
  if (position === 'RB') return [
    { key: 'pts', label: 'Pts' },
    { key: 'rush_yd', label: 'RuYD' },
    { key: 'rush_td', label: 'RuTD' },
    { key: 'rec_tgt', label: 'TGT' },
    { key: 'rec', label: 'REC' },
    { key: 'rec_yd', label: 'ReYD' },
    { key: 'rec_td', label: 'ReTD' },
    { key: 'fum_lost', label: 'FUM' },
  ]
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

export default function DraftPlayerDetailModal({ leagueId, mockScoring, playerId, onClose, onDraft }) {
  const isLeague = !!leagueId
  const leagueQuery = useDraftPlayerDetail(isLeague ? leagueId : null, isLeague ? playerId : null)
  const mockQuery = useMockDraftPlayerDetail(!isLeague ? playerId : null, mockScoring)
  const { data, isLoading } = isLeague ? leagueQuery : mockQuery

  useEffect(() => { lockScroll(); return () => unlockScroll() }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-secondary w-full md:max-w-xl rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
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
          <Body data={data} onDraft={onDraft} />
        )}
      </div>
    </div>
  )
}

function Body({ data, onDraft }) {
  const { player, prior, weekly_stats, news, scoring } = data
  const projKey = scoring?.format === 'ppr' ? 'projected_pts_ppr' : scoring?.format === 'standard' ? 'projected_pts_std' : 'projected_pts_half_ppr'
  const proj = player[projKey]
  const isRookie = !prior

  return (
    <div className="p-5 space-y-5">
      {/* Headshot + name */}
      <div className="flex flex-col items-center text-center">
        {player.headshot_url && (
          <img
            src={player.headshot_url}
            alt={player.full_name}
            className="w-32 h-32 rounded-full object-cover bg-bg-card border-2 border-text-primary/20 mb-3"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        )}
        <h2 className="font-display text-2xl text-text-primary">{player.full_name}</h2>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-text-muted">{player.position} · {player.team || 'FA'}{player.bye_week ? ` · Bye ${player.bye_week}` : ''}</span>
          <InjuryBadge status={player.injury_status} />
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-text-primary/15 bg-bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-text-muted tracking-wider">Projected</div>
          <div className="font-display text-xl text-accent">{proj != null ? Number(proj).toFixed(1) : '—'}</div>
        </div>
        <div className="rounded-xl border border-text-primary/15 bg-bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-text-muted tracking-wider">ADP Rank</div>
          <div className="font-display text-xl text-text-primary">#{player.search_rank || '—'}</div>
        </div>
        <div className="rounded-xl border border-text-primary/15 bg-bg-card p-3 text-center">
          <div className="text-[10px] uppercase text-text-muted tracking-wider">Bye</div>
          <div className="font-display text-xl text-text-primary">{player.bye_week || '—'}</div>
        </div>
      </div>

      {/* Injury detail */}
      {player.injury_body_part && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3">
          <div className="text-xs uppercase font-semibold tracking-wider text-yellow-500 mb-1">Injury</div>
          <div className="text-xs text-text-secondary">{player.injury_body_part}</div>
        </div>
      )}

      {/* Last season summary */}
      {isRookie ? (
        <div className="rounded-xl border border-text-primary/15 bg-bg-card p-4 text-center">
          <div className="text-xs text-text-muted">Rookie — no prior NFL season data</div>
        </div>
      ) : (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-xs uppercase text-text-muted tracking-wider">{prior.season} Season</h3>
            <span className="text-[9px] text-text-muted italic">scored in this league's format</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <SummaryStat label="GP" value={prior.games_played} />
            <SummaryStat label="Total" value={prior.total_pts} accent />
            <SummaryStat label="Avg" value={prior.avg_pts} accent />
          </div>
          {weekly_stats?.length > 0 && (
            <PreviousGamesTable position={player.position} weeks={weekly_stats} />
          )}
        </div>
      )}

      {/* News */}
      {news?.length > 0 && (
        <div>
          <h3 className="text-xs uppercase text-text-muted tracking-wider mb-2">News & Updates</h3>
          <div className="space-y-2">
            {news.slice(0, 5).map((article, idx) => (
              <div key={idx} className="rounded-xl border border-text-primary/10 bg-bg-card p-3">
                <h4 className="text-sm font-bold text-text-primary leading-snug mb-1">{article.headline}</h4>
                {article.description && (
                  <p className="text-xs text-text-secondary leading-relaxed">{article.description}</p>
                )}
                {article.published && (
                  <div className="text-[10px] text-text-muted mt-1.5">
                    {new Date(article.published).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sticky draft button */}
      {onDraft && (
        <button
          onClick={onDraft}
          className="w-full px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wider bg-accent text-white hover:bg-accent-hover active:scale-[0.98] transition"
        >
          Draft {player.full_name}
        </button>
      )}
    </div>
  )
}

function SummaryStat({ label, value, accent }) {
  return (
    <div className="bg-bg-card rounded-lg border border-text-primary/10 px-3 py-2 text-center">
      <div className="text-[10px] uppercase text-text-muted tracking-wider">{label}</div>
      <div className={`font-display text-base ${accent ? 'text-accent' : 'text-text-primary'}`}>{value}</div>
    </div>
  )
}

function PreviousGamesTable({ position, weeks }) {
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
          {weeks.map((w) => (
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
