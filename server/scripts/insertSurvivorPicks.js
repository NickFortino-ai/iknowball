/**
 * One-off: insert Day 1 Dodgers survivor picks for 4 users in "I WILL SURVIVE"
 * who couldn't submit during the period when the league was broken.
 *
 * Inserts with status='pending'. lockPicks → scoreSurvivorPicks will resolve
 * to 'survived' or 'eliminated' naturally when today's LAD @ LAA finishes.
 *
 * Usage:
 *   node server/scripts/insertSurvivorPicks.js [--dry-run] [--commit]
 *
 * Defaults to dry-run (preview only). Pass --commit to write.
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

const LEAGUE_NAME = 'I WILL SURVIVE'
const USERNAMES = ['siddkic', 'dmoney140', 'ustabadger', 'ballsohard']
const TARGET_TEAM = 'Los Angeles Dodgers'

const DRY_RUN = !process.argv.includes('--commit')

function log(...args) { console.log('[insertSurvivorPicks]', ...args) }

async function main() {
  log('mode:', DRY_RUN ? 'DRY RUN (pass --commit to write)' : 'COMMIT')

  // 1. League
  const { data: leagues, error: leagueErr } = await supabase
    .from('leagues')
    .select('id, name, format, sport, starts_at, status')
    .eq('name', LEAGUE_NAME)
    .eq('format', 'survivor')
  if (leagueErr) throw leagueErr
  if (!leagues?.length) throw new Error(`No survivor league named "${LEAGUE_NAME}"`)
  if (leagues.length > 1) throw new Error(`${leagues.length} leagues named "${LEAGUE_NAME}" — disambiguate by id first`)
  const league = leagues[0]
  log('league:', league.id, league.name, `(sport=${league.sport}, status=${league.status})`)

  // 2. Users
  const { data: users, error: userErr } = await supabase
    .from('users')
    .select('id, username')
    .in('username', USERNAMES)
  if (userErr) throw userErr
  const usersByName = Object.fromEntries((users || []).map((u) => [u.username, u]))
  const missing = USERNAMES.filter((n) => !usersByName[n])
  if (missing.length) throw new Error(`Missing users: ${missing.join(', ')}`)
  log('users:', USERNAMES.map((n) => `${n}=${usersByName[n].id}`).join(' '))

  // 3. Members — must already be in the league
  const userIds = USERNAMES.map((n) => usersByName[n].id)
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, lives_remaining')
    .eq('league_id', league.id)
    .in('user_id', userIds)
  const memberSet = new Set((members || []).map((m) => m.user_id))
  const nonMembers = userIds.filter((id) => !memberSet.has(id))
  if (nonMembers.length) {
    const names = nonMembers.map((id) => Object.entries(usersByName).find(([_, u]) => u.id === id)?.[0])
    throw new Error(`Not league members: ${names.join(', ')}`)
  }

  // 4. Current period — the league_week containing now (or first upcoming)
  const nowIso = new Date().toISOString()
  const { data: weeks } = await supabase
    .from('league_weeks')
    .select('id, week_number, starts_at, ends_at')
    .eq('league_id', league.id)
    .order('starts_at', { ascending: true })
  if (!weeks?.length) throw new Error('No league_weeks found for league')
  const currentWeek = weeks.find((w) => w.starts_at <= nowIso && w.ends_at >= nowIso)
    || weeks.find((w) => w.starts_at > nowIso)
  if (!currentWeek) throw new Error('No current/upcoming period found')
  log('period:', `Day ${currentWeek.week_number}`, `${currentWeek.starts_at} → ${currentWeek.ends_at}`)

  // 5. Find LAD game in this period
  const { data: sport } = await supabase
    .from('sports').select('id').eq('key', 'baseball_mlb').single()
  if (!sport) throw new Error('baseball_mlb sport not found')

  const { data: games } = await supabase
    .from('games')
    .select('id, home_team, away_team, starts_at, status')
    .eq('sport_id', sport.id)
    .gte('starts_at', currentWeek.starts_at)
    .lte('starts_at', currentWeek.ends_at)
    .or(`home_team.eq.${TARGET_TEAM},away_team.eq.${TARGET_TEAM}`)
  if (!games?.length) throw new Error(`No ${TARGET_TEAM} game in current period`)
  if (games.length > 1) throw new Error(`Multiple ${TARGET_TEAM} games in period — ambiguous`)
  const game = games[0]
  const pickedTeam = game.home_team === TARGET_TEAM ? 'home' : 'away'
  log('game:', game.id, `${game.away_team} @ ${game.home_team}`, `(starts_at=${game.starts_at}, status=${game.status})`)
  log('picked_team:', pickedTeam, `(${TARGET_TEAM})`)

  // 6. Already-picked check — don't overwrite existing rows
  const { data: existing } = await supabase
    .from('survivor_picks')
    .select('user_id, team_name, status')
    .eq('league_id', league.id)
    .eq('league_week_id', currentWeek.id)
    .in('user_id', userIds)
  const existingByUser = Object.fromEntries((existing || []).map((p) => [p.user_id, p]))
  for (const username of USERNAMES) {
    const uid = usersByName[username].id
    const e = existingByUser[uid]
    if (e) log(`SKIP ${username}: already has pick (${e.team_name}, status=${e.status})`)
  }
  const toInsert = USERNAMES.filter((n) => !existingByUser[usersByName[n].id])
  if (!toInsert.length) { log('nothing to insert.'); return }

  // 7. Insert
  const rows = toInsert.map((username) => ({
    league_id: league.id,
    user_id: usersByName[username].id,
    league_week_id: currentWeek.id,
    game_id: game.id,
    picked_team: pickedTeam,
    team_name: TARGET_TEAM,
    status: 'pending',
    updated_at: new Date().toISOString(),
  }))

  log('will insert:')
  for (const r of rows) {
    const name = USERNAMES.find((n) => usersByName[n].id === r.user_id)
    log(`  - ${name}: ${TARGET_TEAM} for Day ${currentWeek.week_number} (status=pending)`)
  }

  if (DRY_RUN) {
    log('DRY RUN — no writes performed. Re-run with --commit to insert.')
    return
  }

  const { data: inserted, error: insErr } = await supabase
    .from('survivor_picks')
    .insert(rows)
    .select()
  if (insErr) throw insErr
  log(`inserted ${inserted.length} picks ✓`)
  log('next: lockPicks cron (1 min cadence) flips pending → locked when the game kicks off,')
  log('      then scoreSurvivorPicks settles to survived/eliminated when it finalizes.')
}

main().catch((err) => {
  console.error('[insertSurvivorPicks] FAILED:', err.message)
  process.exit(1)
})
