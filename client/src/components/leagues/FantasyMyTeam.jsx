import { useState, useMemo, useEffect } from 'react'
import { useFantasyRoster, useSetFantasyLineup, useDropRosterPlayer, useFantasyTrades, useRespondToTrade, useBlurbPlayerIds, useFantasySettings, useGlobalRank, useFantasyLineupHistory, useFantasyWeeklyLineup, useSetFantasyWeeklyLineup, useFantasyWeekProjections } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { SkeletonRows, SkeletonBlock } from '../ui/Skeleton'
import { toast } from '../ui/Toast'
import Avatar from '../ui/Avatar'
import PlayerDetailModal from './PlayerDetailModal'
import FantasyGlobalRankModal from './FantasyGlobalRankModal'
import { ProposeTradeModal } from './FantasyTrades'
import BlurbDot, { markBlurbSeen } from './BlurbDot'

const INJURY_COLORS = {
  Out: 'text-incorrect',
  IR: 'text-incorrect',
  Questionable: 'text-yellow-400',
  Doubtful: 'text-yellow-400',
  Probable: 'text-correct',
  'Day-To-Day': 'text-yellow-400',
}

// Build the starter slot list from the league's roster_slots config so leagues
// with non-default lineups (e.g., 2 WR instead of 3) don't render extra empty
// slots that nobody can fill. Slot keys must match what the BE writes
// (qb, rb1..rbN, wr1..wrN, te, flex, superflex, k, def).
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
  // IDP slots — DL accepts the D-line family (edge rushers, DTs), LB the
  // linebacker family, DB the corners, S the safeties. Position codes
  // mirror Sleeper's nfl_players.position values.
  for (let i = 1; i <= (slots.dl || 0); i++) result.push({ key: `dl${i}`, label: 'DL', positions: ['DE', 'DT', 'NT', 'DL'] })
  for (let i = 1; i <= (slots.lb || 0); i++) result.push({ key: `lb${i}`, label: 'LB', positions: ['LB', 'ILB', 'OLB', 'MLB'] })
  for (let i = 1; i <= (slots.db || 0); i++) result.push({ key: `db${i}`, label: 'DB', positions: ['CB', 'DB'] })
  for (let i = 1; i <= (slots.s || 0); i++) result.push({ key: `s${i}`, label: 'S', positions: ['S', 'FS', 'SS'] })
  return result
}

// Split-aware slot eligibility so admin overrides like "LB/DL" let a
// hybrid edge player slot at either LB or DL. Mirrors the NBA DFS
// isPlayerEligibleForSlot pattern.
function isPositionEligibleForSlot(playerPosition, slotPositions) {
  if (!playerPosition || !slotPositions) return false
  const parts = playerPosition.split('/').map((p) => p.trim()).filter(Boolean)
  return parts.some((p) => slotPositions.includes(p))
}

const POSITION_STAT_CONFIG = {
  QB: [
    { key: 'pass_yd', label: 'PYD', comma: true },
    { key: 'pass_td', label: 'PTD' },
    { key: 'pass_int', label: 'INT' },
    { key: 'rush_att', label: 'CAR' },
    { key: 'rush_yd', label: 'RYD' },
  ],
  RB: [
    { key: 'rush_att', label: 'CAR' },
    { key: 'rush_yd', label: 'RYD', comma: true },
    { key: 'rush_td', label: 'RTD' },
    { key: 'rec', label: 'REC' },
    { key: 'rec_yd', label: 'REYD' },
    { key: 'rec_td', label: 'RETD' },
    { key: 'rec_tgt', label: 'TGT' },
  ],
  WR: [
    { key: 'rec', label: 'REC' },
    { key: 'rec_yd', label: 'REYD', comma: true },
    { key: 'rec_td', label: 'RETD' },
    { key: 'rec_tgt', label: 'TGT' },
  ],
  TE: [
    { key: 'rec', label: 'REC' },
    { key: 'rec_yd', label: 'REYD', comma: true },
    { key: 'rec_td', label: 'RETD' },
    { key: 'rec_tgt', label: 'TGT' },
  ],
  K: [
    { key: 'fgm', label: 'FGM' },
    { key: 'fgm_50_plus', label: '50+' },
    { key: 'xpm', label: 'XPM' },
  ],
  DEF: [
    { key: 'def_sack', label: 'SCK' },
    { key: 'def_int', label: 'INT' },
    { key: 'def_fum_rec', label: 'FR' },
    { key: 'def_td', label: 'DTD' },
  ],
}

// IDP stat lines — Sleeper's nfl_players.position codes for defenders
// are granular (DE / DT / NT / LB / ILB / OLB / MLB / CB / DB / S / FS
// / SS). Map each family to the same stat template so the display is
// consistent regardless of which specific position code is on file.
const IDP_STAT_TEMPLATE = [
  { key: 'idp_tkl_solo', label: 'SOLO' },
  { key: 'idp_tkl_ast', label: 'AST' },
  { key: 'idp_tkl_loss', label: 'TFL' },
  { key: 'idp_sack', label: 'SCK' },
  { key: 'idp_int', label: 'INT' },
  { key: 'idp_pass_def', label: 'PD' },
  { key: 'idp_ff', label: 'FF' },
  { key: 'idp_fum_rec', label: 'FR' },
]
for (const pos of ['DL', 'DE', 'DT', 'NT', 'LB', 'ILB', 'OLB', 'MLB', 'DB', 'CB', 'S', 'FS', 'SS']) {
  POSITION_STAT_CONFIG[pos] = IDP_STAT_TEMPLATE
}

