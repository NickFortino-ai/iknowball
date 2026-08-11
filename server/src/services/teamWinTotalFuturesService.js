// Auto-resolves futures_markets whose resolution_type is
// 'team_win_total'. NFL v1.
//
// Market shape:
//   team_key: full team name (matches teamRecordsService lookup),
//     e.g. "Buffalo Bills"
//   line:     the O/U line (e.g. 10.5)
//   outcomes: exactly two — { name: 'Over', odds } / { name: 'Under', odds }
//
// Resolver: fetch the team's regular-season wins from the ESPN-fed
// standings cache (already scoped to seasontype=2, so preseason is
// ignored) and settle:
//   wins > line  → 'Over'
//   wins < line  → 'Under'
//   wins == line → push (settle with the exact-numeric outcome name
//                  — settleFuturesMarket will just mark everyone
//                  as incorrect since no outcome matches. Prefer
//                  half-point lines to avoid this.)

import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { getTeamRecords, lookupRecord } from './teamRecordsService.js'
import { settleFuturesMarket } from './futuresService.js'

const SPORT_KEY_TO_STANDINGS = {
  americanfootball_nfl: 'americanfootball_nfl',
  // MLB/NBA/WNBA use the same standings cache keys — enabling those
  // sports here is a one-line change once we're comfortable with the
  // resolver.
}

export async function resolveTeamWinTotalFuture(marketId) {
  const { data: market, error } = await supabase
    .from('futures_markets')
    .select('id, sport_key, status, resolution_type, team_key, line, outcomes')
    .eq('id', marketId)
    .single()
  if (error || !market) throw new Error(`Market ${marketId} not found`)

  if (market.resolution_type !== 'team_win_total') {
    throw new Error(`Market ${marketId} is not a team_win_total market (resolution_type=${market.resolution_type})`)
  }
  if (market.status === 'settled') throw new Error(`Market ${marketId} is already settled`)
  if (!market.team_key) throw new Error(`Market ${marketId} has no team_key`)
  if (market.line == null) throw new Error(`Market ${marketId} has no line`)

  const standingsKey = SPORT_KEY_TO_STANDINGS[market.sport_key]
  if (!standingsKey) throw new Error(`sport_key ${market.sport_key} not supported for team_win_total resolution`)

  // Warm the cache then look up the team's record.
  await getTeamRecords(standingsKey)
  const rec = lookupRecord(standingsKey, market.team_key)
  if (!rec) throw new Error(`No standings record for team '${market.team_key}' in ${standingsKey}`)

  const wins = Number(rec.w) || 0
  const line = Number(market.line)
  let winner
  if (wins > line) winner = 'Over'
  else if (wins < line) winner = 'Under'
  else winner = null // exact-integer push — should be rare with .5 lines

  logger.info(
    { marketId, team: market.team_key, wins, line, winner },
    'Resolving team_win_total future',
  )

  if (winner === null) {
    // Push — no matching outcome; call settle with a sentinel so all
    // picks mark incorrect (fair for a push, no points move either way
    // if odds were even). Admin can override manually if they'd rather
    // refund pushes explicitly later.
    return settleFuturesMarket(marketId, '__PUSH__')
  }
  return settleFuturesMarket(marketId, winner)
}

// Auto-resolve any team_win_total markets past close_at.
export async function autoResolveDueTeamWinTotalFutures() {
  const nowIso = new Date().toISOString()
  const { data: due, error } = await supabase
    .from('futures_markets')
    .select('id, title')
    .eq('resolution_type', 'team_win_total')
    .in('status', ['active', 'closed'])
    .not('close_at', 'is', null)
    .lte('close_at', nowIso)

  if (error) {
    logger.error({ error }, 'auto-resolve team_win_total query failed')
    return { resolved: 0, failed: 0 }
  }
  if (!due?.length) return { resolved: 0, failed: 0 }

  let resolved = 0
  let failed = 0
  for (const m of due) {
    try {
      await resolveTeamWinTotalFuture(m.id)
      resolved++
    } catch (err) {
      failed++
      logger.error({ err: err.message, marketId: m.id, title: m.title }, 'team_win_total auto-resolve failed')
    }
  }
  logger.info({ resolved, failed, total: due.length }, 'team_win_total auto-resolve batch done')
  return { resolved, failed }
}

// Canonical NFL team list for the admin dropdown — full names to match
// how teamRecordsService keys standings.
export const NFL_TEAMS = [
  'Arizona Cardinals', 'Atlanta Falcons', 'Baltimore Ravens', 'Buffalo Bills',
  'Carolina Panthers', 'Chicago Bears', 'Cincinnati Bengals', 'Cleveland Browns',
  'Dallas Cowboys', 'Denver Broncos', 'Detroit Lions', 'Green Bay Packers',
  'Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars', 'Kansas City Chiefs',
  'Las Vegas Raiders', 'Los Angeles Chargers', 'Los Angeles Rams', 'Miami Dolphins',
  'Minnesota Vikings', 'New England Patriots', 'New Orleans Saints', 'New York Giants',
  'New York Jets', 'Philadelphia Eagles', 'Pittsburgh Steelers', 'San Francisco 49ers',
  'Seattle Seahawks', 'Tampa Bay Buccaneers', 'Tennessee Titans', 'Washington Commanders',
]
