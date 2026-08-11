// Auto-resolves futures_markets whose resolution_type is
// 'player_stat_over_under'. NFL v1.
//
// Market shape:
//   player_id:     Sleeper player_id (from nfl_players.id)
//   stat_category: same slugs as stat-leader markets (see
//                  NFL_STAT_CATEGORIES in statLeaderFuturesService)
//   line:          the O/U line (e.g. 4250.5 for pass yards)
//   outcomes:      exactly two — { name: 'Over', odds } / { name: 'Under', odds }
//
// Guard: only settles once the player's TEAM has played its full 17-
// game regular season (from the same ESPN standings cache we use for
// team-win-total). This is intentionally NOT gated on the player's
// individual games played — if a QB tears his ACL Week 8, the Under
// side should win fairly once the team's 17 are done rather than
// waiting forever for the injured player to accumulate games.

import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { getTeamRecords, lookupRecord } from './teamRecordsService.js'
import { settleFuturesMarket } from './futuresService.js'
import { NFL_STAT_CATEGORIES, sumSeasonStats } from './statLeaderFuturesService.js'

const MIN_TEAM_GAMES_BY_SPORT = {
  americanfootball_nfl: 17,
}

// nfl_players.team is the two/three-letter abbreviation (KC, BUF).
// The standings lookup key is the full display name (Kansas City
// Chiefs). This map bridges them for the games-played guard.
const NFL_TEAM_ABBR_TO_FULL = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs',
  LV: 'Las Vegas Raiders', LAC: 'Los Angeles Chargers', LAR: 'Los Angeles Rams', MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
  NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SF: 'San Francisco 49ers',
  SEA: 'Seattle Seahawks', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans', WAS: 'Washington Commanders',
}

export async function resolvePlayerStatOverUnderFuture(marketId, { season } = {}) {
  const { data: market, error } = await supabase
    .from('futures_markets')
    .select('id, sport_key, status, resolution_type, player_id, stat_category, line, outcomes')
    .eq('id', marketId)
    .single()
  if (error || !market) throw new Error(`Market ${marketId} not found`)

  if (market.resolution_type !== 'player_stat_over_under') {
    throw new Error(`Market ${marketId} is not a player_stat_over_under market (resolution_type=${market.resolution_type})`)
  }
  if (market.status === 'settled') throw new Error(`Market ${marketId} is already settled`)
  if (!market.player_id) throw new Error(`Market ${marketId} has no player_id`)
  if (!market.stat_category) throw new Error(`Market ${marketId} has no stat_category`)
  if (market.line == null) throw new Error(`Market ${marketId} has no line`)

  const cfg = NFL_STAT_CATEGORIES[market.stat_category]
  if (!cfg) throw new Error(`Unknown stat_category '${market.stat_category}'`)

  // Team guard — settle only when the player's TEAM has played its
  // full regular season. Not gated on player games played so injury-
  // shortened seasons still resolve fairly.
  const { data: player, error: playerErr } = await supabase
    .from('nfl_players')
    .select('id, full_name, team')
    .eq('id', market.player_id)
    .maybeSingle()
  if (playerErr || !player) throw new Error(`Player ${market.player_id} not found in nfl_players`)

  const teamAbbr = player.team || ''
  const teamFullName = NFL_TEAM_ABBR_TO_FULL[teamAbbr]
  if (!teamFullName) {
    throw new Error(`Player ${player.full_name} has no recognizable team (team='${teamAbbr}') — can't check games-played guard`)
  }
  await getTeamRecords('americanfootball_nfl')
  const rec = lookupRecord('americanfootball_nfl', teamFullName)
  if (!rec) throw new Error(`No standings record for team '${teamFullName}'`)
  const teamGames = (Number(rec.w) || 0) + (Number(rec.l) || 0) + (Number(rec.t) || 0)
  const minGames = MIN_TEAM_GAMES_BY_SPORT[market.sport_key] || 17
  if (teamGames < minGames) {
    throw new Error(
      `${teamFullName} has played ${teamGames}/${minGames} games — refusing to resolve player O/U until the team's regular season is complete`,
    )
  }

  // Sum the player's season total for the requested stat.
  const activeSeason = season || new Date().getFullYear()
  const totals = await sumSeasonStats([market.player_id], activeSeason, cfg.columns)
  const total = totals.get(market.player_id) ?? 0
  const line = Number(market.line)
  let winner
  if (total > line) winner = 'Over'
  else if (total < line) winner = 'Under'
  else winner = null

  logger.info(
    {
      marketId,
      player: player.full_name,
      stat: market.stat_category,
      total,
      line,
      winner,
    },
    'Resolving player_stat_over_under future',
  )

  if (winner === null) return settleFuturesMarket(marketId, '__PUSH__')
  return settleFuturesMarket(marketId, winner)
}

export async function autoResolveDuePlayerStatOverUnderFutures() {
  const nowIso = new Date().toISOString()
  const { data: due, error } = await supabase
    .from('futures_markets')
    .select('id, title')
    .eq('resolution_type', 'player_stat_over_under')
    .in('status', ['active', 'closed'])
    .not('close_at', 'is', null)
    .lte('close_at', nowIso)

  if (error) {
    logger.error({ error }, 'auto-resolve player_stat_over_under query failed')
    return { resolved: 0, failed: 0 }
  }
  if (!due?.length) return { resolved: 0, failed: 0 }

  let resolved = 0, failed = 0
  for (const m of due) {
    try {
      await resolvePlayerStatOverUnderFuture(m.id)
      resolved++
    } catch (err) {
      failed++
      logger.error({ err: err.message, marketId: m.id, title: m.title }, 'player_stat_over_under auto-resolve failed')
    }
  }
  logger.info({ resolved, failed, total: due.length }, 'player_stat_over_under auto-resolve batch done')
  return { resolved, failed }
}
