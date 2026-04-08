import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { fetchPlayerProps } from './oddsService.js'
import { getMarketLabel } from '../utils/propMarkets.js'
import { calculateRiskPoints, calculateRewardPoints } from '../utils/scoring.js'
import { checkRecordAfterSettle } from './recordService.js'

export async function syncPropsForGame(gameId, markets) {
  // Get game details
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, external_id, sport_id, sports(key)')
    .eq('id', gameId)
    .single()

  if (gameError || !game) {
    const err = new Error('Game not found')
    err.status = 404
    throw err
  }

  const sportKey = game.sports.key
  const eventId = game.external_id

  // Fetch props from Odds API
  let apiData
  try {
    apiData = await fetchPlayerProps(sportKey, eventId, markets)
  } catch (err) {
    logger.warn({ err, sportKey, eventId }, 'No player props available from API')
    return { synced: 0 }
  }

  if (!apiData?.bookmakers?.length) {
    logger.info({ sportKey, eventId, hasData: !!apiData, keys: apiData ? Object.keys(apiData) : [] }, 'No bookmakers in props response')
    return { synced: 0 }
  }

  // Prefer bookmaker with both Over and Under; fall back to merging across bookmakers
  const rows = []

  // First pass: find a bookmaker with both sides
  let primaryBookmaker = apiData.bookmakers[0]
  for (const bm of apiData.bookmakers) {
    const sides = new Set()
    for (const mkt of bm.markets || []) {
      for (const o of mkt.outcomes || []) sides.add(o.name?.toLowerCase())
    }
    if (sides.has('over') && sides.has('under')) {
      primaryBookmaker = bm
      break
    }
  }

  // Parse primary bookmaker
  for (const market of primaryBookmaker.markets || []) {
    for (const outcome of market.outcomes || []) {
      if (!outcome.point && outcome.point !== 0) continue

      const playerName = outcome.description || outcome.name
      const line = outcome.point
      const side = outcome.name?.toLowerCase()

      let row = rows.find(
        (r) => r.player_name === playerName && r.market_key === market.key && r.line === line
      )

      if (!row) {
        row = {
          game_id: gameId,
          sport_id: game.sport_id,
          player_name: playerName,
          market_key: market.key,
          market_label: getMarketLabel(market.key),
          line,
          over_odds: null,
          under_odds: null,
          bookmaker: primaryBookmaker.key,
          external_event_id: eventId,
        }
        rows.push(row)
      }

      if (side === 'over') {
        row.over_odds = outcome.price
      } else if (side === 'under') {
        row.under_odds = outcome.price
      }
    }
  }

  if (!rows.length) {
    return { synced: 0 }
  }

  // Upsert props — omit status so existing published/locked props keep their status
  for (const row of rows) {
    const { error } = await supabase
      .from('player_props')
      .upsert(row, { onConflict: 'game_id,player_name,market_key,line' })

    if (error) {
      logger.error({ error, row }, 'Failed to upsert prop')
    }
  }

  logger.info({ gameId, synced: rows.length }, 'Props synced for game')
  return { synced: rows.length }
}

export async function getAllPropsForGame(gameId) {
  const { data, error } = await supabase
    .from('player_props')
    .select('*')
    .eq('game_id', gameId)
    .order('player_name')
    .order('market_key')

  if (error) throw error
  return data || []
}

