import { useState, useMemo } from 'react'
import {
  useAvailablePlayers, useFantasyRoster, useAddDropPlayer,
  useFantasySettings, useWaiverState, useMyWaiverClaims, useSubmitWaiverClaim, useCancelWaiverClaim,
  useBlurbPlayerIds,
} from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import PlayerDetailModal from './PlayerDetailModal'
import BlurbDot, { markBlurbSeen } from './BlurbDot'
import FantasyMyRankings from './FantasyMyRankings'

const POSITION_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']

// Sortable stat columns shown in the strip on the right of each row.
// `key` matches the server-side sort param + the row.stats[key] field.
const OFFENSE_STAT_COLUMNS = [
  { key: 'pts', label: 'PTS' },
  { key: 'pass_yd', label: 'PA YD' },
  { key: 'pass_td', label: 'PA TD' },
  { key: 'pass_int', label: 'INT' },
  { key: 'rush_att', label: 'CAR' },
  { key: 'rush_yd', label: 'RU YD' },
  { key: 'rush_td', label: 'RU TD' },
  { key: 'rec_tgt', label: 'TGT' },
  { key: 'rec', label: 'REC' },
  { key: 'rec_yd', label: 'RE YD' },
  { key: 'rec_td', label: 'RE TD' },
  { key: 'fum_lost', label: 'FUM' },
  { key: 'fgm', label: 'FGM' },
  { key: 'xpm', label: 'XPM' },
]

const DEF_STAT_COLUMNS = [
  { key: 'pts', label: 'PTS' },
  { key: 'def_sack', label: 'SK' },
  { key: 'def_int', label: 'INT' },
  { key: 'def_fum_rec', label: 'FR' },
  { key: 'def_td', label: 'TD' },
  { key: 'def_safety', label: 'SAF' },
  { key: 'def_pts_allowed', label: 'PA' },
]

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

