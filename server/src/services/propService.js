import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { cached } from '../utils/memoCache.js'
import { fetchPlayerProps } from './oddsService.js'
import { getMarketLabel, PROP_MARKETS } from '../utils/propMarkets.js'
import { calculateRiskPoints, calculateRewardPoints } from '../utils/scoring.js'
import { checkRecordAfterSettle } from './recordService.js'
import { createNotification } from './notificationService.js'
import { fetchCompletedGameStats as fetchNbaStatsFromEspn } from '../jobs/scoreNBADFS.js'
import { fetchCompletedGameStats as fetchMlbStatsFromEspn } from '../jobs/scoreMLBDFS.js'
import { fetchCompletedWNBAGameStats as fetchWnbaStatsFromEspn } from '../jobs/scoreWNBADFS.js'
import { normalizeName, stripAccents } from '../utils/name.js'
import { fetchAll } from '../utils/fetchAll.js'
import { buildPlayerIndex, resolvePlayer } from '../utils/playerResolver.js'
import { todaySportsDay, yesterdaySportsDay, sportsDayBoundsUtc } from '../utils/sportsDay.js'
import { getPlayerHeadshotUrl, refreshPlayerHeadshotCache } from './espnService.js'

// Short-key → full Odds API sport key. Short keys are what the admin
// props-visibility config uses; full keys are what the games table stores
// in sports.key and what fetchPlayerProps expects.
const SHORT_TO_FULL_SPORT_KEY = {
  nba: 'basketball_nba',
  wnba: 'basketball_wnba',
  ncaab: 'basketball_ncaab',
  wncaab: 'basketball_wncaab',
  mlb: 'baseball_mlb',
  nfl: 'americanfootball_nfl',
  ncaaf: 'americanfootball_ncaaf',
  ufl: 'americanfootball_ufl',
  nhl: 'icehockey_nhl',
  mls: 'soccer_usa_mls',
  wc: 'soccer_world_cup',
}

// Name key for matching a sportsbook's spelling to ours. Strips accents,
// periods, apostrophes and name suffixes — "Tre' Harris" vs "Tre Harris" was
// the single miss across a full slate before apostrophes were included.
function normalizePropPlayerName(name) {
  return stripAccents(String(name || ''))
    .replace(/[.']/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Odds API sport key → ESPN sportPath (used by the headshot cache).
// Only sports with ESPN roster coverage are mapped; unmapped sports skip
// the headshot lookup and the card renders with a placeholder.
const SPORT_KEY_TO_ESPN_PATH = {
  basketball_nba: 'basketball/nba',
  basketball_wnba: 'basketball/wnba',
  baseball_mlb: 'baseball/mlb',
  americanfootball_nfl: 'football/nfl',
}

// In-memory cache for user-loaded props. Key: `${game_id}:${market_key}`.
// TTL 5 min — long enough that a busy prop tab tap doesn't fan out to the
// Odds API 50 times, short enough that live line moves surface reasonably
// fast. Cache stores just a timestamp; the actual prop rows live in the
// player_props table (upserted below) so all readers stay consistent.
const PROPS_LOAD_CACHE = new Map()
const PROPS_LOAD_TTL_MS = 5 * 60 * 1000

// A failed fetch is cached for far less time than a successful one. See the
// catch block in loadPropsForSportMarket for why the two can't share a TTL.
const PROPS_LOAD_FAILURE_TTL_MS = 20 * 1000

// Max simultaneous Odds API calls when fanning out across a slate. The Odds
// API rate-limits on requests per second (EXCEEDED_FREQ_LIMIT) independently
// of the monthly quota, and /props/load is user-triggered — every open of the
// Props tab fired one request per game at once, so a full NFL slate reliably
// tripped it and the whole market came back empty.
const PROPS_LOAD_CONCURRENCY = 4

// Wall-clock budget for the whole fan-out. Throttling to a pool turns one
// parallel wave into several sequential ones, so a slate that is being hard
// rate-limited could run ~4 waves x ~7s of retries and blow past the client's
// 25s fetch timeout — trading an empty market for a spinner. Past the budget
// we stop issuing new fetches and fall through to the DB read-back, which
// still returns every prop already stored. Skipped games aren't cached, so
// the next load picks them up.
const PROPS_LOAD_BUDGET_MS = 12 * 1000

// Run `fn` over `items` with at most `limit` in flight. Workers pull from a
// shared cursor rather than running fixed-size batches, so one slow game
// doesn't idle the other workers waiting on a batch boundary. Rejections
// propagate like Promise.all — callers here handle their own errors inside
// `fn`, so a throw is a genuine bug rather than an expected API failure.
async function mapWithConcurrency(items, limit, fn) {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await fn(items[index], index)
    }
  })
  await Promise.all(workers)
}

// Sports we deliberately do NOT support player props on, even though
// odds sync + game finalization run against them. NFL preseason falls
// here — no fantasy weight in preseason, and settleNFLProps only
// grades regular NFL, so allowing syncs would create locked prop rows
// that never settle.
const PROPS_UNSUPPORTED_SPORT_KEYS = new Set([
  'americanfootball_nfl_preseason',
])

/**
 * Fill player_headshot_url on NFL prop rows from our own nfl_players table.
 *
 * Shared because there are TWO row builders — syncPropsForGame and the
 * user-facing load — and only one of them had the lookup. Same player, same
 * market, different line is a different row, so Joe Burrow appeared with a
 * headshot at 269.5 yards and initials at 267.5.
 *
 * One indexed read rather than 32 ESPN roster fetches, and the same image the
 * rest of fantasy shows. No-op for other sports.
 */
export async function attachNflHeadshots(rows, sportKey) {
  if (sportKey !== 'americanfootball_nfl') return
  // Every row, not just the blank ones. Rows written before the
  // name-collision fix carry the WRONG face — the two Lamar Jackson prop
  // lines showed different players — and a fill-only pass leaves those
  // permanently wrong. Both callers attach before upserting, so re-resolving
  // repairs the stored value on the next sync instead of needing a migration.
  const needing = rows.filter((r) => r.player_name)
  if (!needing.length) return
  try {
    const { NFL_FULL_TO_ABBR } = await import('./fantasyService.js')

    const players = await fetchAll(
      supabase
        .from('nfl_players')
        .select('full_name, team, headshot_url')
        .not('headshot_url', 'is', null)
        .order('id'),
    )

    // Names are NOT unique. There are two Lamar Jacksons — the Ravens QB and
    // a cornerback — and a flat name->url map is last-write-wins, so the
    // higher sleeper id won and every "Lamar Jackson passing yards" card
    // carried the cornerback's face.
    //
    // Resolution order: the player on a team playing in THIS game, then any
    // rostered player of that name, then whatever we have. The first rule is
    // the only one that can distinguish two active players who share a name.
    const byNameTeam = {}
    const byNameRostered = {}
    const byName = {}
    for (const pl of players || []) {
      const key = normalizePropPlayerName(pl.full_name)
      if (pl.team) {
        byNameTeam[`${key}|${pl.team}`] = pl.headshot_url
        if (!(key in byNameRostered)) byNameRostered[key] = pl.headshot_url
      }
      if (!(key in byName)) byName[key] = pl.headshot_url
    }

    // game_id -> the two team abbreviations in that game.
    const gameIds = [...new Set(needing.map((r) => r.game_id).filter(Boolean))]
    const teamsByGame = {}
    if (gameIds.length) {
      const { data: games } = await supabase
        .from('games')
        .select('id, home_team, away_team')
        .in('id', gameIds)
      for (const g of games || []) {
        teamsByGame[g.id] = [NFL_FULL_TO_ABBR[g.home_team], NFL_FULL_TO_ABBR[g.away_team]].filter(Boolean)
      }
    }

    for (const r of needing) {
      const key = normalizePropPlayerName(r.player_name)
      let url = null
      for (const abbr of teamsByGame[r.game_id] || []) {
        if (byNameTeam[`${key}|${abbr}`]) { url = byNameTeam[`${key}|${abbr}`]; break }
      }
      url = url || byNameRostered[key] || byName[key]
      if (url) r.player_headshot_url = url
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'NFL headshot attach failed — cards fall back to initials')
  }
}

