import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { toast } from '../components/ui/Toast'
import DraftPlayerDetailModal from '../components/leagues/DraftPlayerDetailModal'

// ────────────────────────────────────────────────────────────────────
// Bot personalities
// Each takes (state, ctx) and returns the chosen player.
// ctx: { round, available, botRoster, rosterSlots, scoringKey }
// All personalities are layered on top of position-need awareness.

const PERSONALITIES = ['Best Available', 'Zero RB', 'RB Heavy', 'Early QB', 'Reacher']

// Compare two players by ADP (lower = earlier draft = better).
// Prefers real adp_half_ppr → adp_ppr → search_rank, then projection as final tiebreaker.
function adpScore(p) {
  return p.adp_half_ppr ?? p.adp_ppr ?? p.search_rank ?? 9999
}
function adpCompare(a, b, scoringKey) {
  const diff = adpScore(a) - adpScore(b)
  if (diff !== 0) return diff
  return (b[scoringKey] || 0) - (a[scoringKey] || 0)
}

function projOf(player, scoringKey) {
  return player[scoringKey] || 0
}

// Position counts a roster still NEEDS to fill its starters (excluding flex)
function neededByPos(rosterSlots, botRoster) {
  const have = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
  for (const p of botRoster) have[p.position] = (have[p.position] || 0) + 1
  return {
    QB: Math.max(0, (rosterSlots.qb || 0) - have.QB),
    RB: Math.max(0, (rosterSlots.rb || 0) - have.RB),
    WR: Math.max(0, (rosterSlots.wr || 0) - have.WR),
    TE: Math.max(0, (rosterSlots.te || 0) - have.TE),
    K: Math.max(0, (rosterSlots.k || 0) - have.K),
    DEF: Math.max(0, (rosterSlots.def || 0) - have.DEF),
  }
}

// Total roster cap per position (starter + flex headroom + a couple bench)
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

// Filter pool by what this bot is allowed to draft right now
function eligiblePool(available, botRoster, rosterSlots, round) {
  const max = maxByPos(rosterSlots)
  const have = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }
  for (const p of botRoster) have[p.position] = (have[p.position] || 0) + 1
  return available.filter((p) => {
    if (have[p.position] >= max[p.position]) return false
    // Don't take K/DEF before round 11
    if ((p.position === 'K' || p.position === 'DEF') && round < 11) return false
    return true
  })
}

// Pick one of the top N candidates with weighted randomness (top is most likely)
function weightedTopPick(candidates, n = 5) {
  const top = candidates.slice(0, n)
  if (!top.length) return null
  // Weights 5,4,3,2,1
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
  pool.sort((a, b) => adpCompare(a, b, ctx.scoringKey))
  return weightedTopPick(pool, 5)
}

function pickZeroRB(ctx) {
  let pool = eligiblePool(ctx.available, ctx.botRoster, ctx.rosterSlots, ctx.round)
  if (ctx.round <= 4) pool = pool.filter((p) => p.position !== 'RB')
  pool.sort((a, b) => adpCompare(a, b, ctx.scoringKey))
  return weightedTopPick(pool, 5) || pickBestAvailable(ctx)
}

function pickRBHeavy(ctx) {
  let pool = eligiblePool(ctx.available, ctx.botRoster, ctx.rosterSlots, ctx.round)
  if (ctx.round <= 3) {
    const rbs = pool.filter((p) => p.position === 'RB')
    if (rbs.length) {
      rbs.sort((a, b) => adpCompare(a, b, ctx.scoringKey))
      return weightedTopPick(rbs, 4)
    }
  }
  pool.sort((a, b) => adpCompare(a, b, ctx.scoringKey))
  return weightedTopPick(pool, 5)
}

function pickEarlyQB(ctx) {
  const pool = eligiblePool(ctx.available, ctx.botRoster, ctx.rosterSlots, ctx.round)
  const hasQB = ctx.botRoster.some((p) => p.position === 'QB')
  if (!hasQB && ctx.round >= 4 && ctx.round <= 6) {
    const qbs = pool.filter((p) => p.position === 'QB')
    if (qbs.length) {
      qbs.sort((a, b) => adpCompare(a, b, ctx.scoringKey))
      return weightedTopPick(qbs, 3)
    }
  }
  pool.sort((a, b) => adpCompare(a, b, ctx.scoringKey))
  return weightedTopPick(pool, 5)
}

