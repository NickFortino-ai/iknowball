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
import 'dotenv/config'

// ============================================================
// IMMUTABLE SAFETY CONSTANTS — never change these
// ============================================================
const TEST_LEAGUE_ID = 'feedface-feed-face-feed-facefeedface'
const TEST_COMMISH_ID = 'feedface-feed-face-feed-facefeedca5e'
const TEST_OPPONENT_ID = 'feedface-feed-face-feed-facefeedca7e'
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
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY env vars required')
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
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
  const users = [
    { id: TEST_COMMISH_ID, username: 'sim_commish', display_name: 'Sim Commish' },
    { id: TEST_OPPONENT_ID, username: 'sim_opponent', display_name: 'Sim Opponent' },
  ]
  for (const u of users) {
    if (DRY_RUN) { log('[dry] would upsert user', u.id); continue }
    const { error } = await supabase
      .from('users')
      .upsert({ ...u, total_points: 0 }, { onConflict: 'id' })
    if (error) {
      log('user upsert error (continuing):', error.message)
    }
  }
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
      commissioner_id: TEST_COMMISH_ID,
      visibility: 'closed',
      starts_at: new Date().toISOString(),
    }, { onConflict: 'id' })
  if (leagueErr) throw new Error(`Failed to create test league: ${leagueErr.message}`)

  // Members
  for (const uid of [TEST_COMMISH_ID, TEST_OPPONENT_ID]) {
    await supabase.from('league_members').upsert({
      league_id: TEST_LEAGUE_ID,
      user_id: uid,
      role: uid === TEST_COMMISH_ID ? 'commissioner' : 'member',
    }, { onConflict: 'league_id,user_id' })
  }

  // Fantasy settings — the critical bit: season=9999 so this league only
  // sees simulated stats and never touches real data.
  const { error: settingsErr } = await supabase
    .from('fantasy_settings')
    .upsert({
      league_id: TEST_LEAGUE_ID,
      format: 'traditional',
      scoring_format: 'half_ppr',
      num_teams: 2,
      season: SIM_SEASON,
      current_week: SIM_WEEK,
      draft_status: 'completed',
    }, { onConflict: 'league_id' })
  if (settingsErr) throw new Error(`Failed to set fantasy settings: ${settingsErr.message}`)
}

async function ensureRosters() {
  // Pull a fake roster from real player IDs that have stats in the source week
  const { data: starters } = await supabase
    .from('nfl_player_stats')
    .select('player_id, nfl_players!inner(position)')
    .eq('season', SOURCE_SEASON)
    .eq('week', SOURCE_WEEK)
    .limit(500)
  if (!starters?.length) throw new Error('No starters available from source week')

  const byPos = {}
  for (const s of starters) {
    const pos = s.nfl_players?.position
    if (!pos) continue
    if (!byPos[pos]) byPos[pos] = []
    byPos[pos].push(s.player_id)
  }

  // Two simple lineups: 2 RB, 2 WR, 1 TE, 1 QB, 1 K, 1 DEF each
  function buildLineup() {
    return [
      { slot: 'qb', player_id: byPos.QB?.shift() },
      { slot: 'rb1', player_id: byPos.RB?.shift() },
      { slot: 'rb2', player_id: byPos.RB?.shift() },
      { slot: 'wr1', player_id: byPos.WR?.shift() },
      { slot: 'wr2', player_id: byPos.WR?.shift() },
      { slot: 'te', player_id: byPos.TE?.shift() },
      { slot: 'k', player_id: byPos.K?.shift() },
      { slot: 'def', player_id: byPos.DEF?.shift() },
    ].filter((s) => s.player_id)
  }
  const commishLineup = buildLineup()
  const opponentLineup = buildLineup()

  if (DRY_RUN) {
    log('[dry] would set rosters:', { commishLineup, opponentLineup })
    return
  }
  // Wipe existing test league rosters first
  assertTestLeague(TEST_LEAGUE_ID)
  await supabase.from('fantasy_rosters').delete().eq('league_id', TEST_LEAGUE_ID)

  for (const slot of commishLineup) {
    await supabase.from('fantasy_rosters').insert({
      league_id: TEST_LEAGUE_ID,
      user_id: TEST_COMMISH_ID,
      ...slot,
      acquired_via: 'draft',
    })
  }
  for (const slot of opponentLineup) {
    await supabase.from('fantasy_rosters').insert({
      league_id: TEST_LEAGUE_ID,
      user_id: TEST_OPPONENT_ID,
      ...slot,
      acquired_via: 'draft',
    })
  }
  log(`Rosters set: ${commishLineup.length} starters per side`)
}

async function ensureMatchup() {
  if (DRY_RUN) { log('[dry] would create matchup'); return }
  assertTestLeague(TEST_LEAGUE_ID)
  await supabase.from('fantasy_matchups').delete().eq('league_id', TEST_LEAGUE_ID).eq('week', SIM_WEEK)
  await supabase.from('fantasy_matchups').insert({
    league_id: TEST_LEAGUE_ID,
    week: SIM_WEEK,
    home_user_id: TEST_COMMISH_ID,
    away_user_id: TEST_OPPONENT_ID,
    status: 'pending',
  })
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
        ? Math.round(v * fraction * 100) / 100
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
    .select('home_points, away_points, status')
    .eq('league_id', TEST_LEAGUE_ID)
    .eq('week', SIM_WEEK)
  if (!matchups?.length) { log(label, '— no matchup'); return }
  const m = matchups[0]
  log(`${label} — Commish ${m.home_points} vs Opponent ${m.away_points} (${m.status})`)
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
  await supabase.from('fantasy_matchups').delete().eq('league_id', TEST_LEAGUE_ID)
  await supabase.from('fantasy_rosters').delete().eq('league_id', TEST_LEAGUE_ID)
  // Leave league + settings + members so the matchup ID stays stable across runs
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