/**
 * Fill player_headshot_url on NBA / WNBA / MLB prop rows from the ESPN
 * roster cache.
 *
 * Same shape, and the same reason, as attachNflHeadshots above: there are
 * TWO row builders — syncPropsForGame and the user-facing load — and only
 * the load one ever looked a headshot up. Every row syncPropsForGame wrote
 * got a null, permanently, because once a game is past it falls out of the
 * load path's upcoming/live window and is never revisited.
 *
 * That is most of the gap. NBA sat at 36% coverage with 101 of its 102
 * resolvable players ALSO having rows with no image — the same player,
 * resolving on one row and not the next. Against a warm cache 258 of the
 * 281 missing players resolve, so this was never a name-matching problem.
 *
 * Applied to EVERY row rather than only the blank ones, so a re-sync repairs
 * a value written while the cache was cold instead of needing a migration.
 * The cache build is 30 roster fetches (~4s cold, then 24h in memory), which
 * is why a row written before it warms up is the common case worth fixing.
 *
 * No-op for NFL, which has its own path above, and for any sport with no
 * ESPN roster list.
 */
export async function attachEspnHeadshots(rows, sportKey) {
  if (!rows?.length) return
  const sportPath = SPORT_KEY_TO_ESPN_PATH[sportKey]
  if (!sportPath || sportPath === 'football/nfl') return
  try {
    await refreshPlayerHeadshotCache(sportPath)
    let filled = 0
    for (const r of rows) {
      if (!r.player_name) continue
      const url = getPlayerHeadshotUrl(r.player_name, sportPath)
      if (url) { r.player_headshot_url = url; filled++ }
    }
    logger.info({ sportPath, rows: rows.length, filled }, 'ESPN headshots attached')
  } catch (err) {
    logger.warn({ err: err.message, sportPath }, 'ESPN headshot attach failed — cards fall back to initials')
  }
}

/**
 * Pick which bookmaker to price a game from.
 *
 * Preference is one carrying BOTH sides, so a card can offer Over and Under
 * from a single book rather than mixing prices. A Yes/No market (anytime
 * touchdown) has neither, so that search finds nothing — hence the fallback
 * to the first book that priced anything at all, instead of bookmakers[0],
 * which may have returned an empty markets array.
 */
function pickPrimaryBookmaker(bookmakers) {
  for (const bm of bookmakers) {
    const sides = new Set()
    for (const mkt of bm.markets || []) {
      for (const o of mkt.outcomes || []) sides.add(o.name?.toLowerCase())
    }
    if (sides.has('over') && sides.has('under')) return bm
  }
  const hasOutcomes = (bm) => (bm.markets || []).some((m) => (m.outcomes || []).length)
  return bookmakers.find(hasOutcomes) || bookmakers[0]
}

/**
 * One Odds API outcome -> { playerName, line, side }, or null to skip it.
 *
 * Handles the two shapes the API returns:
 *
 *   Over/Under  { name: 'Over', description: 'Joe Burrow', point: 269.5 }
 *   Yes/No      { name: 'Yes',  description: 'Ja\'Marr Chase' }   <- no point
 *
 * The Yes/No form is anytime touchdown. It was previously discarded whole —
 * the parser required a `point` and only recognised over/under — which is why
 * the Anytime TD category never rendered a single card despite 14 bookmakers
 * pricing it.
 *
 * Yes/No is stored at line 0.5 with Yes as the over: "scored a touchdown" is
 * then literally over the line, and settleNFLProps / gradeProp already
 * compute rush_td + rec_td + return_td and compare against the line, so they
 * grade it correctly without changes.
 *
 * Shared by both row builders. They were separate near-identical copies, and
 * teaching only one about Yes/No would have meant a market that synced but
 * never loaded (or the reverse).
 */
function normalizeOutcome(outcome) {
  const rawSide = outcome.name?.toLowerCase()
  const isYesNo = rawSide === 'yes' || rawSide === 'no'
  if (!isYesNo && outcome.point == null) return null

  // On a Yes/No outcome the player is in `description` and `name` is the side,
  // so falling back to `name` would invent a player called "Yes".
  const playerName = isYesNo ? outcome.description : (outcome.description || outcome.name)
  if (!playerName) return null

  return {
    playerName,
    line: isYesNo ? 0.5 : outcome.point,
    // Yes -> over, No -> under, so every downstream reader (pick buttons,
    // scoring, settlement) keeps working on the two fields it already knows.
    side: isYesNo ? (rawSide === 'yes' ? 'over' : 'under') : rawSide,
  }
}

/**
 * Fill in the missing No side on Yes/No props.
 *
 * Anytime touchdown is priced one-sided by all 14 books we see — every one
 * returns Yes and nothing else — so without this the card offers a single
 * button and there is no decision to make.
 *
 * The No price is the straight complement of the Yes implied probability.
 * That is slightly generous to the picker (the Yes price carries the book's
 * margin, so its complement is a touch longer than a book would quote), which
 * is the right way to err on a points game rather than a cash one.
 *
 * Same shape the MLB home-run market already ships: a 0.5 line with both
 * sides, where the under on a longshot is heavily odds-on.
 */
