import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { buildPlayerIndex, resolvePlayer } from '../utils/playerResolver.js'
import { settleProps } from '../services/propService.js'

// Maps market_key → fn pulling actual value from an mlb_dfs_player_stats row.
const MARKET_STAT_MAP = {
  batter_hits: (s) => s.hits ?? 0,
  batter_home_runs: (s) => s.home_runs ?? 0,
  batter_runs: (s) => s.runs ?? 0,
  batter_rbis: (s) => s.rbis ?? 0,
  batter_total_bases: (s) => s.total_bases ?? 0,
  batter_stolen_bases: (s) => s.stolen_bases ?? 0,
  batter_walks: (s) => s.walks ?? 0,
  batter_strikeouts: (s) => s.strikeouts ?? 0,
  batter_doubles: (s) => s.doubles ?? 0,
  batter_triples: (s) => s.triples ?? 0,
  pitcher_strikeouts: (s) => s.strikeouts ?? 0,
  pitcher_walks: (s) => s.walks ?? 0,
  pitcher_hits_allowed: (s) => s.hits_allowed ?? 0,
  pitcher_earned_runs: (s) => s.earned_runs ?? 0,
}

// Name matching moved to the shared resolver. The local normalizer lowercased
// BEFORE stripping non-letters, so an accent was treated as punctuation and
// deleted: "Jasson Domínguez" became "jasson domnguez". The stats feed writes
// plain ASCII ("Jasson Dominguez"), so the two sides could never meet — and
// this job pushes on a miss, so 110 props for accented players were returned
// as pushes instead of being graded.
//
// The resolver folds accents FIRST, which is the whole point of it.

// Auto-settle MLB player props using mlb_dfs_player_stats. Mirrors
// settleNBAProps. Stats are populated daily by scoreMLBDFS.js (MLB
// Stats API + ESPN fallback).
export async function settleMLBProps() {
  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', 'baseball_mlb')
    .single()
  if (!sport) return

  const { data: props } = await supabase
    .from('player_props')
    .select('id, player_name, market_key, line, game_id, games!inner(id, status, starts_at)')
    .eq('sport_id', sport.id)
    .in('status', ['locked', 'published'])
    .eq('games.status', 'final')
    .limit(500)

  if (!props?.length) return

  // Stats are keyed by ET game_date — the MLB DFS sync writes ET dates
  // to avoid the UTC-rollover bug where 8pm CT first pitch becomes
  // tomorrow's UTC date and misses the lookup.
  const gameDates = new Set()
  for (const p of props) {
    const date = new Date(p.games.starts_at).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    gameDates.add(date)
  }

  const allStats = []
  for (const date of gameDates) {
    const { data: stats } = await supabase
      .from('mlb_dfs_player_stats')
      .select('*')
      .eq('game_date', date)
    if (stats?.length) allStats.push(...stats)
  }

  if (!allStats.length) {
    logger.warn({ dates: [...gameDates], propCount: props.length }, 'No MLB stats found for prop dates')
    return
  }

  // Index by (normalized name, is_pitcher). Two-way players (Ohtani)
  // produce two stat rows per game — one batter, one pitcher — and a
  // pitcher_strikeouts prop needs the pitcher row while batter_strikeouts
  // needs the batter row. The `strikeouts` column means different things
  // depending on role, so we can't just merge.
  // Role plays the part `team` plays elsewhere: it's the disambiguator for
  // two rows that share a name. Ohtani produces a batter row and a pitcher
  // row, and `strikeouts` means opposite things across them.
  const statsIndex = buildPlayerIndex(allStats, {
    getName: (s) => s.player_name,
    getTeam: (s) => (s.is_pitcher ? 'P' : 'B'),
  })

  const settlements = []
  for (const prop of props) {
    const wantsPitcher = prop.market_key?.startsWith('pitcher_')
    const role = wantsPitcher ? 'P' : 'B'
    let stats = resolvePlayer(statsIndex, { name: prop.player_name, team: role })
    // Fall back to the opposite role only if no exact-role row exists —
    // covers legacy stat rows from before the two-way split. Asked
    // explicitly rather than by name alone, because a two-way player has two
    // rows and the resolver correctly refuses an ambiguous name-only lookup.
    if (!stats) {
      stats = resolvePlayer(statsIndex, { name: prop.player_name, team: wantsPitcher ? 'B' : 'P' })
    }
    if (!stats) {
      logger.info({ propId: prop.id, player: prop.player_name }, 'MLB player not in stats — settling as push')
      settlements.push({ propId: prop.id, outcome: 'push', actualValue: null })
      continue
    }
    const calc = MARKET_STAT_MAP[prop.market_key]
    if (!calc) {
      logger.warn({ propId: prop.id, marketKey: prop.market_key }, 'Unmapped MLB market — leaving prop locked')
      continue
    }
    const actualValue = calc(stats)
    let outcome
    if (actualValue > prop.line) outcome = 'over'
    else if (actualValue < prop.line) outcome = 'under'
    else outcome = 'push'
    settlements.push({ propId: prop.id, outcome, actualValue })
  }

  if (settlements.length) {
    await settleProps(settlements)
    logger.info({ count: settlements.length }, 'MLB props auto-settled')
  }
}