export async function featureProp(propId, featuredDate, headshot = null) {
  const updateData = {
    status: 'published',
    featured_date: featuredDate,
    updated_at: new Date().toISOString(),
  }
  if (headshot) updateData.player_headshot_url = headshot

  const { data, error } = await supabase
    .from('player_props')
    .update(updateData)
    .eq('id', propId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function unfeatureProp(propId) {
  // Check for existing picks
  const { count } = await supabase
    .from('prop_picks')
    .select('id', { count: 'exact', head: true })
    .eq('prop_id', propId)

  if (count > 0) {
    const err = new Error('Cannot unfeature prop with existing picks')
    err.status = 400
    throw err
  }

  const { data, error } = await supabase
    .from('player_props')
    .update({
      status: 'synced',
      featured_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', propId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getFeaturedProps(date, { fallback = false } = {}) {
  const { data, error } = await supabase
    .from('player_props')
    .select('*, games(id, home_team, away_team, starts_at, status, sports(key, name))')
    .eq('featured_date', date)
    .in('status', ['published', 'locked', 'settled'])

  if (error) throw error

  const props = data || []

  // If fallback enabled and all today's props are settled or none exist, return next upcoming
  const hasActive = props.some((p) => p.status !== 'settled')
  if (fallback && !hasActive) {
    const { data: nextProps, error: nextError } = await supabase
      .from('player_props')
      .select('*, games(id, home_team, away_team, starts_at, status, sports(key, name))')
      .gt('featured_date', date)
      .in('status', ['published', 'locked'])
      .order('featured_date', { ascending: true })
      .limit(5)

    if (nextError) throw nextError

    if (nextProps?.length) {
      const nextDate = nextProps[0].featured_date
      return nextProps.filter((p) => p.featured_date === nextDate)
    }
    return []
  }

  return props
}

export async function getAllFeaturedProps() {
  const { data, error } = await supabase
    .from('player_props')
    .select('*, games(id, home_team, away_team, starts_at, status, sports(key, name))')
    .not('featured_date', 'is', null)
    .order('featured_date', { ascending: true })

  if (error) throw error
  return data || []
}

export async function settleProps(settlements) {
  const results = []

  for (const { propId, outcome, actualValue } of settlements) {
    const updates = {
      status: 'settled',
      outcome,
      updated_at: new Date().toISOString(),
    }
    if (actualValue !== undefined && actualValue !== null) {
      updates.actual_value = actualValue
    }

    const { data: prop, error: propError } = await supabase
      .from('player_props')
      .update(updates)
      .eq('id', propId)
      .in('status', ['locked', 'published'])
      .select()
      .single()

    if (propError) {
      logger.error({ propError, propId }, 'Failed to settle prop')
      continue
    }

    // Score all locked prop_picks for this prop
    const { data: picks, error: picksError } = await supabase
      .from('prop_picks')
      .select('*')
      .eq('prop_id', propId)
      .eq('status', 'locked')

    if (picksError) {
      logger.error({ picksError, propId }, 'Failed to fetch prop picks for scoring')
      continue
    }

    if (!picks?.length) {
      results.push({ propId, scored: 0 })
      continue
    }

    for (const pick of picks) {
      let isCorrect = null
      let pointsEarned = 0

      if (outcome === 'push') {
        isCorrect = null
        pointsEarned = 0
      } else if (pick.picked_side === outcome) {
        isCorrect = true
        pointsEarned = pick.reward_points || 0
      } else {
        isCorrect = false
        pointsEarned = -(pick.risk_points || 0)
      }

      const { error: pickError } = await supabase
        .from('prop_picks')
        .update({
          status: 'settled',
          is_correct: isCorrect,
          points_earned: pointsEarned,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pick.id)

      if (pickError) {
        logger.error({ pickError, pickId: pick.id }, 'Failed to settle prop pick')
        continue
      }

      if (pointsEarned !== 0) {
        const { error: pointsError } = await supabase
          .rpc('increment_user_points', {
            user_row_id: pick.user_id,
            points_delta: pointsEarned,
          })

        if (pointsError) {
          logger.error({ pointsError, userId: pick.user_id }, 'Failed to update user points for prop')
        }
      }

      if (isCorrect !== null) {
        const { error: statsError } = await supabase
          .rpc('update_sport_stats', {
            p_user_id: pick.user_id,
            p_sport_id: prop.sport_id,
            p_is_correct: isCorrect,
            p_points: pointsEarned,
          })

        if (statsError) {
          logger.error({ statsError, userId: pick.user_id }, 'Failed to update sport stats for prop')
        }
      }

      // Check records after prop pick settles
      if (isCorrect !== null) {
        try {
          await checkRecordAfterSettle(pick.user_id, 'prop', { isCorrect })
        } catch (err) {
          logger.error({ err, userId: pick.user_id }, 'Record check after prop settle failed')
        }
      }
    }

    results.push({ propId, scored: picks.length })
    logger.info({ propId, scored: picks.length, outcome }, 'Prop picks scored')
  }

  return results
}

export async function submitPropPick(userId, propId, pickedSide) {
  const { data: prop, error: propError } = await supabase
    .from('player_props')
    .select('id, status, game_id, over_odds, under_odds, games(starts_at, status)')
    .eq('id', propId)
    .single()

  if (propError || !prop) {
    const err = new Error('Prop not found')
    err.status = 404
    throw err
  }

  if (prop.status !== 'published') {
    const err = new Error('This prop is not available for picking')
    err.status = 400
    throw err
  }

  if (prop.games.status !== 'upcoming' || new Date(prop.games.starts_at) <= new Date()) {
    const err = new Error('Game has already started — props are locked')
    err.status = 400
    throw err
  }

  // Snapshot odds at submission time
  const odds = pickedSide === 'over' ? prop.over_odds : prop.under_odds
  const oddsAtSubmission = odds || null
  const riskAtSubmission = odds ? calculateRiskPoints(odds) : null
  const rewardAtSubmission = odds ? calculateRewardPoints(odds) : null

  const { data, error } = await supabase
    .from('prop_picks')
    .upsert(
      {
        user_id: userId,
        prop_id: propId,
        picked_side: pickedSide,
        status: 'pending',
        updated_at: new Date().toISOString(),
        odds_at_submission: oddsAtSubmission,
        risk_at_submission: riskAtSubmission,
        reward_at_submission: rewardAtSubmission,
      },
      { onConflict: 'user_id,prop_id' }
    )
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to submit prop pick')
    throw error
  }

  return data
}

export async function deletePropPick(userId, propId) {
  const { data: pick } = await supabase
    .from('prop_picks')
    .select('id, status')
    .eq('user_id', userId)
    .eq('prop_id', propId)
    .single()

  if (!pick) {
    const err = new Error('Prop pick not found')
    err.status = 404
    throw err
  }

  if (pick.status !== 'pending') {
    const err = new Error('Cannot undo a locked or settled prop pick')
    err.status = 400
    throw err
  }

  const { error } = await supabase
    .from('prop_picks')
    .delete()
    .eq('id', pick.id)

  if (error) {
    logger.error({ error }, 'Failed to delete prop pick')
    throw error
  }
}

export async function getPropPickById(propPickId) {
  const { data, error } = await supabase
    .from('prop_picks')
    .select('*, player_props(*, games(id, home_team, away_team, starts_at, status, sports(key, name)))')
    .eq('id', propPickId)
    .single()

  if (error || !data) {
    const err = new Error('Prop pick not found')
    err.status = 404
    throw err
  }

  return data
}

function mapNbaStatToMarket(stats, marketKey) {
  const STAT_MAP = {
    player_points: stats.points,
    player_rebounds: stats.rebounds,
    player_assists: stats.assists,
    player_steals: stats.steals,
    player_blocks: stats.blocks,
    player_threes: stats.three_pointers_made,
    player_points_rebounds_assists: (stats.points || 0) + (stats.rebounds || 0) + (stats.assists || 0),
    player_points_rebounds: (stats.points || 0) + (stats.rebounds || 0),
    player_points_assists: (stats.points || 0) + (stats.assists || 0),
    player_rebounds_assists: (stats.rebounds || 0) + (stats.assists || 0),
  }
  return STAT_MAP[marketKey] ?? null
}

function mapMlbStatToMarket(stats, marketKey) {
  const STAT_MAP = {
    batter_hits: stats.hits,
    batter_total_bases: stats.total_bases,
    batter_home_runs: stats.home_runs,
    batter_rbis: stats.rbis,
    batter_stolen_bases: stats.stolen_bases,
    batter_walks: stats.walks,
    pitcher_strikeouts: stats.strikeouts,
  }
  return STAT_MAP[marketKey] ?? null
}

async function enrichLockedPicksWithLiveStats(lockedPicks) {
  if (!lockedPicks.length) return

  // Normalize names so "Jaime Jaquez Jr" matches "Jaime Jaquez Jr." etc.
  // Strips trailing periods on suffixes (Jr/Sr/II/III/IV) and collapses
  // whitespace. Also lowercases for case-insensitive joins.
  function normalizeName(name) {
    if (!name) return ''
    return String(name)
      .replace(/\.\s*$/, '')              // trailing period (e.g. "Jr.")
      .replace(/\s+(jr|sr|ii|iii|iv)\.?\s*$/i, ' $1') // strip period after suffix
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const playerNames = [...new Set(lockedPicks.map((p) => p.player_props?.player_name).filter(Boolean))]

    if (!playerNames.length) {
      logger.warn({ pickCount: lockedPicks.length }, 'Live stat enrichment: no player names on locked picks')
      return
    }

    logger.info({ playerNames, today, pickCount: lockedPicks.length }, 'Live stat enrichment starting')

    // Look up ESPN IDs from DFS salaries (both NBA and MLB)
    const [salaryRes1, salaryRes2] = await Promise.all([
      supabase.from('nba_dfs_salaries').select('player_name, espn_player_id').in('player_name', playerNames).eq('game_date', today),
      supabase.from('mlb_dfs_salaries').select('player_name, espn_player_id').in('player_name', playerNames).eq('game_date', today),
    ])

    const nbaPlayers = salaryRes1.data || []
    const mlbPlayers = salaryRes2.data || []

    if (salaryRes1.error) logger.error({ error: salaryRes1.error }, 'NBA salary lookup failed')
    if (salaryRes2.error) logger.error({ error: salaryRes2.error }, 'MLB salary lookup failed')

    const idMap = {}
    for (const p of [...nbaPlayers, ...mlbPlayers]) {
      idMap[p.player_name] = p.espn_player_id
    }

    const espnIds = Object.values(idMap).filter(Boolean)

    logger.info({ salaryMatches: Object.keys(idMap).length, espnIds: espnIds.length, nbaPlayers: nbaPlayers.length, mlbPlayers: mlbPlayers.length }, 'Live stat enrichment: salary lookup done')

    // Fetch stats from both tables (by ESPN ID if available, and by name as fallback)
    const queries = await Promise.all([
      espnIds.length
        ? supabase.from('nba_dfs_player_stats').select('espn_player_id, player_name, points, rebounds, assists, steals, blocks, turnovers, three_pointers_made').in('espn_player_id', espnIds).eq('game_date', today)
        : { data: [], error: null },
      espnIds.length
        ? supabase.from('mlb_dfs_player_stats').select('espn_player_id, player_name, hits, runs, home_runs, rbis, stolen_bases, walks, strikeouts, total_bases').in('espn_player_id', espnIds).eq('game_date', today)
        : { data: [], error: null },
      // Pull ALL stats for today for in-memory normalized matching
      // (handles "Jaime Jaquez Jr" vs "Jaime Jaquez Jr." and similar drift).
      supabase.from('nba_dfs_player_stats').select('espn_player_id, player_name, points, rebounds, assists, steals, blocks, turnovers, three_pointers_made').eq('game_date', today),
      supabase.from('mlb_dfs_player_stats').select('espn_player_id, player_name, hits, runs, home_runs, rbis, stolen_bases, walks, strikeouts, total_bases').eq('game_date', today),
    ])

    const nbaStats = queries[0].data || []
    const mlbStats = queries[1].data || []
    const nbaStatsByName = queries[2].data || []
    const mlbStatsByName = queries[3].data || []

    for (const q of queries) {
      if (q.error) logger.error({ error: q.error }, 'Stats query failed in enrichment')
    }

    logger.info({ nbaById: nbaStats.length, mlbById: mlbStats.length, nbaByName: nbaStatsByName.length, mlbByName: mlbStatsByName.length }, 'Live stat enrichment: stats lookup done')

    // Build lookup maps — name maps are keyed on the NORMALIZED name so
    // "Jaime Jaquez Jr" and "Jaime Jaquez Jr." match each other.
    const nbaById = {}
    const nbaByName = {}
    for (const s of nbaStats) nbaById[s.espn_player_id] = s
    for (const s of nbaStatsByName) nbaByName[normalizeName(s.player_name)] = s

    const mlbById = {}
    const mlbByName = {}
    for (const s of mlbStats) mlbById[s.espn_player_id] = s
    for (const s of mlbStatsByName) mlbByName[normalizeName(s.player_name)] = s

    // Attach live stats to each locked pick
    for (const pick of lockedPicks) {
      const playerName = pick.player_props?.player_name
      const normName = normalizeName(playerName)
      const espnId = idMap[playerName]
      const marketKey = pick.player_props?.market_key
      const gameStatus = pick.player_props?.games?.status

      const nba = (espnId && nbaById[espnId]) || nbaByName[normName]
      const mlb = (espnId && mlbById[espnId]) || mlbByName[normName]

      if (nba) {
        const mapped = mapNbaStatToMarket(nba, marketKey)
        pick.live_stat = mapped
        logger.info({ playerName, marketKey, mapped, gameStatus, raw: nba }, 'Live stat enriched (NBA)')
      } else if (mlb) {
        const mapped = mapMlbStatToMarket(mlb, marketKey)
        pick.live_stat = mapped
        logger.info({ playerName, marketKey, mapped, gameStatus }, 'Live stat enriched (MLB)')
      } else {
        logger.warn({ playerName, espnId, marketKey, today, gameStatus, nbaByIdKeys: Object.keys(nbaById), nbaByNameKeys: Object.keys(nbaByName) }, 'Live stat enrichment: no stats found for player')
      }
    }
  } catch (err) {
    logger.error({ err }, 'Live stat enrichment failed entirely')
  }
}

export async function getUserPropPicks(userId, status) {
  let query = supabase
    .from('prop_picks')
    .select('*, player_props(*, games(id, home_team, away_team, starts_at, status, period, clock, sports(key, name)))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error

  // Enrich all locked picks with live stats (no game status gate — if stats exist, show them)
  const lockedPicks = (data || []).filter((p) => p.status === 'locked')
  await enrichLockedPicksWithLiveStats(lockedPicks)

  return data || []
}

export async function voidProp(propId) {
  // Fetch the prop
  const { data: prop, error: propError } = await supabase
    .from('player_props')
    .select('id, status, sport_id')
    .eq('id', propId)
    .single()

  if (propError || !prop) {
    const err = new Error('Prop not found')
    err.status = 404
    throw err
  }

  if (!['published', 'locked', 'settled'].includes(prop.status)) {
    const err = new Error('Only published, locked, or settled props can be voided')
    err.status = 400
    throw err
  }

  // Fetch all non-voided picks for this prop
  const { data: picks, error: picksError } = await supabase
    .from('prop_picks')
    .select('*')
    .eq('prop_id', propId)
    .neq('status', 'voided')

  if (picksError) throw picksError

  // Reverse points and stats for settled picks
  for (const pick of picks || []) {
    if (pick.status === 'settled' && pick.points_earned !== 0) {
      const { error: pointsError } = await supabase
        .rpc('increment_user_points', {
          user_row_id: pick.user_id,
          points_delta: -pick.points_earned,
        })

      if (pointsError) {
        logger.error({ pointsError, userId: pick.user_id }, 'Failed to reverse points for voided prop')
      }
    }

    if (pick.status === 'settled' && pick.is_correct !== null) {
      const { error: statsError } = await supabase
        .rpc('update_sport_stats', {
          p_user_id: pick.user_id,
          p_sport_id: prop.sport_id,
          p_is_correct: !pick.is_correct,
          p_points: -pick.points_earned,
        })

      if (statsError) {
        logger.error({ statsError, userId: pick.user_id }, 'Failed to reverse sport stats for voided prop')
      }
    }

    // Mark pick as voided
    const { error: pickError } = await supabase
      .from('prop_picks')
      .update({
        status: 'voided',
        is_correct: null,
        points_earned: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pick.id)

    if (pickError) {
      logger.error({ pickError, pickId: pick.id }, 'Failed to void prop pick')
    }
  }

  // Mark prop as voided and clear featured date so the slot is freed
  const { error: voidError } = await supabase
    .from('player_props')
    .update({
      status: 'voided',
      featured_date: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', propId)

  if (voidError) throw voidError

  const voidedCount = (picks || []).length
  logger.info({ propId, voidedCount }, 'Prop voided')
  return { voidedCount }
}

export async function getUserPropPickHistory(userId) {
  const { data, error } = await supabase
    .from('prop_picks')
    .select('*, player_props(*, games(id, home_team, away_team, starts_at, status, period, clock, sports(key, name)))')
    .eq('user_id', userId)
    .in('status', ['locked', 'settled'])
    .order('updated_at', { ascending: false })

  if (error) throw error

  // Enrich all locked picks with live stats
  const lockedPicks = (data || []).filter((p) => p.status === 'locked')
  await enrichLockedPicksWithLiveStats(lockedPicks)

  return data || []
}