function formatSeasonStats(position, stats) {
  if (!stats || !position) return null
  // Dual positions (e.g. "LB/DL"): use the first part's stat template
  // since both IDP families share the same IDP_STAT_TEMPLATE anyway.
  // For hybrid non-IDP (rare), first-part wins.
  const lookupKey = position.includes('/') ? position.split('/')[0].trim() : position
  const config = POSITION_STAT_CONFIG[lookupKey]
  if (!config) return null
  // Only render stat entries with a non-zero value — a row of "117 RYD ·
  // 0 RTD · 0 REC · 0 REYD" reads as noise when only the rushing yards
  // are meaningful. Keep the order from the config so what does show
  // reads in the same canonical sequence.
  const nonZero = config.filter((c) => (Number(stats[c.key]) || 0) > 0)
  if (nonZero.length === 0) return null
  return nonZero.map((c) => {
    const val = Number(stats[c.key]) || 0
    return `${c.comma ? val.toLocaleString() : val} ${c.label}`
  }).join(' · ')
}

function InjuryBadge({ status }) {
  if (!status) return null
  const label = status === 'Day-To-Day' ? 'DTD' : status === 'IR' ? 'IR' : status.charAt(0)
  return (
    <span className={`text-[12px] font-mono font-bold shrink-0 ${INJURY_COLORS[status] || 'text-text-muted'}`} title={status}>
      {label}
    </span>
  )
}

function PlayerRow({ row, onTap, isSelected, dimmed, onMoveToIR, onMoveOutOfIR, onViewDetail, blurbIds, editMode, showSeasonStats = true, isDropTarget = false }) {
  const canIR = row?.nfl_players?.injury_status === 'Out' || row?.nfl_players?.injury_status === 'IR'
  const isInIR = row?.slot === 'ir'

  function handleRowClick() {
    if (editMode) {
      onTap?.()
    } else {
      onViewDetail?.(row?.player_id)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleRowClick}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg border transition-colors text-left ${
          isSelected
            ? 'border-accent bg-accent/10'
            : isDropTarget
              ? 'border-accent/60 bg-accent/5 ring-1 ring-accent/40'
              : 'border-text-primary/10 bg-bg-primary/40 hover:bg-bg-card-hover'
        } ${dimmed ? 'opacity-40' : ''}`}
      >
        {row?.nfl_players?.headshot_url && (
          <img
            src={row.nfl_players.headshot_url}
            alt=""
            className="w-11 h-11 rounded-full object-cover bg-bg-secondary shrink-0"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        )}
        <div className="flex-1 min-w-0 md:flex-none md:basis-[30%] md:max-w-[30%]">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold text-text-primary truncate">{row?.nfl_players?.full_name || 'Empty'}</span>
            <InjuryBadge status={row?.nfl_players?.injury_status} />
            {blurbIds && <BlurbDot playerId={row?.player_id} blurbIds={blurbIds} />}
          </div>
          <div className="text-xs text-text-primary">
            {row?.nfl_players?.position} · {row?.nfl_players?.team || 'FA'}
            {row?.current_week_opponent ? (
              <span className="text-text-muted ml-2">{row.current_week_is_home ? 'vs' : '@'} {row.current_week_opponent}</span>
            ) : ('current_week_opponent' in (row || {}) && row?.nfl_players?.team) ? (
              <span className="text-yellow-400 ml-2 font-semibold">BYE</span>
            ) : null}
          </div>
        </div>
        {/* Stat line — desktop only. Always the week being viewed:
            week_stats on the current/live week, season_stats on past
            weeks (server overloads season_stats with that-week's stats
            in the lineup-history path). Season totals live in the
            player detail modal.
            Sits in a flex-grow column with text-left so it reads
            close to the player name (not jammed against the points
            column on the right). Header above the table mirrors this
            with a "Season Total" label aligned to the same column. */}
        {row?.nfl_players?.position && !editMode && (() => {
          const source = showSeasonStats ? row.week_stats : row.season_stats
          if (!source) return null
          const statLine = formatSeasonStats(row.nfl_players.position, source)
          if (!statLine) return null
          return (
            <div className="hidden md:block md:flex-1 md:min-w-0 md:ml-3 md:mr-3">
              <div className="text-sm text-text-secondary tabular-nums truncate">{statLine}</div>
            </div>
          )
        })()}
        {row?.nfl_players && (() => {
          // Two-line layout: actual points (or — when player hasn't
          // played) on top, projection below in muted small text.
          // Mirrors the Matchup view's mental model so the user's eye
          // learns one pattern instead of two — and a Thursday-final
          // score never reads as a Monday projection at a glance.
          // hasPlayed = the player has a stats row for this week, even
          // if their actual score is 0 (real DEF/K zeros stay distinct
          // from "game hasn't kicked off yet"). For past-week views the
          // server overloads season_stats with that-week's data, so we
          // check both sources.
          const hasPlayed = showSeasonStats ? row.week_stats != null : row.season_stats != null
          const showProj = row.weekly_projection != null
          return (
            <div className="text-right shrink-0 mr-1 ml-auto">
              {hasPlayed ? (
                <div className="text-lg font-display tabular-nums text-white leading-none">{(row.live_points ?? 0).toFixed(1)}</div>
              ) : (
                <div className="text-lg font-display tabular-nums text-text-muted leading-none">—</div>
              )}
              {showProj && (
                <div className="text-xs tabular-nums text-text-secondary mt-1">
                  Proj {row.weekly_projection.toFixed(1)}
                </div>
              )}
            </div>
          )
        })()}
        {editMode && (canIR && !isInIR && onMoveToIR) && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onMoveToIR(row.player_id) }}
            className="text-xs font-bold px-2 py-1 rounded bg-incorrect/20 text-incorrect hover:bg-incorrect/30 transition-colors shrink-0 cursor-pointer"
          >
            → IR
          </span>
        )}
        {editMode && isInIR && onMoveOutOfIR && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onMoveOutOfIR(row.player_id) }}
            className="text-xs font-bold px-2 py-1 rounded bg-bg-card text-text-secondary hover:bg-bg-card-hover transition-colors shrink-0 cursor-pointer"
          >
            ← Bench
          </span>
        )}
      </button>
    </div>
  )
}

function EmptySlot({ slotLabel, onTap, isSelected, editMode, isDropTarget }) {
  // `isDropTarget` — set when a player is selected and this empty slot is
  // a valid place to move them (bench slot always; starter slot only when
  // position matches, handled by caller). Distinct from `isSelected`
  // (which means "this slot is the cursor"). Visual: faint accent ring
  // + nudge in the label so the user sees a place to drop the picked
  // player without first picking a replacement.
  return (
    <button
      type="button"
      onClick={onTap}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed transition-colors text-left ${
        isSelected
          ? 'border-accent bg-accent/10'
          : isDropTarget
            ? 'border-accent/50 bg-accent/5 hover:bg-accent/10'
            : 'border-text-primary/20 bg-bg-primary/40 hover:bg-bg-card-hover'
      }`}
    >
      <div className="w-9 h-9 rounded-full bg-bg-secondary/40 shrink-0" />
      <div className={`flex-1 text-xs ${isDropTarget ? 'text-accent' : 'text-text-muted'}`}>
        Empty {slotLabel}{editMode ? (isDropTarget ? ' — tap to move here' : ' — tap to assign') : ''}
      </div>
    </button>
  )
}

