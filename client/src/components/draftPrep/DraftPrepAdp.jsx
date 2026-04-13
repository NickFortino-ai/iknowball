import { useState, useMemo } from 'react'
import { useAdpData } from '../../hooks/useDraftPrep'
import LoadingSpinner from '../ui/LoadingSpinner'

const POSITION_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']

export default function DraftPrepAdp({ scoringFormat }) {
  const [posFilter, setPosFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortCol, setSortCol] = useState('adp')
  const [sortAsc, setSortAsc] = useState(true)

  const { data: players, isLoading } = useAdpData(scoringFormat, posFilter !== 'All' ? posFilter : undefined)

  function handleSort(col) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(true) }
  }

  const adpKey = scoringFormat === 'ppr' ? 'adp_ppr' : 'adp_half_ppr'
  const projKey = scoringFormat === 'ppr' ? 'projected_pts_ppr' : scoringFormat === 'standard' ? 'projected_pts_std' : 'projected_pts_half_ppr'

  const sorted = useMemo(() => {
    if (!players) return []
    let filtered = players
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((p) => p.full_name?.toLowerCase().includes(q))
    }

    return [...filtered].sort((a, b) => {
      let va, vb
      if (sortCol === 'adp') { va = a[adpKey] ?? 9999; vb = b[adpKey] ?? 9999 }
      else if (sortCol === 'proj') { va = a[projKey] ?? 0; vb = b[projKey] ?? 0 }
      else if (sortCol === 'name') { va = a.full_name || ''; vb = b.full_name || '' }
      else { va = 0; vb = 0 }

      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortAsc ? va - vb : vb - va
    })
  }, [players, searchQuery, sortCol, sortAsc, adpKey, projKey])

  if (isLoading) return <LoadingSpinner />

  const SortHeader = ({ col, label, className }) => (
    <button
      onClick={() => handleSort(col)}
      className={`text-[10px] md:text-xs font-semibold uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors ${className || ''}`}
    >
      {label} {sortCol === col ? (sortAsc ? '↑' : '↓') : ''}
    </button>
  )

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-3">
        <h3 className="font-display text-base text-text-primary mb-1">Average Draft Position</h3>
        <p className="text-[11px] text-text-muted mb-2">
          Current ADP data based on {scoringFormat === 'ppr' ? 'PPR' : scoringFormat === 'standard' ? 'Standard' : 'Half-PPR'} scoring.
        </p>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search players..."
          className="w-full bg-bg-secondary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div className="flex gap-1 mt-2 overflow-x-auto">
          {POSITION_FILTERS.map((pos) => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                posFilter === pos ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary'
              }`}
            >{pos}</button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        {/* Column headers */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-text-primary/10 bg-bg-primary">
          <span className="w-8 text-center text-[10px] md:text-xs font-semibold text-text-muted">#</span>
          <span className="w-9 shrink-0" />
          <SortHeader col="name" label="Player" className="flex-1 text-left" />
          <SortHeader col="adp" label="ADP" className="w-14 text-right" />
          <SortHeader col="proj" label="Proj" className="w-14 text-right" />
        </div>

        <div className="max-h-[65vh] overflow-y-auto divide-y divide-text-primary/10">
          {sorted.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2.5">
              <span className="text-xs font-bold text-text-muted w-8 text-center shrink-0">{i + 1}</span>
              {p.headshot_url ? (
                <img
                  src={p.headshot_url}
                  alt={p.full_name}
                  width="36"
                  height="36"
                  loading="lazy"
                  decoding="async"
                  className="w-9 h-9 rounded-full object-cover bg-bg-secondary shrink-0"
                  onError={(e) => { e.target.style.visibility = 'hidden' }}
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-bg-secondary shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary truncate">{p.full_name}</div>
                <div className="text-[10px] text-text-muted flex items-center gap-1.5">
                  <span className="font-bold text-text-primary">{p.position}</span>
                  <span>{p.team || 'FA'}</span>
                  {p.bye_week && <span>· Bye {p.bye_week}</span>}
                </div>
              </div>
              <div className="w-14 text-right text-sm font-semibold text-text-primary shrink-0">
                {p[adpKey] != null ? Math.round(p[adpKey] * 10) / 10 : '—'}
              </div>
              <div className="w-14 text-right text-sm text-text-muted shrink-0">
                {p[projKey] != null ? Math.round(p[projKey] * 10) / 10 : '—'}
              </div>
            </div>
          ))}
          {sorted.length === 0 && (
            <div className="text-center text-sm text-text-muted py-8">No players found.</div>
          )}
        </div>
      </div>
    </div>
  )
}