export default function FantasyPlayerBrowser({ league }) {
  const [playerView, setPlayerView] = useState('ADP') // 'ADP' | 'My Ranks'
  const [searchQuery, setSearchQuery] = useState('')
  const [posFilter, setPosFilter] = useState('All')
  const [sortKey, setSortKey] = useState('rank')
  const [sortDir, setSortDir] = useState('desc') // 'desc' = highest first, 'asc' = lowest first
  const statColumns = posFilter === 'DEF' ? DEF_STAT_COLUMNS : OFFENSE_STAT_COLUMNS

  function handleSort(key) {
    if (key === sortKey && key !== 'rank') {
      setSortDir((d) => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir(key === 'rank' ? 'asc' : 'desc')
    }
  }
  const [addingPlayer, setAddingPlayer] = useState(null) // player being added
  const [dropPlayerId, setDropPlayerId] = useState('') // chosen drop
  const [bidAmount, setBidAmount] = useState(0)
  const [detailPlayerId, setDetailPlayerId] = useState(null)
  const { data: blurbIdsList } = useBlurbPlayerIds(league.id)
  const blurbIds = useMemo(() => new Set(blurbIdsList || []), [blurbIdsList])

  function openPlayerDetail(id) {
    if (id) markBlurbSeen(id)
    setDetailPlayerId(id)
  }

  const { data: rawPlayers, isLoading } = useAvailablePlayers(
    league.id,
    searchQuery || undefined,
    posFilter !== 'All' ? posFilter : undefined
  )
  // Sort client-side for instant re-sort without API round-trip.
  // Server returns up to 300 players; we display 60 after sorting.
  const players = useMemo(() => {
    if (!rawPlayers) return null
    let sorted = rawPlayers
    if (sortKey && sortKey !== 'rank') {
      sorted = [...rawPlayers].sort((a, b) => {
        const av = a.stats?.[sortKey] || 0
        const bv = b.stats?.[sortKey] || 0
        return sortDir === 'desc' ? bv - av : av - bv
      })
    }
    return sorted.slice(0, 300)
  }, [rawPlayers, sortKey, sortDir])
  const { data: roster } = useFantasyRoster(league.id)
  const { data: settings } = useFantasySettings(league.id)
  const { data: waiverData } = useWaiverState(league.id)
  const { data: myClaims } = useMyWaiverClaims(league.id)
  const addDrop = useAddDropPlayer(league.id)
  const submitClaim = useSubmitWaiverClaim(league.id)
  const cancelClaim = useCancelWaiverClaim(league.id)
  const isDraftPhase = league.status === 'open' || (league.status === 'active' && !roster?.length)
  const isFaab = settings?.waiver_type === 'faab'
  const isWaiver = settings?.waiver_type === 'priority' || settings?.waiver_type === 'rolling' || isFaab
  const myWaiverState = waiverData?.me
  const pendingClaims = (myClaims || []).filter((c) => c.status === 'pending')
  const claimedPlayerIds = new Set(pendingClaims.map((c) => c.add_player_id))

  // Total roster capacity from settings (starters + bench, IR slots are excluded
  // because IR'd players don't count toward the active roster)
  const rosterCap = (() => {
    const slots = settings?.roster_slots
    if (!slots) return 16
    let n = 0
    for (const [k, v] of Object.entries(slots)) {
      if (k === 'ir') continue
      n += Number(v) || 0
    }
    return n || 16
  })()
  // Active (non-IR) rostered count
  const activeRosterCount = (roster || []).filter((r) => r.slot !== 'ir').length

  async function handleConfirmAdd() {
    if (!addingPlayer) return
    if (activeRosterCount >= rosterCap && !dropPlayerId) {
      toast('Pick a player to drop', 'error')
      return
    }
    // Per-player waiver lock takes priority over the league-level waiver setting:
    // if a player is on waivers, the user must submit a claim, regardless of
    // whether the league uses waivers or instant adds.
    const playerOnWaivers = !!addingPlayer.on_waivers
    try {
      if (playerOnWaivers) {
        await submitClaim.mutateAsync({
          add_player_id: addingPlayer.id,
          drop_player_id: dropPlayerId || null,
          bid_amount: isFaab ? Number(bidAmount) || 0 : 0,
        })
        toast(`Waiver claim submitted for ${addingPlayer.full_name}`, 'success')
      } else {
        await addDrop.mutateAsync({
          addPlayerId: addingPlayer.id,
          dropPlayerId: dropPlayerId || null,
        })
        toast(`${addingPlayer.full_name} added`, 'success')
      }
      setAddingPlayer(null)
      setDropPlayerId('')
      setBidAmount(0)
    } catch (err) {
      toast(err.message || 'Failed to submit claim', 'error')
    }
  }

  // Pre-draft: show ADP / My Ranks toggle
  const showRankingsToggle = settings?.draft_status !== 'completed'

  return (
    <div className="space-y-3">
      {/* ADP / My Ranks toggle */}
      {showRankingsToggle && (
        <div className="flex gap-1 bg-bg-primary/40 rounded-lg p-1 border border-text-primary/10">
          {['ADP', 'My Ranks'].map((v) => (
            <button
              key={v}
              onClick={() => setPlayerView(v)}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                playerView === v ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >{v}</button>
          ))}
        </div>
      )}

      {/* My Ranks view */}
      {playerView === 'My Ranks' && showRankingsToggle ? (
        <FantasyMyRankings league={league} />
      ) : <>

      {/* Waiver state summary */}
      {isWaiver && !isDraftPhase && myWaiverState && (
        <div className="rounded-xl border border-text-primary/20 px-4 py-3 bg-bg-primary/40 backdrop-blur-sm flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs">
            <div>
              <div className="text-[10px] uppercase text-text-muted">Priority</div>
              <div className="text-sm font-bold text-text-primary">#{myWaiverState.priority}</div>
            </div>
            {isFaab && (
              <div>
                <div className="text-[10px] uppercase text-text-muted">FAAB</div>
                <div className="text-sm font-bold text-accent">${myWaiverState.faab_remaining}</div>
              </div>
            )}
          </div>
          <span className="text-[10px] text-text-muted text-right">Waivers process Wed 3 AM ET</span>
        </div>
      )}

      {/* Pending claims */}
      {pendingClaims.length > 0 && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden bg-bg-primary/40">
          <div className="px-4 py-2 border-b border-text-primary/10">
            <h4 className="text-xs text-text-muted uppercase tracking-wider">Your Pending Claims</h4>
          </div>
          <div className="divide-y divide-border">
            {pendingClaims.map((claim) => (
              <div key={claim.id} className="flex items-center gap-3 px-4 py-2">
                {claim.add_player?.headshot_url && (
                  <img src={claim.add_player.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">+ {claim.add_player?.full_name}</div>
                  <div className="text-[10px] text-text-muted">
                    {claim.drop_player ? `Drop ${claim.drop_player.full_name}` : 'No drop'}
                    {isFaab && ` · $${claim.bid_amount}`}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await cancelClaim.mutateAsync(claim.id)
                      toast('Claim cancelled', 'success')
                    } catch (err) {
                      toast(err.message || 'Failed to cancel', 'error')
                    }
                  }}
                  className="text-[10px] font-semibold text-incorrect hover:text-incorrect/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    <div className="rounded-xl border border-text-primary/20 overflow-hidden bg-bg-primary/40">
      <div className="p-3 border-b border-text-primary/10">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search players..."
          className="w-full bg-text-primary/5 border border-text-primary/15 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div className="flex gap-1 mt-2 overflow-x-auto scrollbar-hide">
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
      {/* Season label for pre-draft (showing last year's stats) */}
      {settings?.draft_status === 'pending' && (
        <div className="px-4 py-1.5 text-[10px] text-text-muted font-semibold uppercase tracking-wider">
          2025 Stats
        </div>
      )}
      {/* Single scroll container — header sticks at top, everything scrolls horizontally together */}
      <div className="overflow-x-auto scrollbar-hide max-h-[65vh] overflow-y-auto">
        <div className="min-w-[900px]">
        {/* Header — sticky top so it stays visible during vertical scroll */}
        <div className="border-b border-text-primary/10 bg-bg-card/60 backdrop-blur-sm flex text-[10px] font-bold text-text-muted uppercase tracking-wider sticky top-0 z-30">
          <div className="sticky left-0 z-20 bg-bg-card/80 backdrop-blur-sm flex items-center shrink-0">
            <button
              type="button"
              onClick={() => handleSort('rank')}
              className={`w-8 text-center px-1 py-1.5 rounded transition-colors ${
                sortKey === 'rank' ? 'border border-accent text-accent' : 'hover:bg-bg-card'
              }`}
            >
              {sortKey === 'rank' ? '#↓' : '#'}
            </button>
            <div className="w-[200px] lg:w-[260px] px-1 py-1.5">Player</div>
            <div className="w-8" />
          </div>
          <div className="flex gap-1 py-1.5">
            {statColumns.map((col) => (
              <button
                key={col.key}
                type="button"
                onClick={() => handleSort(col.key)}
                className={`w-14 shrink-0 text-center px-1 py-0.5 rounded transition-colors ${
                  sortKey === col.key ? 'border border-accent text-accent' : 'hover:bg-bg-card'
                }`}
              >
                {col.label}{sortKey === col.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
              </button>
            ))}
          </div>
        </div>
        {/* Rows */}
        <div>
          {isLoading ? (
            <div className="text-center text-sm text-text-muted py-8">Loading...</div>
          ) : (players || []).map((player, idx) => {
            const isClaimed = claimedPlayerIds.has(player.id)
            const onWaivers = !!player.on_waivers
            const pStats = player.stats || {}
            return (
              <div key={player.id} className="flex border-b border-border last:border-0">
                <div className="sticky left-0 z-10 bg-bg-card/60 backdrop-blur-sm flex items-center shrink-0">
                  <div className="w-8 text-center text-xs font-bold text-text-muted">
                    {player.adp_rank || idx + 1}
                  </div>
                  <div className="w-[200px] lg:w-[260px] flex items-center gap-2 px-1 py-2.5">
                    {player.headshot_url && (
                      <img
                        src={player.headshot_url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => openPlayerDetail(player.id)}
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    )}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openPlayerDetail(player.id)}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-text-primary truncate hover:text-accent transition-colors">{player.full_name}</span>
                        <InjuryBadge status={player.injury_status} />
                        <BlurbDot playerId={player.id} blurbIds={blurbIds} />
                        {onWaivers && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500" title="On waivers">W</span>
                        )}
                        {isClaimed && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent/20 text-accent" title="Pending claim">C</span>
                        )}
                      </div>
                      <div className="text-[10px] text-text-muted">{player.position} · {player.team || 'FA'}</div>
                    </div>
                  </div>
                  <div className="w-8 flex items-center justify-center">
                    {!isDraftPhase && roster?.length > 0 && !isClaimed && (
                      <button
                        onClick={() => setAddingPlayer(player)}
                        className={`text-lg font-bold w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                          onWaivers
                            ? 'text-accent hover:bg-accent/15'
                            : 'text-correct hover:bg-correct/15'
                        }`}
                      >
                        +
                      </button>
                    )}
                    {!isDraftPhase && isClaimed && (
                      <span className="text-[9px] font-semibold text-text-muted">...</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 items-center">
                  {statColumns.map((col) => (
                    <div
                      key={col.key}
                      className={`w-14 shrink-0 text-center text-xs tabular-nums py-1 rounded ${
                        sortKey === col.key ? 'bg-accent/10 text-text-primary font-bold' : 'text-text-secondary'
                      }`}
                    >
                      {pStats[col.key] ?? 0}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {!isLoading && players?.length === 0 && (
            <div className="text-center text-sm text-text-muted py-8">No players found</div>
          )}
        </div>
      </div>
    </div>
    </div>

      {/* Add/drop confirm modal */}
      {addingPlayer && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center" onClick={() => { setAddingPlayer(null); setBidAmount(0) }}>
          <div className="bg-bg-secondary w-full md:max-w-md rounded-2xl mx-3 mb-16 md:mb-0 md:mx-0 p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg mb-4">{addingPlayer?.on_waivers ? 'Claim' : 'Add'} {addingPlayer.full_name}</h3>
            {isFaab && (
              <div className="mb-4">
                <label className="block text-xs uppercase text-text-muted mb-1.5">FAAB Bid (you have ${myWaiverState?.faab_remaining ?? 0})</label>
                <input
                  type="number"
                  min={0}
                  max={myWaiverState?.faab_remaining ?? 100}
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  className="w-full bg-bg-card border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            )}
            {activeRosterCount >= rosterCap && (
              <>
                <p className="text-sm text-text-secondary mb-3">Roster is full. Pick a player to drop:</p>
                <div className="space-y-1 mb-4 max-h-60 overflow-y-auto">
                  {(roster || []).map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setDropPlayerId(r.player_id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                        dropPlayerId === r.player_id ? 'border-accent bg-accent/10' : 'border-border bg-bg-primary hover:bg-bg-card-hover'
                      }`}
                    >
                      {r.nfl_players?.headshot_url && (
                        <img src={r.nfl_players.headshot_url} alt="" className="w-7 h-7 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{r.nfl_players?.full_name}</div>
                        <div className="text-[10px] text-text-muted">{r.nfl_players?.position} · {r.slot.toUpperCase()}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setAddingPlayer(null); setDropPlayerId(''); setBidAmount(0) }} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-bg-card text-text-secondary border border-border hover:bg-bg-card-hover transition-colors">Cancel</button>
              <button
                onClick={handleConfirmAdd}
                disabled={addDrop.isPending || submitClaim.isPending}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {(addDrop.isPending || submitClaim.isPending) ? 'Submitting…' : addingPlayer?.on_waivers ? 'Submit Claim' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detailPlayerId && (() => {
        const detailPlayer = players?.find((p) => p.id === detailPlayerId)
        const ctx = detailPlayer?.on_waivers ? 'waiver' : 'free_agent'
        return (
          <PlayerDetailModal
            leagueId={league.id}
            playerId={detailPlayerId}
            onClose={() => setDetailPlayerId(null)}
            playerContext={ctx}
            onClaim={(pid) => {
              const p = players?.find((pl) => pl.id === pid)
              if (p) { setDetailPlayerId(null); setAddingPlayer(p) }
            }}
            onAdd={(pid) => {
              const p = players?.find((pl) => pl.id === pid)
              if (p) { setDetailPlayerId(null); setAddingPlayer(p) }
            }}
          />
        )
      })()}
    </>}
    </div>
  )
}
