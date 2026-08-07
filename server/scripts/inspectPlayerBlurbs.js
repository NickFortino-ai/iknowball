/**
 * Inspect all player_blurbs rows for a player, by name match.
 *
 * Usage:
 *   node server/scripts/inspectPlayerBlurbs.js "Justin Jefferson"
 *   node server/scripts/inspectPlayerBlurbs.js "jefferson" nfl
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

const query = process.argv[2]
const sportFilter = (process.argv[3] || '').toLowerCase() || null
if (!query) {
  console.error('Usage: node inspectPlayerBlurbs.js "<name>" [sport]')
  process.exit(1)
}

async function findPlayers() {
  const rows = []
  // NFL — Sleeper table
  const { data: nfl } = await supabase
    .from('nfl_players')
    .select('id, full_name, position, team')
    .ilike('full_name', `%${query}%`)
    .limit(20)
  for (const p of nfl || []) rows.push({ ...p, source: 'nfl_players', sport: 'nfl' })

  // NBA/MLB — dfs salaries
  for (const [tbl, sport] of [['nba_dfs_salaries', 'nba'], ['mlb_dfs_salaries', 'mlb']]) {
    const { data } = await supabase
      .from(tbl)
      .select('espn_player_id, player_name, team, position, game_date')
      .ilike('player_name', `%${query}%`)
      .order('game_date', { ascending: false })
      .limit(20)
    const seen = new Set()
    for (const r of data || []) {
      if (seen.has(r.espn_player_id)) continue
      seen.add(r.espn_player_id)
      rows.push({ id: r.espn_player_id, full_name: r.player_name, position: r.position, team: r.team, source: tbl, sport })
    }
  }
  return rows
}

async function main() {
  const players = await findPlayers()
  if (!players.length) {
    console.log(`No players matching "${query}"`)
    return
  }
  console.log(`\nMatched ${players.length} player row(s):`)
  for (const p of players) {
    console.log(`  [${p.sport}] id=${p.id}  ${p.full_name}  ${p.position || '?'}  ${p.team || '?'}  (${p.source})`)
  }

  const ids = [...new Set(players.map((p) => p.id))]
  let q = supabase
    .from('player_blurbs')
    .select('id, player_id, sport, status, generated_by, week, season, published_at, created_at, updated_at, written_by, content')
    .in('player_id', ids)
    .order('created_at', { ascending: false })
  if (sportFilter) q = q.eq('sport', sportFilter)
  const { data: blurbs, error } = await q
  if (error) {
    console.error('Blurb query failed:', error.message)
    return
  }

  if (!blurbs?.length) {
    console.log(`\nNo blurbs found for these player_ids (sport=${sportFilter || 'any'}).`)
    return
  }

  const authorIds = [...new Set(blurbs.map((b) => b.written_by).filter(Boolean))]
  const authorMap = {}
  if (authorIds.length) {
    const { data: authors } = await supabase
      .from('users')
      .select('id, username, display_name')
      .in('id', authorIds)
    for (const a of authors || []) authorMap[a.id] = a
  }

  console.log(`\nFound ${blurbs.length} blurb row(s):\n`)
  for (const b of blurbs) {
    const author = b.written_by ? (authorMap[b.written_by]?.username || b.written_by) : '—'
    const preview = (b.content || '').replace(/\s+/g, ' ').slice(0, 100)
    console.log(
      `  ${b.status.padEnd(10)}  sport=${b.sport}  pid=${b.player_id}\n` +
      `    src=${b.generated_by}  by=${author}  week=${b.week ?? '-'}  season=${b.season ?? '-'}\n` +
      `    created=${b.created_at}  published=${b.published_at || '-'}  updated=${b.updated_at}\n` +
      `    id=${b.id}\n` +
      `    "${preview}${b.content?.length > 100 ? '…' : ''}"\n`
    )
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
