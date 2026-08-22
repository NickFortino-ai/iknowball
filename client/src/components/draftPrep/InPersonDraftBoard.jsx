import { useState, useMemo, useEffect, useRef } from 'react'
import { useDraftPrepRankings } from '../../hooks/useDraftPrep'
import LoadingSpinner from '../ui/LoadingSpinner'

const SWIPE_THRESHOLD = 80
const SWIPE_MAX = 160

const SLOT_DISPLAY = [
  { key: 'qb', label: 'QB' },
  { key: 'rb', label: 'RB' },
  { key: 'wr', label: 'WR' },
  { key: 'te', label: 'TE' },
  { key: 'flex', label: 'FLEX' },
  { key: 'sflex', label: 'SFLEX' },
  { key: 'k', label: 'K' },
  { key: 'def', label: 'DEF' },
  { key: 'bench', label: 'BN' },
]

function autoSlotKey(rosterSlots, currentRoster, position) {
  const pos = (position || '').toUpperCase()
  const naturalKey = pos === 'DEF' ? 'def' : pos.toLowerCase()
  const filled = (key) => (currentRoster[key]?.length || 0)
  const cap = (key) => (rosterSlots[key] || 0)

  if (cap(naturalKey) > 0 && filled(naturalKey) < cap(naturalKey)) return naturalKey
  if (['RB', 'WR', 'TE'].includes(pos) && cap('flex') > 0 && filled('flex') < cap('flex')) return 'flex'
  if (['QB', 'RB', 'WR', 'TE'].includes(pos) && cap('sflex') > 0 && filled('sflex') < cap('sflex')) return 'sflex'
  return 'bench'
}

function SwipeRow({ rank, player, onLeft, onRight }) {
  const [offset, setOffset] = useState(0)
  const [animating, setAnimating] = useState(false)
  const startRef = useRef(null)
  const movedRef = useRef(false)

  function handleStart(clientX) {
    startRef.current = clientX
    movedRef.current = false
    setAnimating(false)
  }

  function handleMove(clientX) {
    if (startRef.current == null) return
    const delta = clientX - startRef.current
    if (Math.abs(delta) > 4) movedRef.current = true
    const clamped = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, delta))
    setOffset(clamped)
  }

  function handleEnd() {
    if (startRef.current == null) return
    const final = offset
    startRef.current = null
    setAnimating(true)
    if (final > SWIPE_THRESHOLD) {
      setOffset(SWIPE_MAX * 1.5)
      setTimeout(() => onRight?.(), 150)
    } else if (final < -SWIPE_THRESHOLD) {
      setOffset(-SWIPE_MAX * 1.5)
      setTimeout(() => onLeft?.(), 150)
    } else {
      setOffset(0)
    }
  }

  const intent = offset > SWIPE_THRESHOLD ? 'right' : offset < -SWIPE_THRESHOLD ? 'left' : null

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Left action background — drafted by someone else */}
      <div className={`absolute inset-y-0 left-0 right-0 flex items-center justify-end pr-4 bg-incorrect/30 ${intent === 'left' ? 'opacity-100' : 'opacity-50'}`}>
        <span className="text-xs font-bold text-incorrect uppercase tracking-wider">Off the board ✕</span>
      </div>
      {/* Right action background — drafted for me */}
      <div className={`absolute inset-y-0 left-0 right-0 flex items-center justify-start pl-4 bg-correct/30 ${intent === 'right' ? 'opacity-100' : 'opacity-50'}`}>
        <span className="text-xs font-bold text-correct uppercase tracking-wider">✓ Draft for me</span>
      </div>

      <div
        className={`relative bg-bg-primary/60 backdrop-blur-md border border-text-primary/15 rounded-xl px-3 py-2.5 flex items-center gap-3 select-none ${animating ? 'transition-transform duration-150' : ''}`}
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        onTouchEnd={handleEnd}
        onMouseDown={(e) => handleStart(e.clientX)}
        onMouseMove={(e) => { if (startRef.current != null) handleMove(e.clientX) }}
        onMouseUp={handleEnd}
        onMouseLeave={() => { if (startRef.current != null) handleEnd() }}
      >
        <span className="text-text-muted font-semibold text-sm w-8 shrink-0 text-center">{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text-primary truncate">{player.full_name}</div>
          <div className="text-xs text-text-muted">
            <span className="font-bold text-text-primary">{player.position}</span>
            <span> · {player.team || 'FA'}</span>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onLeft?.() }}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-incorrect/40 text-incorrect hover:bg-incorrect/15"
            title="Drafted by someone else"
          >✕ Off</button>
          <button
            onClick={(e) => { e.stopPropagation(); onRight?.() }}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-correct/40 text-correct hover:bg-correct/15"
            title="Draft for me"
          >✓ Mine</button>
        </div>
      </div>
    </div>
  )
}

