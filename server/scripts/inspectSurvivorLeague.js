/**
 * One-off: inspect the I WILL SURVIVE league's data.
 *   - League row (id, status, starts_at)
 *   - All league_weeks (id, week_number, starts_at, ends_at, processed)
 *   - All members + alive status + pick count
 *   - Every survivor_pick across all users with status/team/week
 *
 * Use to diagnose why picks aren't showing in standings.
 *
 * Usage: node server/scripts/inspectSurvivorLeague.js
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

async function main() {
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, format, sport, status, starts_at')
    .eq('name', LEAGUE_NAME)
    .eq('format', 'survivor')
  if (!leagues?.length) { console.log('NO LEAGUE NAMED', LEAGUE_NAME); return }
  const league = leagues[0]
  console.log('LEAGUE:', league)

  const { data: weeks } = await supabase
    .from('league_weeks')
    .select('id, week_number, starts_at, ends_at, missed_picks_processed')
    .eq('league_id', league.id)
    .order('week_number', { ascending: true })
  console.log(`\nLEAGUE_WEEKS (${weeks?.length || 0}):`)
  for (const w of weeks || []) console.log(' ', w)

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, is_alive, lives_remaining, eliminated_week, joined_at, users(username)')
    .eq('league_id', league.id)
  console.log(`\nMEMBERS (${members?.length || 0}):`)
  for (const m of members || []) {
    console.log(`  ${m.users?.username?.padEnd(15)} alive=${m.is_alive} lives=${m.lives_remaining} elim_wk=${m.eliminated_week ?? '-'}`)
  }

  const { data: picks } = await supabase
    .from('survivor_picks')
    .select('id, user_id, league_week_id, game_id, team_name, picked_team, status, created_at, updated_at, users(username), league_weeks(week_number), games(home_team, away_team, starts_at, status, winner)')
    .eq('league_id', league.id)
    .order('updated_at', { ascending: true })
  console.log(`\nSURVIVOR_PICKS (${picks?.length || 0}):`)
  for (const p of picks || []) {
    const wk = p.league_weeks?.week_number
    const game = p.games ? `${p.games.away_team}@${p.games.home_team} [game.status=${p.games.status}, winner=${p.games.winner ?? '-'}]` : 'no game'
    console.log(`  ${p.users?.username?.padEnd(15)} Day${wk} status=${p.status.padEnd(10)} team=${p.team_name?.padEnd(25)} ${game}`)
  }

  // Highlight the 4 users
  console.log('\nTARGET USERS:')
  for (const username of ['siddkid', 'dmoney140', 'ustabadger', 'ballsohard']) {
    const u = (members || []).find((m) => m.users?.username === username)
    if (!u) { console.log(`  ${username.padEnd(15)} NOT IN LEAGUE`); continue }
    const userPicks = (picks || []).filter((p) => p.user_id === u.user_id)
    console.log(`  ${username.padEnd(15)} member=yes alive=${u.is_alive} picks=${userPicks.length}`)
    for (const p of userPicks) console.log(`     - Day${p.league_weeks?.week_number} status=${p.status} team=${p.team_name}`)
  }
}

main().catch((err) => { console.error(err.message); process.exit(1) })
