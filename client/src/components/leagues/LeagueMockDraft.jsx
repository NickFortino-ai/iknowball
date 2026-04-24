import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import LoadingSpinner from '../ui/LoadingSpinner'
import DraftPlayerPreview from './DraftPlayerPreview'

// ── Position colors ──────────────────────────────────────────────────
const POS_BG = {
  QB: 'bg-red-500/25 text-red-200 border-red-500/40',
  RB: 'bg-green-500/25 text-green-200 border-green-500/40',
  WR: 'bg-yellow-500/25 text-yellow-200 border-yellow-500/40',
  TE: 'bg-blue-500/25 text-blue-200 border-blue-500/40',
  K: 'bg-gray-500/25 text-gray-200 border-gray-500/40',
  DEF: 'bg-purple-500/25 text-purple-200 border-purple-500/40',
}

// ── Bot logic (mirrored from MockDraftPage) ──────────────────────────

const PERSONALITIES = ['Best Available', 'Zero RB', 'RB Heavy', 'Early QB', 'Reacher']

function adpScore(p, ctx = {}) {
  const scoring = ctx.scoring || 'half_ppr'
  let raw
  if (scoring === 'ppr') raw = p.adp_ppr ?? p.adp_half_ppr ?? p.search_rank
  else if (scoring === 'standard') raw = p.search_rank ?? p.adp_half_ppr ?? p.adp_ppr
  else raw = p.adp_half_ppr ?? p.adp_ppr ?? p.search_rank
  raw = raw ?? 9999
  if (p.position === 'QB' && (ctx.superflex || ctx.qbCount >= 2)) raw -= 30
  // In 1QB leagues, push QBs down to realistic ADP range when using search_rank fallback
  if (p.position === 'QB' && !ctx.superflex && (ctx.qbCount || 1) < 2 && !p.adp_ppr && !p.adp_half_ppr) raw += 40
  return raw
}

function adpCompare(a, b, scoringKey, ctx) {
  const diff = adpScore(a, ctx) - adpScore(b, ctx)
  if (diff !== 0) return diff
  return (b[scoringKey] || 0) - (a[scoringKey] || 0)
}

function maxByPos(rosterSlots) {
  const flex = rosterSlots.flex || 0
  return {
    QB: (rosterSlots.qb || 0) + 1 + (rosterSlots.superflex || 0),
    RB: (rosterSlots.rb || 0) + flex + 2,
    WR: (rosterSlots.wr || 0) + flex + 2,
    TE: (rosterSlots.te || 0) + flex + 1,
    K: (rosterSlots.k || 0),
    DEF: (rosterSlots.def || 0),
  }
}

function eligiblePool(available, botRoster, rosterSlots, round) {
  const max = maxByPos(rosterSlots)
  const have = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
  for (const p of botRoster) have[p.position] = (have[p.position] || 0) + 1
  return available.filter((p) => {
    if (have[p.position] >= max[p.position]) return false
    if ((p.position === 'K' || p.position === 'DEF') && round < 11) return false
    return true
  })
}

function weightedTopPick(candidates, n = 5) {
  const top = candidates.slice(0, n)
  if (!top.length) return null
  const weights = top.map((_, i) => n - i)
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < top.length; i++) {
    r -= weights[i]
    if (r <= 0) return top[i]
  }
  return top[0]
}

