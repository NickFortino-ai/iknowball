import { useState } from 'react'
import { useDraftPlayerDetail, useMockDraftPlayerDetail } from '../../hooks/useLeagues'

/**
 * Embedded player preview that lives in the draft room — replaces the
 * standalone DraftPlayerDetailModal. Shows compact info by default with
 * an expand chevron for prior-season stats.
 *
 * Two modes:
 *  - league: pass leagueId + playerId
 *  - mock: pass playerId + mockScoring
 */
const POS_COLORS = {
  QB: 'bg-red-500/20 text-red-300',
  RB: 'bg-green-500/20 text-green-300',
  WR: 'bg-yellow-500/20 text-yellow-300',
  TE: 'bg-blue-500/20 text-blue-300',
  K: 'bg-gray-500/20 text-gray-300',
  DEF: 'bg-purple-500/20 text-purple-300',
}

const INJURY_COLORS = {
  Out: 'bg-incorrect/20 text-incorrect',
  IR: 'bg-incorrect/20 text-incorrect',
  Questionable: 'bg-yellow-500/20 text-yellow-500',
  Doubtful: 'bg-yellow-500/20 text-yellow-500',
  Probable: 'bg-correct/20 text-correct',
  'Day-To-Day': 'bg-yellow-500/20 text-yellow-500',
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
  ]
  if (position === 'RB') return [
    { key: 'pts', label: 'Pts' },
    { key: 'rush_yd', label: 'RuYD' },
    { key: 'rush_td', label: 'RuTD' },
    { key: 'rec', label: 'REC' },
    { key: 'rec_yd', label: 'ReYD' },
    { key: 'rec_td', label: 'ReTD' },
  ]
  return [
    { key: 'pts', label: 'Pts' },
    { key: 'rec', label: 'REC' },
    { key: 'rec_yd', label: 'ReYD' },
    { key: 'rec_td', label: 'ReTD' },
    { key: 'rush_yd', label: 'RuYD' },
    { key: 'rush_td', label: 'RuTD' },
  ]
}

export default function DraftPlayerPreview({ leagueId, mockScoring, playerId, onClose, onDraft }) {
  const [expanded, setExpanded] = useState(false)
  const isLeague = !!leagueId
  const leagueQuery = useDraftPlayerDetail(isLeague ? leagueId : null, isLeague ? playerId : null)
  const mockQuery = useMockDraftPlayerDetail(!isLeague ? playerId : null, mockScoring)
  const { data, isLoading } = isLeague ? leagueQuery : mockQuery

  if (isLoading || !data) {
    return (
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-3 animate-pulse">
        <div className="h-12 bg-bg-secondary rounded" />
      </div>
    )
  }

  const { player, prior, weekly_stats, scoring } = data
  const projKey = scoring?.format === 'ppr' ? 'projected_pts_ppr' : scoring?.format === 'standard' ? 'projected_pts_std' : 'projected_pts_half_ppr'
  const proj = player[projKey]
  const isRookie = !prior

  return (
    <div className="relative rounded-xl border border-text-primary/20 bg-bg-primary overflow-hidden">
      {/* × top-right corner */}
      <button
        onClick={onClose}
        className="absolute top-1.5 right-2 z-10 w-9 h-9 flex items-center justify-center text-text-muted hover:text-incorrect text-2xl leading-none"
        title="Close"
      >
        ×
      </button>
      {/* ▾ bottom-right corner */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="absolute bottom-1.5 right-2 z-10 w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-primary text-lg leading-none"
        title={expanded ? 'Collapse' : 'Expand details'}
      >
        {expanded ? '▴' : '▾'}
      </button>

      {/* Compact row — pr-10 reserves space for the corner buttons */}
      <div className="flex items-center gap-3 md:gap-4 pl-3 md:pl-5 pr-10 md:pr-12 py-4">
        {player.headshot_url && (
          <img
            src={player.headshot_url}
            alt={player.full_name}
            width="80"
            height="80"
            decoding="async"
            className="w-20 h-20 md:w-20 md:h-20 rounded-full object-cover bg-bg-card border border-text-primary/20 shrink-0"
            onError={(e) => { e.target.style.visibility = 'hidden' }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-xl md:text-2xl text-text-primary break-words leading-tight">{player.full_name}</span>
            {player.injury_status && (
              <span className={`text-[10px] md:text-xs font-bold px-2 py-0.5 rounded ${INJURY_COLORS[player.injury_status] || 'bg-text-primary/10 text-text-muted'}`}>
                {player.injury_status}
              </span>
            )}
          </div>
          <div className="text-xs md:text-sm text-text-muted flex items-center gap-2 mt-1 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-[11px] md:text-xs font-bold ${POS_COLORS[player.position] || 'bg-text-primary/10 text-text-muted'}`}>
              {player.position}
            </span>
            <span>{player.team || 'FA'}</span>
            {player.bye_week && <span>· Bye {player.bye_week}</span>}
            <span>· ADP #{player.search_rank || '—'}</span>
            {proj != null && <span>· {Number(proj).toFixed(1)} proj</span>}
          </div>
          {onDraft && (
            <button
              onClick={onDraft}
              className="mt-2 px-4 md:px-5 py-2 md:py-2.5 rounded-lg text-sm md:text-base font-bold uppercase tracking-wider bg-accent text-white hover:bg-accent-hover active:scale-95 transition"
            >
              Draft
            </button>
          )}
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-text-primary/10 px-3 md:px-5 py-4 space-y-4">
          {isRookie ? (
            <div className="text-center text-sm text-text-muted py-4">Rookie — no prior NFL season data</div>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <h4 className="text-xs uppercase text-text-muted tracking-wider">{prior.season} Season</h4>
                <span className="text-[11px] text-text-muted italic">in this league's scoring</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="GP" value={prior.games_played} />
                <Stat label="Total Pts" value={prior.total_pts} accent />
                <Stat label="Avg" value={prior.avg_pts} accent />
              </div>
              {weekly_stats?.length > 0 && (
                <div className="overflow-x-auto -mx-3 md:-mx-5 px-3 md:px-5">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase text-text-muted">
                        <th className="text-left font-semibold px-2 py-2 sticky left-0 bg-bg-primary">Wk</th>
                        {columnsFor(player.position).map((c) => (
                          <th key={c.key} className="text-right font-semibold px-2 py-2 whitespace-nowrap">{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {weekly_stats.map((w) => (
                        <tr key={w.week} className="border-t border-text-primary/10">
                          <td className="px-2 py-2.5 font-semibold sticky left-0 bg-bg-primary text-text-primary">{w.week}</td>
                          {columnsFor(player.position).map((c) => {
                            const val = w[c.key]
                            const display = val == null ? '—' : c.key === 'pts' ? Number(val).toFixed(1) : val
                            return (
                              <td
                                key={c.key}
                                className={`px-2 py-2.5 text-right whitespace-nowrap ${c.key === 'pts' ? 'text-accent font-bold text-base' : 'text-text-primary'}`}
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
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div className="bg-bg-card rounded-lg border border-text-primary/10 px-3 py-3 text-center">
      <div className="text-[11px] uppercase text-text-muted tracking-wider mb-1">{label}</div>
      <div className={`font-display text-2xl md:text-3xl ${accent ? 'text-accent' : 'text-text-primary'}`}>{value}</div>
    </div>
  )
}
