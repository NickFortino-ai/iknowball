import { useState, useMemo, useEffect } from 'react'
import { useFantasyRosterForUser, useForceLineup, useFantasySettings } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'

/**
 * Build ordered starter slot definitions from a league's roster_slots.
 * Duplicated from FantasyMyTeam to avoid an export-just-for-this refactor.
 * Keep in sync when either side changes.
 */
function buildStarterSlots(rosterSlots) {
  const slots = rosterSlots || { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, k: 1, def: 1 }
  const result = []
  if ((slots.qb || 0) >= 1) result.push({ key: 'qb', label: 'QB', positions: ['QB'] })
  for (let i = 1; i <= (slots.rb || 0); i++) result.push({ key: `rb${i}`, label: 'RB', positions: ['RB'] })
  for (let i = 1; i <= (slots.wr || 0); i++) result.push({ key: `wr${i}`, label: 'WR', positions: ['WR'] })
  if ((slots.te || 0) >= 1) result.push({ key: 'te', label: 'TE', positions: ['TE'] })
  if ((slots.flex || 0) >= 1) result.push({ key: 'flex', label: 'FLEX', positions: ['RB', 'WR', 'TE'] })
  if ((slots.superflex || 0) >= 1) result.push({ key: 'superflex', label: 'SFLEX', positions: ['QB', 'RB', 'WR', 'TE'] })
  if ((slots.k || 0) >= 1) result.push({ key: 'k', label: 'K', positions: ['K'] })
  if ((slots.def || 0) >= 1) result.push({ key: 'def', label: 'DEF', positions: ['DEF'] })
  for (let i = 1; i <= (slots.dl || 0); i++) result.push({ key: `dl${i}`, label: 'DL', positions: ['DE', 'DT', 'NT', 'DL'] })
  for (let i = 1; i <= (slots.lb || 0); i++) result.push({ key: `lb${i}`, label: 'LB', positions: ['LB', 'ILB', 'OLB', 'MLB'] })
  for (let i = 1; i <= (slots.db || 0); i++) result.push({ key: `db${i}`, label: 'DB', positions: ['CB', 'DB'] })
  for (let i = 1; i <= (slots.s || 0); i++) result.push({ key: `s${i}`, label: 'S', positions: ['S', 'FS', 'SS'] })
  return result
}

function isPositionEligibleForSlot(playerPosition, slotPositions) {
  if (!playerPosition || !slotPositions) return false
  const parts = playerPosition.split('/').map((p) => p.trim()).filter(Boolean)
  return parts.some((p) => slotPositions.includes(p))
}