function pickBestAvailable(ctx) {
  const pool = eligiblePool(ctx.available, ctx.botRoster, ctx.rosterSlots, ctx.round)
  pool.sort((a, b) => adpCompare(a, b, ctx.scoringKey, ctx.adpCtx))
  return weightedTopPick(pool, 5)
}
function pickZeroRB(ctx) {
  let pool = eligiblePool(ctx.available, ctx.botRoster, ctx.rosterSlots, ctx.round)
  if (ctx.round <= 4) pool = pool.filter((p) => p.position !== 'RB')
  pool.sort((a, b) => adpCompare(a, b, ctx.scoringKey, ctx.adpCtx))
  return weightedTopPick(pool, 5) || pickBestAvailable(ctx)
}
function pickRBHeavy(ctx) {
  let pool = eligiblePool(ctx.available, ctx.botRoster, ctx.rosterSlots, ctx.round)
  if (ctx.round <= 3) {
    const rbs = pool.filter((p) => p.position === 'RB')
    if (rbs.length) { rbs.sort((a, b) => adpCompare(a, b, ctx.scoringKey, ctx.adpCtx)); return weightedTopPick(rbs, 4) }
  }
  pool.sort((a, b) => adpCompare(a, b, ctx.scoringKey, ctx.adpCtx))
  return weightedTopPick(pool, 5)
}
function pickEarlyQB(ctx) {
  const pool = eligiblePool(ctx.available, ctx.botRoster, ctx.rosterSlots, ctx.round)
  const hasQB = ctx.botRoster.some((p) => p.position === 'QB')
  if (!hasQB && ctx.round >= 4 && ctx.round <= 6) {
    const qbs = pool.filter((p) => p.position === 'QB')
    if (qbs.length) { qbs.sort((a, b) => adpCompare(a, b, ctx.scoringKey, ctx.adpCtx)); return weightedTopPick(qbs, 3) }
  }
  pool.sort((a, b) => adpCompare(a, b, ctx.scoringKey, ctx.adpCtx))
  return weightedTopPick(pool, 5)
}
function pickReacher(ctx) {
  const pool = eligiblePool(ctx.available, ctx.botRoster, ctx.rosterSlots, ctx.round)
  pool.sort((a, b) => adpCompare(a, b, ctx.scoringKey, ctx.adpCtx))
  if (Math.random() < 0.3 && pool.length > 12) return pool[5 + Math.floor(Math.random() * 7)]
  return weightedTopPick(pool, 5)
}

const PERSONALITY_FNS = { 'Best Available': pickBestAvailable, 'Zero RB': pickZeroRB, 'RB Heavy': pickRBHeavy, 'Early QB': pickEarlyQB, 'Reacher': pickReacher }

const ADJ = ['Crushing','Roaring','Lethal','Iron','Savage','Rampaging','Electric','Frozen','Shadow','Thunder','Phantom','Rogue','Wild','Brutal','Vicious','Mighty','Stormy','Fearless','Cosmic','Blazing']
const NOUN = ['Dynasty','Goliaths','Titans','Reckoning','Empire','Legion','Outlaws','Kings','Wrecking Crew','Bandits','Maulers','Renegades','Wolves','Mavericks','Rebels','Sharks','Hammers','Vipers','Bulldogs']
function randomTeamName() { return `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}` }

function snakeOrder(numTeams, totalRounds) {
  const order = []
  for (let r = 0; r < totalRounds; r++) {
    const reverse = r % 2 === 1
    for (let i = 0; i < numTeams; i++) {
      const slot = reverse ? numTeams - 1 - i : i
      order.push({ round: r + 1, pickInRound: i + 1, teamSlot: slot, overall: order.length + 1 })
    }
  }
  return order
}

const SCORING_KEY_MAP = { ppr: 'projected_pts_ppr', half_ppr: 'projected_pts_half_ppr', standard: 'projected_pts_std' }

const FLEX_ELIGIBLE = ['RB', 'WR', 'TE']
function buildSlotPlan(rosterSlots, players) {
  const remaining = [...players]
  function take(pos) { const idx = remaining.findIndex((p) => p.position === pos); return idx >= 0 ? remaining.splice(idx, 1)[0] : null }
  function takeAny(positions) { const idx = remaining.findIndex((p) => positions.includes(p.position)); return idx >= 0 ? remaining.splice(idx, 1)[0] : null }
  const slots = []
  const order = ['qb', 'rb', 'wr', 'te', 'flex', 'superflex', 'k', 'def']
  const labels = { qb: 'QB', rb: 'RB', wr: 'WR', te: 'TE', flex: 'FLEX', superflex: 'SUPER FLEX', k: 'K', def: 'D/ST' }
  for (const key of order) {
    for (let i = 0; i < (rosterSlots[key] || 0); i++) {
      let player = key === 'flex' ? takeAny(FLEX_ELIGIBLE) : key === 'superflex' ? takeAny(['QB', ...FLEX_ELIGIBLE]) : take(key.toUpperCase())
      slots.push({ slot: key, label: labels[key] || key.toUpperCase(), player })
    }
  }
  const bench = remaining
  const benchCount = rosterSlots.bench || 0
  return { slots, bench, filled: slots.filter((s) => s.player).length + bench.length, totalStarters: slots.length, totalRoster: slots.length + benchCount, benchCount }
}

