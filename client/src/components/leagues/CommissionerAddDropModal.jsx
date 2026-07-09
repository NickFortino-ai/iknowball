import { useState, useMemo } from 'react'
import { useFantasyRosterForUser, useAvailablePlayers, useCommissionerAddDrop, useFantasySettings } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'

const POSITION_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']

/**
 * Duplicated from FantasyMyTeam / ForceLineupModal to keep this component
 * self-contained. Determines whether a player position fits the roster cap.
 */
function rosterSlotOrder(slot) {
  if (!slot) return 999
  const s = String(slot).toLowerCase()
  const tail = parseInt(s.replace(/^[a-z]+/, ''), 10) || 0
  if (s === 'qb') return 0
  if (s.startsWith('rb')) return 100 + tail
  if (s.startsWith('wr')) return 200 + tail
  if (s === 'te') return 300
  if (s === 'flex') return 400
  if (s === 'superflex' || s === 'sflex') return 500
  if (s === 'k') return 600
  if (s === 'def') return 700
  if (s.startsWith('bench')) return 1000 + tail
  if (s.startsWith('ir')) return 2000 + tail
  return 9999
}

function computeRosterCap(rosterSlots) {
  const slots = rosterSlots || { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, k: 1, def: 1, bench: 6 }
  let cap = 0
  for (const [k, v] of Object.entries(slots)) {
    if (k === 'ir') continue
    cap += Number(v) || 0
  }
  return cap
}