export default function FantasyMyTeam({ league }) {
  const { profile } = useAuth()
  const { data: fantasySettings } = useFantasySettings(league.id)
  const STARTER_SLOTS = useMemo(() => buildStarterSlots(fantasySettings?.roster_slots), [fantasySettings?.roster_slots])
  const currentWeek = fantasySettings?.current_week || 1
  const season = fantasySettings?.season || 2026
  const totalWeeks = 17
  const [viewWeek, setViewWeek] = useState(null) // null = current week
  const activeWeek = viewWeek ?? currentWeek
  const isCurrentWeek = activeWeek === currentWeek
  const isPastWeek = activeWeek < currentWeek
  const isFutureWeek = activeWeek > currentWeek

  const { data: rawRoster, isLoading } = useFantasyRoster(league.id)
  const { data: historyData } = useFantasyLineupHistory(league.id, isPastWeek ? activeWeek : null, isPastWeek ? season : null)
  const { data: weeklyLineupData } = useFantasyWeeklyLineup(league.id, isFutureWeek ? activeWeek : null)
  const setWeeklyLineup = useSetFantasyWeeklyLineup(league.id)
  const { data: trades } = useFantasyTrades(league.id)
  const { data: blurbIdsList } = useBlurbPlayerIds(league.id)
  const blurbIds = useMemo(() => new Set(blurbIdsList || []), [blurbIdsList])
  const respond = useRespondToTrade(league.id)
  const setLineup = useSetFantasyLineup(league.id)
  const dropPlayer = useDropRosterPlayer(league.id)
  const [confirmDrop, setConfirmDrop] = useState(null) // roster row being dropped
  const [draftSlots, setDraftSlots] = useState(null) // { [player_id]: slot }
  const [selected, setSelected] = useState(null) // { type: 'slot'|'player', key: string }
  const [editMode, setEditMode] = useState(false)
  const [showCounterTrade, setShowCounterTrade] = useState(null)
  const [detailPlayerId, setDetailPlayerId] = useState(null)
  const [showGlobalRank, setShowGlobalRank] = useState(false)
  const { data: globalRankData } = useGlobalRank(league.id)
  const hasGlobalRank = globalRankData?.status === 'ok' && globalRankData?.format?.team_count > 1
  const [expandedTradeId, setExpandedTradeId] = useState(null)
  const [tradeAcceptedModal, setTradeAcceptedModal] = useState(false)

  // Reset edit state when navigating weeks
  useEffect(() => {
    setEditMode(false)
    setDraftSlots(null)
    setSelected(null)
  }, [activeWeek])

  // For past weeks, use lineup history; for future weeks with saved lineup, use that; otherwise current roster
  // Fetch per-week projection + opponent context whenever the user
  // is viewing a non-current week so we can overlay onto the roster
  // rows (the downstream renderer reads weekly_projection +
  // current_week_opponent directly off each row).
  const { data: weekContextData } = useFantasyWeekProjections(league.id, !isCurrentWeek ? activeWeek : null)
  const weekProjMap = weekContextData?.projections
  const weekOppMap = weekContextData?.opponents
  function applyWeekOverlay(arr) {
    if (!arr || !weekContextData) return arr
    return arr.map((r) => {
      const overlay = {}
      const team = r.nfl_players?.team
      const isOnBye = team && weekOppMap && !weekOppMap[team]
      // Bye-week players: force projection to 0. Sleeper occasionally
      // returns a non-zero projection on a bye week (their model
      // doesn't always cross-reference the schedule), which would
      // otherwise show "23.8 PROJ" for a guy who's not playing.
      if (isOnBye) {
        overlay.weekly_projection = 0
      } else {
        const wp = weekProjMap?.[r.player_id]
        if (wp != null) overlay.weekly_projection = wp
      }
      if (team && weekOppMap) {
        const op = weekOppMap[team]
        if (op) {
          overlay.current_week_opponent = op.opponent
          overlay.current_week_is_home = op.is_home
        } else {
          // Null opponent + the present-but-null current_week_opponent
          // field triggers BYE label in PlayerRow.
          overlay.current_week_opponent = null
          overlay.current_week_is_home = null
        }
      }
      return Object.keys(overlay).length > 0 ? { ...r, ...overlay } : r
    })
  }
  const roster = useMemo(() => applyWeekOverlay(rawRoster), [rawRoster, weekContextData])

  const weeklyRoster = weeklyLineupData?.roster
  const hasWeeklyLineup = isFutureWeek && weeklyRoster && weeklyRoster.length > 0
  const baseDisplayRoster = isPastWeek && historyData?.roster?.length
    ? historyData.roster
    : hasWeeklyLineup
      ? weeklyRoster
      : roster
  const displayRoster = applyWeekOverlay(baseDisplayRoster)

  function openPlayerDetail(playerId) {
    if (playerId) markBlurbSeen(playerId)
    setDetailPlayerId(playerId)
  }

  // Any pending trade involving me — incoming (I'm the receiver) or
  // outgoing (I proposed and am waiting). Counters back-and-forth keep
  // the latest trade pending so the banner stays visible the whole time.
  const pendingTrades = (trades || []).filter((t) => t.status === 'pending' && (t.receiver_user_id === profile?.id || t.proposer_user_id === profile?.id))

  // Build a working slot-by-player map (server slot or draftSlots override)
  // For future weeks with a saved weekly lineup, use those slots as the base
  const slotByPlayer = useMemo(() => {
    if (!roster) return {}
    const map = {}
    // Start from weekly lineup if viewing a future week with saved data
    if (hasWeeklyLineup) {
      // Initialize all current roster players as bench
      for (const r of roster) map[r.player_id] = 'bench'
      // Override with weekly lineup slots (only players still on roster)
      for (const w of weeklyRoster) {
        if (map[w.player_id] !== undefined) map[w.player_id] = w.slot
      }
    } else {
      for (const r of roster) map[r.player_id] = r.slot
    }
    // Apply draft overrides on top
    if (draftSlots) {
      for (const pid of Object.keys(draftSlots)) {
        if (map[pid] !== undefined) map[pid] = draftSlots[pid]
      }
    }
    return map
  }, [roster, draftSlots, hasWeeklyLineup, weeklyRoster])

  const isDirty = useMemo(() => {
    if (!draftSlots || !roster) return false
    if (hasWeeklyLineup) {
      const weeklyMap = {}
      for (const r of roster) weeklyMap[r.player_id] = 'bench'
      for (const w of weeklyRoster) {
        if (weeklyMap[w.player_id] !== undefined) weeklyMap[w.player_id] = w.slot
      }
      return Object.keys(draftSlots).some((pid) => draftSlots[pid] !== weeklyMap[pid])
    }
    return roster.some((r) => draftSlots[r.player_id] !== r.slot)
  }, [draftSlots, roster, hasWeeklyLineup, weeklyRoster])

  if (isLoading) return (
    <div className="space-y-4">
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <SkeletonBlock className="h-4 w-32" />
        </div>
        <div className="p-3">
          <SkeletonRows count={10} imgSize="w-9 h-9" />
        </div>
      </div>
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <SkeletonBlock className="h-4 w-24" />
        </div>
        <div className="p-3">
          <SkeletonRows count={5} imgSize="w-9 h-9" />
        </div>
      </div>
    </div>
  )

  const hasRoster = roster && roster.length > 0
  const isSalaryCap = fantasySettings?.format === 'salary_cap'
  if (!hasRoster) {
    const slots = fantasySettings?.roster_slots || (isSalaryCap
      ? { qb: 1, rb: 2, wr: 3, te: 1, flex: 1, k: 1, def: 1 }
      : { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, k: 1, def: 1, bench: 6 })
    const starterSlots = []
    // Mirror buildStarterSlots order so pre-draft empty view matches
    // the post-draft layout (including IDP families when configured).
    const slotExpansion = { qb: 'QB', rb: 'RB', wr: 'WR', te: 'TE', flex: 'FLEX', superflex: 'SFLEX', k: 'K', def: 'DEF', dl: 'DL', lb: 'LB', db: 'DB', s: 'S' }
    for (const [key, label] of Object.entries(slotExpansion)) {
      for (let i = 0; i < (slots[key] || 0); i++) starterSlots.push(label)
    }
    const benchCount = isSalaryCap ? 0 : (slots.bench || 6)
    const irCount = isSalaryCap ? 0 : (slots.ir || 0)
    return (
      <div className="space-y-4">
        <p className="text-sm text-text-secondary text-center">
          {isSalaryCap ? 'Set your lineup each week under the salary cap.' : "You'll see your team here after the draft!"}
        </p>
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-base font-semibold text-text-primary">{isSalaryCap ? 'Lineup' : 'Starters'}</h3>
          </div>
          <div className="divide-y divide-text-primary/10">
            {starterSlots.map((label, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-xs font-bold text-text-muted w-8 shrink-0">{label}</span>
                <div className="w-9 h-9 rounded-full border border-text-primary/20 shrink-0" />
                <div className="flex-1 text-xs text-text-muted italic">Empty</div>
              </div>
            ))}
          </div>
        </div>
        {benchCount > 0 && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-base font-semibold text-text-primary">Bench</h3>
          </div>
          <div className="divide-y divide-text-primary/10">
            {Array.from({ length: benchCount }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-xs font-bold text-text-muted w-8 shrink-0">BN</span>
                <div className="w-9 h-9 rounded-full border border-text-primary/20 shrink-0" />
                <div className="flex-1 text-xs text-text-muted italic">Empty</div>
              </div>
            ))}
          </div>
        </div>
        )}
        {irCount > 0 && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-base font-semibold text-text-primary">IR</h3>
          </div>
          <div className="divide-y divide-text-primary/10">
            {Array.from({ length: irCount }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-xs font-bold text-text-muted w-8 shrink-0">IR</span>
                <div className="w-9 h-9 rounded-full border border-text-primary/20 shrink-0" />
                <div className="flex-1 text-xs text-text-muted italic">Empty</div>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>
    )
  }

  async function handleTradeAction(tradeId, action) {
    try {
      await respond.mutateAsync({ tradeId, action })
      if (action === 'accept') {
        setTradeAcceptedModal(true)
      } else {
        toast(`Trade ${action}d`, 'success')
      }
    } catch (err) {
      toast(err.message || `Failed to ${action} trade`, 'error')
    }
  }

  // Group roster by current (working) slot
  const playersBySlot = {}
  for (const r of roster) {
    const slot = slotByPlayer[r.player_id]
    if (!playersBySlot[slot]) playersBySlot[slot] = []
    playersBySlot[slot].push(r)
  }
  const benchPlayers = playersBySlot.bench || []
  const benchSlots = fantasySettings?.roster_slots?.bench || 6
  const emptyBenchCount = Math.max(0, benchSlots - benchPlayers.length)
  const irPlayers = playersBySlot.ir || []
  const irSlotCount = fantasySettings?.roster_slots?.ir || 0
  const emptyIrCount = Math.max(0, irSlotCount - irPlayers.length)

  function ensureDraft() {
    if (draftSlots) return draftSlots
    const initial = {}
    if (hasWeeklyLineup) {
      // Start from weekly lineup: bench everyone, then overlay saved slots
      for (const r of roster) initial[r.player_id] = 'bench'
      for (const w of weeklyRoster) {
        if (initial[w.player_id] !== undefined) initial[w.player_id] = w.slot
      }
    } else {
      for (const r of roster) initial[r.player_id] = r.slot
    }
    setDraftSlots(initial)
    return initial
  }

  function swapSelectionWith(target) {
    // target = { type: 'slot', key } or { type: 'player', key: player_id }
    const next = { ...ensureDraft() }
    if (selected?.type === 'player' && target.type === 'slot') {
      const playerId = selected.key
      const slotKey = target.key
      // Benching: just move to bench, no position check
      if (slotKey === 'bench') {
        next[playerId] = 'bench'
      } else {
        const player = roster.find((r) => r.player_id === playerId)
        const slotDef = STARTER_SLOTS.find((s) => s.key === slotKey)
        if (!isPositionEligibleForSlot(player?.nfl_players?.position, slotDef?.positions)) {
          toast(`${player?.nfl_players?.position || 'Player'} can't fill ${slotDef?.label || slotKey}`, 'error')
          return
        }
        for (const r of roster) {
          if (r.player_id !== playerId && next[r.player_id] === slotKey) {
            next[r.player_id] = 'bench'
          }
        }
        next[playerId] = slotKey
      }
    } else if (selected?.type === 'slot' && target.type === 'player') {
      const slotKey = selected.key
      const playerId = target.key
      if (slotKey === 'bench') {
        next[playerId] = 'bench'
      } else {
        const player = roster.find((r) => r.player_id === playerId)
        const slotDef = STARTER_SLOTS.find((s) => s.key === slotKey)
        if (!isPositionEligibleForSlot(player?.nfl_players?.position, slotDef?.positions)) {
          toast(`${player?.nfl_players?.position || 'Player'} can't fill ${slotDef?.label || slotKey}`, 'error')
          return
        }
        for (const r of roster) {
          if (r.player_id !== playerId && next[r.player_id] === slotKey) {
            next[r.player_id] = 'bench'
          }
        }
        next[playerId] = slotKey
      }
    } else if (selected?.type === 'player' && target.type === 'player') {
      // Swap two players' slots
      const a = selected.key, b = target.key
      const slotA = next[a], slotB = next[b]
      const playerA = roster.find((r) => r.player_id === a)
      const playerB = roster.find((r) => r.player_id === b)
      const slotADef = STARTER_SLOTS.find((s) => s.key === slotB)
      const slotBDef = STARTER_SLOTS.find((s) => s.key === slotA)
      if (slotADef && !isPositionEligibleForSlot(playerA?.nfl_players?.position, slotADef.positions)) {
        toast(`${playerA?.nfl_players?.position} can't fill ${slotADef.label}`, 'error')
        return
      }
      if (slotBDef && !isPositionEligibleForSlot(playerB?.nfl_players?.position, slotBDef.positions)) {
        toast(`${playerB?.nfl_players?.position} can't fill ${slotBDef.label}`, 'error')
        return
      }
      next[a] = slotB
      next[b] = slotA
    }
    setDraftSlots(next)
    setSelected(null)
  }

  function handleSlotTap(slotKey) {
    if (selected?.type === 'slot' && selected.key === slotKey) {
      setSelected(null)
      return
    }
    if (selected) {
      swapSelectionWith({ type: 'slot', key: slotKey })
    } else {
      setSelected({ type: 'slot', key: slotKey })
    }
  }

  function handlePlayerTap(playerId) {
    if (selected?.type === 'player' && selected.key === playerId) {
      setSelected(null)
      return
    }
    if (selected) {
      swapSelectionWith({ type: 'player', key: playerId })
    } else {
      setSelected({ type: 'player', key: playerId })
    }
  }

  async function handleSave() {
    if (!draftSlots) return
    const slots = Object.entries(draftSlots).map(([player_id, slot]) => ({ player_id, slot }))
    try {
      if (isFutureWeek) {
        await setWeeklyLineup.mutateAsync({ week: activeWeek, slots })
      } else {
        await setLineup.mutateAsync(slots)
      }
      toast('Lineup saved', 'success')
      setDraftSlots(null)
      setSelected(null)
    } catch (err) {
      toast(err.message || 'Failed to save lineup', 'error')
    }
  }

  function handleReset() {
    setDraftSlots(null)
    setSelected(null)
  }

  function handleMoveToIR(playerId) {
    const next = { ...ensureDraft() }
    next[playerId] = 'ir'
    setDraftSlots(next)
    setSelected(null)
  }

  function handleMoveOutOfIR(playerId) {
    const next = { ...ensureDraft() }
    next[playerId] = 'bench'
    setDraftSlots(next)
    setSelected(null)
  }


  return (
    <div className={`space-y-4 ${editMode && (isCurrentWeek || isFutureWeek) ? 'pb-32 md:pb-0' : ''}`}>
      {/* Week navigator */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setViewWeek(Math.max(1, activeWeek - 1))}
          disabled={activeWeek <= 1}
          className="text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <div className="text-center">
          <span className="font-display text-lg text-text-primary">Week {activeWeek}</span>
          {isCurrentWeek && <span className="text-xs text-accent ml-2">Current</span>}
          {isPastWeek && <span className="text-xs text-text-muted ml-2">Final</span>}
          {isFutureWeek && hasWeeklyLineup && <span className="text-xs text-correct ml-2">Set</span>}
          {isFutureWeek && !hasWeeklyLineup && <span className="text-xs text-text-muted ml-2">Upcoming</span>}
        </div>
        <button
          onClick={() => setViewWeek(Math.min(totalWeeks, activeWeek + 1))}
          disabled={activeWeek >= totalWeeks}
          className="text-text-muted hover:text-text-primary disabled:opacity-30 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Past week: win/loss result + total */}
      {isPastWeek && historyData?.roster?.length > 0 && (
        <div className="text-center text-sm">
          {historyData.matchup_result === 'win' ? (
            <span className="text-correct font-semibold">You won Week {activeWeek}</span>
          ) : historyData.matchup_result === 'loss' ? (
            <span className="text-incorrect font-semibold">You lost Week {activeWeek}</span>
          ) : historyData.matchup_result === 'tie' ? (
            <span className="text-text-muted font-semibold">Week {activeWeek} was a tie</span>
          ) : (
            <span className="text-text-muted">Week {activeWeek} Final</span>
          )}
          {historyData.team_total != null && (
            <span className="ml-2 text-white font-display">{historyData.team_total.toFixed(2)} pts</span>
          )}
        </div>
      )}
      {isPastWeek && (!historyData?.roster?.length) && (
        <div className="text-center text-sm text-text-muted py-8">No lineup history for this week</div>
      )}

      {/* Future week: invalidation warning if players no longer on roster */}
      {hasWeeklyLineup && weeklyRoster.some((w) => w.still_on_roster === false) && (
        <div className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent text-center">
          Some players in this lineup are no longer on your roster. Edit to fix.
        </div>
      )}

      {/* Pending trade proposals — incoming or outgoing */}
      {pendingTrades.map((trade) => {
        const isOutgoing = trade.proposer_user_id === profile?.id
        const counterparty = isOutgoing
          ? (trade.receiver || trade.receiver_user)
          : (trade.proposer || trade.proposer_user)
        const isExpanded = expandedTradeId === trade.id
        const proposerItems = (trade.fantasy_trade_items || []).filter((i) => i.from_user_id === trade.proposer_user_id)
        const receiverItems = (trade.fantasy_trade_items || []).filter((i) => i.from_user_id === trade.receiver_user_id)
        // From my perspective: what I receive vs what I give up
        const myReceiveItems = isOutgoing ? receiverItems : proposerItems
        const myGiveItems = isOutgoing ? proposerItems : receiverItems
        const counterpartyName = counterparty?.display_name || counterparty?.username
        return (
          <div key={trade.id} className={`rounded-xl border overflow-hidden ${isOutgoing ? 'border-text-primary/20 bg-bg-primary/40' : 'border-accent/40 bg-accent/5'}`}>
            <button
              onClick={() => setExpandedTradeId(isExpanded ? null : trade.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <Avatar user={counterparty} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary">
                  {isOutgoing
                    ? `Waiting on ${counterpartyName} to respond`
                    : `${counterpartyName} proposed a trade`}
                </div>
                <div className="text-[10px] text-text-muted">Tap to review</div>
              </div>
              <svg className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isExpanded && (
              <div className="px-4 pb-4">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="text-sm font-semibold text-text-primary mb-2">You receive</div>
                    <div className="space-y-1.5">
                      {myReceiveItems.map((item) => (
                        <div key={item.player_id} className="flex flex-col items-center rounded-lg bg-bg-primary/60 border border-text-primary/10 px-2 py-3 text-center">
                          {item.nfl_players?.headshot_url && <img src={item.nfl_players.headshot_url} alt="" className="w-14 h-14 rounded-full object-cover mb-1.5" />}
                          <div className="text-sm font-bold text-text-primary leading-tight">{item.nfl_players?.full_name}</div>
                          <div className="text-[11px] text-text-muted mt-0.5">{item.nfl_players?.position} · {item.nfl_players?.team}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-text-primary mb-2">You give up</div>
                    <div className="space-y-1.5">
                      {myGiveItems.map((item) => (
                        <div key={item.player_id} className="flex flex-col items-center rounded-lg bg-bg-primary/60 border border-text-primary/10 px-2 py-3 text-center">
                          {item.nfl_players?.headshot_url && <img src={item.nfl_players.headshot_url} alt="" className="w-14 h-14 rounded-full object-cover mb-1.5" />}
                          <div className="text-sm font-bold text-text-primary leading-tight">{item.nfl_players?.full_name}</div>
                          <div className="text-[11px] text-text-muted mt-0.5">{item.nfl_players?.position} · {item.nfl_players?.team}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {trade.message && (
                  <div className="text-sm text-text-primary italic mb-3">"{trade.message}"</div>
                )}
                {isOutgoing ? (
                  <button
                    onClick={() => handleTradeAction(trade.id, 'cancel')}
                    disabled={respond.isPending}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold bg-bg-card text-text-secondary border border-text-primary/20 hover:bg-text-primary/5 transition-colors disabled:opacity-50"
                  >Cancel Trade</button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTradeAction(trade.id, 'accept')}
                      disabled={respond.isPending}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-correct text-white hover:bg-correct/90 transition-colors disabled:opacity-50"
                    >Accept</button>
                    <button
                      onClick={() => {
                        setExpandedTradeId(null)
                        setShowCounterTrade(trade)
                      }}
                      disabled={respond.isPending}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                    >Counter</button>
                    <button
                      onClick={() => handleTradeAction(trade.id, 'decline')}
                      disabled={respond.isPending}
                      className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-incorrect text-white hover:bg-incorrect/90 transition-colors disabled:opacity-50"
                    >Decline</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {hasGlobalRank && (
        <button
          onClick={() => setShowGlobalRank(true)}
          className="w-full rounded-xl border border-text-primary/20 bg-bg-primary p-3 flex items-center justify-between hover:bg-bg-secondary transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div className="text-left">
              <div className="text-sm font-semibold text-text-primary">Global Rank</div>
              <div className="text-xs text-text-primary">See where your team ranks across all IKB leagues with the same roster and scoring settings.</div>
            </div>
          </div>
          <span className="text-text-muted">→</span>
        </button>
      )}

      {showGlobalRank && (
        <FantasyGlobalRankModal leagueId={league.id} onClose={() => setShowGlobalRank(false)} />
      )}

      {tradeAcceptedModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4" onClick={() => setTradeAcceptedModal(false)}>
          <div className="bg-bg-primary border border-text-primary/20 rounded-2xl p-6 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-3xl mb-3">&#9989;</div>
            <h3 className="font-display text-xl text-text-primary mb-2">Trade Accepted</h3>
            <p className="text-sm text-text-primary leading-relaxed mb-4">
              This trade will be reviewed by the commissioner of this league. Upon approval, the trade will be processed.
            </p>
            <button
              onClick={() => setTradeAcceptedModal(false)}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {showCounterTrade && (
        <ProposeTradeModal
          league={league}
          currentUserId={profile?.id}
          initialReceiverId={showCounterTrade.proposer_user_id}
          counteringTradeId={showCounterTrade.id}
          onClose={() => setShowCounterTrade(null)}
        />
      )}

      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <h3 className="text-base font-semibold text-text-primary">Starting Lineup</h3>
          {/* Column label for the season-total stat line that PlayerRow
              renders on desktop. Hidden in edit mode (stat line is also
              hidden when editMode is true). Sits to the left of the
              Edit button so it visually anchors above where the stats
              column begins in each row. */}
          {!editMode && (
            <span className="hidden md:inline-block text-xs uppercase tracking-wider text-text-muted ml-auto mr-auto">Season Total</span>
          )}
          {(isCurrentWeek || isFutureWeek) && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="text-xs font-semibold text-accent hover:text-accent-hover transition-colors px-3 py-1 rounded-lg border border-accent/30 hover:border-accent ml-auto md:ml-0"
            >
              Edit
            </button>
          )}
          {editMode && (
            <span className="text-[10px] text-text-muted ml-3">Tap a slot or player to swap</span>
          )}
        </div>
        <div className="p-3 space-y-2">
          {STARTER_SLOTS.map((slotDef) => {
            const occupant = playersBySlot[slotDef.key]?.[0]
            const isSlotSelected = selected?.type === 'slot' && selected.key === slotDef.key
            return (
              <div key={slotDef.key} className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-text-muted w-8 shrink-0">{slotDef.label}</span>
                <div className="flex-1">
                  {occupant ? (() => {
                    // Highlight occupied starter rows as drop targets when a
                    // position-compatible bench (or IR) player is selected so
                    // the user sees which slots a bench player can swap into.
                    const isOccupantSelected = editMode && selected?.type === 'player' && selected.key === occupant.player_id
                    const selPlayer = !isOccupantSelected && selected?.type === 'player'
                      ? roster.find((r) => r.player_id === selected.key) : null
                    const selPlayerIsBench = selPlayer && slotByPlayer[selPlayer.player_id] !== slotDef.key &&
                      slotByPlayer[selPlayer.player_id] !== 'ir' === false ? false : true
                    // Simpler: a non-self position-compatible player counts as a
                    // potential swap target regardless of where they're coming
                    // from — bench-to-starter, starter-to-starter (cross-slot),
                    // or IR-to-starter. The position eligibility check carries
                    // the meaning.
                    const isDropTarget = editMode && !!selPlayer &&
                      isPositionEligibleForSlot(selPlayer?.nfl_players?.position, slotDef.positions)
                    return (
                      <PlayerRow
                        row={occupant}
                        isSelected={isOccupantSelected}
                        isDropTarget={isDropTarget}
                        onTap={() => handlePlayerTap(occupant.player_id)}
                        onViewDetail={openPlayerDetail}
                        editMode={editMode}
                        blurbIds={blurbIds}
                        showSeasonStats={isCurrentWeek || isFutureWeek}
                      />
                    )
                  })() : (
                    editMode ? (
                      (() => {
                        // Highlight as drop target when a position-compatible
                        // bench player is currently selected — gives the user
                        // a clear "tap here to start" affordance.
                        const selPlayer = selected?.type === 'player'
                          ? roster.find((r) => r.player_id === selected.key) : null
                        const isDropTarget = !!selPlayer && isPositionEligibleForSlot(selPlayer?.nfl_players?.position, slotDef.positions)
                        return <EmptySlot slotLabel={slotDef.label} isSelected={isSlotSelected} onTap={() => handleSlotTap(slotDef.key)} editMode isDropTarget={isDropTarget} />
                      })()
                    ) : <EmptySlot slotLabel={slotDef.label} onTap={() => {}} isSelected={false} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-baseline gap-3">
          <h3 className="text-base font-semibold text-text-primary">Bench</h3>
          {!editMode && (
            <span className="hidden md:inline-block text-xs uppercase tracking-wider text-text-muted ml-auto mr-auto">Season Total</span>
          )}
          <span className="text-xs text-text-muted font-mono ml-auto md:ml-0">{benchPlayers.length}/{benchSlots}</span>
        </div>
        <div className="p-3 space-y-2">
          {(() => {
            // When a STARTER is selected, compute the eligible positions for
            // that starter's slot so bench players who could fill it light up
            // as swap targets. Mirrors the existing starter-side affordance.
            let benchDropPositions = null
            if (editMode && selected?.type === 'player') {
              const selPlayer = roster.find((r) => r.player_id === selected.key)
              const selSlot = selPlayer ? slotByPlayer[selPlayer.player_id] : null
              if (selSlot && selSlot !== 'bench' && selSlot !== 'ir') {
                const slotDef = STARTER_SLOTS.find((s) => s.key === selSlot)
                if (slotDef) benchDropPositions = slotDef.positions
              }
            }
            return benchPlayers.map((r) => {
              const isRowSelected = editMode && selected?.type === 'player' && selected.key === r.player_id
              const isDropTarget = !isRowSelected && benchDropPositions != null &&
                benchDropPositions.includes(r?.nfl_players?.position)
              return (
                <PlayerRow
                  key={r.id}
                  row={r}
                  isSelected={isRowSelected}
                  isDropTarget={isDropTarget}
                  onTap={() => handlePlayerTap(r.player_id)}
                  onViewDetail={openPlayerDetail}
                  onMoveToIR={handleMoveToIR}
                  editMode={editMode}
                  blurbIds={blurbIds}
                  showSeasonStats={isCurrentWeek || isFutureWeek}
                />
              )
            })
          })()}
          {Array.from({ length: emptyBenchCount }, (_, i) => (
            <EmptySlot
              key={`bench-empty-${i}`}
              slotLabel="BN"
              onTap={editMode ? () => handleSlotTap('bench') : () => {}}
              isSelected={editMode && selected?.type === 'slot' && selected.key === 'bench'}
              editMode={editMode}
              // Intentionally not setting isDropTarget — empty bench slots
              // sit there as fallback drop targets but don't need to glow
              // when a starter is selected. The typical flow is bench⇄
              // starter swap; benching-without-replacement is the
              // edge case.
            />
          ))}
          {editMode && emptyBenchCount === 0 && selected?.type === 'player' && (() => {
            // Transient "bench without filling" slot: when the bench is full
            // and the user has a starter selected, show a virtual empty bench
            // row so they can bench the starter without filling the starter
            // slot. Total roster size is preserved — the starter's slot just
            // becomes empty until another bench player is moved up.
            const selPlayer = roster.find((r) => r.player_id === selected.key)
            const currentSlot = selPlayer ? slotByPlayer[selPlayer.player_id] : null
            const isStarter = !!selPlayer && currentSlot && currentSlot !== 'bench' && currentSlot !== 'ir'
            if (!isStarter) return null
            return (
              <EmptySlot
                key="bench-empty-transient"
                slotLabel="BN"
                onTap={() => handleSlotTap('bench')}
                isSelected={false}
                editMode
                isDropTarget
              />
            )
          })()}
        </div>
      </div>

      {irSlotCount > 0 && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-base font-semibold text-text-primary">IR</h3>
          </div>
          <div className="p-3 space-y-2">
            {irPlayers.map((r) => (
              <PlayerRow
                key={r.id}
                row={r}
                isSelected={editMode && selected?.type === 'player' && selected.key === r.player_id}
                onTap={() => handlePlayerTap(r.player_id)}
                onViewDetail={openPlayerDetail}
                onMoveOutOfIR={handleMoveOutOfIR}
                editMode={editMode}
                blurbIds={blurbIds}
                showSeasonStats={isCurrentWeek || isFutureWeek}
              />
            ))}
            {Array.from({ length: emptyIrCount }).map((_, i) => (
              <div key={`ir-empty-${i}`} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-text-primary/10 bg-bg-primary/40">
                <div className="w-9 h-9 rounded-full bg-bg-secondary/40 shrink-0" />
                <div className="flex-1 text-xs text-text-muted italic">Empty — move an Out or IR player here from your bench</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editMode && (isCurrentWeek || isFutureWeek) && (
        // Mobile: fixed above the BottomTabBar (h-14 + safe-area). sticky
        // bottom-0 silently fails inside this layout — an ancestor overflow
        // ate the stickiness, so the button rendered at the natural bottom
        // of the content and the user had to scroll to reach it. Desktop
        // keeps sticky-bottom-4 inside the page layout.
        <div className="fixed bottom-14 left-0 right-0 z-40 flex gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-bg-primary/90 backdrop-blur-xl border-t border-text-primary/15 md:sticky md:left-auto md:right-auto md:bottom-4 md:px-2 md:pt-0 md:pb-0 md:border-0 md:bg-transparent md:backdrop-blur-none">
          <button
            type="button"
            onClick={() => { handleReset(); setSelected(null); setEditMode(false) }}
            className="flex-1 py-3 rounded-xl text-sm font-semibold bg-bg-card text-text-secondary border border-border hover:bg-bg-card-hover transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => { await handleSave(); setSelected(null); setEditMode(false) }}
            disabled={(isFutureWeek ? setWeeklyLineup.isPending : setLineup.isPending) || !isDirty}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${isDirty ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-text-muted/30 text-text-muted'}`}
          >
            {(isFutureWeek ? setWeeklyLineup.isPending : setLineup.isPending) ? 'Saving…' : 'Save Lineup'}
          </button>
        </div>
      )}

      {detailPlayerId && (
        <PlayerDetailModal
          leagueId={league.id}
          playerId={detailPlayerId}
          onClose={() => setDetailPlayerId(null)}
          playerContext="my_roster"
          onDrop={(pid) => {
            const row = roster?.find((r) => r.player_id === pid)
            if (row) { setDetailPlayerId(null); setConfirmDrop(row) }
          }}
        />
      )}

      {confirmDrop && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-4" onClick={() => setConfirmDrop(null)}>
          <div className="bg-bg-secondary w-full max-w-md rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg mb-2">Drop {confirmDrop.nfl_players?.full_name}?</h3>
            <p className="text-sm text-text-secondary mb-4">
              Are you sure?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDrop(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-bg-card text-text-secondary border border-border hover:bg-bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await dropPlayer.mutateAsync(confirmDrop.player_id)
                    toast(`${confirmDrop.nfl_players?.full_name || 'Player'} dropped`, 'success')
                    setConfirmDrop(null)
                  } catch (err) {
                    toast(err.message || 'Failed to drop', 'error')
                  }
                }}
                disabled={dropPlayer.isPending}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-incorrect text-white hover:bg-incorrect/80 transition-colors disabled:opacity-50"
              >
                {dropPlayer.isPending ? 'Dropping…' : 'Drop'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