function addSyntheticNoSide(rows) {
  for (const row of rows) {
    if (row.market_key !== 'player_anytime_td') continue
    if (row.under_odds != null || row.over_odds == null) continue
    const pYes = impliedProbability(row.over_odds)
    if (!(pYes > 0 && pYes < 1)) continue
    const pNo = 1 - pYes
    row.under_odds = pNo >= 0.5
      ? -Math.round((100 * pNo) / (1 - pNo))
      : Math.round((100 * (1 - pNo)) / pNo)
  }
}

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

  if (PROPS_UNSUPPORTED_SPORT_KEYS.has(sportKey)) {
    const err = new Error(`Player props are not supported for ${sportKey}`)
    err.status = 400
    throw err
  }

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
  const primaryBookmaker = pickPrimaryBookmaker(apiData.bookmakers)

  // Parse primary bookmaker
  for (const market of primaryBookmaker.markets || []) {
    for (const outcome of market.outcomes || []) {
      const norm = normalizeOutcome(outcome)
      if (!norm) continue
      const { playerName, line, side } = norm

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

  addSyntheticNoSide(rows)

  if (!rows.length) {
    return { synced: 0 }
  }

  // This builder never looked up a headshot, so every row it wrote carried a
  // null until the user-facing load happened to rewrite it — and for a game
  // already past, that never happens.
  await attachNflHeadshots(rows, game.sports?.key)
  await attachEspnHeadshots(rows, game.sports?.key)

  // Upsert props — omit status so existing published/locked props keep their status
  for (const row of rows) {
    await attachNflHeadshots([row], sportKey)
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


/**
 * Attach each prop's slider ladder.
 *
 * Computed here rather than in the browser so the price the slider SHOWS is
 * the price the submit path will CHARGE. A client-side copy of the hit-rate
 * table would drift the moment the rates are re-measured, and the drift would
 * be invisible — the card would quote one number and the server would store
 * another.
 *
 * `slider` is null for flat markets (anytime TD and friends), which is the
 * client's signal to render the existing over/under card.
 */
async function withSliders(props) {
  if (!props?.length) return props || []
  const { buildSlider } = await import('./propSliderService.js')
  return props.map((p) => ({
    ...p,
    slider: buildSlider(p.market_key, Number(p.line)),
  }))
}

/**
 * Make a pick's nested prop describe the line the USER took.
 *
 * Every shipped client — 1.2.19 and everything before it — renders a prop
 * pick from `player_props.line`, because until now that WAS the user's line.
 * On a slider pick it isn't: the book's number might be 222.5 while the pick
 * is over 300. An app that hasn't updated would show the wrong threshold,
 * compute "needs 12 more" against it, and can paint a ✓ on a pick the server
 * correctly settled as a loss — display contradicting the points awarded.
 *
 * Rather than ship a client fix and wait on an App Store review, the server
 * hands every client the line that is actually in play. The book's number
 * moves to `book_line` for anything that wants to show it as context.
 *
 * Applies to the payloads a user reads their OWN or another user's picks
 * from. The props BOARD is untouched — there `line` is the book's line and
 * that is correct, since nobody has chosen anything yet.
 */
export function applyChosenLine(picks) {
  const one = (pick) => {
    if (!pick?.player_props || pick.chosen_line == null) return pick
    return {
      ...pick,
      player_props: {
        ...pick.player_props,
        book_line: pick.player_props.line,
        line: Number(pick.chosen_line),
      },
    }
  }
  return Array.isArray(picks) ? picks.map(one) : one(picks)
}

/**
 * One card per player, per market, per game.
 *
 * The odds feed re-quotes a line as the week goes on, and `line` is part of
 * the upsert conflict key — so every move INSERTS a row rather than updating
 * one. That is deliberate (a prop someone already picked must keep the line
 * they picked), but it means the board accumulated five pickable Tyson Bagent
 * pass-yards props for the same game at 217.5 through 222.5. 255 of 532
 * player/market/game groups on the current football slate were duplicated
 * this way.
 *
 * Harmless-looking before, actively wrong with the slider: five overlapping
 * ±33% ladders over the same question, where the stale ones are still
 * pickable at a price the book has since moved off.
 *
 * So: among PUBLISHED rows, exactly ONE survives per player/market/game —
 * the row THIS USER has a pick on if they have one, otherwise the latest
 * quote. Preferring their own row rather than keeping it IN ADDITION to the
 * newest matters: the first version of this rescued any row with a pick on
 * it, which put the picked card and the current card side by side and looked
 * exactly like the collapse had failed.
 *
 * Rows that are locked or settled are left alone — they are history.
 */
async function collapseStaleLines(props, userId) {
  if (!props?.length) return props || []

  const published = props.filter((p) => p.status === 'published')
  if (!published.length) return props

  // Which of these the caller has already picked. One round trip, and it is
  // what makes "your card" beat "the newest card".
  const mine = new Set()
  if (userId) {
    const { data: picks } = await supabase
      .from('prop_picks')
      .select('prop_id')
      .eq('user_id', userId)
      .in('prop_id', published.map((p) => p.id))
    for (const row of picks || []) mine.add(row.prop_id)
  }

  const stamp = (p) => p.updated_at || p.created_at || ''
  const groups = new Map()
  for (const p of published) {
    const key = `${p.game_id}|${p.market_key}|${p.player_name}`
    const prev = groups.get(key)
    if (!prev) { groups.set(key, p); continue }
    // Your own pick always wins the slot. Failing that, the newest quote.
    const pMine = mine.has(p.id)
    const prevMine = mine.has(prev.id)
    if (pMine && !prevMine) groups.set(key, p)
    else if (pMine === prevMine && stamp(p) > stamp(prev)) groups.set(key, p)
  }

  const keep = new Set([...groups.values()].map((p) => p.id))
  return props.filter((p) => p.status !== 'published' || keep.has(p.id))
}

// User-facing prop loader for the Props tab. Fans out fetchPlayerProps
// across all of today's games in the given sport for a single market,
// upserts fresh prop rows with status='published' so they're immediately
// pickable, and returns the enriched rows (with headshots + game metadata).
//
// Caching: per (game_id, market_key) with 5-min TTL. First caller pays the
// Odds API round-trip; subsequent callers within the window are served
// from the DB (rows are already published) and skip the external fetch.
//
// Status preservation: existing 'locked' / 'settled' rows are left alone
// so a mid-game reload can't roll a settled prop back to published.
export async function loadPropsForSportMarket(shortSportKey, marketKey, userId = null) {
  const fullSportKey = SHORT_TO_FULL_SPORT_KEY[shortSportKey]
  if (!fullSportKey) {
    const err = new Error(`Unknown sport: ${shortSportKey}`)
    err.status = 400
    throw err
  }

  const market = PROP_MARKETS[marketKey]
  if (!market || !market.sports.includes(fullSportKey)) {
    const err = new Error(`Market ${marketKey} not available for ${shortSportKey}`)
    err.status = 400
    throw err
  }

  const { data: sport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', fullSportKey)
    .single()

  if (!sport) return []

  // Window of games to fetch props for. Daily-cadence sports (NBA/WNBA/
  // MLB/NHL) show TODAY's PT slate — anything further out isn't relevant
  // since the next day's card fills in overnight. Football sports run
  // weekly with Thu/Sun/Mon games; anchoring to "today" hides Sunday's
  // slate on Wed/Fri/Sat. For football we widen the window to a rolling
  // 7 days so users browsing the tab mid-week actually see the coming
  // weekend's props.
  //
  // sportsDayBoundsUtc handles DST correctly (PDT → PST would silently
  // shift the previous `-07:00` hardcode by an hour once November hits).
  const isFootball = fullSportKey === 'americanfootball_nfl'
    || fullSportKey === 'americanfootball_ncaaf'
    || fullSportKey === 'americanfootball_ufl'
    || fullSportKey === 'americanfootball_nfl_preseason'

  const todayPt = todaySportsDay()
  const { startUtc } = sportsDayBoundsUtc(todayPt)
  const endUtc = isFootball
    ? new Date(new Date(startUtc).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : sportsDayBoundsUtc(todayPt).endUtc

  const { data: games } = await supabase
    .from('games')
    .select('id, external_id, home_team, away_team, starts_at, status')
    .eq('sport_id', sport.id)
    .in('status', ['upcoming', 'live'])
    .gte('starts_at', startUtc)
    .lt('starts_at', endUtc)
    .order('starts_at', { ascending: true })

  if (!games?.length) return []

  const sportPath = SPORT_KEY_TO_ESPN_PATH[fullSportKey]
  if (sportPath) {
    try { await refreshPlayerHeadshotCache(sportPath) } catch (err) {
      logger.warn({ err: err.message, sportPath }, 'Headshot cache refresh failed — cards may render without headshots')
    }
  }

  // NFL headshots come from our own nfl_players rows, not the ESPN roster
  // cache. That cache is keyed by a SPORT_TEAMS list which has entries for
  // NBA, MLB and WNBA and none for football — so every NFL prop card rendered
  // with initials, silently, even though americanfootball_nfl was mapped in
  // SPORT_KEY_TO_ESPN_PATH.
  //
  // Sleeper already gives us a headshot for essentially every rostered NFL
  // player, so this is one indexed read instead of 32 ESPN roster fetches,
  // and it matched 195 of 196 distinct prop players on the current slate.

  const now = Date.now()

  const fetchDeadline = now + PROPS_LOAD_BUDGET_MS
  let skippedForBudget = 0

  await mapWithConcurrency(games, PROPS_LOAD_CONCURRENCY, async (game) => {
    const cacheKey = `${game.id}:${marketKey}`
    const cached = PROPS_LOAD_CACHE.get(cacheKey)
    if (cached && cached.expiresAt > now) return

    if (Date.now() > fetchDeadline) {
      skippedForBudget++
      return
    }

    let apiData
    try {
      apiData = await fetchPlayerProps(fullSportKey, game.external_id, [marketKey])
    } catch (err) {
      // Cache the FAILURE briefly, not for the full TTL. A 429 or a blip is
      // not the same fact as "this game has no props for this market", but
      // both used to be memoized for 5 minutes — so one rate-limited burst
      // blanked the market for every user for the whole window, and the next
      // request after it expired re-ran the same burst. Short TTL lets the
      // slate recover on the next page load while still stopping a hot loop.
      //
      // Stamped from Date.now() rather than the loop-start `now`: throttling
      // the fan-out means a late game can fail well after the loop began, and
      // against a 20s window that offset is enough to write an already-expired
      // entry — which would defeat the backstop entirely.
      logger.warn({ err: err.message, gameId: game.id, marketKey }, 'fetchPlayerProps failed for load')
      PROPS_LOAD_CACHE.set(cacheKey, { expiresAt: Date.now() + PROPS_LOAD_FAILURE_TTL_MS })
      return
    }

    if (!apiData?.bookmakers?.length) {
      PROPS_LOAD_CACHE.set(cacheKey, { expiresAt: now + PROPS_LOAD_TTL_MS })
      return
    }

    const primary = pickPrimaryBookmaker(apiData.bookmakers)

    const rows = []
    for (const mkt of primary.markets || []) {
      for (const outcome of mkt.outcomes || []) {
        const norm = normalizeOutcome(outcome)
        if (!norm) continue
        const { playerName, line, side } = norm

        let row = rows.find((r) => r.player_name === playerName && r.market_key === mkt.key && r.line === line)
        if (!row) {
          row = {
            game_id: game.id,
            sport_id: sport.id,
            player_name: playerName,
            market_key: mkt.key,
            market_label: getMarketLabel(mkt.key),
            line,
            over_odds: null,
            under_odds: null,
            bookmaker: primary.key,
            external_event_id: game.external_id,
          }
          rows.push(row)
        }
        if (side === 'over') row.over_odds = outcome.price
        else if (side === 'under') row.under_odds = outcome.price
      }
    }

    addSyntheticNoSide(rows)

    if (!rows.length) {
      PROPS_LOAD_CACHE.set(cacheKey, { expiresAt: now + PROPS_LOAD_TTL_MS })
      return
    }

    // Attach to EVERY row rather than only to newly-created ones, which is
    // what the inline lookup here used to do. Re-resolving on each sync is
    // what repairs a row written while the roster cache was still cold.
    await attachEspnHeadshots(rows, fullSportKey)

    // Look up existing rows to preserve 'locked' / 'settled' statuses; only
    // set status='published' on inserts / 'synced' / 'published' upserts.
    const { data: existing } = await supabase
      .from('player_props')
      .select('player_name, line, status')
      .eq('game_id', game.id)
      .eq('market_key', marketKey)

    const preserve = new Map()
    for (const e of existing || []) {
      if (e.status === 'locked' || e.status === 'settled') {
        preserve.set(`${e.player_name}|${e.line}`, e.status)
      }
    }

    // A prop for a game that has ALREADY KICKED OFF must not be pickable.
    //
    // The odds feed keeps quoting new lines after a game starts, and this
    // path upserts whatever it returns. lockPicks can't clean up after it —
    // that job only selects games still marked 'upcoming', so once a game is
    // live it never revisits them. The result was 11 live-game props sitting
    // on the board as 'published' at kickoff + 3 minutes, fully pickable.
    const hasStarted = game.status !== 'upcoming'
      || (game.starts_at && new Date(game.starts_at) <= new Date())

    for (const row of rows) {
      const preserved = preserve.get(`${row.player_name}|${row.line}`)
      row.status = preserved || (hasStarted ? 'locked' : 'published')
    }
    await attachNflHeadshots(rows, fullSportKey)

    // Chunked upsert with per-row fallback — a single poisoned row
    // (e.g. odd Unicode in player_name) shouldn't nuke the whole game's slate.
    const CHUNK = 40
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error } = await supabase
        .from('player_props')
        .upsert(chunk, { onConflict: 'game_id,player_name,market_key,line' })
      if (error) {
        logger.warn({ err: error.message, gameId: game.id, marketKey, chunkSize: chunk.length }, 'Chunked upsert failed — retrying per-row')
        for (const row of chunk) {
          const { error: rowErr } = await supabase
            .from('player_props')
            .upsert(row, { onConflict: 'game_id,player_name,market_key,line' })
          if (rowErr) {
            logger.error({ err: rowErr.message, row: { player: row.player_name, line: row.line } }, 'Per-row prop upsert failed')
          }
        }
      }
    }

    PROPS_LOAD_CACHE.set(cacheKey, { expiresAt: now + PROPS_LOAD_TTL_MS })
  })

  if (skippedForBudget > 0) {
    logger.warn({
      sport: fullSportKey,
      marketKey,
      skipped: skippedForBudget,
      totalGames: games.length,
      budgetMs: PROPS_LOAD_BUDGET_MS,
    }, 'Props load hit its time budget — some games not fetched this pass')
  }

  // Read back everything — fresh + cached rows — so the response is
  // consistent regardless of who paid the fetch. Only 'published' rows are
  // pickable; 'locked' / 'settled' rows returned here so the client can
  // show them as picked-but-locked in the same list.
  const gameIds = games.map((g) => g.id)
  const { data: allProps } = await supabase
    .from('player_props')
    .select('*, games(id, home_team, away_team, starts_at, status, sports(key, name))')
    .in('game_id', gameIds)
    .eq('market_key', marketKey)
    .in('status', ['published', 'locked', 'settled'])

  // Anytime touchdown is a single-sided Yes market across dozens of players,
  // so the list only makes sense ranked: the likeliest scorer first. Every
  // other market is one line per player, where the odds hover around even and
  // ranking them says nothing — those keep the database's order.
  //
  // The book's own price is the ranking. A shorter price means likelier, and
  // American odds are not monotonic as numbers (-150 is likelier than +110
  // but sorts lower), so they convert to implied probability first.
  if (marketKey === 'player_anytime_td') {
    // Anytime TD never re-quotes — the line is always 0.5 — so there is
    // nothing for collapseStaleLines to find.
    return (allProps || []).slice().sort(
      (a, b) => impliedProbability(b.over_odds) - impliedProbability(a.over_odds),
    )
  }

  return withSliders(await collapseStaleLines(allProps || [], userId))
}

/**
 * American odds -> implied probability (0-1). Null odds sort last.
 *
 * Includes the book's margin, which is fine here: it's a consistent ranking
 * key, not a published number.
 */
function impliedProbability(odds) {
  const o = Number(odds)
  if (!Number.isFinite(o) || o === 0) return -1
  return o < 0 ? Math.abs(o) / (Math.abs(o) + 100) : 100 / (o + 100)
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
  // Match any prop featured on or before the requested date whose game
  // hasn't yet started. Earlier this used eq('featured_date', date), which
  // broke when admin featured a prop on day N for a game on day N+1 — the
  // picks page auto-advances dayOffset to the game date, so the prop's
  // featured_date wouldn't match and it disappeared.
  const { data, error } = await supabase
    .from('player_props')
    .select('*, games(id, home_team, away_team, starts_at, status, sports(key, name))')
    .lte('featured_date', date)
    .in('status', ['published', 'locked', 'settled'])

  if (error) throw error

  // The client's FeaturedPropSection already filters out props whose
  // game has started or which are locked/settled — let it decide what
  // to render. We just hand back everything featured on or before the
  // requested date.
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
      return withSliders(nextProps.filter((p) => p.featured_date === nextDate))
    }
    return []
  }

  return withSliders(props)
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

    // Settle 'pending' picks alongside 'locked' ones.
    //
    // Picks are meant to be flipped pending -> locked by lockPicks, which
    // also snapshots odds/risk/reward. If a pick misses that job it stays
    // 'pending' forever, and settling only 'locked' skipped it permanently —
    // 13 prop picks were sitting pending on games that had already finished,
    // several against props whose own status was already 'settled'. Same
    // failure as scoreCompletedGame had for straight picks.
    //
    // The prop is settled by the time we get here, so a pending pick on it
    // is unambiguously due.
    const { data: picks, error: picksError } = await supabase
      .from('prop_picks')
      .select('*')
      .eq('prop_id', propId)
      .in('status', ['locked', 'pending'])

    if (picksError) {
      logger.error({ picksError, propId }, 'Failed to fetch prop picks for scoring')
      continue
    }

    if (!picks?.length) {
      results.push({ propId, scored: 0 })
      continue
    }

    // Only fire the DNP push notification when the settle path passed
    // actualValue: null — that's the "player wasn't in the box"
    // signal from settleWNBAProps / settleNFLProps / etc. Exact-line
    // pushes (rare, actualValue === line) don't need a special notif.
    const wasDnpPush = outcome === 'push' && (actualValue === null || actualValue === undefined)
    const propLabel = prop.market_key ? getMarketLabel(prop.market_key) : 'this prop'

    for (const pick of picks) {
      let isCorrect = null
      let pointsEarned = 0

      // odds_at_pick / risk_points / reward_points are written at LOCK time,
      // so a pick that slipped the lock has all three NULL and would settle
      // at `|| 0` — marked resolved, W/L recorded, zero points awarded.
      // Resolve from the submission values the same way lockPicks does, and
      // persist them so the row ends up complete rather than blank.
      let stakeBackfill = null
      if (pick.risk_points == null || pick.reward_points == null) {
        // Mirrors lockPicks' prop branch exactly. No multiplier: unlike
        // straight picks, prop_picks has no multiplier column and the lock
        // job applies none.
        let odds, risk, reward
        if (pick.odds_at_submission != null) {
          odds = pick.odds_at_submission
          risk = pick.risk_at_submission || (odds ? calculateRiskPoints(odds) : 0)
          reward = pick.reward_at_submission || (odds ? calculateRewardPoints(odds) : 0)
        } else {
          odds = pick.picked_side === 'over' ? prop.over_odds : prop.under_odds
          risk = odds ? calculateRiskPoints(odds) : 0
          reward = odds ? calculateRewardPoints(odds) : 0
        }
        pick.risk_points = risk
        pick.reward_points = reward
        stakeBackfill = { odds_at_pick: pick.odds_at_pick ?? odds, risk_points: risk, reward_points: reward }
      }

      // A slider pick carries its own threshold, so the prop-level outcome
      // does not describe it: two users on this same prop can be holding
      // different numbers, and one can win while the other loses. Judge those
      // against actual_value directly.
      //
      // The DNP case still pushes — actualValue null means the player was
      // never in the box score, which is no more the fault of someone who
      // moved the line than of someone who didn't.
      const hasCustomLine = pick.chosen_line !== null && pick.chosen_line !== undefined
      const actualForPick = actualValue !== undefined ? actualValue : prop.actual_value

      if (hasCustomLine && actualForPick !== null && actualForPick !== undefined) {
        const line = Number(pick.chosen_line)
        const actual = Number(actualForPick)
        if (actual === line) {
          // Only reachable on whole-number lines; the stepping keeps counting
          // markets on .5 precisely to avoid it.
          isCorrect = null
          pointsEarned = 0
        } else {
          // Which way they bet it. Judging every custom line as an over would
          // settle under picks exactly backwards — paying out the losers and
          // charging the winners.
          const cleared = pick.picked_side === 'under' ? actual < line : actual > line
          isCorrect = cleared
          pointsEarned = cleared ? (pick.reward_points || 0) : -(pick.risk_points || 0)
        }
      } else if (outcome === 'push') {
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
          ...(stakeBackfill || {}),
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

      // DNP push notification — user picked a prop and the player
      // didn't play. No point/record impact, but users deserve to
      // know why the pick isn't showing win/loss.
      if (wasDnpPush) {
        try {
          await createNotification(pick.user_id, 'prop_pushed', `⏸ ${prop.player_name} didn't play — your ${propLabel} pick was pushed.`, {
            propPickId: pick.id,
            propId: prop.id,
            playerName: prop.player_name,
            marketKey: prop.market_key,
          })
        } catch (err) {
          logger.error({ err, userId: pick.user_id, propId: prop.id, pickId: pick.id }, 'DNP push notification failed')
        }
      }
    }

    results.push({ propId, scored: picks.length })
    logger.info({ propId, scored: picks.length, outcome }, 'Prop picks scored')
  }

  return results
}

export async function submitPropPick(userId, propId, pickedSide, chosenLine = null) {
  const { data: prop, error: propError } = await supabase
    .from('player_props')
    .select('id, status, game_id, market_key, line, over_odds, under_odds, games(starts_at, status)')
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
  let riskAtSubmission = odds ? calculateRiskPoints(odds) : null
  let rewardAtSubmission = odds ? calculateRewardPoints(odds) : null

  // Custom line. The client sends only the NUMBER and the SIDE; the payout is
  // recomputed here from the measured hit-rate table, so a tampered request
  // buys exactly the same price as an honest one. A line that isn't an
  // offered stop is refused rather than priced.
  //
  // Both sides are offered. The slider sets WHERE the threshold is; over and
  // under decide which way you're betting it — and because under is the
  // complement, the same stop pays opposite amounts on each side.
  let storedLine = null
  if (chosenLine !== null && chosenLine !== undefined) {
    const { priceChosenLine } = await import('./propSliderService.js')
    const priced = priceChosenLine(prop.market_key, Number(prop.line), chosenLine, 10, pickedSide)
    if (!priced.ok) {
      const err = new Error(priced.error)
      err.status = 400
      throw err
    }
    storedLine = priced.line
    riskAtSubmission = priced.risk
    rewardAtSubmission = priced.reward
  }

  const { data, error } = await supabase
    .from('prop_picks')
    .upsert(
      {
        user_id: userId,
        prop_id: propId,
        picked_side: pickedSide,
        chosen_line: storedLine,
        status: 'pending',
        updated_at: new Date().toISOString(),
        odds_at_submission: oddsAtSubmission,
        risk_at_submission: riskAtSubmission,
        reward_at_submission: rewardAtSubmission,
      },
      // Keyed on side AND line, so over 195 and over 220 on one prop are two
      // bets while over 195 twice is an edit of the first.
      { onConflict: 'user_id,prop_id,picked_side,chosen_line' }
    )
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to submit prop pick')
    throw error
  }

  return data
}

