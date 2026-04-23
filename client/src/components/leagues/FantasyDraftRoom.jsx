import { useState, useEffect, useMemo, useRef } from 'react'
import { useDraftBoard, useAvailablePlayers, useMakeDraftPick, useInitDraft, useStartDraft, useStartOfflineDraft, useRealtimeDraft, useDraftQueue, useSetDraftQueue, usePauseDraft, useResumeDraft, useMakeOfflineDraftPick, useUndoDraftPick, useMyRankings } from '../../hooks/useLeagues'
import DraftPlayerPreview from './DraftPlayerPreview'
import { useAuth } from '../../hooks/useAuth'
import Avatar from '../ui/Avatar'
import LoadingSpinner from '../ui/LoadingSpinner'
import { toast } from '../ui/Toast'

const POSITION_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']

const INJURY_COLORS = {
  Out: 'bg-incorrect/20 text-incorrect',
  Questionable: 'bg-yellow-500/20 text-yellow-500',
  Probable: 'bg-correct/20 text-correct',
  'Day-To-Day': 'bg-yellow-500/20 text-yellow-500',
}

function InjuryBadge({ status }) {
  if (!status) return null
  const label = status === 'Day-To-Day' ? 'DTD' : status.charAt(0)
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${INJURY_COLORS[status] || 'bg-text-primary/10 text-text-muted'}`} title={status}>
      {label}
    </span>
  )
}

// Live countdown to a scheduled draft. Renders the absolute date in the
// user's local timezone plus a ticking d/h/m/s countdown.
function DraftCountdown({ date }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const remaining = Math.max(0, date.getTime() - now)
  const days = Math.floor(remaining / 86400000)
  const hours = Math.floor((remaining % 86400000) / 3600000)
  const mins = Math.floor((remaining % 3600000) / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)
  const localDate = date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
  if (remaining === 0) {
    return (
      <div className="mb-4 px-4 py-3 rounded-xl border border-correct/40 bg-correct/10 text-correct text-sm font-semibold">
        Draft is starting any moment…
      </div>
    )
  }
  return (
    <div className="mb-4 px-4 py-3 rounded-xl border border-accent/40 bg-accent/10 inline-block">
      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Draft scheduled</div>
      <div className="text-sm text-text-primary font-semibold mb-2">{localDate}</div>
      <div className="flex items-center justify-center gap-3 font-display text-text-primary">
        {days > 0 && (
          <div className="text-center"><div className="text-xl tabular-nums">{days}</div><div className="text-[9px] uppercase text-text-muted">days</div></div>
        )}
        <div className="text-center"><div className="text-xl tabular-nums">{String(hours).padStart(2, '0')}</div><div className="text-[9px] uppercase text-text-muted">hr</div></div>
        <div className="text-center"><div className="text-xl tabular-nums">{String(mins).padStart(2, '0')}</div><div className="text-[9px] uppercase text-text-muted">min</div></div>
        <div className="text-center"><div className="text-xl tabular-nums">{String(secs).padStart(2, '0')}</div><div className="text-[9px] uppercase text-text-muted">sec</div></div>
      </div>
    </div>
  )
}

export default function FantasyDraftRoom({ league }) {
  const { profile } = useAuth()
  const { data: draftData, isLoading } = useDraftBoard(league.id)
  const makePick = useMakeDraftPick()
  const makeOfflinePick = useMakeOfflineDraftPick()
  const undoPick = useUndoDraftPick()
  const [offlineMode, setOfflineMode] = useState(false)
  const initDraft = useInitDraft()
  const startDraft = useStartDraft()
  const startOffline = useStartOfflineDraft()
  const { data: queue } = useDraftQueue(league.id)
  const setQueue = useSetDraftQueue()
  const pauseDraftMut = usePauseDraft()
  const resumeDraftMut = useResumeDraft()
  useRealtimeDraft(league.id)

  const queuedIds = useMemo(() => new Set((queue || []).map((q) => q.player_id)), [queue])

  async function toggleQueue(playerId) {
    const current = (queue || []).map((q) => q.player_id)
    const next = current.includes(playerId)
      ? current.filter((id) => id !== playerId)
      : [...current, playerId]
    try {
      await setQueue.mutateAsync({ leagueId: league.id, playerIds: next })
    } catch (err) {
      toast(err.message || 'Failed to update queue', 'error')
    }
  }

  async function moveQueue(playerId, direction) {
    const ids = (queue || []).map((q) => q.player_id)
    const idx = ids.indexOf(playerId)
    if (idx < 0) return
    const swap = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= ids.length) return
    ;[ids[idx], ids[swap]] = [ids[swap], ids[idx]]
    try {
      await setQueue.mutateAsync({ leagueId: league.id, playerIds: ids })
    } catch (err) {
      toast(err.message || 'Failed to reorder queue', 'error')
    }
  }

  const [posFilter, setPosFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [timerSeconds, setTimerSeconds] = useState(null)
  const [activeTab, setActiveTab] = useState('Players')
  const [playerView, setPlayerView] = useState('ADP') // 'ADP' or 'My Rankings'
  const [detailPlayerId, setDetailPlayerId] = useState(null)
  const { data: myRankings } = useMyRankings(league.id)
  const pickListRef = useRef(null)

  const { data: availablePlayers } = useAvailablePlayers(
    league.id,
    searchQuery || undefined,
    posFilter !== 'All' ? posFilter : undefined
  )

  const settings = draftData?.settings
  const picks = draftData?.picks || []
  const draftStatus = settings?.draft_status || 'pending'

  // Auto-enable offline mode when draft is in offline mode
  useEffect(() => {
    if (settings?.draft_mode === 'offline') setOfflineMode(true)
  }, [settings?.draft_mode])

  // Current pick info
  const currentPick = useMemo(() => {
    return picks.find((p) => !p.player_id) || null
  }, [picks])

  const isMyTurn = currentPick?.user_id === profile?.id
  const completedPicks = picks.filter((p) => p.player_id)

  // Pick timer
  useEffect(() => {
    if (draftStatus !== 'in_progress' || !currentPick || !settings?.draft_pick_timer) {
      setTimerSeconds(null)
      return
    }

    // Calculate time remaining based on last pick
    const lastPick = completedPicks[completedPicks.length - 1]
    const lastPickTime = lastPick?.picked_at ? new Date(lastPick.picked_at) : new Date()
    const elapsed = (Date.now() - lastPickTime.getTime()) / 1000
    const remaining = Math.max(0, settings.draft_pick_timer - elapsed)
    setTimerSeconds(Math.ceil(remaining))

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 0) return 0
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [draftStatus, currentPick?.pick_number, settings?.draft_pick_timer])

  // Tick beeps during the final countdown of YOUR pick. Fires once at
  // 10s remaining (gentle warning), then short blips at 5/4/3/2/1 with
  // rising pitch so the urgency escalates audibly.
  const lastBeepedSecondRef = useRef(null)
  useEffect(() => {
    if (!isMyTurn || draftStatus !== 'in_progress' || timerSeconds == null) {
      lastBeepedSecondRef.current = null
      return
    }
    const triggers = { 10: { freq: 660, dur: 0.25, gain: 0.1 },
                       5:  { freq: 880, dur: 0.18, gain: 0.13 },
                       4:  { freq: 880, dur: 0.18, gain: 0.13 },
                       3:  { freq: 1100, dur: 0.18, gain: 0.15 },
                       2:  { freq: 1100, dur: 0.18, gain: 0.15 },
                       1:  { freq: 1320, dur: 0.25, gain: 0.18 } }
    const trig = triggers[timerSeconds]
    if (!trig) return
    if (lastBeepedSecondRef.current === timerSeconds) return
    lastBeepedSecondRef.current = timerSeconds
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.frequency.value = trig.freq
      g.gain.setValueAtTime(trig.gain, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + trig.dur)
      o.start()
      o.stop(ctx.currentTime + trig.dur)
    } catch {}
  }, [isMyTurn, timerSeconds, draftStatus])

  // "You're on the clock" in-room alert — fires only when isMyTurn flips
  // false → true. Plays a beep, toasts, and flashes the document title so
  // users with the tab in the background notice.
  const wasMyTurnRef = useRef(false)
  useEffect(() => {
    if (isMyTurn && !wasMyTurnRef.current && draftStatus === 'in_progress') {
      toast("You're on the clock!", 'success')
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (Ctx) {
          const ctx = new Ctx()
          const o = ctx.createOscillator()
          const g = ctx.createGain()
          o.connect(g); g.connect(ctx.destination)
          o.frequency.value = 880
          g.gain.setValueAtTime(0.15, ctx.currentTime)
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
          o.start(); o.stop(ctx.currentTime + 0.4)
        }
      } catch {}
      const original = document.title
      let flashCount = 0
      const flashTimer = setInterval(() => {
        document.title = flashCount % 2 === 0 ? "⏰ YOU'RE UP" : original
        flashCount++
        if (flashCount > 10) {
          clearInterval(flashTimer)
          document.title = original
        }
      }, 800)
    }
    wasMyTurnRef.current = isMyTurn
  }, [isMyTurn, draftStatus])

  // Auto-scroll to latest pick
  useEffect(() => {
    if (pickListRef.current) {
      pickListRef.current.scrollTop = pickListRef.current.scrollHeight
    }
  }, [completedPicks.length])

  async function handlePick(playerId) {
    if (offlineMode) {
      if (makeOfflinePick.isPending) return
      try {
        await makeOfflinePick.mutateAsync({ leagueId: league.id, playerId })
        setSearchQuery('')
      } catch (err) {
        toast(err.message || 'Failed to record offline pick', 'error')
      }
      return
    }
    if (!isMyTurn || makePick.isPending) return
    try {
      await makePick.mutateAsync({ leagueId: league.id, playerId })
      setSearchQuery('')
    } catch (err) {
      toast(err.message || 'Failed to make pick', 'error')
    }
  }

  async function handleInitDraft() {
    try {
      await initDraft.mutateAsync(league.id)
      toast('Draft order randomized!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to initialize draft', 'error')
    }
  }

  async function handleStartDraft() {
    try {
      await startDraft.mutateAsync(league.id)
      toast('Draft started!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to start draft', 'error')
    }
  }

  if (isLoading) return <LoadingSpinner />

  const isCommissioner = league.commissioner_id === profile?.id

  // Pre-draft state
  if (draftStatus === 'pending') {
    const hasPickSlots = picks.length > 0
    const draftDate = settings?.draft_date ? new Date(settings.draft_date) : null
    const draftDateValid = draftDate && !isNaN(draftDate.getTime())
    const msUntilDraft = draftDateValid ? draftDate.getTime() - Date.now() : Infinity
    const withinOneHour = hasPickSlots && draftDateValid && msUntilDraft <= 60 * 60 * 1000 && msUntilDraft > 0

    // ── Board preview with countdown (T-60min) ──────────────────────
    if (withinOneHour) {
      return <DraftBoardPreview settings={settings} picks={picks} draftDate={draftDate} profileId={profile?.id} league={league} isCommissioner={isCommissioner} onStartDraft={handleStartDraft} startDraftPending={startDraft.isPending} />
    }

    return (
      <div className="text-center py-8">
        <h3 className="font-display text-lg text-text-primary mb-2">
          {settings?.draft_mode === 'offline' ? 'Offline Draft' : 'Draft Room'}
        </h3>
        <p className="text-sm text-text-secondary mb-4">
          {hasPickSlots
            ? `Draft order is set. ${league.members?.length || 0} teams, ${picks.length} total picks.`
            : `${league.members?.length || 0} teams joined. The commissioner needs to set the draft order.`}
        </p>
        {settings?.draft_location && (
          <div className="mb-3 text-sm text-text-secondary">
            <span className="text-text-muted">Location:</span> <span className="font-semibold text-text-primary">{settings.draft_location}</span>
          </div>
        )}
        {draftDateValid && settings?.draft_mode === 'offline' ? (
          <div className="mb-4 px-4 py-3 rounded-xl border border-accent/40 bg-accent/10 inline-block">
            <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Draft date</div>
            <div className="text-sm text-text-primary font-semibold">
              {draftDate.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}
            </div>
          </div>
        ) : draftDateValid ? (
          <DraftCountdown date={draftDate} />
        ) : null}
        {isCommissioner && !hasPickSlots && (() => {
          const memberCount = league.members?.length || 0
          const numTeams = settings?.num_teams || 10
          const isFull = memberCount >= numTeams
          return (
            <>
              <button
                onClick={handleInitDraft}
                disabled={initDraft.isPending || !isFull}
                className="block mx-auto mt-4 px-6 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 mb-3"
              >
                {initDraft.isPending ? 'Randomizing...' : 'Randomize Draft Order'}
              </button>
              {!isFull && (
                <p className="text-xs text-text-muted mb-3">
                  {memberCount}/{numTeams} members joined — league must be full before setting draft order.
                </p>
              )}
            </>
          )
        })()}
        {isCommissioner && hasPickSlots && settings?.draft_mode === 'offline' && (
          <button
            onClick={async () => {
              try {
                await startOffline.mutateAsync(league.id)
                toast('Offline draft started — enter your results', 'success')
              } catch (err) {
                toast(err.message || 'Failed to start offline draft', 'error')
              }
            }}
            disabled={startOffline.isPending}
            className="px-6 py-2 rounded-xl text-sm font-semibold bg-correct text-white hover:bg-correct/80 transition-colors disabled:opacity-50"
          >
            {startOffline.isPending ? 'Starting...' : 'Enter Draft Results'}
          </button>
        )}
        {isCommissioner && hasPickSlots && settings?.draft_mode !== 'offline' && (
          <button
            onClick={handleStartDraft}
            disabled={startDraft.isPending}
            className="px-6 py-2 rounded-xl text-sm font-semibold bg-correct text-white hover:bg-correct/80 transition-colors disabled:opacity-50"
          >
            {startDraft.isPending ? 'Starting...' : 'Start Draft'}
          </button>
        )}
        {hasPickSlots && (
          <div className="mt-4 text-left max-w-sm mx-auto">
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Draft Order</div>
            {settings?.draft_order?.map((userId, i) => {
              const member = picks.find((p) => p.user_id === userId)?.users
              return (
                <div key={userId} className="flex items-center gap-2 py-1">
                  <span className="text-xs text-text-muted w-5">{i + 1}.</span>
                  {member && <Avatar user={member} size="xs" />}
                  <span className="text-sm text-text-primary">{member?.display_name || member?.username || 'Unknown'}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Paused state
  if (draftStatus === 'paused') {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="text-4xl">⏸</div>
        <h3 className="font-display text-lg text-text-primary">Draft Paused</h3>
        <p className="text-sm text-text-secondary">The commissioner has paused this draft. The pick clock is frozen.</p>
        {isCommissioner && (
          <button
            onClick={async () => {
              try { await resumeDraftMut.mutateAsync(league.id); toast('Draft resumed', 'success') }
              catch (err) { toast(err.message || 'Failed to resume', 'error') }
            }}
            disabled={resumeDraftMut.isPending}
            className="px-6 py-2 rounded-xl text-sm font-semibold bg-correct text-white hover:bg-correct/80 transition-colors disabled:opacity-50"
          >
            {resumeDraftMut.isPending ? 'Resuming...' : 'Resume Draft'}
          </button>
        )}
      </div>
    )
  }

  // Draft completed state — review screen with team accordion + board
  if (draftStatus === 'completed') {
    return (
      <CompletedDraftReview
        league={league}
        picks={picks}
        settings={settings}
        profileId={profile?.id}
      />
    )
  }

  // Offline draft entry — clean commissioner-only UI
  if (settings?.draft_mode === 'offline') {
    const totalPicks = picks.length
    const filledPicks = completedPicks.length
    const progressPct = totalPicks > 0 ? Math.round((filledPicks / totalPicks) * 100) : 0
    const numTeams = settings?.num_teams || 10

    return (
      <div className="space-y-4">
        {/* Progress header */}
        <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wider text-text-muted">Entering Draft Results</div>
            <div className="text-xs text-text-muted">{filledPicks} / {totalPicks} picks</div>
          </div>
          <div className="w-full h-2 bg-bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* Current pick info */}
        {currentPick && (
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-4 text-center">
            <div className="font-display text-lg text-text-primary">
              Round {currentPick.round} · Pick {((currentPick.pick_number - 1) % numTeams) + 1}
            </div>
            <div className="flex items-center justify-center gap-2 mt-2">
              {currentPick.users && <Avatar user={currentPick.users} size="sm" />}
              <span className="text-sm font-semibold text-accent">
                {currentPick.users?.display_name || currentPick.users?.username || 'Unknown'}
              </span>
            </div>
          </div>
        )}

        {/* Undo button */}
        {filledPicks > 0 && (
          <div className="flex items-center justify-between">
            <div className="text-xs text-text-muted">
              Last pick: <span className="text-text-primary font-semibold">{completedPicks[completedPicks.length - 1]?.nfl_players?.full_name}</span>
              {' '}to {completedPicks[completedPicks.length - 1]?.users?.display_name || completedPicks[completedPicks.length - 1]?.users?.username}
            </div>
            <button
              onClick={async () => {
                try {
                  await undoPick.mutateAsync(league.id)
                  toast('Pick undone', 'success')
                } catch (err) {
                  toast(err.message || 'Failed to undo', 'error')
                }
              }}
              disabled={undoPick.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-incorrect border border-incorrect/30 hover:bg-incorrect/10 transition-colors disabled:opacity-50"
            >
              {undoPick.isPending ? 'Undoing...' : 'Undo'}
            </button>
          </div>
        )}

        {/* Player search + filter */}
        {currentPick && (
          <>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-bg-primary border border-text-primary/20 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {POSITION_FILTERS.map((pos) => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    posFilter === pos ? 'bg-accent text-white' : 'bg-bg-card text-text-muted border border-text-primary/10 hover:bg-bg-secondary'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>

            {/* Player list */}
            <div className="rounded-xl border border-text-primary/20 overflow-hidden max-h-[50vh] overflow-y-auto">
              {(availablePlayers || []).map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0 hover:bg-accent/10 transition-colors"
                >
                  {player.headshot_url ? (
                    <img src={player.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-bg-secondary shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{player.full_name}</div>
                    <div className="text-[10px] text-text-muted">{player.position} · {player.team || 'FA'}</div>
                  </div>
                  <InjuryBadge status={player.injury_status} />
                  <button
                    onClick={() => handlePick(player.id)}
                    disabled={makeOfflinePick.isPending}
                    className="shrink-0 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-accent text-white hover:bg-accent-hover active:scale-95 transition disabled:opacity-50"
                  >
                    Draft
                  </button>
                </div>
              ))}
              {(!availablePlayers || availablePlayers.length === 0) && (
                <div className="text-center text-sm text-text-muted py-8">No players found</div>
              )}
            </div>
          </>
        )}

        {/* Recent picks log (collapsed) */}
        {filledPicks > 0 && (
          <div className="rounded-xl border border-text-primary/20 overflow-hidden">
            <div className="p-3 border-b border-border">
              <h3 className="text-sm font-semibold text-text-primary">Draft Log ({filledPicks} picks)</h3>
            </div>
            <DraftLogList completedPicks={completedPicks} numTeams={numTeams} profileId={profile?.id} listRef={pickListRef} />
          </div>
        )}
      </div>
    )
  }

  // Build my roster slot map from commissioner's roster_slots config
  const myPicks = completedPicks.filter((p) => p.user_id === profile?.id)
  const rosterSlots = settings?.roster_slots || { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, k: 1, def: 1, bench: 6 }
  const slotPlan = buildSlotPlan(rosterSlots, myPicks)

  // Live draft
  return (
    <div className="space-y-3 md:space-y-4">
      {/* Sticky pick banner — glass edge */}
      <div className="sticky top-0 z-20 -mx-2 px-2 pt-1 md:static md:mx-0 md:px-0 md:pt-0">
      <div className={`rounded-xl px-4 py-2.5 flex items-center justify-center gap-3 flex-wrap bg-bg-primary border ${isMyTurn ? 'border-accent' : 'border-text-primary/20'}`}>
        <div className="font-display text-base md:text-lg text-white">
          R{currentPick?.round} · PICK {currentPick?.pick_number}
        </div>
        <div className="font-display text-sm md:text-base text-text-secondary">
          {isMyTurn ? "You're on the clock!" : `${currentPick?.users?.display_name || 'Someone'} is picking...`}
        </div>
        {timerSeconds != null && (
          <div className={`font-display text-base md:text-lg ${timerSeconds <= 10 ? 'text-incorrect' : 'text-text-primary'}`}>
            {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
          </div>
        )}
        {isCommissioner && (
          <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
            <button
              onClick={async () => {
                try { await pauseDraftMut.mutateAsync(league.id); toast('Draft paused', 'success') }
                catch (err) { toast(err.message || 'Failed to pause', 'error') }
              }}
              disabled={pauseDraftMut.isPending}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-bg-card hover:bg-bg-secondary text-text-secondary border border-text-primary/20 transition-colors disabled:opacity-50"
            >
              {pauseDraftMut.isPending ? 'Pausing...' : 'Pause draft'}
            </button>
            <button
              onClick={() => setOfflineMode((v) => !v)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                offlineMode
                  ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                  : 'bg-bg-card hover:bg-bg-secondary border-text-primary/20 text-text-secondary'
              }`}
              title="Record picks for whoever's on the clock — for in-person drafts"
            >
              {offlineMode ? '● Offline mode ON' : 'Offline mode'}
            </button>
          </div>
        )}
        {offlineMode && (
          <div className="mt-2 text-[11px] text-yellow-400">
            Recording for {currentPick?.users?.display_name || 'on-the-clock user'} · turn check disabled
          </div>
        )}
      </div>
      </div>

      {/* Embedded player preview (replaces the old modal) */}
      {detailPlayerId && (
        <DraftPlayerPreview
          leagueId={league.id}
          playerId={detailPlayerId}
          onClose={() => setDetailPlayerId(null)}
          onDraft={(isMyTurn || offlineMode)
            ? async () => { await handlePick(detailPlayerId); setDetailPlayerId(null) }
            : null}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-text-primary/10">
        {['Players', 'My Roster', 'Board', 'Queue', 'Log'].map((t) => {
          const isActive = activeTab === t
          const filledCount = slotPlan.filled
          const totalCount = slotPlan.totalRoster
          const badge = t === 'My Roster' ? `${filledCount}/${totalCount}` : t === 'Queue' ? (queue?.length || 0) : null
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                isActive ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              {t}{badge != null ? ` (${badge})` : ''}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'Players' && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Player search + list */}
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="flex gap-1 mb-2">
              {['ADP', 'My Rankings'].map((v) => (
                <button
                  key={v}
                  onClick={() => setPlayerView(v)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    playerView === v ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary'
                  }`}
                >{v}</button>
              ))}
            </div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search players..."
              className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex gap-1 mt-2 overflow-x-auto">
              {POSITION_FILTERS.map((pos) => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    posFilter === pos ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[55vh] md:max-h-96 overflow-y-auto">
            {(() => {
              // Default = ADP view: use the overall_rank from the API.
              let displayList = (availablePlayers || []).map((p) => ({ ...p, _displayRank: p.overall_rank || null }))

              if (playerView === 'My Rankings' && myRankings?.length) {
                const draftedSet = new Set(picks.filter((p) => p.player_id).map((p) => p.player_id))
                // Build user-rank lookup (filtering out drafted entries first)
                const userRankIdx = {} // player_id → 1-based rank
                let i = 0
                for (const r of myRankings) {
                  if (draftedSet.has(r.player_id)) continue
                  i++
                  userRankIdx[r.player_id] = i
                }
                const inLeague = new Set(displayList.map((p) => p.id))
                const ranked = []
                const seenIds = new Set()
                // Walk myRankings in order, picking out the ones currently available
                for (const r of myRankings) {
                  if (draftedSet.has(r.player_id)) continue
                  if (!inLeague.has(r.player_id)) continue
                  const p = displayList.find((x) => x.id === r.player_id)
                  if (p) {
                    ranked.push({ ...p, _displayRank: userRankIdx[r.player_id] })
                    seenIds.add(p.id)
                  }
                }
                const tail = displayList
                  .filter((p) => !seenIds.has(p.id))
                  .map((p) => ({ ...p, _displayRank: null }))
                displayList = [...ranked, ...tail]
              }
              return displayList
            })().map((player) => {
              const isQueued = queuedIds.has(player.id)
              return (
                <div
                  key={player.id}
                  className={`w-full flex items-center gap-3 px-3 py-3 md:py-2 border-b border-border last:border-0 transition-colors ${
                    (isMyTurn || offlineMode) ? 'hover:bg-accent/10' : 'opacity-60'
                  }`}
                >
                  <span className="w-8 text-center text-xs font-bold text-text-muted shrink-0">
                    {player._displayRank || '—'}
                  </span>
                  <button
                    onClick={() => toggleQueue(player.id)}
                    className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg active:bg-bg-secondary transition-colors ${isQueued ? 'text-yellow-400' : 'text-text-muted hover:text-yellow-400'}`}
                    title={isQueued ? 'Remove from queue' : 'Add to queue'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={isQueued ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDetailPlayerId(player.id)}
                    className="flex-1 flex items-center gap-3 text-left cursor-pointer"
                  >
                    <img
                      src={player.headshot_url}
                      alt={player.full_name}
                      width="40"
                      height="40"
                      loading="lazy"
                      decoding="async"
                      className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                      onError={(e) => { e.target.style.visibility = 'hidden' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-text-primary truncate">{player.full_name}</span>
                        <InjuryBadge status={player.injury_status} />
                      </div>
                      <div className="text-xs text-text-muted flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${POS_COLORS[player.position] || 'bg-text-primary/10 text-text-muted'}`}>
                          {player.position}{player.pos_rank ? player.pos_rank : ''}
                        </span>
                        <span>{player.team || 'FA'}</span>
                        {player.bye_week && <span className="text-text-muted">· Bye {player.bye_week}</span>}
                      </div>
                    </div>
                    {player.projected_pts_half_ppr != null && Number(player.projected_pts_half_ppr) > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-sm font-display text-accent">{Number(player.projected_pts_half_ppr).toFixed(1)}</div>
                        <div className="text-[10px] text-text-muted">proj</div>
                      </div>
                    )}
                  </button>
                  {(isMyTurn || offlineMode) && (
                    <button
                      onClick={() => handlePick(player.id)}
                      disabled={makePick.isPending || makeOfflinePick.isPending}
                      className="shrink-0 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-accent text-white hover:bg-accent-hover active:scale-95 transition disabled:opacity-50"
                    >
                      Draft
                    </button>
                  )}
                </div>
              )
            })}
            {availablePlayers?.length === 0 && (
              <div className="text-center text-sm text-text-muted py-8">No players found</div>
            )}
          </div>
        </div>

        {/* Desktop-only side panel: log */}
        <div className="hidden md:block rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="p-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Draft Log</h3>
          </div>
          <DraftLogList completedPicks={completedPicks} numTeams={settings?.num_teams || 10} profileId={profile?.id} listRef={pickListRef} />
        </div>
      </div>
      )}

      {activeTab === 'My Roster' && (
        <RosterNeedsView slotPlan={slotPlan} />
      )}

      {activeTab === 'Board' && (
        <div
          className="rounded-xl border border-text-primary/20 p-2 overflow-hidden md:relative md:left-1/2 md:-translate-x-1/2 md:w-[95vw] md:max-w-[1600px]"
        >
          <DraftBoard picks={picks} settings={settings} profileId={profile?.id} />
        </div>
      )}

      {activeTab === 'Queue' && (() => {
        // Hide queue entries for players already drafted
        const draftedSet = new Set(picks.filter((p) => p.player_id).map((p) => p.player_id))
        const visibleQueue = (queue || []).filter((q) => !draftedSet.has(q.player_id))
        return (
        <div className="rounded-xl border border-text-primary/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">My Queue</h3>
            <span className="text-[10px] text-text-muted italic">Auto-picks from here when your clock runs out</span>
          </div>
          {visibleQueue.length === 0 ? (
            <p className="text-xs text-text-muted">Star players in the Players tab to queue them up.</p>
          ) : (
            <div className="space-y-1">
              {visibleQueue.map((q, i) => (
                <div key={q.player_id} className="flex items-center gap-2 bg-bg-card rounded-lg px-2 py-1.5">
                  <span className="text-xs text-text-muted w-5 text-center shrink-0">{i + 1}</span>
                  {q.nfl_players?.headshot_url && (
                    <img src={q.nfl_players.headshot_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-text-primary truncate">{q.nfl_players?.full_name}</div>
                    <div className="text-[10px] text-text-muted">{q.nfl_players?.position} · {q.nfl_players?.team || 'FA'}</div>
                  </div>
                  <button onClick={() => moveQueue(q.player_id, 'up')} disabled={i === 0} className="text-text-muted hover:text-text-primary w-9 h-9 flex items-center justify-center rounded-lg active:bg-bg-secondary disabled:opacity-30" title="Move up">▲</button>
                  <button onClick={() => moveQueue(q.player_id, 'down')} disabled={i === queue.length - 1} className="text-text-muted hover:text-text-primary w-9 h-9 flex items-center justify-center rounded-lg active:bg-bg-secondary disabled:opacity-30" title="Move down">▼</button>
                  <button onClick={() => toggleQueue(q.player_id)} className="text-text-muted hover:text-incorrect w-9 h-9 flex items-center justify-center rounded-lg active:bg-bg-secondary text-lg" title="Remove">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
        )
      })()}

      {activeTab === 'Log' && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="p-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Draft Log</h3>
          </div>
          <DraftLogList completedPicks={completedPicks} numTeams={settings?.num_teams || 10} profileId={profile?.id} listRef={pickListRef} />
        </div>
      )}

    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Helpers

const STARTER_SLOT_LABELS = {
  qb: 'QB', rb: 'RB', wr: 'WR', te: 'TE', flex: 'FLEX', k: 'K', def: 'D/ST',
  superflex: 'SUPER FLEX',
}
const FLEX_ELIGIBLE = ['RB', 'WR', 'TE']
const SUPERFLEX_ELIGIBLE = ['QB', 'RB', 'WR', 'TE']

/**
 * Given the commissioner's roster_slots config and the user's drafted picks,
 * return an ordered list of starter slots with the player (or null) filling each,
 * plus the bench list. Greedy assignment: best player per primary slot first,
 * leftover RB/WR/TE flow into FLEX, leftovers go to bench.
 */
function buildSlotPlan(rosterSlots, myPicks) {
  const players = myPicks.map((p) => ({
    id: p.player_id,
    name: p.nfl_players?.full_name,
    position: p.nfl_players?.position,
    team: p.nfl_players?.team,
    headshot: p.nfl_players?.headshot_url,
  }))
  const remaining = [...players]
  function take(pos) {
    const idx = remaining.findIndex((p) => p.position === pos)
    if (idx >= 0) return remaining.splice(idx, 1)[0]
    return null
  }
  function takeAny(positions) {
    const idx = remaining.findIndex((p) => positions.includes(p.position))
    if (idx >= 0) return remaining.splice(idx, 1)[0]
    return null
  }

  const slots = [] // { slot, label, player }
  const order = ['qb', 'rb', 'wr', 'te', 'flex', 'superflex', 'k', 'def']
  for (const slotKey of order) {
    const count = rosterSlots[slotKey] || 0
    for (let i = 0; i < count; i++) {
      let player = null
      if (slotKey === 'flex') player = takeAny(FLEX_ELIGIBLE)
      else if (slotKey === 'superflex') player = takeAny(SUPERFLEX_ELIGIBLE)
      else player = take(slotKey.toUpperCase())
      slots.push({ slot: slotKey, label: STARTER_SLOT_LABELS[slotKey] || slotKey.toUpperCase(), player })
    }
  }

  const benchCount = rosterSlots.bench || 0
  // Bench accepts ALL non-starter players, even beyond benchCount, so users
  // can punt K/DEF and the extras spill over into bench. Configured benchCount
  // is just the minimum slots to display — actual bench can grow.
  const bench = remaining
  const startersFilled = slots.filter((s) => s.player).length
  const totalStarters = slots.length
  const totalRoster = totalStarters + benchCount
  const filledTotal = startersFilled + bench.length
  return { slots, bench, overflow: [], filled: filledTotal, totalStarters, totalRoster, benchCount }
}

function RosterNeedsView({ slotPlan }) {
  // Compute "need" summary by counting empty starter slots per label
  const needCounts = {}
  for (const s of slotPlan.slots) {
    if (!s.player) needCounts[s.label] = (needCounts[s.label] || 0) + 1
  }
  const needList = Object.entries(needCounts)
  return (
    <div className="space-y-4">
      {needList.length > 0 && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 text-center">
          <span className="text-xs text-yellow-400 font-semibold uppercase tracking-wider">Still need: </span>
          <span className="text-xs text-text-primary">
            {needList.map(([label, n], i) => (
              <span key={label}>{i > 0 ? ', ' : ''}{n} {label}</span>
            ))}
          </span>
        </div>
      )}
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Starting Lineup</h3>
        </div>
        <div className="divide-y divide-border">
          {slotPlan.slots.map((s, i) => (
            <SlotRow key={i} label={s.label} player={s.player} />
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Bench</h3>
          <span className="text-[10px] text-text-muted">{slotPlan.bench.length} / {slotPlan.benchCount}</span>
        </div>
        <div className="divide-y divide-border">
          {(() => {
            const rows = []
            slotPlan.bench.forEach((p) => rows.push(<SlotRow key={`b-${p.id}`} label="BN" player={p} />))
            const emptyToShow = Math.max(0, slotPlan.benchCount - slotPlan.bench.length)
            for (let i = 0; i < emptyToShow; i++) {
              rows.push(<SlotRow key={`e-${i}`} label="BN" player={null} />)
            }
            return rows
          })()}
        </div>
      </div>
    </div>
  )
}

function SlotRow({ label, player }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted w-12 shrink-0">{label}</span>
      {player ? (
        <>
          {player.headshot && (
            <img src={player.headshot} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-card shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-text-primary truncate">{player.name}</div>
            <div className="text-[10px] text-text-muted">{player.position} · {player.team || 'FA'}</div>
          </div>
        </>
      ) : (
        <span className="text-xs text-text-muted italic">empty</span>
      )}
    </div>
  )
}

function DraftLogList({ completedPicks, numTeams, profileId, listRef }) {
  return (
    <div ref={listRef} className="max-h-[60vh] md:max-h-96 overflow-y-auto">
      {completedPicks.map((pick) => (
        <div
          key={pick.id}
          className={`flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 ${
            pick.user_id === profileId ? 'bg-accent/5' : ''
          }`}
        >
          <span className="text-xs text-text-muted w-8 shrink-0">
            {pick.round}.{((pick.pick_number - 1) % numTeams) + 1}
          </span>
          {pick.nfl_players?.headshot_url && (
            <img
              src={pick.nfl_players.headshot_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0"
              onError={(e) => { e.target.style.display = 'none' }}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text-primary truncate">
              {pick.nfl_players?.full_name}
            </div>
            <div className="text-xs text-text-muted">
              {pick.nfl_players?.position} · {pick.nfl_players?.team} — {pick.users?.display_name || pick.users?.username}
              {pick.is_auto_pick && <span className="text-yellow-400 ml-1">(auto)</span>}
            </div>
          </div>
        </div>
      ))}
      {completedPicks.length === 0 && (
        <div className="text-center text-sm text-text-muted py-8">Waiting for first pick...</div>
      )}
    </div>
  )
}

function CompletedDraftReview({ league, picks, settings, profileId }) {
  const [openTeam, setOpenTeam] = useState(profileId)
  const numTeams = settings?.num_teams || 10
  const scoringFormat = settings?.scoring_format === 'half_ppr' ? 'Half-PPR' : settings?.scoring_format === 'standard' ? 'Standard' : 'PPR'

  // Group picks by user_id
  const teamMap = new Map()
  for (const pick of picks) {
    if (!teamMap.has(pick.user_id)) {
      teamMap.set(pick.user_id, {
        userId: pick.user_id,
        user: pick.users,
        picks: [],
      })
    }
    teamMap.get(pick.user_id).picks.push(pick)
  }
  // Order teams by draft order
  const draftOrder = settings?.draft_order || []
  const teams = draftOrder
    .map((uid, i) => {
      const t = teamMap.get(uid)
      return t ? { ...t, slot: i } : null
    })
    .filter(Boolean)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-4 text-center">
        <div className="text-xs uppercase text-text-muted tracking-wider mb-1">Draft Complete</div>
        <div className="font-display text-lg text-text-primary">
          {numTeams}-team {scoringFormat}
        </div>
      </div>

      <div className="space-y-2">
        {teams.map((team) => {
          const isUser = team.userId === profileId
          const isOpen = openTeam === team.userId
          return (
            <div
              key={team.userId}
              className={`rounded-xl border ${isUser ? 'border-accent/40' : 'border-text-primary/20'} bg-bg-primary overflow-hidden`}
            >
              <button
                onClick={() => setOpenTeam(isOpen ? null : team.userId)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-secondary"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">#{team.slot + 1}</span>
                  <span className={`text-sm font-semibold ${isUser ? 'text-accent' : 'text-text-primary'}`}>
                    {isUser ? 'Your Team' : (team.user?.display_name || team.user?.username || 'Unknown')}
                  </span>
                </div>
                <span className="text-text-muted">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="border-t border-text-primary/10 divide-y divide-text-primary/10">
                  {team.picks.sort((a, b) => a.pick_number - b.pick_number).map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                      <span className="text-[10px] text-text-muted w-10 shrink-0">{p.round}.{((p.pick_number - 1) % numTeams) + 1}</span>
                      {p.nfl_players?.headshot_url && (
                        <img src={p.nfl_players.headshot_url} alt="" className="w-7 h-7 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">{p.nfl_players?.full_name}</div>
                        <div className="text-[10px] text-text-muted">{p.nfl_players?.position} · {p.nfl_players?.team}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Full board for reference */}
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-2 overflow-hidden">
        <DraftBoard picks={picks} settings={settings} profileId={profileId} />
      </div>
    </div>
  )
}

const POS_COLORS = {
  QB: 'bg-red-500/20 border-red-500/40 text-red-300',
  RB: 'bg-green-500/20 border-green-500/40 text-green-300',
  WR: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300',
  TE: 'bg-blue-500/20 border-blue-500/40 text-blue-300',
  K: 'bg-gray-500/20 border-gray-500/40 text-gray-300',
  DEF: 'bg-purple-500/20 border-purple-500/40 text-purple-300',
}

function DraftBoard({ picks, settings, profileId }) {
  const numTeams = settings?.num_teams || 10
  const draftOrder = settings?.draft_order || []
  const totalRounds = Math.ceil(picks.length / numTeams)

  // Build grid: rows = rounds, columns = draft order position
  const grid = []
  for (let r = 0; r < totalRounds; r++) {
    const row = []
    const isReverse = r % 2 === 1 // snake
    for (let c = 0; c < numTeams; c++) {
      const colIdx = isReverse ? numTeams - 1 - c : c
      const pickNum = r * numTeams + colIdx + 1
      const pick = picks.find((p) => p.pick_number === pickNum)
      row.push(pick || null)
    }
    grid.push(row)
  }

  // Map user IDs to display names
  const userNames = {}
  for (const pick of picks) {
    if (pick.users) userNames[pick.user_id] = pick.users.display_name || pick.users.username
  }

  // Mobile: scroll both ways, larger cells. Desktop: fit container.
  return (
    <div className="overflow-auto max-h-[70vh] md:max-h-none md:overflow-visible">
      <table className="text-xs border-collapse md:w-full md:table-fixed">
        <thead>
          <tr>
            <th className="px-1 py-2 text-text-muted font-semibold text-center w-10 border border-border bg-bg-secondary sticky left-0 z-10">Rd</th>
            {draftOrder.map((userId, i) => (
              <th key={userId} className={`px-2 py-2 font-semibold text-center border border-border min-w-[120px] md:min-w-0 ${userId === profileId ? 'text-accent' : 'text-text-secondary'}`}>
                <div className="text-text-muted text-[10px]">{i + 1}</div>
                <div className="truncate">{userNames[userId] || 'Team'}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, roundIdx) => (
            <tr key={roundIdx}>
              <td className="px-1 py-1 text-center text-text-muted font-semibold border border-border bg-bg-secondary sticky left-0 z-10">
                <div className="flex items-center gap-0.5 justify-center">
                  {roundIdx + 1}
                  <span className="text-[8px]">{roundIdx % 2 === 0 ? '→' : '←'}</span>
                </div>
              </td>
              {row.map((pick, colIdx) => {
                const pos = pick?.nfl_players?.position
                const colorClass = pos ? POS_COLORS[pos] || '' : ''
                return (
                  <td key={colIdx} className={`px-2 py-2 border border-border min-w-[120px] md:min-w-0 ${pick ? colorClass : ''}`}>
                    {pick?.nfl_players ? (
                      <div className="min-w-0">
                        <div className="font-semibold truncate text-[11px] md:text-xs">{pick.nfl_players.full_name}</div>
                        <div className="text-[10px] opacity-70 truncate">{pos} {pick.nfl_players.team}</div>
                      </div>
                    ) : (
                      <div className="text-text-muted text-center">—</div>
                    )}
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

// ── Pre-draft board preview (T-60min countdown) ──────────────────────

function DraftBoardPreview({ settings, picks, draftDate, profileId, isCommissioner, onStartDraft, startDraftPending }) {
  const draftOrder = settings?.draft_order || []
  const rosterSlots = settings?.roster_slots || { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, k: 1, def: 1, bench: 6 }
  const totalSlots = Object.values(rosterSlots).reduce((a, b) => a + b, 0)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const remaining = Math.max(0, draftDate.getTime() - now)
  const mins = Math.floor(remaining / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)

  const userNames = {}
  for (const pick of picks) {
    if (pick.users) userNames[pick.user_id] = pick.users.display_name || pick.users.username
  }
  const userSlot = draftOrder.indexOf(profileId)

  return (
    <div className="space-y-4">
      <div className="text-center py-6">
        <div className="text-[10px] uppercase tracking-widest text-text-muted mb-2">Draft starts in</div>
        <div className="font-display text-6xl md:text-7xl text-accent tabular-nums">
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </div>
        {settings?.draft_location && (
          <div className="mt-3 text-sm text-text-secondary">
            <span className="text-text-muted">Location:</span> <span className="font-semibold text-text-primary">{settings.draft_location}</span>
          </div>
        )}
        {userSlot >= 0 && (
          <div className="mt-2 text-sm text-text-secondary">
            You're picking at <span className="font-bold text-accent">#{userSlot + 1}</span>
          </div>
        )}
        {isCommissioner && remaining <= 0 && (
          <button
            onClick={onStartDraft}
            disabled={startDraftPending}
            className="mt-4 px-6 py-2.5 rounded-xl text-sm font-semibold bg-correct text-white hover:bg-correct/80 transition-colors disabled:opacity-50"
          >
            {startDraftPending ? 'Starting...' : 'Start Draft Now'}
          </button>
        )}
      </div>

      <div className="rounded-xl border border-text-primary/20 p-2 overflow-auto">
        <table className="text-xs border-collapse w-full table-fixed">
          <thead>
            <tr>
              <th className="px-1 py-2 text-text-muted font-semibold text-center w-10 border border-border bg-bg-secondary">Rd</th>
              {draftOrder.map((userId, i) => (
                <th key={userId} className={`px-2 py-2 font-semibold text-center border border-border ${userId === profileId ? 'text-accent' : 'text-text-secondary'}`}>
                  <div className="text-text-muted text-[10px]">{i + 1}</div>
                  <div className="truncate">{userNames[userId] || 'Team'}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: totalSlots }, (_, r) => (
              <tr key={r}>
                <td className="px-1 py-3 text-center text-text-muted font-semibold border border-border bg-bg-secondary">
                  <div className="flex items-center gap-0.5 justify-center">
                    {r + 1}
                    <span className="text-[8px]">{r % 2 === 0 ? '\u2192' : '\u2190'}</span>
                  </div>
                </td>
                {draftOrder.map((userId) => (
                  <td key={userId} className="px-2 py-3 border border-border text-center">
                    <div className="text-text-muted/30">{'\u2014'}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
