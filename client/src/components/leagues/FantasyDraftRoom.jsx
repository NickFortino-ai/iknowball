import { useState, useEffect, useMemo, useRef } from 'react'
import { useDraftBoard, useAvailablePlayers, useMakeDraftPick, useInitDraft, useStartDraft, useRealtimeDraft } from '../../hooks/useLeagues'
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

export default function FantasyDraftRoom({ league }) {
  const { profile } = useAuth()
  const { data: draftData, isLoading } = useDraftBoard(league.id)
  const makePick = useMakeDraftPick()
  const initDraft = useInitDraft()
  const startDraft = useStartDraft()
  useRealtimeDraft(league.id)

  const [posFilter, setPosFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [timerSeconds, setTimerSeconds] = useState(null)
  const pickListRef = useRef(null)

  const { data: availablePlayers } = useAvailablePlayers(
    league.id,
    searchQuery || undefined,
    posFilter !== 'All' ? posFilter : undefined
  )

  const settings = draftData?.settings
  const picks = draftData?.picks || []
  const draftStatus = settings?.draft_status || 'pending'

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

  // Auto-scroll to latest pick
  useEffect(() => {
    if (pickListRef.current) {
      pickListRef.current.scrollTop = pickListRef.current.scrollHeight
    }
  }, [completedPicks.length])

  async function handlePick(playerId) {
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
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3">{'\uD83C\uDFC8'}</div>
        <h3 className="font-display text-lg text-text-primary mb-2">Draft Room</h3>
        <p className="text-sm text-text-secondary mb-4">
          {hasPickSlots
            ? `Draft order is set. ${league.members?.length || 0} teams, ${picks.length} total picks.`
            : `${league.members?.length || 0} teams joined. The commissioner needs to set the draft order.`}
        </p>
        {isCommissioner && !hasPickSlots && (
          <button
            onClick={handleInitDraft}
            disabled={initDraft.isPending}
            className="px-6 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 mb-3"
          >
            {initDraft.isPending ? 'Randomizing...' : 'Randomize Draft Order'}
          </button>
        )}
        {isCommissioner && hasPickSlots && (
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

  // Draft completed state
  if (draftStatus === 'completed') {
    return (
      <div>
        <div className="text-center py-4 mb-4">
          <div className="text-2xl mb-1">{'\u2705'}</div>
          <h3 className="font-display text-lg text-text-primary">Draft Complete</h3>
        </div>
        <DraftBoard picks={picks} settings={settings} profileId={profile?.id} />
      </div>
    )
  }

  // Live draft
  return (
    <div className="space-y-4">
      {/* Current pick banner */}
      <div className={`rounded-xl p-4 text-center ${isMyTurn ? 'bg-accent/20 border border-accent' : 'bg-bg-card border border-border'}`}>
        <div className="text-xs text-text-muted uppercase tracking-wider mb-1">
          Round {currentPick?.round} · Pick {currentPick?.pick_number}
        </div>
        <div className="font-display text-lg text-text-primary">
          {isMyTurn ? "You're on the clock!" : `${currentPick?.users?.display_name || 'Someone'} is picking...`}
        </div>
        {timerSeconds != null && (
          <div className={`font-display text-2xl mt-1 ${timerSeconds <= 10 ? 'text-incorrect' : 'text-text-primary'}`}>
            {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
          </div>
        )}
      </div>

      {/* Two-column layout: players + draft log */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Player search + list */}
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="p-3 border-b border-border">
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
          <div className="max-h-96 overflow-y-auto">
            {(availablePlayers || []).map((player) => (
              <button
                key={player.id}
                onClick={() => handlePick(player.id)}
                disabled={!isMyTurn || makePick.isPending}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left border-b border-border last:border-0 transition-colors ${
                  isMyTurn ? 'hover:bg-accent/10 cursor-pointer' : 'opacity-60 cursor-not-allowed'
                }`}
              >
                <img
                  src={player.headshot_url}
                  alt={player.full_name}
                  className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-text-primary truncate">{player.full_name}</span>
                    <InjuryBadge status={player.injury_status} />
                  </div>
                  <div className="text-xs text-text-muted">{player.position} · {player.team || 'FA'}</div>
                </div>
                <div className="text-xs text-text-muted shrink-0">
                  #{player.search_rank}
                </div>
              </button>
            ))}
            {availablePlayers?.length === 0 && (
              <div className="text-center text-sm text-text-muted py-8">No players found</div>
            )}
          </div>
        </div>

        {/* Draft log */}
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="p-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Draft Log</h3>
          </div>
          <div ref={pickListRef} className="max-h-96 overflow-y-auto">
            {completedPicks.map((pick) => (
              <div
                key={pick.id}
                className={`flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 ${
                  pick.user_id === profile?.id ? 'bg-accent/5' : ''
                }`}
              >
                <span className="text-xs text-text-muted w-8 shrink-0">
                  {pick.round}.{((pick.pick_number - 1) % (settings?.num_teams || 10)) + 1}
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
        </div>
      </div>

      {/* My roster so far */}
      <div className="rounded-xl border border-text-primary/20 p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-3">My Picks</h3>
        <div className="flex flex-wrap gap-2">
          {completedPicks
            .filter((p) => p.user_id === profile?.id)
            .map((pick) => (
              <div key={pick.id} className="flex items-center gap-2 bg-bg-card rounded-lg px-3 py-1.5">
                {pick.nfl_players?.headshot_url && (
                  <img src={pick.nfl_players.headshot_url} alt="" className="w-6 h-6 rounded-full object-cover" onError={(e) => { e.target.style.display = 'none' }} />
                )}
                <span className="text-xs font-semibold text-text-primary">{pick.nfl_players?.full_name}</span>
                <span className="text-xs text-text-muted">{pick.nfl_players?.position}</span>
              </div>
            ))}
          {completedPicks.filter((p) => p.user_id === profile?.id).length === 0 && (
            <span className="text-xs text-text-muted">No picks yet</span>
          )}
        </div>
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

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse min-w-full">
        <thead>
          <tr>
            <th className="px-1 py-2 text-text-muted font-semibold text-center w-8 border border-border">Rd.</th>
            {draftOrder.map((userId, i) => (
              <th key={userId} className={`px-2 py-2 font-semibold text-center border border-border whitespace-nowrap ${userId === profileId ? 'text-accent' : 'text-text-secondary'}`}>
                <div className="text-text-muted text-[10px]">{i + 1}</div>
                {userNames[userId] || 'Team'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, roundIdx) => (
            <tr key={roundIdx}>
              <td className="px-1 py-1 text-center text-text-muted font-semibold border border-border">
                <div className="flex items-center gap-0.5 justify-center">
                  {roundIdx + 1}
                  <span className="text-[8px]">{roundIdx % 2 === 0 ? '→' : '←'}</span>
                </div>
              </td>
              {row.map((pick, colIdx) => {
                const pos = pick?.nfl_players?.position
                const colorClass = pos ? POS_COLORS[pos] || '' : ''
                return (
                  <td key={colIdx} className={`px-1.5 py-1.5 border border-border ${pick ? colorClass : ''}`}>
                    {pick?.nfl_players ? (
                      <div className="min-w-[80px]">
                        <div className="font-semibold truncate">{pick.nfl_players.full_name}</div>
                        <div className="text-[10px] opacity-70">{pos} ({pick.nfl_players.team})</div>
                      </div>
                    ) : (
                      <div className="min-w-[80px] text-text-muted text-center">—</div>
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