/**
 * Remove picks on a prop.
 *
 * `pickId` names one bet. Without it this removes EVERY pending pick the user
 * holds on the prop, which is what the shipped clients mean when they call
 * DELETE /props/picks/:propId — they were written when a prop could only
 * carry one, and they pass no id. Keeping that behaviour means an old app's
 * remove button still removes what its card is showing.
 */
export async function deletePropPick(userId, propId, pickId = null) {
  let query = supabase
    .from('prop_picks')
    .select('id, status')
    .eq('user_id', userId)
    .eq('prop_id', propId)
  if (pickId) query = query.eq('id', pickId)
  const { data: picks } = await query

  if (!picks?.length) {
    const err = new Error('Prop pick not found')
    err.status = 404
    throw err
  }

  // Locked and settled picks are history — refuse the whole call rather than
  // silently removing the half that is still pending.
  const stuck = picks.find((p) => p.status !== 'pending')
  if (stuck) {
    const err = new Error('Cannot undo a locked or settled prop pick')
    err.status = 400
    throw err
  }

  const { error } = await supabase
    .from('prop_picks')
    .delete()
    .in('id', picks.map((p) => p.id))

  if (error) {
    logger.error({ error }, 'Failed to delete prop pick')
    throw error
  }
}

export async function getPropPickById(propPickId) {
  const { data, error } = await supabase
    .from('prop_picks')
    .select('*, player_props(*, games(id, home_team, away_team, starts_at, status, home_score, away_score, sports(key, name)))')
    .eq('id', propPickId)
    .single()

  if (error || !data) {
    const err = new Error('Prop pick not found')
    err.status = 404
    throw err
  }

  // Attach live in-game stat when the pick is locked and the game is live.
  if (data.status === 'locked') {
    try {
      await enrichLockedPicksWithLiveStats([data])
    } catch (e) {
      logger.warn({ err: e?.message, pickId: data.id }, 'Live stat enrichment failed for detail modal')
    }
  }

  // Consensus over/under counts across all settled+locked picks for this prop.
  try {
    const [overCount, underCount] = await Promise.all([
      supabase
        .from('prop_picks')
        .select('*', { count: 'exact', head: true })
        .eq('prop_id', data.prop_id)
        .eq('picked_side', 'over'),
      supabase
        .from('prop_picks')
        .select('*', { count: 'exact', head: true })
        .eq('prop_id', data.prop_id)
        .eq('picked_side', 'under'),
    ])
    data.totalCounts = {
      over: overCount.count || 0,
      under: underCount.count || 0,
    }
  } catch (e) {
    logger.warn({ err: e?.message, pickId: data.id }, 'Consensus lookup failed for detail modal')
    data.totalCounts = { over: 0, under: 0 }
  }

  return applyChosenLine(data)
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

// NFL stats are Sleeper weekly stats (nfl_player_stats). Keep in sync with
// the MARKET_STAT_MAP in jobs/settleNFLProps.js.
function mapNflStatToMarket(stats, marketKey) {
  const STAT_MAP = {
    player_pass_yds: stats.pass_yd,
    player_pass_tds: stats.pass_td,
    player_pass_completions: stats.pass_cmp,
    player_pass_attempts: stats.pass_att,
    player_pass_interceptions: stats.pass_int,
    player_rush_yds: stats.rush_yd,
    player_rush_attempts: stats.rush_att,
    player_reception_yds: stats.rec_yd,
    player_receptions: stats.rec,
    // Any TD counts (rush + rec + kick/punt/INT/fumble returns via
    // return_td). Sportsbooks grade any touchdown; leaving returns out
    // silently under-graded return specialists.
    player_anytime_td: (stats.rush_td || 0) + (stats.rec_td || 0) + (stats.return_td || 0),
  }
  return STAT_MAP[marketKey] ?? null
}

async function enrichLockedPicksWithLiveStats(lockedPicks) {
  if (!lockedPicks.length) return

  // Normalize names so "Jaime Jaquez Jr" matches "Jaime Jaquez Jr." etc.
  // Strips diacritics (é→e — otherwise ESPN's "Ekéler" vs Sleeper's
  // "Ekeler" silently miss), strips trailing periods on suffixes
  // (Jr/Sr/II/III/IV), and collapses whitespace. Also lowercases for
  // case-insensitive joins.
  //
  // Note: shadows the module-scoped normalizeName import (which is the
  // shorter accent+lowercase-only version). This local override is
  // deliberately kept because it also normalizes suffixes and periods
  // that the DFS-salary rows carry inconsistently.
  function normalizeName(name) {
    if (!name) return ''
    return stripAccents(String(name))
      .replace(/\./g, '')                 // strip all periods (C.J. → CJ, Jr. → Jr)
      .replace(/\s+(jr|sr|ii|iii|iv)\s*$/i, ' $1') // normalize suffix
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  try {
    // DFS salary rows (nba_/mlb_/wnba_dfs_salaries) key game_date to the PT
    // sports day. Also include yesterday: games that start before midnight PT
    // but finish after it save their stats under yesterday's game_date, so
    // post-midnight requests would miss them otherwise.
    const today = todaySportsDay()
    const yesterday = yesterdaySportsDay()
    const lookupDates = [today, yesterday]
    const playerNames = [...new Set(lockedPicks.map((p) => p.player_props?.player_name).filter(Boolean))]

    if (!playerNames.length) {
      logger.warn({ pickCount: lockedPicks.length }, 'Live stat enrichment: no player names on locked picks')
      return
    }

    logger.info({ playerNames, today, yesterday, pickCount: lockedPicks.length }, 'Live stat enrichment starting')

    // Look up ESPN IDs from DFS salaries (NBA, MLB, and WNBA). Fetch
    // by date only and match in JS using accent-stripped names so a
    // diacritic mismatch between the prop's stored player_name and the
    // ESPN-roster-derived salary row (e.g. "Jovana Nogić" vs "Jovana
    // Nogic") doesn't silently miss the player.
    const [salaryRes1, salaryRes2, salaryRes3] = await Promise.all([
      supabase.from('nba_dfs_salaries').select('player_name, espn_player_id').in('game_date', lookupDates),
      supabase.from('mlb_dfs_salaries').select('player_name, espn_player_id').in('game_date', lookupDates),
      supabase.from('wnba_dfs_salaries').select('player_name, espn_player_id').in('game_date', lookupDates),
    ])

    const allSalaryRows = [...(salaryRes1.data || []), ...(salaryRes2.data || []), ...(salaryRes3.data || [])]

    if (salaryRes1.error) logger.error({ error: salaryRes1.error }, 'NBA salary lookup failed')
    if (salaryRes2.error) logger.error({ error: salaryRes2.error }, 'MLB salary lookup failed')
    if (salaryRes3.error) logger.error({ error: salaryRes3.error }, 'WNBA salary lookup failed')

    // Build a normalized-name → espn_player_id lookup, then resolve each
    // prop's player_name through it. Preserve the original-name key in
    // idMap for downstream code that still maps by raw player_name.
    const normalizedSalaryMap = {}
    for (const r of allSalaryRows) {
      const key = normalizeName(r.player_name)
      if (key) normalizedSalaryMap[key] = r.espn_player_id
    }
    const idMap = {}
    for (const name of playerNames) {
      const id = normalizedSalaryMap[normalizeName(name)]
      if (id) idMap[name] = id
    }

    const espnIds = Object.values(idMap).filter(Boolean)

    logger.info({ salaryMatches: Object.keys(idMap).length, espnIds: espnIds.length, salaryRows: allSalaryRows.length }, 'Live stat enrichment: salary lookup done')

    // Fetch stats from both tables (by ESPN ID if available, and by name as fallback)
    const queries = await Promise.all([
      espnIds.length
        ? supabase.from('nba_dfs_player_stats').select('espn_player_id, player_name, points, rebounds, assists, steals, blocks, turnovers, three_pointers_made').in('espn_player_id', espnIds).in('game_date', lookupDates)
        : { data: [], error: null },
      espnIds.length
        ? supabase.from('mlb_dfs_player_stats').select('espn_player_id, player_name, hits, runs, home_runs, rbis, stolen_bases, walks, strikeouts, total_bases').in('espn_player_id', espnIds).in('game_date', lookupDates)
        : { data: [], error: null },
      // Pull ALL stats for today+yesterday for in-memory normalized matching
      // (handles "Jaime Jaquez Jr" vs "Jaime Jaquez Jr." and similar drift).
      supabase.from('nba_dfs_player_stats').select('espn_player_id, player_name, points, rebounds, assists, steals, blocks, turnovers, three_pointers_made').in('game_date', lookupDates),
      supabase.from('mlb_dfs_player_stats').select('espn_player_id, player_name, hits, runs, home_runs, rbis, stolen_bases, walks, strikeouts, total_bases').in('game_date', lookupDates),
      // WNBA — same basketball stat columns as NBA.
      espnIds.length
        ? supabase.from('wnba_dfs_player_stats').select('espn_player_id, player_name, points, rebounds, assists, steals, blocks, turnovers, three_pointers_made').in('espn_player_id', espnIds).in('game_date', lookupDates)
        : { data: [], error: null },
      supabase.from('wnba_dfs_player_stats').select('espn_player_id, player_name, points, rebounds, assists, steals, blocks, turnovers, three_pointers_made').in('game_date', lookupDates),
    ])

    const nbaStats = queries[0].data || []
    const mlbStats = queries[1].data || []
    const nbaStatsByName = queries[2].data || []
    const mlbStatsByName = queries[3].data || []
    const wnbaStats = queries[4].data || []
    const wnbaStatsByName = queries[5].data || []

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

    const wnbaById = {}
    const wnbaByName = {}
    for (const s of wnbaStats) wnbaById[s.espn_player_id] = s
    for (const s of wnbaStatsByName) wnbaByName[normalizeName(s.player_name)] = s

    // ESPN fallback — fire whenever we can't find stats for AT LEAST ONE locked
    // pick's player in the DB. We can't rely on "DB is empty" because the
    // scoring job might have picked up an earlier game's stats while a later
    // game's players are still missing. Per-sport, we check each locked pick's
    // player name against the DB's name map; if even one is missing, fetch
    // ESPN directly. The fetched stats are merged into the in-memory maps.
    const nbaLockedPicks = lockedPicks.filter((p) => p.player_props?.games?.sports?.key === 'basketball_nba')
    const mlbLockedPicks = lockedPicks.filter((p) => p.player_props?.games?.sports?.key === 'baseball_mlb')
    const wnbaLockedPicks = lockedPicks.filter((p) => p.player_props?.games?.sports?.key === 'basketball_wnba')

    const nbaMissing = nbaLockedPicks.some((p) => {
      const normName = normalizeName(p.player_props?.player_name)
      const espnId = idMap[p.player_props?.player_name]
      return !((espnId && nbaById[espnId]) || nbaByName[normName])
    })
    const mlbMissing = mlbLockedPicks.some((p) => {
      const normName = normalizeName(p.player_props?.player_name)
      const espnId = idMap[p.player_props?.player_name]
      return !((espnId && mlbById[espnId]) || mlbByName[normName])
    })
    const wnbaMissing = wnbaLockedPicks.some((p) => {
      const normName = normalizeName(p.player_props?.player_name)
      const espnId = idMap[p.player_props?.player_name]
      return !((espnId && wnbaById[espnId]) || wnbaByName[normName])
    })

    if (nbaLockedPicks.length && nbaMissing) {
      try {
        // Fetch both today and yesterday from ESPN — covers post-midnight case
        // where a game that started last night is still wrapping up.
        const [todayStats, yesterdayStats] = await Promise.all([
          fetchNbaStatsFromEspn(today),
          fetchNbaStatsFromEspn(yesterday),
        ])
        const allStats = [...(todayStats.playerStats || []), ...(yesterdayStats.playerStats || [])]
        for (const p of allStats) {
          const row = {
            espn_player_id: p.espnPlayerId,
            player_name: p.playerName,
            ...p.stats,
          }
          nbaById[p.espnPlayerId] = row
          nbaByName[normalizeName(p.playerName)] = row
        }
        logger.info({ count: allStats.length }, 'Live stat enrichment: ESPN NBA fallback fetched')
      } catch (err) {
        logger.error({ err }, 'Live stat enrichment: ESPN NBA fallback failed')
      }
    }

    if (mlbLockedPicks.length && mlbMissing) {
      try {
        const [todayStats, yesterdayStats] = await Promise.all([
          fetchMlbStatsFromEspn(today),
          fetchMlbStatsFromEspn(yesterday),
        ])
        const allStats = [...(todayStats.playerStats || []), ...(yesterdayStats.playerStats || [])]
        for (const p of allStats) {
          const row = {
            espn_player_id: p.espnPlayerId,
            player_name: p.playerName,
            ...p.stats,
          }
          mlbById[p.espnPlayerId] = row
          mlbByName[normalizeName(p.playerName)] = row
        }
        logger.info({ count: allStats.length }, 'Live stat enrichment: ESPN MLB fallback fetched')
      } catch (err) {
        logger.error({ err }, 'Live stat enrichment: ESPN MLB fallback failed')
      }
    }

    if (wnbaLockedPicks.length && wnbaMissing) {
      try {
        const [todayStats, yesterdayStats] = await Promise.all([
          fetchWnbaStatsFromEspn(today),
          fetchWnbaStatsFromEspn(yesterday),
        ])
        const allStats = [...(todayStats.playerStats || []), ...(yesterdayStats.playerStats || [])]
        for (const p of allStats) {
          const row = {
            espn_player_id: p.espnPlayerId,
            player_name: p.playerName,
            ...p.stats,
          }
          wnbaById[p.espnPlayerId] = row
          wnbaByName[normalizeName(p.playerName)] = row
        }
        logger.info({ count: allStats.length }, 'Live stat enrichment: ESPN WNBA fallback fetched')
      } catch (err) {
        logger.error({ err }, 'Live stat enrichment: ESPN WNBA fallback failed')
      }
    }

    // NFL — Sleeper weekly stats (nfl_player_stats), keyed by (player_id,
    // season, week) and matched to props by player name via nfl_players.
    // Separate from the daily/ESPN basketball+baseball path above (NFL is
    // weekly, not daily, and uses Sleeper ids rather than ESPN ids).
    let nflIndex = null
    let nflTeamAbbr = {}
    const nflLockedPicks = lockedPicks.filter((p) => p.player_props?.games?.sports?.key === 'americanfootball_nfl')
    if (nflLockedPicks.length) {
      try {
        const { getCurrentNflWeek, NFL_FULL_TO_ABBR_LOCK } = await import('./tdPassService.js')
        nflTeamAbbr = NFL_FULL_TO_ABBR_LOCK
        const { season, week } = await getCurrentNflWeek()
        // fetchAll, not a bare select: a full NFL week is ~1,150 stat rows and
        // Supabase silently caps an unpaginated query at 1,000. Ja'Marr Chase
        // sat past the cut, so his locked prop showed no live stat mid-game
        // while Gibbs and Watson — who happened to land inside the first
        // thousand — resolved fine. Nothing errored; the rows simply weren't
        // there. .order('player_id') keeps paging deterministic, otherwise
        // rows shift between pages and some are skipped or repeated.
        const nflStats = await fetchAll(
          supabase
            .from('nfl_player_stats')
            .select('player_id, pass_yd, pass_td, pass_cmp, pass_att, pass_int, rush_yd, rush_att, rec, rec_yd, rec_td, rush_td, return_td, nfl_players!inner(full_name, team)')
            .eq('season', season)
            .eq('week', week)
            .order('player_id', { ascending: true }),
        )
        // Indexed through the shared resolver rather than this file's local
        // normalizeName, which keeps generational suffixes: the Odds API
        // says "Mike Washington Jr." and nfl_players says "Mike Washington",
        // so his locked prop showed no live stat all game. The resolver
        // tries the exact name first and only falls back to the suffixless
        // form when it is league-unique, so a father and son on two rosters
        // still can't be confused for one another.
        nflIndex = buildPlayerIndex(nflStats || [], {
          getName: (r) => r.nfl_players?.full_name,
          getTeam: (r) => r.nfl_players?.team,
        })
        logger.info({ rows: (nflStats || []).length, season, week }, 'Live stat enrichment: NFL weekly stats loaded')
      } catch (err) {
        logger.error({ err }, 'Live stat enrichment: NFL weekly stats load failed')
      }
    }

    // ── NCAAF ──────────────────────────────────────────────────────
    // College has no stored stat table — nothing like nfl_player_stats — so
    // until now a college prop simply got no live line while its card showed
    // a live game clock.
    //
    // Settlement solves this with one ESPN summary fetch PER GAME, which is
    // fine for a job that runs after games end but not on a request path:
    // ESPN per-host blocked this server on 2026-08-26 over call volume, and
    // that was background traffic, not users refreshing a props page.
    //
    // The scoreboard carries per-game leaders for exactly the categories we
    // need, in ONE call covering every game on the slate. Cached for 30s, so
    // a whole page of college props — and every user looking at them — shares
    // a single fetch.
    //
    // Limitation, deliberately accepted: ESPN lists only the TOP player per
    // category, so a prop on a non-leading player still gets no line. That is
    // no worse than today, and the leader is who props are usually written
    // on — Malachi Toney was the receiving leader on the card that prompted
    // this. A per-game summary fallback for unmatched players is the next
    // step if gaps show up; it is left out here because that is precisely
    // where the 403 risk lives.
    const ncaafLockedPicks = lockedPicks.filter((p) => p.player_props?.games?.sports?.key === 'americanfootball_ncaaf')
    const ncaafByName = {}
    if (ncaafLockedPicks.length) {
      try {
        // ESPN's scoreboard MUST be asked for explicit dates. Called without
        // them it returns whatever it considers "now" — on a Saturday night
        // at 9:50pm PT that was 16 events out of the day's 52, and the 36 it
        // dropped included games still in progress. Anthony Colandrea had no
        // live line because NEB @ ORE was simply not in the payload, which
        // also means the leaders pass never saw it either.
        //
        // PT-anchored, per utils/sportsDay.js. ESPN keys by a calendar date,
        // and a 7:30pm PT kickoff is already "tomorrow" in ET — asking for
        // the ET date at that hour returns an empty slate. Yesterday is
        // included too, for a late game still running past the rollover.
        //
        // Cached per date, so the two calls are shared across every user and
        // every prop on the page.
        const espnDates = [todaySportsDay(), yesterdaySportsDay()].map((d) => d.replace(/-/g, ''))
        const eventsByDate = await Promise.all(espnDates.map((d) =>
          cached(`ncaafScoreboardLive:${d}`, 30_000, async () => {
            const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?limit=200&dates=${d}`)
            if (!res.ok) throw new Error(`ESPN NCAAF scoreboard ${res.status}`)
            return (await res.json()).events || []
          }).catch((err) => {
            logger.error({ err: err.message, date: d }, 'Live stat enrichment: NCAAF scoreboard date fetch failed')
            return []
          }),
        ))
        // Merge, de-duping by event id — a game can appear under both dates.
        const seenEventIds = new Set()
        const events = []
        for (const list of eventsByDate) {
          for (const ev of list) {
            if (ev?.id && !seenEventIds.has(ev.id)) { seenEventIds.add(ev.id); events.push(ev) }
          }
        }
        for (const ev of events) {
          for (const cat of ev.competitions?.[0]?.leaders || []) {
            for (const l of cat.leaders || []) {
              const name = l.athlete?.displayName
              if (!name) continue
              const key = normalizeName(name)
              const row = ncaafByName[key] || (ncaafByName[key] = {})
              // displayValue packs several stats into one string, and which
              // ones depend on the category:
              //   passingYards    "14/15, 252 YDS, 3 TD"
              //   rushingYards    "10 CAR, 142 YDS, 2 TD"
              //   receivingYards  "4 REC, 96 YDS, 1 TD"
              // so receivingYards alone covers both reception markets.
              const dv = String(l.displayValue || '')
              const yds = dv.match(/([\d,]+)\s*YDS/i)
              const num = (m) => (m ? Number(m[1].replace(/,/g, '')) : null)
              if (cat.name === 'passingYards') row.pass_yd = num(yds)
              else if (cat.name === 'rushingYards') row.rush_yd = num(yds)
              else if (cat.name === 'receivingYards') {
                row.rec_yd = num(yds)
                row.rec = num(dv.match(/(\d+)\s*REC/i))
              }
            }
          }
        }
        logger.info({ players: Object.keys(ncaafByName).length, events: events.length }, 'Live stat enrichment: NCAAF scoreboard leaders loaded')

        // ── Per-game box score, for players the leaders list omits ──────
        //
        // The leaders block above returns ONE player per category per GAME,
        // picked across both teams. So in every matchup the quarterback with
        // the quieter line is invisible — Bear Bachmeier had no number
        // because CJ Carr led ND @ BYU in passing, and Ashton Daniels had
        // none because Darian Mensah led FSU @ MIA. That is not an edge
        // case; it is roughly half of all quarterback props.
        //
        // The gaps the original comment said to watch for duly showed up, so
        // this is the fallback it nominated. The 403 risk it flagged is real
        // (ESPN per-host blocked this server on 2026-08-26 over call volume)
        // and is bounded three ways:
        //
        //   1. Only games that still have an UNMATCHED pick are fetched. A
        //      slate where the leaders happened to cover everyone costs
        //      nothing extra.
        //   2. Each summary is cached 45s under its event id, so every user
        //      looking at the same game shares one fetch.
        //   3. Hard cap of 6 games per pass, and the overflow is logged
        //      rather than dropped silently.
        //
        // Uses the site.web.api mirror, which is the host that got us out of
        // the August block.
        const stillMissing = ncaafLockedPicks.filter(
          (p) => !ncaafByName[normalizeName(p.player_props?.player_name)],
        )
        if (stillMissing.length) {
          // Match our game to its ESPN event through the scoreboard we
          // already hold — no extra lookup, and no reliance on external_id,
          // which is the Odds API's id and not ESPN's.
          const eventByTeams = {}
          for (const ev of events) {
            for (const c of ev.competitions?.[0]?.competitors || []) {
              const dn = c.team?.displayName
              if (dn) eventByTeams[normalizeName(dn)] = ev.id
            }
          }
          const wantedEventIds = new Set()
          for (const p of stillMissing) {
            const g = p.player_props?.games
            const id = eventByTeams[normalizeName(g?.home_team)] || eventByTeams[normalizeName(g?.away_team)]
            if (id) wantedEventIds.add(id)
          }
          const MAX_SUMMARY_FETCHES = 6
          const eventIds = [...wantedEventIds]
          if (eventIds.length > MAX_SUMMARY_FETCHES) {
            logger.warn({ wanted: eventIds.length, cap: MAX_SUMMARY_FETCHES },
              'Live stat enrichment: NCAAF summary fan-out capped — some players will have no live line this pass')
          }
          const results = await Promise.allSettled(eventIds.slice(0, MAX_SUMMARY_FETCHES).map((eventId) =>
            cached(`ncaafSummary:${eventId}`, 45_000, async () => {
              const res = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${eventId}`)
              if (!res.ok) throw new Error(`ESPN NCAAF summary ${res.status}`)
              return (await res.json()).boxscore?.players || []
            }),
          ))
          let added = 0
          for (const r of results) {
            if (r.status !== 'fulfilled') {
              logger.error({ err: r.reason?.message }, 'Live stat enrichment: NCAAF summary fetch failed')
              continue
            }
            for (const team of r.value || []) {
              for (const cat of team.statistics || []) {
                // ESPN labels the columns per category; read by label rather
                // than by index so a layout change cannot silently shift
                // yards into attempts.
                const labels = (cat.labels || []).map((l) => String(l).toUpperCase())
                const yds = labels.indexOf('YDS')
                const rec = labels.indexOf('REC')
                for (const a of cat.athletes || []) {
                  const name = a.athlete?.displayName
                  if (!name) continue
                  const key = normalizeName(name)
                  // Never overwrite a leaders value — same source, and it is
                  // the one already proven to parse.
                  const row = ncaafByName[key] || (ncaafByName[key] = {})
                  const num = (i) => {
                    if (i < 0) return null
                    const v = String(a.stats?.[i] ?? '').replace(/,/g, '')
                    return v === '' || Number.isNaN(Number(v)) ? null : Number(v)
                  }
                  if (cat.name === 'passing' && row.pass_yd == null) row.pass_yd = num(yds)
                  else if (cat.name === 'rushing' && row.rush_yd == null) row.rush_yd = num(yds)
                  else if (cat.name === 'receiving') {
                    if (row.rec_yd == null) row.rec_yd = num(yds)
                    if (row.rec == null) row.rec = num(rec)
                  }
                  added++
                }
              }
            }
          }
          logger.info({ games: Math.min(eventIds.length, MAX_SUMMARY_FETCHES), unmatchedPicks: stillMissing.length, athleteRows: added },
            'Live stat enrichment: NCAAF per-game box scores loaded')
        }
      } catch (err) {
        logger.error({ err: err.message }, 'Live stat enrichment: NCAAF scoreboard load failed')
      }
    }

    // Attach live stats to each locked pick
    for (const pick of lockedPicks) {
      const playerName = pick.player_props?.player_name
      const normName = normalizeName(playerName)
      const espnId = idMap[playerName]
      const marketKey = pick.player_props?.market_key
      const gameStatus = pick.player_props?.games?.status

      const nba = (espnId && nbaById[espnId]) || nbaByName[normName]
      const mlb = (espnId && mlbById[espnId]) || mlbByName[normName]
      const wnba = (espnId && wnbaById[espnId]) || wnbaByName[normName]
      // A prop carries no player team, but its GAME names two — and the
      // player is on one of them. That is enough to disambiguate a shared
      // name, which matters: there are two Justin Jeffersons, a Vikings
      // receiver and a Browns linebacker. Resolving on name alone returns
      // null for him by design, because the old map silently picked
      // whichever row was written last — a coin flip on whose stats
      // appeared on the receiving prop.
      let nfl = null
      if (nflIndex) {
        const g = pick.player_props?.games
        for (const side of [g?.home_team, g?.away_team]) {
          const abbr = nflTeamAbbr[side]
          if (!abbr) continue
          nfl = resolvePlayer(nflIndex, { name: playerName, team: abbr })
          if (nfl) break
        }
        // Falls back to name-only, which still refuses when ambiguous.
        if (!nfl) nfl = resolvePlayer(nflIndex, { name: playerName })
      }
      const ncaaf = ncaafByName[normName]

      if (nba) {
        const mapped = mapNbaStatToMarket(nba, marketKey)
        pick.live_stat = mapped
        logger.info({ playerName, marketKey, mapped, gameStatus, raw: nba }, 'Live stat enriched (NBA)')
      } else if (mlb) {
        const mapped = mapMlbStatToMarket(mlb, marketKey)
        pick.live_stat = mapped
        logger.info({ playerName, marketKey, mapped, gameStatus }, 'Live stat enriched (MLB)')
      } else if (wnba) {
        // WNBA uses the same basketball stat shape + markets as NBA.
        const mapped = mapNbaStatToMarket(wnba, marketKey)
        pick.live_stat = mapped
        logger.info({ playerName, marketKey, mapped, gameStatus, raw: wnba }, 'Live stat enriched (WNBA)')
      } else if (nfl) {
        const mapped = mapNflStatToMarket(nfl, marketKey)
        pick.live_stat = mapped
        logger.info({ playerName, marketKey, mapped, gameStatus }, 'Live stat enriched (NFL)')
      } else if (ncaaf) {
        // Same four markets settleNCAAFProps maps, and the same shape — the
        // comment there says "keep in sync with the NCAAF branch of
        // enrichLockedPicksWithLiveStats", which until now did not exist.
        // undefined rather than null for an unmapped market, so a market we
        // have no college data for is left alone instead of being asserted
        // as zero.
        const mapped = {
          player_pass_yds: ncaaf.pass_yd,
          player_rush_yds: ncaaf.rush_yd,
          player_reception_yds: ncaaf.rec_yd,
          player_receptions: ncaaf.rec,
        }[marketKey]
        if (mapped != null) {
          pick.live_stat = mapped
          logger.info({ playerName, marketKey, mapped, gameStatus }, 'Live stat enriched (NCAAF)')
        }
      } else {
        // Basketball "haven't played yet" fallback: a bench player whose
        // game is live but who hasn't checked in (or has checked in but
        // recorded zero of the requested stat) won't appear in the DFS
        // stats table or ESPN's box score. If we KNOW the player is in
        // the system (matched an espn_player_id from salaries), default
        // their live stat to 0 so the UI surfaces a real number instead
        // of falling silent. Scoped to NBA/WNBA only — MLB and NFL
        // bench/inactive semantics differ and defaulting to 0 could
        // mislead.
        const sportKey = pick.player_props?.games?.sports?.key
        const isBasketball = sportKey === 'basketball_wnba' || sportKey === 'basketball_nba'
        if (isBasketball && gameStatus === 'live' && espnId) {
          pick.live_stat = 0
          logger.info({ playerName, marketKey, sportKey, gameStatus }, 'Live stat defaulted to 0 (basketball player has not recorded the stat)')
        } else {
          logger.warn({ playerName, espnId, marketKey, today, gameStatus, sportKey, nbaByIdKeys: Object.keys(nbaById), nbaByNameKeys: Object.keys(nbaByName) }, 'Live stat enrichment: no stats found for player')
        }
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

  // Live-stat enrichment is now served by a separate lightweight endpoint
  // (getUserLivePropStats) so this list query stays fast and ESPN round-trips
  // happen on their own cadence rather than on every picks refetch.
  return applyChosenLine(data || [])
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

  // Live-stat enrichment is served by getUserLivePropStats on its own cadence.
  return applyChosenLine(data || [])
}

/**
 * Lightweight endpoint for the live-score polling loop.
 * Returns a map of { [pickId]: live_stat } for the user's locked picks. The
 * shared enrichLockedPicksWithLiveStats does the heavy lifting (DB lookup +
 * ESPN fallback); we just surface its output as a compact map so clients can
 * poll this on its own interval without re-fetching the whole pick list.
 */
export async function getUserLivePropStats(userId) {
  const { data, error } = await supabase
    .from('prop_picks')
    .select('id, prop_id, player_props(player_name, market_key, games(sports(key)))')
    .eq('user_id', userId)
    .eq('status', 'locked')

  if (error) throw error

  const lockedPicks = data || []
  if (!lockedPicks.length) return {}

  await enrichLockedPicksWithLiveStats(lockedPicks)

  const result = {}
  for (const pick of lockedPicks) {
    if (pick.live_stat != null) result[pick.id] = pick.live_stat
  }
  return result
}