export default function ForceLineupModal({ league, targetUserId, targetUserName, onClose }) {
  const { data: fantasySettings } = useFantasySettings(league.id)
  const { data: roster, isLoading } = useFantasyRosterForUser(league.id, targetUserId)
  const force = useForceLineup(league.id)

  const STARTER_SLOTS = useMemo(
    () => buildStarterSlots(fantasySettings?.roster_slots),
    [fantasySettings?.roster_slots],
  )

  // slotByPlayer: { player_id: slotKey } — full mapping we'll send.
  // Bench players get slot 'bench'. IR stays as IR. Unassigned starter
  // slots are allowed at edit time but blocked at submit.
  const [slotByPlayer, setSlotByPlayer] = useState({})

  // Initialize from server-side roster once loaded.
  useEffect(() => {
    if (!roster?.length) return
    const initial = {}
    for (const r of roster) initial[r.player_id] = r.slot || 'bench'
    setSlotByPlayer(initial)
  }, [roster])

  const rosterById = useMemo(() => {
    const map = {}
    for (const r of roster || []) map[r.player_id] = r
    return map
  }, [roster])

  // For each starter slot, find who's currently assigned there.
  const playerBySlot = useMemo(() => {
    const map = {}
    for (const [pid, slot] of Object.entries(slotByPlayer)) map[slot] = pid
    return map
  }, [slotByPlayer])

  // Bench + IR listings for the read-only sidebar / footer summary.
  const benched = (roster || []).filter((r) => slotByPlayer[r.player_id] === 'bench')
  const injured = (roster || []).filter((r) => slotByPlayer[r.player_id] === 'ir')

  function assignSlot(slotKey, playerId) {
    setSlotByPlayer((prev) => {
      const next = { ...prev }
      // Move whoever was in this slot to bench, then place the new pick.
      const displaced = Object.entries(next).find(([pid, s]) => s === slotKey && pid !== playerId)?.[0]
      if (displaced) next[displaced] = 'bench'
      // Wherever the incoming player was, replace with new slot.
      if (playerId) next[playerId] = slotKey
      return next
    })
  }

  function clearSlot(slotKey) {
    setSlotByPlayer((prev) => {
      const next = { ...prev }
      for (const [pid, s] of Object.entries(next)) {
        if (s === slotKey) next[pid] = 'bench'
      }
      return next
    })
  }

  async function handleSave() {
    // Validate: every starter slot must be filled.
    const unfilledSlots = STARTER_SLOTS.filter((s) => !playerBySlot[s.key])
    if (unfilledSlots.length > 0) {
      toast(`Missing starter for ${unfilledSlots.map((s) => s.label).join(', ')}`, 'error')
      return
    }
    const slots = Object.entries(slotByPlayer).map(([player_id, slot]) => ({ player_id, slot }))
    try {
      const result = await force.mutateAsync({ userId: targetUserId, slots })
      const n = result?.changed_count ?? 0
      toast(n === 0 ? 'No slots changed' : `Forced lineup — ${n} slot${n === 1 ? '' : 's'} changed`, 'success')
      onClose()
    } catch (err) {
      toast(err.message || 'Failed to force lineup', 'error')
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
            <h2 className="font-display text-base text-text-primary truncate">Force Lineup: {targetUserName || 'Manager'}</h2>
            <p className="text-[11px] text-text-muted">This edit is logged and the manager is notified.</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1 shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="p-10 flex justify-center"><LoadingSpinner /></div>
        ) : !roster?.length ? (
          <div className="p-10 text-center text-sm text-text-muted">This manager has no roster in this league.</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {STARTER_SLOTS.map((slot) => {
                const assignedPid = playerBySlot[slot.key]
                const assigned = assignedPid ? rosterById[assignedPid] : null
                // Eligible = on this manager's roster, position fits, and not
                // already starting in another slot (we'd overwrite if picked).
                const eligible = (roster || []).filter((r) => {
                  if (r.slot === 'ir' && !assigned) return false // don't move IR into a starter slot silently
                  if (!isPositionEligibleForSlot(r.nfl_players?.position, slot.positions)) return false
                  return true
                })
                return (
                  <div key={slot.key} className="rounded-lg border border-text-primary/15 bg-text-primary/5 p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted w-10 shrink-0">{slot.label}</span>
                      <select
                        value={assignedPid || ''}
                        onChange={(e) => {
                          const pid = e.target.value
                          if (!pid) clearSlot(slot.key)
                          else assignSlot(slot.key, pid)
                        }}
                        className="flex-1 bg-bg-primary border border-text-primary/20 rounded-lg px-2 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                      >
                        <option value="">— pick a player —</option>
                        {eligible.map((r) => (
                          <option key={r.player_id} value={r.player_id}>
                            {r.nfl_players?.full_name} ({r.nfl_players?.position} · {r.nfl_players?.team || 'FA'}
                            {r.nfl_players?.injury_status ? ` · ${r.nfl_players.injury_status}` : ''})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              })}

              {benched.length > 0 && (
                <div className="mt-4 pt-3 border-t border-text-primary/10">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-text-muted mb-1.5">Bench</div>
                  <div className="text-xs text-text-primary/70">
                    {benched.map((r) => r.nfl_players?.full_name).filter(Boolean).join(', ') || 'None'}
                  </div>
                </div>
              )}
              {injured.length > 0 && (
                <div className="mt-2">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-text-muted mb-1.5">Injured Reserve</div>
                  <div className="text-xs text-text-primary/70">
                    {injured.map((r) => r.nfl_players?.full_name).filter(Boolean).join(', ') || 'None'}
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-text-primary/20 p-3 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-text-primary/5 text-text-secondary border border-text-primary/20"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={force.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white disabled:opacity-50 hover:bg-accent-hover transition-colors"
              >
                {force.isPending ? 'Saving…' : 'Force & Notify'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