// ── Component ────────────────────────────────────────────────────────

const MAX_RECENT = 5
function recentKey(leagueId) { return `leagueMockHistory_${leagueId}` }
function savedKey(leagueId) { return `leagueMockSaved_${leagueId}` }
function loadRecent(leagueId) {
  try { return JSON.parse(localStorage.getItem(recentKey(leagueId)) || '[]') } catch { return [] }
}
function saveRecent(leagueId, list) {
  localStorage.setItem(recentKey(leagueId), JSON.stringify(list.slice(0, MAX_RECENT)))
}
function loadSaved(leagueId) {
  try { return JSON.parse(localStorage.getItem(savedKey(leagueId)) || '[]') } catch { return [] }
}
function persistSaved(leagueId, list) {
  localStorage.setItem(savedKey(leagueId), JSON.stringify(list))
}

export default function LeagueMockDraft({ league, fantasySettings }) {
  const { profile } = useAuth()
  const [started, setStarted] = useState(false)
  const [picks, setPicks] = useState([])
  const [reviewMock, setReviewMock] = useState(null)
  const [recentMocks, setRecentMocks] = useState(() => loadRecent(league.id))
  const [savedMocks, setSavedMocks] = useState(() => loadSaved(league.id))
  const [justBookmarked, setJustBookmarked] = useState(false)

  function bookmarkMock(mock) {
    const alreadySaved = savedMocks.some((m) => m.id === mock.id)
    if (alreadySaved) return
    const next = [mock, ...savedMocks]
    persistSaved(league.id, next)
    setSavedMocks(next)
    // Remove from recent
    const nextRecent = recentMocks.filter((m) => m.id !== mock.id)
    saveRecent(league.id, nextRecent)
    setRecentMocks(nextRecent)
    setJustBookmarked(true)
  }
  const [activeTab, setActiveTab] = useState('Players')
  const [posFilter, setPosFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [detailPlayer, setDetailPlayer] = useState(null)

  const { data: allPlayers, isLoading } = useQuery({
    queryKey: ['mock-draft', 'players'],
    queryFn: () => api.get('/mock-draft/players'),
    staleTime: 5 * 60 * 1000,
  })

  // Build config from league settings
  const config = useMemo(() => {
    if (!fantasySettings) return null
    const rosterSlots = fantasySettings.roster_slots || { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, k: 1, def: 1, bench: 6 }
    const numTeams = fantasySettings.num_teams || 10
    const totalSlots = Object.entries(rosterSlots).reduce((a, [k, v]) => a + (k === 'ir' ? 0 : v), 0)

    // Draft position: use actual position if draft order is set, random otherwise
    let userSlot
    if (fantasySettings.draft_order?.length && profile?.id) {
      const idx = fantasySettings.draft_order.indexOf(profile.id)
      userSlot = idx >= 0 ? idx : Math.floor(Math.random() * numTeams)
    } else {
      userSlot = Math.floor(Math.random() * numTeams)
    }

    return {
      numTeams,
      userSlot,
      scoring: fantasySettings.scoring_format || 'half_ppr',
      rounds: totalSlots,
      rosterSlots,
    }
  }, [fantasySettings, profile?.id])

  const personalities = useMemo(() => {
    if (!config) return []
    const arr = []
    for (let i = 0; i < config.numTeams; i++) {
      arr.push(i === config.userSlot ? 'You' : PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)])
    }
    return arr
  }, [started]) // regenerate on each new mock

  const teamNames = useMemo(() => {
    if (!config) return []
    const used = new Set()
    return Array.from({ length: config.numTeams }, (_, i) => {
      if (i === config.userSlot) return 'Your Team'
      let name; let attempts = 0
      do { name = randomTeamName(); attempts++ } while (used.has(name) && attempts < 20)
      used.add(name)
      return name
    })
  }, [started])

  const order = useMemo(() => config ? snakeOrder(config.numTeams, config.rounds) : [], [config])
  const scoringKey = config ? SCORING_KEY_MAP[config.scoring] : 'projected_pts_half_ppr'
  const draftedIds = useMemo(() => new Set(picks.map((p) => p.player.id)), [picks])
  const available = useMemo(() => (allPlayers || []).filter((p) => !draftedIds.has(p.id)), [allPlayers, draftedIds])

  const currentPickIdx = picks.length
  const currentPick = order[currentPickIdx]
  const isComplete = currentPickIdx >= order.length
  const isUserTurn = !isComplete && currentPick?.teamSlot === config?.userSlot

  // Auto-pick bots
  useEffect(() => {
    if (!started || isComplete || !allPlayers?.length || !config) return
    if (currentPick.teamSlot === config.userSlot) return
    const t = setTimeout(() => {
      const botSlot = currentPick.teamSlot
      const botRoster = picks.filter((p) => p.teamSlot === botSlot).map((p) => p.player)
      const fn = PERSONALITY_FNS[personalities[botSlot]] || pickBestAvailable
      const adpCtx = { scoring: config.scoring, superflex: (config.rosterSlots?.superflex || 0) > 0, qbCount: config.rosterSlots?.qb || 1 }
      const player = fn({ round: currentPick.round, available, botRoster, rosterSlots: config.rosterSlots, scoringKey, adpCtx })
      if (!player) return
      setPicks((p) => [...p, { overall: currentPick.overall, round: currentPick.round, pickInRound: currentPick.pickInRound, teamSlot: botSlot, player, personality: personalities[botSlot] }])
    }, 220)
    return () => clearTimeout(t)
  }, [currentPickIdx, isComplete, allPlayers, started])

  // Save mock when complete
  const savedRef = useRef(false)
  useEffect(() => {
    if (isComplete && picks.length > 0 && !savedRef.current) {
      savedRef.current = true
      handleComplete()
    }
  }, [isComplete])

  function handleUserPick(player) {
    if (!isUserTurn) return
    setPicks((p) => [...p, { overall: currentPick.overall, round: currentPick.round, pickInRound: currentPick.pickInRound, teamSlot: config.userSlot, player, personality: 'You' }])
    setSearchQuery('')
  }

  function handleComplete() {
    const myPicks = picks.filter((p) => p.teamSlot === config.userSlot).map((p) => ({
      id: p.player.id, name: p.player.full_name, position: p.player.position, team: p.player.team, headshot: p.player.headshot_url,
    }))
    const mock = {
      id: `mock_${Date.now()}`,
      completedAt: new Date().toISOString(),
      draftPosition: config.userSlot + 1,
      roster: myPicks,
      config,
    }
    const updated = [mock, ...recentMocks].slice(0, MAX_RECENT)
    saveRecent(league.id, updated)
    setRecentMocks(updated)
    setReviewMock(mock)
  }

  function handleRestart() {
    setPicks([])
    setStarted(false)
    setReviewMock(null)
    savedRef.current = false
  }

  function handleDeleteMock(mockId) {
    const updated = recentMocks.filter((m) => m.id !== mockId)
    saveRecent(league.id, updated)
    setRecentMocks(updated)
    if (reviewMock?.id === mockId) setReviewMock(null)
  }

  if (!config) return null

  // Review a completed mock
  if (reviewMock) {
    const slotPlan = buildSlotPlan(config.rosterSlots, reviewMock.roster)
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-correct/40 bg-correct/10 p-4 text-center">
          <div className="font-display text-lg text-correct mb-1">Mock Draft Complete</div>
          <div className="text-xs text-text-muted">
            Draft position #{reviewMock.draftPosition} · {new Date(reviewMock.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
        </div>
        <RosterView slotPlan={slotPlan} />
        <div className="flex gap-2">
          {!justBookmarked && !savedMocks.some((m) => m.id === reviewMock.id) ? (
            <button onClick={() => bookmarkMock(reviewMock)} className="flex-1 py-3 rounded-xl border border-accent text-accent font-semibold text-sm hover:bg-accent/10 transition-colors">
              Save Mock
            </button>
          ) : (
            <span className="flex-1 py-3 rounded-xl text-correct font-semibold text-sm text-center">Saved</span>
          )}
          <button onClick={handleRestart} className="flex-1 py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent-hover transition-colors">
            New Mock
          </button>
        </div>
      </div>
    )
  }

  // Pre-start screen
  if (!started) {
    const hasOrder = fantasySettings?.draft_order?.length > 0
    const scoringLabel = config.scoring === 'ppr' ? 'PPR' : config.scoring === 'half_ppr' ? 'Half-PPR' : 'Standard'

    return (
      <div className="max-w-xl mx-auto py-6 md:py-8 space-y-6">
        <div className="text-center">
          <h3 className="font-display text-2xl md:text-3xl text-text-primary mb-2">Mock Draft</h3>
          <p className="text-sm text-text-primary">Practice drafting with your league's exact settings before the real thing.</p>
        </div>

        {/* League settings summary */}
        <div className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm p-4">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">League Settings</div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="font-display text-2xl text-white">{config.numTeams}</div>
              <div className="text-[10px] text-text-muted uppercase mt-0.5">Teams</div>
            </div>
            <div>
              <div className="font-display text-2xl text-white">{config.rounds}</div>
              <div className="text-[10px] text-text-muted uppercase mt-0.5">Rounds</div>
            </div>
            <div>
              <div className="font-display text-2xl text-white">{scoringLabel}</div>
              <div className="text-[10px] text-text-muted uppercase mt-0.5">Scoring</div>
            </div>
          </div>
          {hasOrder && (
            <div className="mt-3 pt-3 border-t border-text-primary/10 text-center text-sm text-accent font-semibold">
              Your draft position: #{config.userSlot + 1}
            </div>
          )}
          {!hasOrder && (
            <div className="mt-3 pt-3 border-t border-text-primary/10 text-center text-xs text-text-muted">
              Draft position will be randomized (draft order not set yet)
            </div>
          )}
        </div>

        <button
          onClick={() => setStarted(true)}
          className="w-full py-3 rounded-xl font-display text-base bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Start Mock Draft
        </button>

        {/* Saved mocks */}
        {savedMocks.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Saved Mocks</div>
            <div className="space-y-2">
              {savedMocks.map((mock) => (
                <div key={mock.id} className="rounded-xl border border-accent/30 bg-bg-primary/60 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
                  <button onClick={() => { setReviewMock(mock); setJustBookmarked(true) }} className="flex-1 text-left min-w-0">
                    <div className="text-sm font-semibold text-text-primary">
                      Pick #{mock.draftPosition}
                    </div>
                    <div className="text-xs text-text-muted">
                      {new Date(mock.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      {' · '}{mock.roster?.length || 0} players
                    </div>
                  </button>
                  <button
                    onClick={() => { const next = savedMocks.filter((m) => m.id !== mock.id); persistSaved(league.id, next); setSavedMocks(next) }}
                    className="text-text-muted hover:text-incorrect text-lg ml-3 shrink-0"
                  >&times;</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent mocks */}
        {recentMocks.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Recent Mocks</div>
            <div className="space-y-2">
              {recentMocks.map((mock) => (
                <div key={mock.id} className="rounded-xl border border-text-primary/20 bg-bg-primary/60 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
                  <button onClick={() => { setReviewMock(mock); setJustBookmarked(false) }} className="flex-1 text-left min-w-0">
                    <div className="text-sm font-semibold text-text-primary">
                      Pick #{mock.draftPosition}
                    </div>
                    <div className="text-xs text-text-muted">
                      {new Date(mock.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      {' · '}{mock.roster?.length || 0} players
                    </div>
                  </button>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <button
                      onClick={() => bookmarkMock(mock)}
                      className="text-text-muted hover:text-accent text-sm"
                      title="Save mock"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteMock(mock.id)}
                      className="text-text-muted hover:text-incorrect text-lg"
                    >&times;</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (isLoading) return <LoadingSpinner />
  if (!allPlayers?.length) return <div className="text-center text-text-muted py-12">Couldn't load players.</div>

  // Completed
  // isComplete is handled by the effect that calls handleComplete → sets reviewMock
  if (isComplete && reviewMock) return null // will render review screen above

  // Active drafting
  const adpCtx = { scoring: config.scoring, superflex: (config.rosterSlots?.superflex || 0) > 0, qbCount: config.rosterSlots?.qb || 1 }
  const rankedAll = [...(allPlayers || [])].sort((a, b) => adpScore(a, adpCtx) - adpScore(b, adpCtx)).map((p, i) => ({ ...p, overall_rank: i + 1 }))
  const filtered = rankedAll.filter((p) => !draftedIds.has(p.id)).filter((p) => posFilter === 'All' || p.position === posFilter).filter((p) => !searchQuery || p.full_name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 60)
  const myPicks = picks.filter((p) => p.teamSlot === config.userSlot).map((p) => ({ id: p.player.id, name: p.player.full_name, position: p.player.position, team: p.player.team, headshot: p.player.headshot_url }))
  const slotPlan = buildSlotPlan(config.rosterSlots, myPicks)

  return (
    <div className="space-y-3">
      {/* Pick banner */}
      <div className="sticky top-0 z-20 -mx-2 px-2 pt-1">
        <div className={`rounded-xl px-4 py-2.5 flex items-center justify-center gap-3 bg-bg-primary border ${isUserTurn ? 'border-accent' : 'border-text-primary/20'}`}>
          <div className="font-display text-base md:text-lg text-white">R{currentPick?.round} · PICK {currentPick?.overall}</div>
          <div className="font-display text-sm md:text-base text-text-secondary">
            {isUserTurn ? "You're on the clock!" : `${teamNames[currentPick?.teamSlot]} picking...`}
          </div>
        </div>
      </div>

      {detailPlayer && (
        <DraftPlayerPreview
          playerId={detailPlayer.id}
          mockScoring={config.scoring}
          onClose={() => setDetailPlayer(null)}
          onDraft={isUserTurn ? () => { handleUserPick(detailPlayer); setDetailPlayer(null) } : null}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-text-primary/10">
        {['Players', 'My Roster', 'Board', 'Log'].map((t) => {
          const badge = t === 'My Roster' ? `${slotPlan.filled}/${slotPlan.totalRoster}` : null
          return (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${activeTab === t ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-primary'}`}
            >{t}{badge ? ` (${badge})` : ''}</button>
          )
        })}
      </div>

      {activeTab === 'Players' && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="p-3 border-b border-text-primary/10">
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search players..."
              className="w-full bg-bg-secondary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent" />
            <div className="flex gap-1 mt-2 overflow-x-auto">
              {['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((pos) => (
                <button key={pos} onClick={() => setPosFilter(pos)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${posFilter === pos ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary'}`}
                >{pos}</button>
              ))}
            </div>
          </div>
          <div className="max-h-[55vh] md:max-h-[60vh] overflow-y-auto">
            {filtered.map((player) => (
              <div key={player.id} className="w-full flex items-center gap-3 px-3 py-3 md:py-2 border-b border-text-primary/10 last:border-0">
                <span className="w-8 text-center text-xs font-bold text-text-muted shrink-0">{player.overall_rank || '—'}</span>
                <button onClick={() => setDetailPlayer(player)} className="flex-1 flex items-center gap-3 text-left cursor-pointer">
                  {player.headshot_url && <img src={player.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.visibility = 'hidden' }} />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{player.full_name}</div>
                    <div className="text-xs text-text-muted">{player.position} · {player.team || 'FA'}{player.bye_week ? ` · Bye ${player.bye_week}` : ''}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {player[scoringKey] != null && <div className="text-sm font-display text-accent">{Number(player[scoringKey]).toFixed(1)}</div>}
                    <div className="text-[10px] text-text-muted">proj</div>
                  </div>
                </button>
                {isUserTurn && (
                  <button onClick={() => handleUserPick(player)} className="shrink-0 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-accent text-white hover:bg-accent-hover active:scale-95 transition">Draft</button>
                )}
              </div>
            ))}
            {filtered.length === 0 && <div className="text-center text-sm text-text-muted py-8">No players found</div>}
          </div>
        </div>
      )}

      {activeTab === 'My Roster' && <RosterView slotPlan={slotPlan} />}

      {activeTab === 'Board' && (
        <div className="rounded-xl border border-text-primary/20 p-2 overflow-auto">
          <MockBoard picks={picks} numTeams={config.numTeams} userSlot={config.userSlot} teamNames={teamNames} rounds={config.rounds} />
        </div>
      )}

      {activeTab === 'Log' && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden max-h-[60vh] overflow-y-auto">
          {[...picks].reverse().map((p) => (
            <div key={p.overall} className={`flex items-center gap-3 px-3 py-2 border-b border-text-primary/10 last:border-0 ${p.teamSlot === config.userSlot ? 'bg-accent/5' : ''}`}>
              <span className="text-xs text-text-muted w-10 shrink-0">{p.round}.{p.pickInRound}</span>
              {p.player.headshot_url && <img src={p.player.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{p.player.full_name}</div>
                <div className="text-xs text-text-muted">{p.player.position} · {p.player.team} — {teamNames[p.teamSlot]}</div>
              </div>
            </div>
          ))}
          {picks.length === 0 && <div className="text-center text-sm text-text-muted py-8">Waiting for first pick...</div>}
        </div>
      )}
    </div>
  )
}

function RosterView({ slotPlan }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="p-3 border-b border-border"><h3 className="text-sm font-semibold text-text-primary">Starting Lineup</h3></div>
        <div className="divide-y divide-border">
          {slotPlan.slots.map((s, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted w-12 shrink-0">{s.label}</span>
              {s.player ? (
                <>
                  {s.player.headshot && <img src={s.player.headshot} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-card shrink-0" onError={(e) => { e.target.style.display = 'none' }} />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{s.player.name}</div>
                    <div className="text-[10px] text-text-muted">{s.player.position} · {s.player.team || 'FA'}</div>
                  </div>
                </>
              ) : <span className="text-xs text-text-muted italic">empty</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Bench</h3>
          <span className="text-[10px] text-text-muted">{slotPlan.bench.length} / {slotPlan.benchCount}</span>
        </div>
        <div className="divide-y divide-border">
          {slotPlan.bench.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted w-12 shrink-0">BN</span>
              {p.headshot && <img src={p.headshot} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-card shrink-0" onError={(e) => { e.target.style.display = 'none' }} />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary truncate">{p.name}</div>
                <div className="text-[10px] text-text-muted">{p.position} · {p.team || 'FA'}</div>
              </div>
            </div>
          ))}
          {Array.from({ length: Math.max(0, slotPlan.benchCount - slotPlan.bench.length) }).map((_, i) => (
            <div key={`e-${i}`} className="flex items-center gap-3 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted w-12 shrink-0">BN</span>
              <span className="text-xs text-text-muted italic">empty</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MockBoard({ picks, numTeams, userSlot, teamNames, rounds }) {
  const grid = []
  for (let r = 0; r < rounds; r++) {
    const row = []
    const isReverse = r % 2 === 1
    for (let c = 0; c < numTeams; c++) {
      const colIdx = isReverse ? numTeams - 1 - c : c
      const overall = r * numTeams + colIdx + 1
      const pick = picks.find((p) => p.overall === overall)
      row.push(pick || null)
    }
    grid.push(row)
  }

  return (
    <div className="overflow-auto max-h-[70vh]">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-1 py-2 text-text-muted font-semibold text-center w-10 border border-border bg-bg-secondary sticky left-0 z-10">Rd</th>
            {Array.from({ length: numTeams }, (_, i) => (
              <th key={i} className={`px-2 py-2 font-semibold text-center border border-border min-w-[120px] ${i === userSlot ? 'text-accent' : 'text-text-secondary'}`}>
                <div className="text-text-muted text-[10px]">{i + 1}</div>
                <div className="truncate">{teamNames[i]}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, roundIdx) => (
            <tr key={roundIdx}>
              <td className="px-1 py-1 text-center text-text-muted font-semibold border border-border bg-bg-secondary sticky left-0 z-10">
                {roundIdx + 1}
              </td>
              {row.map((pick, colIdx) => {
                const posCls = pick?.player?.position ? POS_BG[pick.player.position] || '' : ''
                return (
                <td key={colIdx} className={`px-2 py-2 border border-text-primary/15 min-w-[120px] ${posCls}`}>
                  {pick?.player ? (
                    <div className="min-w-0">
                      <div className="font-semibold truncate text-[11px]">{pick.player.full_name}</div>
                      <div className="text-[10px] opacity-70 truncate">{pick.player.position} {pick.player.team}</div>
                    </div>
                  ) : (
                    <div className="text-text-muted text-center">{'\u2014'}</div>
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
