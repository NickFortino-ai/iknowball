/**
 * Fantasy Game-Day Simulator
 *
 * Pre-launch dress rehearsal for the live fantasy scoring pipeline. Replays
 * a real NFL week's stats in chunks against an isolated test league so you
 * can watch points climb in real time and confirm everything wires up
 * correctly before actual NFL games start.
 *
 * SAFETY MODEL — three independent guardrails:
 *
 *   1. Hardcoded test league. We only ever create/update the league with
 *      UUID `feedface-feed-face-feed-facefeedface`. The script refuses to
 *      target any other league.
 *
 *   2. Hardcoded simulation season `9999`. All replayed stats are written
 *      under (season=9999, week=1). Real seasons are never touched. The
 *      script asserts that the SOURCE season we read from is NOT 9999.
 *
 *   3. Every DELETE in this script includes either `season=9999` or
 *      `league_id=TEST_LEAGUE_ID` in its WHERE clause. There is no code
 *      path that deletes from a real league or a real season's stats.
 *
 * Usage:
 *   node server/scripts/simulateGameDay.js \
 *     --source-season=2025 --source-week=5 \
 *     --tick-seconds=30 [--reset] [--dry-run]
 *
 * Flags:
 *   --source-season=YYYY    Real season to read stats from (default 2025)
 *   --source-week=N         Real week to read stats from (default 5)
 *   --tick-seconds=N        Pause between replay ticks in seconds (default 30)
 *   --reset                 Wipe and recreate the test league before running
 *   --dry-run               Print what would happen without writing anything
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

// ============================================================
// IMMUTABLE SAFETY CONSTANTS — never change these
// ============================================================
const TEST_LEAGUE_ID = 'feedface-feed-face-feed-facefeedface'
const SIM_USERS = [
  { id: 'f45f8a06-b9bd-4ced-bd21-3f443385da16', name: 'mossyou', role: 'commissioner' },
  { id: '2305ae26-9927-415f-a61f-78b0cc09c18e', name: 'Himmy', role: 'member' },
  { id: 'f8fef0b6-ed5e-42f4-a1bb-8479e32aac39', name: 'admin', role: 'member' },
  { id: 'f149c685-99e9-4c31-800c-d23d3e4d21a3', name: 'userpick', role: 'member' },
]
const SIM_SEASON = 9999
const SIM_WEEK = 1

// ============================================================
// CLI args
// ============================================================
function getArg(name, fallback) {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`))
  return m ? m.split('=')[1] : fallback
}
const SOURCE_SEASON = parseInt(getArg('source-season', '2025'), 10)
const SOURCE_WEEK = parseInt(getArg('source-week', '5'), 10)
const TICK_SECONDS = parseInt(getArg('tick-seconds', '30'), 10)
const RESET = process.argv.includes('--reset')
const DRY_RUN = process.argv.includes('--dry-run')

// ============================================================
// Safety assertions before any DB call
// ============================================================
if (SOURCE_SEASON === SIM_SEASON) {
  throw new Error(`source-season cannot equal simulation season ${SIM_SEASON}`)
}
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!process.env.SUPABASE_URL || !SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) env vars required')
}

const supabase = createClient(process.env.SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...args) => console.log(`[sim ${new Date().toISOString().slice(11, 19)}]`, ...args)

function assertTestLeague(id) {
  if (id !== TEST_LEAGUE_ID) {
    throw new Error(`SAFETY: refusing to operate on league ${id}, only ${TEST_LEAGUE_ID} is allowed`)
  }
}

function assertSimSeason(s) {
  if (s !== SIM_SEASON) {
    throw new Error(`SAFETY: refusing to write stats under season ${s}, only ${SIM_SEASON} is allowed`)
  }
}

// ============================================================
// 1. Verify the source week has data we can replay
// ============================================================
async function verifySourceData() {
  const { data, error, count } = await supabase
    .from('nfl_player_stats')
    .select('player_id', { count: 'exact', head: true })
    .eq('season', SOURCE_SEASON)
    .eq('week', SOURCE_WEEK)
  if (error) throw error
  log(`Source data: ${count} stat rows for season=${SOURCE_SEASON} week=${SOURCE_WEEK}`)
  if (!count) {
    throw new Error(`No stats found for season=${SOURCE_SEASON} week=${SOURCE_WEEK}. Try a different week.`)
  }
}

// ============================================================
// 2. Test league + users + roster setup
// ============================================================
async function ensureTestUsers() {
  log(`Using real accounts: ${SIM_USERS.map((u) => u.name).join(', ')}`)
}

async function ensureTestLeague() {
  assertTestLeague(TEST_LEAGUE_ID)
  if (DRY_RUN) { log('[dry] would upsert test league', TEST_LEAGUE_ID); return }

  const { error: leagueErr } = await supabase
    .from('leagues')
    .upsert({
      id: TEST_LEAGUE_ID,
      name: '[SIM] Game Day Test League',
      format: 'fantasy',
      sport: 'americanfootball_nfl',
      status: 'active',
      commissioner_id: SIM_USERS[0].id,
      visibility: 'closed',
      duration: 'full_season',
      invite_code: 'SIMTEST',
      starts_at: new Date().toISOString(),
    }, { onConflict: 'id' })
  if (leagueErr) throw new Error(`Failed to create test league: ${leagueErr.message}`)

  // Members
  for (const u of SIM_USERS) {
    await supabase.from('league_members').upsert({
      league_id: TEST_LEAGUE_ID,
      user_id: u.id,
      role: u.role,
    }, { onConflict: 'league_id,user_id' })
  }

  // Fantasy settings — season=9999 so this league only sees simulated stats
  const { error: settingsErr } = await supabase
    .from('fantasy_settings')
    .upsert({
      league_id: TEST_LEAGUE_ID,
      format: 'traditional',
      scoring_format: 'half_ppr',
      num_teams: SIM_USERS.length,
      season: SIM_SEASON,
      current_week: SIM_WEEK,
      draft_status: 'completed',
    }, { onConflict: 'league_id' })
  if (settingsErr) throw new Error(`Failed to set fantasy settings: ${settingsErr.message}`)
}

async function ensureRosters() {
  // Pull players sorted by points scored in the source week (highest first)
  // so each team gets real contributors, not zero-stat players
  const { data: allStats } = await supabase
    .from('nfl_player_stats')
    .select('player_id, pass_td, rush_td, rec_td, pass_yd, rush_yd, rec_yd, fgm, xpm, nfl_players!inner(position, full_name)')
    .eq('season', SOURCE_SEASON)
    .eq('week', SOURCE_WEEK)

  if (!allStats?.length) throw new Error('No stats available from source week')

  // Score each player roughly to sort by production
  function roughScore(s) {
    return (s.pass_td || 0) * 4 + (s.rush_td || 0) * 6 + (s.rec_td || 0) * 6 +
      (Number(s.pass_yd) || 0) * 0.04 + (Number(s.rush_yd) || 0) * 0.1 + (Number(s.rec_yd) || 0) * 0.1 +
      (s.fgm || 0) * 3 + (s.xpm || 0) * 1
  }

  const byPos = {}
  for (const s of allStats) {
    const pos = s.nfl_players?.position
    if (!pos) continue
    if (!byPos[pos]) byPos[pos] = []
    byPos[pos].push({ player_id: s.player_id, name: s.nfl_players.full_name, score: roughScore(s) })
  }
  // Sort each position by score descending (best producers first)
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => b.score - a.score)
  }

  // Build lineup for each user: 8 starters + 3 bench (leave 1 bench slot open for free agent pickup)
  // Starters: QB, RB1, RB2, WR1, WR2, TE, K, DEF
  // Bench: 1 extra RB, 1 extra WR, 1 extra QB/TE (3 bench, 1 open)
  const STARTER_TEMPLATE = [
    { slot: 'qb', pos: 'QB' },
    { slot: 'rb1', pos: 'RB' },
    { slot: 'rb2', pos: 'RB' },
    { slot: 'wr1', pos: 'WR' },
    { slot: 'wr2', pos: 'WR' },
    { slot: 'te', pos: 'TE' },
    { slot: 'k', pos: 'K' },
    { slot: 'def', pos: 'DEF' },
  ]
  const BENCH_TEMPLATE = [
    { slot: 'bench', pos: 'RB' },
    { slot: 'bench', pos: 'WR' },
    { slot: 'bench', pos: 'TE' },
  ]

  function buildLineup(teamIdx) {
    const lineup = []
    for (const t of STARTER_TEMPLATE) {
      const pool = byPos[t.pos]
      if (pool?.length) lineup.push({ slot: t.slot, player_id: pool.shift().player_id })
    }
    for (const t of BENCH_TEMPLATE) {
      const pool = byPos[t.pos]
      if (pool?.length) lineup.push({ slot: t.slot, player_id: pool.shift().player_id })
    }
    return lineup
  }

  const rosters = SIM_USERS.map((u, i) => ({ userId: u.id, name: u.name, lineup: buildLineup(i) }))

  if (DRY_RUN) {
    for (const r of rosters) log(`[dry] ${r.name}: ${r.lineup.length} players`)
    return
  }

  assertTestLeague(TEST_LEAGUE_ID)
  await supabase.from('fantasy_rosters').delete().eq('league_id', TEST_LEAGUE_ID)

  for (const r of rosters) {
    for (const slot of r.lineup) {
      await supabase.from('fantasy_rosters').insert({
        league_id: TEST_LEAGUE_ID,
        user_id: r.userId,
        ...slot,
        acquired_via: 'draft',
      })
    }
    log(`${r.name}: ${r.lineup.length} players (${r.lineup.filter((s) => s.slot !== 'bench').length} starters, ${r.lineup.filter((s) => s.slot === 'bench').length} bench)`)
  }
}

async function ensureMatchup() {
  if (DRY_RUN) { log('[dry] would create matchups'); return }
  assertTestLeague(TEST_LEAGUE_ID)
  await supabase.from('fantasy_matchups').delete().eq('league_id', TEST_LEAGUE_ID).eq('week', SIM_WEEK)

  // 2 matchups: user 0 vs user 1, user 2 vs user 3
  await supabase.from('fantasy_matchups').insert({
    league_id: TEST_LEAGUE_ID,
    week: SIM_WEEK,
    home_user_id: SIM_USERS[0].id,
    away_user_id: SIM_USERS[1].id,
    status: 'pending',
  })
  await supabase.from('fantasy_matchups').insert({
    league_id: TEST_LEAGUE_ID,
    week: SIM_WEEK,
    home_user_id: SIM_USERS[2].id,
    away_user_id: SIM_USERS[3].id,
    status: 'pending',
  })
  log('Created 2 matchups: mossyou vs Himmy, admin vs userpick')
}

// ============================================================
// 3. Replay logic — split source stats into 4 quarter chunks
// ============================================================
const NUMERIC_STAT_COLS = [
  'pass_att', 'pass_cmp', 'pass_yd', 'pass_td', 'pass_int',
  'rush_att', 'rush_yd', 'rush_td',
  'rec_tgt', 'rec', 'rec_yd', 'rec_td',
  'fum_lost', 'two_pt',
  'fgm', 'fga', 'fgm_0_39', 'fgm_40_49', 'fgm_50_plus', 'xpm', 'xpa',
  'def_td', 'def_int', 'def_sack', 'def_fum_rec', 'def_safety', 'def_pts_allowed',
]

async function loadSourceStats() {
  const { data, error } = await supabase
    .from('nfl_player_stats')
    .select('*')
    .eq('season', SOURCE_SEASON)
    .eq('week', SOURCE_WEEK)
  if (error) throw error
  return data || []
}

async function applyTick(sourceStats, fraction) {
  assertSimSeason(SIM_SEASON)
  log(`Writing ${sourceStats.length} stat rows scaled to ${(fraction * 100).toFixed(0)}%`)

  const rows = sourceStats.map((row) => {
    const out = {
      player_id: row.player_id,
      season: SIM_SEASON,
      week: SIM_WEEK,
    }
    for (const col of NUMERIC_STAT_COLS) {
      const v = row[col]
      if (v == null) continue
      out[col] = typeof v === 'number'
        ? Math.round(v * fraction)
        : v
    }
    return out
  })

  if (DRY_RUN) { log('[dry] would upsert', rows.length, 'sim stat rows'); return }

  // Upsert in chunks to avoid statement size limits
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('nfl_player_stats')
      .upsert(slice, { onConflict: 'player_id,season,week' })
    if (error) throw error
  }
}

async function rescore() {
  if (DRY_RUN) { log('[dry] would call scoreFantasyMatchupsWeek'); return }
  // Use dynamic import so the script can run standalone
  const { scoreFantasyMatchupsWeek } = await import('../src/services/fantasyService.js')
  const result = await scoreFantasyMatchupsWeek(SIM_WEEK, SIM_SEASON)
  log('Rescored:', result)
}

// ============================================================
// 4. Verification — pull the test league's matchup and check
// ============================================================
async function showMatchup(label) {
  const { data: matchups } = await supabase
    .from('fantasy_matchups')
    .select('home_user_id, away_user_id, home_points, away_points, status')
    .eq('league_id', TEST_LEAGUE_ID)
    .eq('week', SIM_WEEK)
  if (!matchups?.length) { log(label, '— no matchups'); return }
  for (const m of matchups) {
    const home = SIM_USERS.find((u) => u.id === m.home_user_id)?.name || '?'
    const away = SIM_USERS.find((u) => u.id === m.away_user_id)?.name || '?'
    log(`${label} — ${home} ${m.home_points} vs ${away} ${m.away_points} (${m.status})`)
  }
}

// ============================================================
// 5. Reset (idempotent cleanup of the test league only)
// ============================================================
async function resetTestLeague() {
  log('--reset: wiping test league + sim stats')
  assertTestLeague(TEST_LEAGUE_ID)
  assertSimSeason(SIM_SEASON)
  if (DRY_RUN) { log('[dry] would reset'); return }

  // Stats first (FK cascade safety)
  await supabase.from('nfl_player_stats').delete().eq('season', SIM_SEASON).eq('week', SIM_WEEK)
  await supabase.from('fantasy_lineup_history').delete().eq('league_id', TEST_LEAGUE_ID)
  await supabase.from('fantasy_matchups').delete().eq('league_id', TEST_LEAGUE_ID)
  await supabase.from('fantasy_rosters').delete().eq('league_id', TEST_LEAGUE_ID)
  await supabase.from('league_members').delete().eq('league_id', TEST_LEAGUE_ID)
  // League + settings will be re-upserted
}

// ============================================================
// Main
// ============================================================
async function main() {
  log('Test league:', TEST_LEAGUE_ID)
  log('Sim season/week:', SIM_SEASON, SIM_WEEK)
  log('Source season/week:', SOURCE_SEASON, SOURCE_WEEK)
  log('Tick interval:', TICK_SECONDS, 'seconds')
  log('Dry run:', DRY_RUN)
  log('---')

  await verifySourceData()
  if (RESET) await resetTestLeague()
  await ensureTestUsers()
  await ensureTestLeague()
  await ensureRosters()
  await ensureMatchup()

  const sourceStats = await loadSourceStats()
  log(`Loaded ${sourceStats.length} source stat rows`)

  await showMatchup('PRE-REPLAY')

  for (let tick = 1; tick <= 4; tick++) {
    const fraction = tick / 4
    log(`\n--- TICK ${tick} of 4 (${(fraction * 100).toFixed(0)}%) ---`)
    await applyTick(sourceStats, fraction)
    await rescore()
    await showMatchup(`POST-TICK-${tick}`)
    if (tick < 4) {
      log(`Sleeping ${TICK_SECONDS}s — open the test league matchup tab in a browser to watch`)
      await sleep(TICK_SECONDS * 1000)
    }
  }

  log('\nDone. Test league points reflect the replayed week. To re-run, pass --reset.')
}

main().catch((err) => {
  console.error('[sim FAILED]', err)
  process.exit(1)
})
