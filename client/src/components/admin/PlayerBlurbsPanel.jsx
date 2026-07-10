import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'

const SPORTS = [
  { key: 'nfl', label: 'NFL' },
  { key: 'nba', label: 'NBA' },
  { key: 'wnba', label: 'WNBA' },
  { key: 'mlb', label: 'MLB' },
]

const POSITIONS_BY_SPORT = {
  nfl: ['all', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB', 'S'],
  nba: ['all', 'PG', 'SG', 'SF', 'PF', 'C', 'G', 'F'],
  wnba: ['all', 'G', 'F', 'C'],
  mlb: ['all', 'SP', 'RP', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH'],
}

// Injury filter chips. 'Any' matches any non-null injury_status. Specific
// statuses match exactly. NFL most commonly returns Questionable / Doubtful /
// Probable / Out / IR. DTD is rare for NFL (more common in NBA/MLB) but
// included for completeness since Sleeper occasionally surfaces it.
const INJURY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'any', label: 'Any injury' },
  { key: 'Out', label: 'Out' },
  { key: 'IR', label: 'IR' },
  { key: 'Doubtful', label: 'Doubtful' },
  { key: 'Questionable', label: 'Questionable' },
  { key: 'Probable', label: 'Probable' },
  { key: 'Day-To-Day', label: 'DTD' },
]