function RosterSlotRow({ label, capacity, players, onUndo }) {
  const rows = []
  for (let i = 0; i < capacity; i++) {
    const p = players[i]
    rows.push(
      <div key={`${label}-${i}`} className="flex items-center gap-2 bg-bg-primary/40 border border-text-primary/10 rounded-lg px-3 py-2">
        <span className="text-[10px] font-bold text-text-muted w-10 shrink-0">{label}</span>
        {p ? (
          <>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-text-primary truncate">{p.full_name}</div>
              <div className="text-[10px] text-text-muted">{p.position} · {p.team || 'FA'}</div>
            </div>
            <button
              onClick={() => onUndo(i)}
              className="text-[10px] text-text-muted hover:text-incorrect transition-colors"
              title="Remove from roster"
            >×</button>
          </>
        ) : (
          <span className="text-xs text-text-muted/50 italic">Empty</span>
        )}
      </div>
    )
  }
  return rows
}

export default function InPersonDraftBoard({ scoringFormat, configHash, rosterSlots }) {
  const { data: rankings, isLoading } = useDraftPrepRankings(scoringFormat, configHash)
  const STORAGE_KEY = `inPersonDraft:${scoringFormat}:${configHash}`

  const [draftedOthers, setDraftedOthers] = useState([])
  const [myRoster, setMyRoster] = useState({})
  const [introOpen, setIntroOpen] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)
  const [posFilter, setPosFilter] = useState('All')
  const [hydrated, setHydrated] = useState(false)
  // True when this session came back from localStorage rather than being
  // started here. Drives the resume banner below.
  const [resumed, setResumed] = useState(false)
  // ISO timestamp set when the user hits Finish. A finished draft shows its
  // recap instead of the live board, so a completed draft can never quietly
  // hide players from a future one.
  const [finishedAt, setFinishedAt] = useState(null)

  // Load from localStorage on mount / config change
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      const others = saved.others || []
      const roster = saved.roster || {}
      setDraftedOthers(others)
      setMyRoster(roster)
      setFinishedAt(saved.finishedAt || null)
      // A restored session hides players from the board. Silently resuming a
      // months-old draft made a correct board look wrong and unrecognizable,
      // so flag it and say so loudly instead.
      const restoredCount = others.length + Object.values(roster)
        .reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0)
      setResumed(restoredCount > 0)
    } catch {
      setDraftedOthers([])
      setMyRoster({})
      setFinishedAt(null)
      setResumed(false)
    }
    setHydrated(true)
  }, [STORAGE_KEY])

  // Save to localStorage on change. This is what makes progress survive
  // navigating away mid-draft — it must keep firing on every state change.
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ others: draftedOthers, roster: myRoster, finishedAt }))
  }, [STORAGE_KEY, draftedOthers, myRoster, finishedAt, hydrated])

  const draftedOthersSet = useMemo(() => new Set(draftedOthers), [draftedOthers])
  const myRosterIds = useMemo(() => {
    const set = new Set()
    Object.values(myRoster).forEach((arr) => {
      if (Array.isArray(arr)) arr.forEach((p) => set.add(p.player_id))
    })
    return set
  }, [myRoster])

  const totalDrafted = draftedOthers.length + myRosterIds.size

  // Rank comes from the FULL board and is stamped BEFORE any filtering, so a
  // player's number is their actual spot on your rankings and never moves as
  // players come off the board or you switch position tabs. Numbering the
  // filtered list instead (rank = index + 1) silently renumbered everything
  // on every pick, which made a correct board look like someone else's.
  const available = useMemo(() => {
    if (!rankings) return []
    return rankings
      .map((r, i) => ({ ...r, boardRank: i + 1 }))
      .filter((r) => !draftedOthersSet.has(r.player_id) && !myRosterIds.has(r.player_id))
      .filter((r) => posFilter === 'All' || r.nfl_players?.position === posFilter)
  }, [rankings, draftedOthersSet, myRosterIds, posFilter])

  function draftToOthers(player) {
    setDraftedOthers((prev) => [...prev, player.player_id])
  }

  function draftToMe(player) {
    const p = player.nfl_players
    if (!p) return
    setMyRoster((prev) => {
      const slotKey = autoSlotKey(rosterSlots, prev, p.position)
      const slot = prev[slotKey] || []
      return {
        ...prev,
        [slotKey]: [...slot, {
          player_id: player.player_id,
          full_name: p.full_name,
          position: p.position,
          team: p.team,
          nfl_player_id: p.id,
        }],
      }
    })
  }

  function removeFromMyRoster(slotKey, idx) {
    setMyRoster((prev) => {
      const slot = [...(prev[slotKey] || [])]
      slot.splice(idx, 1)
      return { ...prev, [slotKey]: slot }
    })
  }

  // Every starting slot the roster config asks for is filled. Bench is
  // excluded — it has no real cap (it renders a floor of 6 empty rows), so
  // counting it would mean the roster is never "full".
  const startingSlots = useMemo(
    () => SLOT_DISPLAY.filter((s) => s.key !== 'bench' && (rosterSlots[s.key] || 0) > 0),
    [rosterSlots],
  )
  const rosterFull = useMemo(
    () => startingSlots.length > 0 &&
      startingSlots.every((s) => (myRoster[s.key]?.length || 0) >= (rosterSlots[s.key] || 0)),
    [startingSlots, myRoster, rosterSlots],
  )

  function reset() {
    if (!confirm('Reset draft? All your swiped picks and drafted players will be cleared.')) return
    setDraftedOthers([])
    setMyRoster({})
    setFinishedAt(null)
    setResumed(false)
  }

  function finishDraft() {
    if (!rosterFull && !confirm('Finish draft? Your starting roster isn\'t full yet — you can reopen it after.')) return
    setFinishedAt(new Date().toISOString())
    setResumed(false)
    setRosterOpen(true)
  }

  // Escape hatch for a mis-tapped Finish — puts the live board back with the
  // session intact rather than forcing a reset.
  function reopenDraft() {
    setFinishedAt(null)
  }

  const finishedDate = finishedAt
    ? new Date(finishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  if (isLoading || !hydrated) return <LoadingSpinner />

  const positions = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']

  return (
    <div className="space-y-4">
      {/* Resumed-session banner. The board hides every player in a saved
          session, so a stale one silently subtracts players and shifts the
          list — indistinguishable from "these aren't my rankings". Make the
          resume explicit and give a one-tap way out. */}
      {/* Finished draft — the recap replaces the live board entirely, which is
          also what keeps a completed draft from silently hiding players the
          next time this roster + scoring combo is opened. */}
      {finishedAt && (
        <div className="rounded-xl border border-accent bg-bg-primary px-4 py-4">
          <div className="font-display text-xl text-text-primary">Draft complete</div>
          <div className="text-xs text-text-muted mt-1">
            Finished {finishedDate} · <span className="font-semibold text-text-primary">{myRosterIds.size}</span> players on your roster
          </div>
          <div className="text-xs text-text-secondary mt-2">
            Your roster is below. Starting a new draft clears this one.
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={reset}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-accent text-accent hover:bg-accent/10 transition-colors"
            >
              Start a new draft
            </button>
            <button
              onClick={reopenDraft}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-text-primary transition-colors"
            >
              Reopen this draft
            </button>
          </div>
        </div>
      )}

      {/* Roster full but not yet finished — offer the natural exit. */}
      {!finishedAt && rosterFull && (
        <div className="rounded-xl border border-correct/50 bg-bg-primary px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-text-primary">Your roster is full</div>
            <div className="text-xs text-text-secondary mt-0.5">
              Every starting slot is filled. Keep drafting for the bench, or wrap it up.
            </div>
          </div>
          <button
            onClick={finishDraft}
            className="px-3.5 py-2 rounded-lg text-xs font-bold bg-correct text-white hover:opacity-90 transition-opacity shrink-0"
          >
            Finish draft
          </button>
        </div>
      )}

      {!finishedAt && resumed && totalDrafted > 0 && (
        <div className="rounded-xl border border-accent bg-bg-primary px-4 py-3">
          <div className="text-sm font-bold text-text-primary">
            Picked up a draft already in progress
          </div>
          <div className="text-xs text-text-secondary mt-1">
            <span className="font-semibold text-text-primary">{totalDrafted}</span>
            {totalDrafted === 1 ? ' player is' : ' players are'} already marked drafted and hidden from the list below.
            If this isn't the draft you're in right now, start fresh.
          </div>
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={reset}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-accent text-accent hover:bg-accent/10 transition-colors"
            >
              Start fresh
            </button>
            <button
              onClick={() => setResumed(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-text-primary transition-colors"
            >
              Keep going
            </button>
          </div>
        </div>
      )}

      {/* Intro */}
      <div className={`rounded-xl border border-text-primary/20 backdrop-blur-md p-4 transition-colors ${introOpen ? 'bg-bg-primary/15' : 'bg-bg-primary/5'}`}>
        <button
          onClick={() => setIntroOpen(!introOpen)}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <p className="text-sm font-bold text-text-primary">
            Live-track your in-person draft right from your rankings.
          </p>
          <svg
            className={`w-5 h-5 shrink-0 text-accent transition-transform ${introOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {introOpen && (
          <ul className="space-y-1.5 text-sm text-text-primary/80 mt-3">
            <li className="flex gap-2"><span className="text-accent">•</span><span>Set the roster shape above to match your in-person league</span></li>
            <li className="flex gap-2"><span className="text-accent">•</span><span>Swipe left (or click ✕ Off on desktop) when someone else drafts a player</span></li>
            <li className="flex gap-2"><span className="text-accent">•</span><span>Swipe right (or click ✓ Mine on desktop) when you draft a player — they auto-fill the right slot</span></li>
            <li className="flex gap-2"><span className="text-accent">•</span><span>Players slot into their natural position first, then FLEX/SFLEX, then bench</span></li>
            <li className="flex gap-2"><span className="text-accent">•</span><span>Progress saves automatically — refresh and you're right where you left off</span></li>
          </ul>
        )}
      </div>

      {/* Status + reset */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="text-xs text-text-muted">
          <span className="text-text-primary font-semibold">{myRosterIds.size}</span> drafted by you
          {' · '}
          <span className="text-text-primary font-semibold">{draftedOthers.length}</span> off the board
          {' · '}
          <span className="text-text-primary font-semibold">{available.length}</span> available
        </div>
        {totalDrafted > 0 && (
          <div className="flex items-center gap-3 shrink-0">
            {!finishedAt && (
              <button
                onClick={finishDraft}
                className="text-xs font-semibold text-correct hover:opacity-80 transition-opacity underline"
              >
                Finish draft
              </button>
            )}
            <button
              onClick={reset}
              className="text-xs text-text-muted hover:text-incorrect transition-colors underline"
            >
              Reset draft
            </button>
          </div>
        )}
      </div>

      {/* My roster — pinned above the available list so it's always reachable */}
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary/30 backdrop-blur-md overflow-hidden">
        <button
          onClick={() => setRosterOpen(!rosterOpen)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg-primary/10 transition-colors"
        >
          <div className="text-left">
            <div className="font-display text-base text-text-primary">Your Roster</div>
            <div className="text-[11px] text-text-muted mt-0.5">
              {myRosterIds.size} drafted
            </div>
          </div>
          <svg
            className={`w-4 h-4 shrink-0 text-text-muted transition-transform ${rosterOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {rosterOpen && (
          <div className="px-4 pb-4 space-y-1.5">
            {SLOT_DISPLAY.filter((s) => s.key === 'bench' || (rosterSlots[s.key] || 0) > 0).map((s) => {
              const players = myRoster[s.key] || []
              // Bench shows a floor of 6 open rows while drafting so there's
              // somewhere to land; once finished, show only what was actually
              // drafted rather than a run of empty rows in the recap.
              const capacity = s.key === 'bench'
                ? (finishedAt ? players.length : Math.max(players.length, 6))
                : (rosterSlots[s.key] || 0)
              return (
                <div key={s.key} className="space-y-1">
                  {RosterSlotRow({
                    label: s.label,
                    capacity,
                    players,
                    onUndo: (idx) => removeFromMyRoster(s.key, idx),
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Live board — hidden once the draft is finished, so the recap above
          is the whole screen and there's nothing left to swipe by accident. */}
      {!finishedAt && (
        <>
          {/* Position filter */}
          <div className="flex flex-wrap gap-1.5">
            {positions.map((pos) => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  posFilter === pos
                    ? 'bg-accent text-white'
                    : 'bg-bg-primary/30 border border-text-primary/20 text-text-secondary hover:bg-white/10'
                }`}
              >{pos}</button>
            ))}
          </div>

          {/* Rankings list */}
          <div className="space-y-1.5">
            {available.length === 0 ? (
              <div className="text-center py-8 text-sm text-text-muted">
                {rankings?.length ? 'No more available players in this position.' : 'No rankings yet — set your board on the My Rankings tab first.'}
              </div>
            ) : (
              available.map((r) => (
                <SwipeRow
                  key={r.player_id}
                  rank={r.boardRank}
                  player={r.nfl_players || { full_name: 'Unknown', position: '', team: '' }}
                  onLeft={() => draftToOthers(r)}
                  onRight={() => draftToMe(r)}
                />
              ))
            )}
          </div>
        </>
      )}

    </div>
  )
}
