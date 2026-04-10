import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'

const POSITIONS = ['all', 'QB', 'RB', 'WR', 'TE', 'DEF']

export default function PlayerBlurbsPanel() {
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
  const season = new Date().getFullYear()

  const fetchPlayers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get(`/admin/blurbs/players?season=${season}&position=${position}`)
      setPlayers(data)
    } catch (err) {
      toast(err.message, 'error')
    }
    setLoading(false)
  }, [position, season])

  useEffect(() => { fetchPlayers() }, [fetchPlayers])

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === players.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(players.map((p) => p.id)))
    }
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
      await api.post('/admin/blurbs', { player_id: playerId, content: createContent, season, week })
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

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {POSITIONS.map((pos) => (
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

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={selectAll}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg-card border border-text-primary/20 text-text-secondary hover:bg-bg-card/80"
        >
          {selected.size === players.length ? 'Deselect All' : 'Select All'}
        </button>
        <button
          onClick={handleGenerate}
          disabled={generating || !selected.size}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white disabled:opacity-50"
        >
          {generating ? 'Generating...' : `Generate AI Blurbs (${selected.size})`}
        </button>
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
      ) : (
        <div className="space-y-1">
          {players.map((player) => {
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
                    <div className="text-[10px] text-text-muted">
                      {player.seasonPoints} pts · {player.gamesPlayed} GP · {player.avgPoints} avg
                    </div>
                  </div>

                  {/* Blurb status indicator */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {blurb ? (
                      <>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
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
                    ) : (
                      <button
                        onClick={() => { setCreatingFor(isCreating ? null : player.id); setCreateContent('') }}
                        className="text-accent text-lg leading-none hover:text-accent/80"
                        title="Add blurb"
                      >+</button>
                    )}
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
                        {history.map((h) => (
                          <div key={h.id} className={`rounded-lg border p-2 text-xs ${
                            h.status === 'published' ? 'border-correct/30 bg-correct/5'
                            : h.status === 'draft' ? 'border-yellow-500/30 bg-yellow-500/5'
                            : 'border-text-primary/10 bg-bg-card/50 opacity-60'
                          }`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={`font-bold ${
                                h.status === 'published' ? 'text-correct' : h.status === 'draft' ? 'text-yellow-500' : 'text-text-muted'
                              }`}>{h.status}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-text-muted">
                                  {h.generated_by === 'ai' ? 'AI' : 'Manual'} · W{h.week || '?'}
                                  {h.published_at && ` · ${new Date(h.published_at).toLocaleDateString()}`}
                                </span>
                                <button onClick={() => handleDelete(h.id)} className="text-incorrect hover:underline">Del</button>
                              </div>
                            </div>
                            <p className="text-text-secondary">{h.content}</p>
                          </div>
                        ))}
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