export default function PlayerBlurbsPanel() {
  const [sport, setSport] = useState('nfl')
  const [position, setPosition] = useState('all')
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [creatingFor, setCreatingFor] = useState(null)
  const [createContent, setCreateContent] = useState('')
  const [historyPlayerId, setHistoryPlayerId] = useState(null)
  const [history, setHistory] = useState([])
  const [week, setWeek] = useState(1)
  const [search, setSearch] = useState('')
  const [injuryFilter, setInjuryFilter] = useState('all')
  const season = new Date().getFullYear()

  const filteredPlayers = (() => {
    let list = players
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((p) => p.full_name?.toLowerCase().includes(q))
    if (injuryFilter === 'any') {
      list = list.filter((p) => !!p.injury_status)
    } else if (injuryFilter !== 'all') {
      list = list.filter((p) => p.injury_status === injuryFilter)
    }
    return list
  })()

  const fetchPlayers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get(`/admin/blurbs/players?season=${season}&position=${position}&sport=${sport}`)
      setPlayers(data)
    } catch (err) {
      toast(err.message, 'error')
    }
    setLoading(false)
  }, [position, season, sport])

  useEffect(() => { fetchPlayers() }, [fetchPlayers])

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    // Acts on the currently visible (filtered) set — toggles on/off based on
    // whether every visible player is already selected.
    const allVisibleSelected = filteredPlayers.length > 0
      && filteredPlayers.every((p) => selected.has(p.id))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        for (const p of filteredPlayers) next.delete(p.id)
      } else {
        for (const p of filteredPlayers) next.add(p.id)
      }
      return next
    })
  }

  const handleGenerate = async () => {
    if (!selected.size) return toast('Select players first', 'error')
    setGenerating(true)
    try {
      const result = await api.post('/admin/blurbs/generate', {
        playerIds: [...selected],
        season,
        week,
      })
      toast(`Generated ${result.generated} blurbs`, 'success')
      setSelected(new Set())
      fetchPlayers()
    } catch (err) {
      toast(err.message, 'error')
    }
    setGenerating(false)
  }

  const handlePublish = async (blurbId) => {
    try {
      await api.post(`/admin/blurbs/${blurbId}/publish`)
      toast('Published', 'success')
      fetchPlayers()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const handlePublishAll = async () => {
    setPublishing(true)
    try {
      const result = await api.post('/admin/blurbs/publish-all')
      toast(`Published ${result.published} blurbs`, 'success')
      fetchPlayers()
    } catch (err) {
      toast(err.message, 'error')
    }
    setPublishing(false)
  }

  const handleEdit = async (blurbId) => {
    try {
      await api.patch(`/admin/blurbs/${blurbId}`, { content: editContent })
      toast('Updated', 'success')
      setEditingId(null)
      fetchPlayers()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const handleCreate = async (playerId) => {
    try {
      await api.post('/admin/blurbs', { player_id: playerId, content: createContent, season, week, sport })
      toast('Blurb created', 'success')
      setCreatingFor(null)
      setCreateContent('')
      fetchPlayers()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const handleDelete = async (blurbId) => {
    if (!confirm('Delete this blurb?')) return
    try {
      await api.delete(`/admin/blurbs/${blurbId}`)
      toast('Deleted', 'success')
      fetchPlayers()
      if (historyPlayerId) loadHistory(historyPlayerId)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const loadHistory = async (playerId) => {
    if (historyPlayerId === playerId) { setHistoryPlayerId(null); return }
    setHistoryPlayerId(playerId)
    try {
      const data = await api.get(`/admin/blurbs/player/${playerId}/history`)
      setHistory(data)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const draftCount = players.filter((p) => p.blurb?.status === 'draft').length

  const positionOptions = POSITIONS_BY_SPORT[sport] || ['all']

  return (
    <div className="space-y-4">
      {/* Sport selector */}
      <div className="flex flex-wrap gap-1">
        {SPORTS.map((s) => (
          <button
            key={s.key}
            onClick={() => { setSport(s.key); setPosition('all'); setSelected(new Set()) }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              sport === s.key ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 flex-wrap">
          {positionOptions.map((pos) => (
            <button
              key={pos}
              onClick={() => setPosition(pos)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                position === pos ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
              }`}
            >
              {pos === 'all' ? 'All' : pos}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players…"
          className="flex-1 min-w-[12rem] max-w-sm px-3 py-1.5 rounded-lg bg-bg-card border border-text-primary/20 text-sm text-text-primary placeholder-text-muted"
        />

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-text-muted">Week</label>
          <input
            type="number"
            min={1}
            max={18}
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
            className="w-14 px-2 py-1 rounded-lg bg-bg-card border border-text-primary/20 text-sm text-text-primary"
          />
        </div>
      </div>

      {/* Injury status filter */}
      <div className="flex flex-wrap gap-1">
        {INJURY_FILTERS.map((f) => {
          const active = injuryFilter === f.key
          // Active styling must use literal Tailwind classes — dynamic
          // bg-${tone} strings get tree-shaken by the JIT compiler.
          const activeClass = !active ? 'bg-bg-card text-text-secondary border border-transparent'
            : f.key === 'Out' || f.key === 'IR' ? 'bg-incorrect/30 text-incorrect border border-incorrect/50'
            : f.key === 'Questionable' || f.key === 'Doubtful' || f.key === 'Day-To-Day' ? 'bg-yellow-500/30 text-yellow-500 border border-yellow-500/50'
            : f.key === 'Probable' ? 'bg-correct/30 text-correct border border-correct/50'
            : 'bg-accent text-white border border-transparent'
          return (
            <button
              key={f.key}
              onClick={() => setInjuryFilter(f.key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${activeClass}`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={selectAll}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg-card border border-text-primary/20 text-text-secondary hover:bg-bg-card/80"
        >
          {filteredPlayers.length > 0 && filteredPlayers.every((p) => selected.has(p.id)) ? 'Deselect All' : 'Select All'}
        </button>
        {sport === 'nfl' && (
          <button
            onClick={handleGenerate}
            disabled={generating || !selected.size}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white disabled:opacity-50"
          >
            {generating ? 'Generating...' : `Generate AI Blurbs (${selected.size})`}
          </button>
        )}
        {draftCount > 0 && (
          <button
            onClick={handlePublishAll}
            disabled={publishing}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-correct text-white disabled:opacity-50"
          >
            {publishing ? 'Publishing...' : `Publish All Drafts (${draftCount})`}
          </button>
        )}
      </div>

      {/* Player list */}
      {loading ? (
        <LoadingSpinner />
      ) : filteredPlayers.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">
          {search.trim()
            ? `No players matching "${search}"`
            : injuryFilter !== 'all'
              ? `No players with ${injuryFilter === 'any' ? 'any injury' : injuryFilter} status`
              : 'No players found'}
        </p>
      ) : (
        <div className="space-y-1">
          {filteredPlayers.map((player) => {
            const isSelected = selected.has(player.id)
            const blurb = player.blurb
            const isEditing = editingId === blurb?.id
            const isCreating = creatingFor === player.id
            const showingHistory = historyPlayerId === player.id

            return (
              <div key={player.id} className="bg-bg-primary border border-text-primary/20 rounded-xl overflow-hidden">
                {/* Player row */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(player.id)}
                    className="shrink-0 accent-accent"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary truncate">{player.full_name}</span>
                      <span className="text-[10px] text-text-muted">{player.position} · {player.team}</span>
                      {player.injury_status && (
                        <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                          player.injury_status === 'Out' ? 'bg-incorrect/20 text-incorrect'
                          : player.injury_status === 'Probable' ? 'bg-correct/20 text-correct'
                          : 'bg-yellow-500/20 text-yellow-500'
                        }`}>{player.injury_status}</span>
                      )}
                    </div>
                    {sport === 'nfl' && (
                      <div className="text-[10px] text-text-muted">
                        {player.seasonPoints} pts · {player.gamesPlayed} GP · {player.avgPoints} avg
                      </div>
                    )}
                    {/* Mobile: drop Published/Draft badge under the name row so
                        it doesn't compete for horizontal space with the
                        injury badge. Desktop still shows it in the right
                        column with Edit. */}
                    {blurb && (
                      <span className={`sm:hidden inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 ${
                        blurb.status === 'published' ? 'bg-correct/20 text-correct' : 'bg-yellow-500/20 text-yellow-500'
                      }`}>
                        {blurb.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                    )}
                  </div>

                  {/* Blurb status indicator */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {blurb && (
                      <>
                        <span className={`hidden sm:inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          blurb.status === 'published' ? 'bg-correct/20 text-correct' : 'bg-yellow-500/20 text-yellow-500'
                        }`}>
                          {blurb.status === 'published' ? 'Published' : 'Draft'}
                        </span>
                        <button
                          onClick={() => { setEditingId(isEditing ? null : blurb.id); setEditContent(blurb.content) }}
                          className="text-accent text-xs hover:underline"
                        >
                          Edit
                        </button>
                        {blurb.status === 'draft' && (
                          <button onClick={() => handlePublish(blurb.id)} className="text-correct text-xs hover:underline">
                            Publish
                          </button>
                        )}
                      </>
                    )}
                    {/* + always present so admins can publish a new blurb on top
                        of an existing one. Old blurbs stay in history; the
                        newest becomes current Player Notes. */}
                    <button
                      onClick={() => { setCreatingFor(isCreating ? null : player.id); setCreateContent('') }}
                      className="text-accent text-lg leading-none hover:text-accent/80"
                      title="Add new blurb"
                    >+</button>
                    <button
                      onClick={() => loadHistory(player.id)}
                      className="text-text-muted text-xs hover:text-text-primary"
                      title="View history"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Edit inline */}
                {isEditing && (
                  <div className="px-3 pb-3 space-y-2">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg bg-bg-card border border-text-primary/20 text-sm text-text-primary resize-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(blurb.id)} className="px-3 py-1 rounded-lg text-xs font-semibold bg-accent text-white">Save</button>
                      <button onClick={() => handleDelete(blurb.id)} className="px-3 py-1 rounded-lg text-xs font-semibold bg-incorrect/20 text-incorrect">Delete</button>
                      <button onClick={() => setEditingId(null)} className="px-3 py-1 rounded-lg text-xs font-semibold text-text-muted">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Create inline */}
                {isCreating && (
                  <div className="px-3 pb-3 space-y-2">
                    <textarea
                      value={createContent}
                      onChange={(e) => setCreateContent(e.target.value)}
                      rows={3}
                      placeholder="Write a player note..."
                      className="w-full px-3 py-2 rounded-lg bg-bg-card border border-text-primary/20 text-sm text-text-primary resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCreate(player.id)}
                        disabled={!createContent.trim()}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-accent text-white disabled:opacity-50"
                      >Create Draft</button>
                      <button onClick={() => setCreatingFor(null)} className="px-3 py-1 rounded-lg text-xs font-semibold text-text-muted">Cancel</button>
                    </div>
                  </div>
                )}

                {/* History dropdown */}
                {showingHistory && (
                  <div className="px-3 pb-3">
                    <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Blurb History</div>
                    {history.length === 0 ? (
                      <div className="text-xs text-text-muted">No history</div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {history.map((h) => {
                          // Border color = source (manual / ai / espn). Status
                          // is conveyed via the colored status label + opacity
                          // dimming for archived rows.
                          const sourceBorder = h.generated_by === 'ai'
                            ? 'border-purple-500/60'
                            : h.generated_by === 'espn'
                              ? 'border-blue-500/60'
                              : 'border-accent/60'
                          const sourceLabel = h.generated_by === 'ai'
                            ? 'AI'
                            : h.generated_by === 'espn'
                              ? 'ESPN'
                              : 'Manual'
                          return (
                            <div key={h.id} className={`rounded-lg border p-2 text-xs ${sourceBorder} ${h.status === 'archived' ? 'opacity-60' : ''}`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className={`font-bold ${
                                  h.status === 'published' ? 'text-correct' : h.status === 'draft' ? 'text-yellow-500' : 'text-text-muted'
                                }`}>{h.status}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-text-muted">
                                    {sourceLabel} · W{h.week || '?'}
                                    {h.published_at && ` · ${new Date(h.published_at).toLocaleDateString()}`}
                                  </span>
                                  <button onClick={() => handleDelete(h.id)} className="text-incorrect hover:underline">Delete</button>
                                </div>
                              </div>
                              <p className="text-text-primary">{h.content}</p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
