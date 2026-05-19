/**
 * One-off mossyou pick fixes:
 *   1. Drop the 2x multiplier on the existing Cubs pick to 1x
 *   2. Insert a new Rays pick (intended pick that wasn't placed) at 1x
 *
 * Both target locked-but-not-settled games. Run dry-run first to verify
 * what it'll do, then re-run with --commit. Safe to delete after use.
 *
 * Usage:
 *   node server/scripts/fixPickMultiplier.js              # dry run
 *   node server/scripts/fixPickMultiplier.js --commit     # write
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
)

const USERNAME = 'mossyou'
const COMMIT = process.argv.includes('--commit')

function americanToMultiplier(odds) {
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds)
}
function calculateRiskPoints(odds) {
  if (odds == null) return 0
  if (odds > 0) return 10
  return Math.min(20, Math.round((100 / americanToMultiplier(odds)) / 10) * 10 || 10)
}
function calculateRewardPoints(odds) {
  if (odds == null) return 0
  const m = americanToMultiplier(odds)
  return Math.round(10 * (m - 1))
}

function log(...args) { console.log('[fixPickMultiplier]', ...args) }

async function findGameForTeam(teamName) {
  // Most recent / upcoming / in-progress game involving this team (last 24h
  // through next 24h). Returns the first non-final match.
  const now = new Date()
  const startWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const endWindow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()

  const { data: games } = await supabase
    .from('games')
    .select('id, home_team, away_team, status, home_odds, away_odds, starts_at')
    .or(`home_team.eq.${teamName},away_team.eq.${teamName}`)
    .gte('starts_at', startWindow)
    .lte('starts_at', endWindow)
    .order('starts_at', { ascending: false })
    .limit(5)

  // Prefer live or upcoming over final
  const ordered = (games || []).sort((a, b) => {
    const score = (g) => g.status === 'live' ? 0 : g.status === 'upcoming' ? 1 : 2
    return score(a) - score(b)
  })
  return ordered[0] || null
}

async function fixCubsMultiplier(user) {
  const { data: picks } = await supabase
    .from('picks')
    .select('id, status, multiplier, picked_team, odds_at_submission, odds_at_pick, games(id, home_team, away_team, status)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const cubsPick = (picks || []).find((p) => {
    const g = p.games
    if (!g) return false
    if (g.home_team !== 'Chicago Cubs' && g.away_team !== 'Chicago Cubs') return false
    return p.status === 'locked' || p.status === 'pending'
  })

  if (!cubsPick) {
    log('CUBS FIX: no pending/locked Cubs pick found — skipping')
    return
  }
  if (cubsPick.multiplier === 1) {
    log('CUBS FIX: pick already at 1x — skipping')
    return
  }

  const odds = cubsPick.odds_at_pick ?? cubsPick.odds_at_submission ?? null
  if (odds == null) {
    log('CUBS FIX: no odds on pick — aborting')
    return
  }
  const newRisk = calculateRiskPoints(odds)
  const newReward = calculateRewardPoints(odds)

  const updates = {
    multiplier: 1,
    risk_at_submission: newRisk,
    reward_at_submission: newReward,
    risk_points: newRisk,
    reward_points: newReward,
    updated_at: new Date().toISOString(),
  }

  log('CUBS FIX:', { pickId: cubsPick.id, currentMultiplier: cubsPick.multiplier, odds, updates })

  if (!COMMIT) { log('CUBS FIX: dry run — no write'); return }

  const { error } = await supabase.from('picks').update(updates).eq('id', cubsPick.id)
  if (error) throw error
  log('CUBS FIX: ✓ updated')
}

async function insertRaysPick(user) {
  // Avoid double-inserting if a Rays pick already exists today.
  const { data: existing } = await supabase
    .from('picks')
    .select('id, status, games(home_team, away_team)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30)
  const already = (existing || []).find((p) => {
    const g = p.games
    return g && (g.home_team === 'Tampa Bay Rays' || g.away_team === 'Tampa Bay Rays')
  })
  if (already) {
    log('RAYS INSERT: pick already exists for this user on a Rays game — skipping', already)
    return
  }

  const game = await findGameForTeam('Tampa Bay Rays')
  if (!game) { log('RAYS INSERT: no Rays game in the ±24h window — aborting'); return }

  const pickedTeam = game.home_team === 'Tampa Bay Rays' ? 'home' : 'away'
  const odds = pickedTeam === 'home' ? game.home_odds : game.away_odds
  if (odds == null) { log('RAYS INSERT: game has no odds — aborting', game); return }

  const risk = calculateRiskPoints(odds)
  const reward = calculateRewardPoints(odds)

  const row = {
    user_id: user.id,
    game_id: game.id,
    picked_team: pickedTeam,
    multiplier: 1,
    status: 'locked', // game is already in progress
    odds_at_submission: odds,
    odds_at_pick: odds,
    risk_at_submission: risk,
    reward_at_submission: reward,
    risk_points: risk,
    reward_points: reward,
    updated_at: new Date().toISOString(),
  }

  log('RAYS INSERT:', { game, pickedTeam, odds, risk, reward, row })

  if (!COMMIT) { log('RAYS INSERT: dry run — no write'); return }

  const { error } = await supabase.from('picks').insert(row)
  if (error) throw error
  log('RAYS INSERT: ✓ inserted')
}

async function main() {
  log(`mode: ${COMMIT ? 'COMMIT' : 'DRY RUN (pass --commit to write)'}`)

  const { data: user } = await supabase
    .from('users').select('id, username').eq('username', USERNAME).single()
  if (!user) throw new Error(`No user named ${USERNAME}`)
  log('user:', user)

  await fixCubsMultiplier(user)
  await insertRaysPick(user)
}

main().catch((err) => { console.error('FAILED:', err.message); process.exit(1) })