export default function CommissionerAddDropModal({ league, targetUserId, targetUserName, onClose }) {
  const { data: fantasySettings } = useFantasySettings(league.id)
  const { data: targetRoster, isLoading: rosterLoading } = useFantasyRosterForUser(league.id, targetUserId)
  const [posFilter, setPosFilter] = useState('All')
  const [query, setQuery] = useState('')
  const { data: available, isFetching: searchFetching } = useAvailablePlayers(
    league.id,
    query,
    posFilter === 'All' ? null : posFilter,
    null,
  )
  const addDrop = useCommissionerAddDrop(league.id)

  const [selectedAddId, setSelectedAddId] = useState(null)
  const [selectedDropId, setSelectedDropId] = useState(null)

  const rosterCap = useMemo(() => computeRosterCap(fantasySettings?.roster_slots), [fantasySettings?.roster_slots])
  const activeRoster = (targetRoster || []).filter((r) => r.slot !== 'ir')
  const needsDrop = activeRoster.length >= rosterCap

  const sortedRoster = useMemo(
    () => [...(targetRoster || [])].sort((a, b) => rosterSlotOrder(a.slot) - rosterSlotOrder(b.slot)),
    [targetRoster],
  )

  const selectedAdd = (available || []).find((p) => p.id === selectedAddId)
  const selectedDrop = (targetRoster || []).find((r) => r.player_id === selectedDropId)

  async function handleSubmit() {
    if (!selectedAddId) {
      toast('Pick a player to add', 'error')
      return
    }
    if (needsDrop && !selectedDropId) {
      toast(`${targetUserName}'s roster is full — pick a player to drop`, 'error')
      return
    }
    try {
      await addDrop.mutateAsync({
        userId: targetUserId,
        add_player_id: selectedAddId,
        drop_player_id: selectedDropId || null,
      })
      const addedName = selectedAdd?.full_name || 'Player'
      const droppedName = selectedDrop?.nfl_players?.full_name
      toast(
        droppedName
          ? `Added ${addedName}, dropped ${droppedName} on ${targetUserName}'s roster`
          : `Added ${addedName} to ${targetUserName}'s roster`,
        'success',
      )
      onClose()
    } catch (err) {
      toast(err.message || 'Failed to add/drop', 'error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{
        paddingTop: 'max(1.5rem, calc(3.5rem + env(safe-area-inset-top) + 1rem))',
        paddingBottom: 'max(1.5rem, calc(3.5rem + env(safe-area-inset-bottom) + 1rem))',
      }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-bg-primary border border-text-primary/20 rounded-2xl w-full sm:max-w-lg max-h-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 bg-bg-primary/95 backdrop-blur-sm border-b border-text-primary/20 px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-base text-text-primary truncate">Add/Drop: {targetUserName || 'Manager'}</h2>
            <p className="text-[11px] text-text-muted">Every action is logged and the manager is notified.</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1 shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {rosterLoading ? (
          <div className="p-10 flex justify-center"><LoadingSpinner /></div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* ADD section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] uppercase font-bold tracking-wider text-text-muted">
                    Add {selectedAdd ? `· ${selectedAdd.full_name}` : ''}
                  </div>
                  {selectedAddId && (
                    <button
                      onClick={() => setSelectedAddId(null)}
                      className="text-[11px] text-accent hover:text-accent-hover"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search free agents…"
                  className="w-full bg-text-primary/5 border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {POSITION_FILTERS.map((pos) => (
                    <button
                      key={pos}
                      onClick={() => setPosFilter(pos)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase transition-colors ${
                        posFilter === pos ? 'bg-accent text-white' : 'bg-text-primary/5 text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
                <div className="mt-2 rounded-lg border border-text-primary/15 bg-text-primary/[0.02] max-h-52 overflow-y-auto">
                  {searchFetching && !available ? (
                    <div className="p-4 text-center text-xs text-text-muted">Searching…</div>
                  ) : !available?.length ? (
                    <div className="p-4 text-center text-xs text-text-muted">No available players match.</div>
                  ) : (
                    available.slice(0, 30).map((p) => {
                      const isSelected = p.id === selectedAddId
                      return (
                        <button
                          key={p.id}
                          onClick={() => setSelectedAddId(p.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                            isSelected ? 'bg-correct/15 border-l-2 border-correct' : 'hover:bg-text-primary/5 border-l-2 border-transparent'
                          }`}
                        >
                          {p.headshot_url ? (
                            <img src={p.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-bg-secondary shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-text-primary truncate">{p.full_name}</div>
                            <div className="text-[11px] text-text-muted">{p.position} · {p.team || 'FA'}{p.injury_status ? ` · ${p.injury_status}` : ''}</div>
                          </div>
                          {isSelected && <span className="text-[10px] font-bold text-correct">ADD</span>}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              {/* DROP section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] uppercase font-bold tracking-wider text-text-muted">
                    Drop {selectedDrop ? `· ${selectedDrop.nfl_players?.full_name}` : ''}
                    {needsDrop && <span className="ml-2 text-yellow-400">(required — roster full)</span>}
                    {!needsDrop && <span className="ml-2 text-text-muted/60">(optional)</span>}
                  </div>
                  {selectedDropId && (
                    <button
                      onClick={() => setSelectedDropId(null)}
                      className="text-[11px] text-accent hover:text-accent-hover"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="rounded-lg border border-text-primary/15 bg-text-primary/[0.02] max-h-52 overflow-y-auto">
                  {sortedRoster.length === 0 ? (
                    <div className="p-4 text-center text-xs text-text-muted">This manager has no roster.</div>
                  ) : (
                    sortedRoster.map((r) => {
                      const isSelected = r.player_id === selectedDropId
                      const p = r.nfl_players || {}
                      return (
                        <button
                          key={r.player_id}
                          onClick={() => setSelectedDropId(r.player_id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                            isSelected ? 'bg-incorrect/15 border-l-2 border-incorrect' : 'hover:bg-text-primary/5 border-l-2 border-transparent'
                          }`}
                        >
                          <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted w-10 shrink-0">
                            {(r.slot || '').toUpperCase()}
                          </span>
                          {p.headshot_url ? (
                            <img src={p.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-bg-secondary shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-text-primary truncate">{p.full_name}</div>
                            <div className="text-[11px] text-text-muted">{p.position} · {p.team || 'FA'}</div>
                          </div>
                          {isSelected && <span className="text-[10px] font-bold text-incorrect">DROP</span>}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-text-primary/20 p-3 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-text-primary/5 text-text-secondary border border-text-primary/20"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!selectedAddId || (needsDrop && !selectedDropId) || addDrop.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white disabled:opacity-50 hover:bg-accent-hover transition-colors"
              >
                {addDrop.isPending ? 'Saving…' : (selectedDropId ? 'Add & Drop' : 'Add')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