function pickReacher(ctx) {
  const pool = eligiblePool(ctx.available, ctx.botRoster, ctx.rosterSlots, ctx.round)
  pool.sort((a, b) => adpCompare(a, b, ctx.scoringKey))
  // 30% chance to reach: pick from rank 6-12 instead of 1-5
  if (Math.random() < 0.3 && pool.length > 12) {
    return pool[5 + Math.floor(Math.random() * 7)]
  }
  return weightedTopPick(pool, 5)
}

const PERSONALITY_FNS = {
  'Best Available': pickBestAvailable,
  'Zero RB': pickZeroRB,
  'RB Heavy': pickRBHeavy,
  'Early QB': pickEarlyQB,
  'Reacher': pickReacher,
}

// ────────────────────────────────────────────────────────────────────
// Bot team names — randomized at mock start

const TEAM_NAME_ADJECTIVES = [
  'Crushing', 'Roaring', 'Lethal', 'Iron', 'Savage', 'Rampaging', 'Electric', 'Frozen',
  'Shadow', 'Thunder', 'Phantom', 'Rogue', 'Wild', 'Brutal', 'Vicious', 'Mighty',
  'Stormy', 'Fearless', 'Cosmic', 'Blazing',
]
const TEAM_NAME_NOUNS = [
  'Dynasty', 'Goliaths', 'Titans', 'Reckoning', 'Empire', 'Legion', 'Outlaws', 'Kings',
  'Wrecking Crew', 'Bandits', 'Maulers', 'Renegades', 'Wolves', 'Mavericks', 'Rebels',
  'Bandits', 'Sharks', 'Hammers', 'Vipers', 'Bulldogs',
]

function randomTeamName() {
  const adj = TEAM_NAME_ADJECTIVES[Math.floor(Math.random() * TEAM_NAME_ADJECTIVES.length)]
  const noun = TEAM_NAME_NOUNS[Math.floor(Math.random() * TEAM_NAME_NOUNS.length)]
  return `${adj} ${noun}`
}

// ────────────────────────────────────────────────────────────────────
// Snake order

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

// ────────────────────────────────────────────────────────────────────
// LocalStorage history

const HISTORY_KEY = 'mockDraftHistory'
const MAX_HISTORY = 5

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}
function saveToHistory(mock) {
  const list = loadHistory()
  list.unshift(mock)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY)))
}
function clearHistory() {
  localStorage.removeItem(HISTORY_KEY)
}

// ────────────────────────────────────────────────────────────────────
// Page

export default function MockDraftPage() {
  const [screen, setScreen] = useState('home') // home | setup | draft | review
  const [config, setConfig] = useState(null)
  const [history, setHistory] = useState(loadHistory())
  const [reviewMock, setReviewMock] = useState(null)

  function startMock(cfg) {
    setConfig(cfg)
    setScreen('draft')
  }

  function finishMock(mockResult) {
    saveToHistory(mockResult)
    setHistory(loadHistory())
    setReviewMock(mockResult)
    setScreen('review')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-32">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/leagues" className="text-text-muted hover:text-text-primary">←</Link>
        <h1 className="font-display text-3xl">Mock Draft</h1>
      </div>

      {screen === 'home' && (
        <HomeScreen
          history={history}
          onStartNew={() => setScreen('setup')}
          onReview={(m) => { setReviewMock(m); setScreen('review') }}
          onClearHistory={() => { clearHistory(); setHistory([]) }}
        />
      )}
      {screen === 'setup' && (
        <SetupScreen
          onCancel={() => setScreen('home')}
          onStart={startMock}
        />
      )}
      {screen === 'draft' && config && (
        <DraftScreen
          config={config}
          onExit={() => setScreen('home')}
          onComplete={finishMock}
        />
      )}
      {screen === 'review' && reviewMock && (
        <ReviewScreen mock={reviewMock} onBack={() => setScreen('home')} onNew={() => setScreen('setup')} />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Home

function HomeScreen({ history, onStartNew, onReview, onClearHistory }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-5">
        <h2 className="font-display text-lg text-text-primary mb-1">Practice your draft</h2>
        <p className="text-sm text-text-secondary mb-4">
          Run a full NFL fantasy draft against bots with different personalities. Test strategies,
          try different draft slots, and see what your team could look like — no league required.
        </p>
        <button
          onClick={onStartNew}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          + Start New Mock
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs uppercase text-text-muted tracking-wider">Recent Mocks</h3>
          {history.length > 0 && (
            <button onClick={onClearHistory} className="text-[10px] text-text-muted hover:text-incorrect">Clear all</button>
          )}
        </div>
        {history.length === 0 ? (
          <div className="rounded-xl border border-text-primary/10 p-6 text-center text-sm text-text-muted">
            Your last 5 mocks will show up here.
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((m) => (
              <button
                key={m.id}
                onClick={() => onReview(m)}
                className="w-full text-left rounded-xl border border-text-primary/15 bg-bg-card p-3 hover:bg-bg-secondary transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-text-primary">
                      {m.config.numTeams}-team {m.config.scoring.toUpperCase()}, pick #{m.config.userSlot + 1}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      {new Date(m.completedAt).toLocaleString()} · {m.config.rounds} rounds
                    </div>
                  </div>
                  <div className="text-text-muted">→</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Setup

const DEFAULT_ROSTER = { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, k: 1, def: 1, bench: 6 }

function SetupScreen({ onCancel, onStart }) {
  const [numTeams, setNumTeams] = useState(12)
  const [userSlot, setUserSlot] = useState('random') // 'random' or 0-based int
  const [scoring, setScoring] = useState('ppr')
  const [rounds, setRounds] = useState(15)
  const [roster, setRoster] = useState({ ...DEFAULT_ROSTER, superflex: 0 })

  function handleStart() {
    const slot = userSlot === 'random' ? Math.floor(Math.random() * numTeams) : Number(userSlot)
    onStart({ numTeams, userSlot: slot, scoring, rounds, rosterSlots: roster })
  }

  function bumpSlot(key, delta) {
    setRoster((r) => ({ ...r, [key]: Math.max(0, (r[key] || 0) + delta) }))
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-5 space-y-4">
        <h2 className="font-display text-lg text-text-primary">Setup</h2>

        <div>
          <label className="text-xs uppercase text-text-muted tracking-wider block mb-1.5">Number of teams</label>
          <div className="flex gap-2 flex-wrap">
            {[8, 10, 12, 14].map((n) => (
              <button
                key={n}
                onClick={() => setNumTeams(n)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                  numTeams === n ? 'bg-accent text-white border-accent' : 'bg-bg-secondary text-text-secondary border-text-primary/20 hover:bg-bg-card'
                }`}
              >{n}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs uppercase text-text-muted tracking-wider block mb-1.5">Your draft slot</label>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setUserSlot('random')}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                userSlot === 'random' ? 'bg-accent text-white border-accent' : 'bg-bg-secondary text-text-secondary border-text-primary/20 hover:bg-bg-card'
              }`}
            >Random</button>
            {Array.from({ length: numTeams }, (_, i) => (
              <button
                key={i}
                onClick={() => setUserSlot(i)}
                className={`w-9 h-9 rounded-lg text-sm font-semibold border transition-colors ${
                  userSlot === i ? 'bg-accent text-white border-accent' : 'bg-bg-secondary text-text-secondary border-text-primary/20 hover:bg-bg-card'
                }`}
              >{i + 1}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs uppercase text-text-muted tracking-wider block mb-1.5">Scoring</label>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'ppr', label: 'PPR' },
              { key: 'half_ppr', label: 'Half-PPR' },
              { key: 'standard', label: 'Standard' },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setScoring(s.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                  scoring === s.key ? 'bg-accent text-white border-accent' : 'bg-bg-secondary text-text-secondary border-text-primary/20 hover:bg-bg-card'
                }`}
              >{s.label}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs uppercase text-text-muted tracking-wider block mb-1.5">Rounds</label>
          <input
            type="number"
            min={10}
            max={20}
            value={rounds}
            onChange={(e) => setRounds(Math.max(10, Math.min(20, Number(e.target.value) || 15)))}
            className="w-20 bg-bg-secondary border border-text-primary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary"
          />
        </div>

        <div>
          <label className="text-xs uppercase text-text-muted tracking-wider block mb-1.5">Roster positions</label>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'qb', label: 'QB' },
              { key: 'rb', label: 'RB' },
              { key: 'wr', label: 'WR' },
              { key: 'te', label: 'TE' },
              { key: 'flex', label: 'FLEX' },
              { key: 'superflex', label: 'SUPER FLEX' },
              { key: 'k', label: 'K' },
              { key: 'def', label: 'D/ST' },
              { key: 'bench', label: 'BENCH' },
            ].map((s) => (
              <div key={s.key} className="flex items-center bg-bg-secondary border border-text-primary/20 rounded-lg overflow-hidden">
                <button
                  onClick={() => bumpSlot(s.key, -1)}
                  className="w-7 h-9 text-text-muted hover:text-text-primary active:bg-bg-card text-lg leading-none"
                >−</button>
                <div className="px-2 text-center min-w-[58px]">
                  <div className="text-[9px] uppercase text-text-muted tracking-wider leading-none">{s.label}</div>
                  <div className="text-sm font-display text-text-primary leading-tight">{roster[s.key] || 0}</div>
                </div>
                <button
                  onClick={() => bumpSlot(s.key, 1)}
                  className="w-7 h-9 text-text-muted hover:text-text-primary active:bg-bg-card text-lg leading-none"
                >+</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-semibold bg-bg-card border border-text-primary/20 text-text-secondary">Cancel</button>
        <button onClick={handleStart} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover">Start Mock Draft</button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Draft

const SCORING_KEY_MAP = {
  ppr: 'projected_pts_ppr',
  half_ppr: 'projected_pts_half_ppr',
  standard: 'projected_pts_std',
}

function DraftScreen({ config, onExit, onComplete }) {
  const { data: allPlayers, isLoading } = useQuery({
    queryKey: ['mock-draft', 'players'],
    queryFn: () => api.get('/mock-draft/players'),
    staleTime: 5 * 60 * 1000,
  })

  // Stable per-mock state
  const [picks, setPicks] = useState([]) // { overall, round, teamSlot, player }
  const [activeTab, setActiveTab] = useState('Players')
  const [posFilter, setPosFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [detailPlayer, setDetailPlayer] = useState(null)

  // Bot personalities — stable for the duration of the mock
  const personalities = useMemo(() => {
    const arr = []
    for (let i = 0; i < config.numTeams; i++) {
      if (i === config.userSlot) arr.push('You')
      else arr.push(PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)])
    }
    return arr
  }, [config.numTeams, config.userSlot])

  // Random team names (unique per mock); user's team is always "Your Team"
  const teamNames = useMemo(() => {
    const used = new Set()
    const arr = []
    for (let i = 0; i < config.numTeams; i++) {
      if (i === config.userSlot) {
        arr.push('Your Team')
      } else {
        let name
        let attempts = 0
        do { name = randomTeamName(); attempts++ } while (used.has(name) && attempts < 20)
        used.add(name)
        arr.push(name)
      }
    }
    return arr
  }, [config.numTeams, config.userSlot])

  const order = useMemo(() => snakeOrder(config.numTeams, config.rounds), [config.numTeams, config.rounds])
  const scoringKey = SCORING_KEY_MAP[config.scoring]

  const draftedIds = useMemo(() => new Set(picks.map((p) => p.player.id)), [picks])
  const available = useMemo(() => (allPlayers || []).filter((p) => !draftedIds.has(p.id)), [allPlayers, draftedIds])

  const currentPickIdx = picks.length
  const currentPick = order[currentPickIdx]
  const isComplete = currentPickIdx >= order.length
  const isUserTurn = !isComplete && currentPick?.teamSlot === config.userSlot

  // Auto-pick bots
  useEffect(() => {
    if (isComplete || !allPlayers?.length) return
    if (currentPick.teamSlot === config.userSlot) return
    const delay = 220
    const t = setTimeout(() => {
      const botSlot = currentPick.teamSlot
      const botRoster = picks.filter((p) => p.teamSlot === botSlot).map((p) => p.player)
      const personality = personalities[botSlot]
      const fn = PERSONALITY_FNS[personality] || pickBestAvailable
      const player = fn({
        round: currentPick.round,
        available,
        botRoster,
        rosterSlots: config.rosterSlots,
        scoringKey,
      })
      if (!player) return
      setPicks((p) => [...p, {
        overall: currentPick.overall,
        round: currentPick.round,
        pickInRound: currentPick.pickInRound,
        teamSlot: botSlot,
        player,
        personality,
      }])
    }, delay)
    return () => clearTimeout(t)
  }, [currentPickIdx, isComplete, allPlayers])

  // When draft completes, build the result
  useEffect(() => {
    if (!isComplete || picks.length === 0) return
    const result = {
      id: `mock_${Date.now()}`,
      completedAt: new Date().toISOString(),
      config,
      personalities,
      teamNames,
      picks: picks.map((p) => ({
        overall: p.overall,
        round: p.round,
        pickInRound: p.pickInRound,
        teamSlot: p.teamSlot,
        personality: p.personality,
        player: {
          id: p.player.id,
          full_name: p.player.full_name,
          position: p.player.position,
          team: p.player.team,
          headshot_url: p.player.headshot_url,
          [scoringKey]: p.player[scoringKey],
        },
      })),
    }
    onComplete(result)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete])

  function handleUserPick(player) {
    if (!isUserTurn) return
    setPicks((p) => [...p, {
      overall: currentPick.overall,
      round: currentPick.round,
      pickInRound: currentPick.pickInRound,
      teamSlot: config.userSlot,
      player,
      personality: 'You',
    }])
    setSearchQuery('')
  }

  if (isLoading) return <LoadingSpinner />
  if (!allPlayers?.length) return <div className="text-center text-text-muted py-12">Couldn't load players.</div>

  // Filter the available list for the Players tab
  const filtered = available
    .filter((p) => posFilter === 'All' || p.position === posFilter)
    .filter((p) => !searchQuery || p.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice(0, 60)

  const myPicks = picks.filter((p) => p.teamSlot === config.userSlot).map((p) => ({
    id: p.player.id,
    name: p.player.full_name,
    position: p.player.position,
    team: p.player.team,
    headshot: p.player.headshot_url,
  }))
  const slotPlan = buildSlotPlan(config.rosterSlots, myPicks)

  return (
    <div className="space-y-3">
      {/* Sticky banner */}
      <div className="sticky top-0 z-20 -mx-2 px-2 pt-1">
        <div className={`rounded-xl p-3 text-center ${isUserTurn ? 'bg-accent/20 border border-accent' : 'bg-bg-card border border-text-primary/20'}`}>
          <div className="flex items-center justify-center gap-2">
            <div className="text-[10px] text-text-muted uppercase tracking-wider">R{currentPick?.round} · Pick {currentPick?.overall}</div>
            <div className="font-display text-sm text-text-primary">
              {isUserTurn ? "You're on the clock!" : `${teamNames[currentPick?.teamSlot]} picking...`}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center">
            <button
              onClick={onExit}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-bg-card border border-text-primary/20 text-text-muted hover:text-incorrect"
            >Exit</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-text-primary/10">
        {['Players', 'My Roster', 'Board', 'Log'].map((t) => {
          const isActive = activeTab === t
          const badge = t === 'My Roster' ? `${slotPlan.filled}/${slotPlan.totalRoster}` : null
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                isActive ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >{t}{badge ? ` (${badge})` : ''}</button>
          )
        })}
      </div>

      {activeTab === 'Players' && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="p-3 border-b border-text-primary/10">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search players..."
              className="w-full bg-bg-secondary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="flex gap-1 mt-2 overflow-x-auto">
              {['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((pos) => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    posFilter === pos ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary'
                  }`}
                >{pos}</button>
              ))}
            </div>
          </div>
          <div className="max-h-[55vh] md:max-h-[60vh] overflow-y-auto">
            {filtered.map((player) => (
              <div
                key={player.id}
                className="w-full flex items-center gap-3 px-3 py-3 md:py-2 border-b border-text-primary/10 last:border-0"
              >
                <button
                  onClick={() => setDetailPlayer(player)}
                  className="flex-1 flex items-center gap-3 text-left cursor-pointer"
                >
                  <img
                    src={player.headshot_url}
                    alt={player.full_name}
                    className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
                    onError={(e) => { e.target.style.display = 'none' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{player.full_name}</div>
                    <div className="text-xs text-text-muted">
                      {player.position} · {player.team || 'FA'}
                      {player.bye_week && <span> · Bye {player.bye_week}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {player[scoringKey] != null && (
                      <div className="text-sm font-display text-accent">{Number(player[scoringKey]).toFixed(1)}</div>
                    )}
                    <div className="text-[10px] text-text-muted">proj</div>
                  </div>
                </button>
                {isUserTurn && (
                  <button
                    onClick={() => handleUserPick(player)}
                    className="shrink-0 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-accent text-white hover:bg-accent-hover active:scale-95 transition"
                  >
                    Draft
                  </button>
                )}
              </div>
            ))}
            {filtered.length === 0 && <div className="text-center text-sm text-text-muted py-8">No players found</div>}
          </div>
        </div>
      )}

      {activeTab === 'My Roster' && <RosterNeedsView slotPlan={slotPlan} />}

      {activeTab === 'Board' && (
        <div
          className="rounded-xl border border-text-primary/20 p-2 overflow-hidden md:relative md:left-1/2 md:-translate-x-1/2 md:w-[95vw] md:max-w-[1600px]"
        >
          <MockDraftBoard picks={picks} numTeams={config.numTeams} userSlot={config.userSlot} teamNames={teamNames} />
        </div>
      )}

      {activeTab === 'Log' && (
        <div className="rounded-xl border border-text-primary/20 overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto">
            {[...picks].reverse().map((p) => (
              <div key={p.overall} className={`flex items-center gap-3 px-3 py-2 border-b border-text-primary/10 last:border-0 ${p.teamSlot === config.userSlot ? 'bg-accent/5' : ''}`}>
                <span className="text-xs text-text-muted w-10 shrink-0">{p.round}.{p.pickInRound}</span>
                {p.player.headshot_url && (
                  <img src={p.player.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">{p.player.full_name}</div>
                  <div className="text-xs text-text-muted">{p.player.position} · {p.player.team} — {teamNames[p.teamSlot]}</div>
                </div>
              </div>
            ))}
            {picks.length === 0 && <div className="text-center text-sm text-text-muted py-8">Waiting for first pick...</div>}
          </div>
        </div>
      )}

      {detailPlayer && (
        <DraftPlayerDetailModal
          playerId={detailPlayer.id}
          mockScoring={config.scoring}
          onClose={() => setDetailPlayer(null)}
          onDraft={isUserTurn ? () => { handleUserPick(detailPlayer); setDetailPlayer(null) } : null}
        />
      )}
    </div>
  )
}


// ────────────────────────────────────────────────────────────────────
// Roster helpers (mirrors FantasyDraftRoom)

const STARTER_SLOT_LABELS = { qb: 'QB', rb: 'RB', wr: 'WR', te: 'TE', flex: 'FLEX', k: 'K', def: 'D/ST', superflex: 'SUPER FLEX' }
const FLEX_ELIGIBLE = ['RB', 'WR', 'TE']
const SUPERFLEX_ELIGIBLE = ['QB', 'RB', 'WR', 'TE']

function buildSlotPlan(rosterSlots, players) {
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
  const slots = []
  const order = ['qb', 'rb', 'wr', 'te', 'flex', 'superflex', 'k', 'def']
  for (const slotKey of order) {
    const count = rosterSlots[slotKey] || 0
    for (let i = 0; i < count; i++) {
      let player = null
      if (slotKey === 'flex') player = takeAny(FLEX_ELIGIBLE)
      else if (slotKey === 'superflex') player = takeAny(SUPERFLEX_ELIGIBLE)
      else player = take(slotKey.toUpperCase())
      slots.push({ slot: slotKey, label: STARTER_SLOT_LABELS[slotKey], player })
    }
  }
  const benchCount = rosterSlots.bench || 0
  // Bench accepts ALL non-starter players, even beyond benchCount, so users
  // can punt K/DEF and the extras spill over into bench. The configured
  // benchCount is just a "minimum slots to display" — actual size can grow.
  const bench = remaining
  const startersFilled = slots.filter((s) => s.player).length
  const totalStarters = slots.length
  const totalRoster = totalStarters + benchCount
  const filledTotal = startersFilled + bench.length
  return { slots, bench, filled: filledTotal, totalStarters, totalRoster, benchCount }
}

function RosterNeedsView({ slotPlan }) {
  const needCounts = {}
  for (const s of slotPlan.slots) if (!s.player) needCounts[s.label] = (needCounts[s.label] || 0) + 1
  const needList = Object.entries(needCounts)
  return (
    <div className="space-y-4">
      {needList.length > 0 && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 text-center">
          <span className="text-xs text-yellow-400 font-semibold uppercase tracking-wider">Still need: </span>
          <span className="text-xs text-text-primary">
            {needList.map(([label, n], i) => <span key={label}>{i > 0 ? ', ' : ''}{n} {label}</span>)}
          </span>
        </div>
      )}
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="p-3 border-b border-text-primary/10">
          <h3 className="text-sm font-semibold text-text-primary">Starting Lineup</h3>
        </div>
        <div className="divide-y divide-text-primary/10">
          {slotPlan.slots.map((s, i) => <SlotRow key={i} label={s.label} player={s.player} />)}
        </div>
      </div>
      <div className="rounded-xl border border-text-primary/20 overflow-hidden">
        <div className="p-3 border-b border-text-primary/10 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Bench</h3>
          <span className="text-[10px] text-text-muted">{slotPlan.bench.length} / {slotPlan.benchCount}</span>
        </div>
        <div className="divide-y divide-text-primary/10">
          {(() => {
            // Show every drafted bench player, then pad with empty rows
            // until the configured benchCount is reached.
            const rows = []
            slotPlan.bench.forEach((p, i) => rows.push(<SlotRow key={`b-${p.id}`} label="BN" player={p} />))
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

const POS_BG = {
  QB: 'bg-red-500/25 text-red-200 border-red-500/40',
  RB: 'bg-green-500/25 text-green-200 border-green-500/40',
  WR: 'bg-yellow-500/25 text-yellow-200 border-yellow-500/40',
  TE: 'bg-blue-500/25 text-blue-200 border-blue-500/40',
  K: 'bg-gray-500/25 text-gray-200 border-gray-500/40',
  DEF: 'bg-purple-500/25 text-purple-200 border-purple-500/40',
}

function MockDraftBoard({ picks, numTeams, userSlot, teamNames }) {
  const totalRounds = Math.ceil(picks.length / numTeams) || 1
  const grid = []
  for (let r = 0; r < totalRounds; r++) {
    const row = []
    const reverse = r % 2 === 1
    for (let c = 0; c < numTeams; c++) {
      const colIdx = reverse ? numTeams - 1 - c : c
      const overall = r * numTeams + colIdx + 1
      const pick = picks.find((p) => p.overall === overall)
      row.push(pick || null)
    }
    grid.push(row)
  }
  // Mobile: scroll both ways with bigger cells. Desktop: fit container width.
  return (
    <div className="overflow-auto max-h-[70vh] md:max-h-none md:overflow-visible">
      <table className="text-[11px] md:text-xs border-collapse md:w-full md:table-fixed">
        <thead>
          <tr>
            <th className="px-1 py-2 text-text-muted font-semibold text-center w-10 border border-text-primary/15 bg-bg-secondary sticky left-0 z-10">Rd</th>
            {Array.from({ length: numTeams }, (_, i) => (
              <th key={i} className={`px-2 py-2 font-semibold text-center border border-text-primary/15 min-w-[120px] md:min-w-0 ${i === userSlot ? 'text-accent' : 'text-text-secondary'}`}>
                <div className="text-text-muted text-[9px]">{i + 1}</div>
                <div className="truncate">{teamNames?.[i] || (i === userSlot ? 'You' : `T${i + 1}`)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((row, ri) => (
            <tr key={ri}>
              <td className="px-1 py-1 text-center text-text-muted font-semibold border border-text-primary/15 bg-bg-secondary sticky left-0 z-10">
                <div className="flex items-center gap-0.5 justify-center">
                  {ri + 1}
                  <span className="text-[8px]">{ri % 2 === 0 ? '→' : '←'}</span>
                </div>
              </td>
              {row.map((pick, ci) => {
                const pos = pick?.player?.position
                const cls = pos ? POS_BG[pos] || '' : ''
                return (
                  <td key={ci} className={`px-2 py-2 border border-text-primary/15 min-w-[120px] md:min-w-0 ${cls}`}>
                    {pick?.player ? (
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{pick.player.full_name}</div>
                        <div className="text-[10px] opacity-70 truncate">{pos} {pick.player.team}</div>
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

function SlotRow({ label, player }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted w-12 shrink-0">{label}</span>
      {player ? (
        <>
          {player.headshot && <img src={player.headshot} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-card shrink-0" onError={(e) => { e.target.style.display = 'none' }} />}
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

// ────────────────────────────────────────────────────────────────────
// Review

function ReviewScreen({ mock, onBack, onNew }) {
  const [openTeam, setOpenTeam] = useState(mock.config.userSlot)
  const teams = []
  const names = mock.teamNames || []
  for (let i = 0; i < mock.config.numTeams; i++) {
    const teamPicks = mock.picks.filter((p) => p.teamSlot === i)
    teams.push({
      slot: i,
      name: names[i] || (i === mock.config.userSlot ? 'Your Team' : `Team ${i + 1}`),
      picks: teamPicks,
    })
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-4 text-center">
        <div className="text-xs uppercase text-text-muted tracking-wider mb-1">Mock Complete</div>
        <div className="font-display text-lg text-text-primary">
          {mock.config.numTeams}-team {mock.config.scoring.toUpperCase()} · You picked at #{mock.config.userSlot + 1}
        </div>
      </div>

      <div className="space-y-2">
        {teams.map((team) => {
          const isUser = team.slot === mock.config.userSlot
          const isOpen = openTeam === team.slot
          return (
            <div key={team.slot} className={`rounded-xl border ${isUser ? 'border-accent/40' : 'border-text-primary/20'} bg-bg-primary overflow-hidden`}>
              <button
                onClick={() => setOpenTeam(isOpen ? -1 : team.slot)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-secondary"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">#{team.slot + 1}</span>
                  <span className={`text-sm font-semibold ${isUser ? 'text-accent' : 'text-text-primary'}`}>
                    {team.name}
                  </span>
                </div>
                <span className="text-text-muted">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="border-t border-text-primary/10 divide-y divide-text-primary/10">
                  {team.picks.map((p) => (
                    <div key={p.overall} className="flex items-center gap-3 px-4 py-2">
                      <span className="text-[10px] text-text-muted w-10 shrink-0">{p.round}.{p.pickInRound}</span>
                      {p.player.headshot_url && (
                        <img src={p.player.headshot_url} alt="" className="w-7 h-7 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">{p.player.full_name}</div>
                        <div className="text-[10px] text-text-muted">{p.player.position} · {p.player.team}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-2">
        <button onClick={onBack} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-bg-card border border-text-primary/20 text-text-secondary">Back to Mock Draft</button>
        <button onClick={onNew} className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-accent text-white">+ New Mock</button>
      </div>
    </div>
  )
}
