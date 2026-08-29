// Post-game box score fetcher. Normalizes ESPN's /summary?event payload
// into a sport-agnostic shape the client can render as tables:
//
//   {
//     game_id, sport_key, status: 'final' | 'live' | 'upcoming',
//     status_detail: 'Final' | 'Final/OT' | 'Bottom 7th' | ...,
//     teams: [{ id, name, short, abbr, logo, record, score, home_away, linescore: [] }],
//     line_score_headers: ['1','2','3','4','T']  // per-quarter labels
//     stat_groups: {
//       [espn_team_id]: [
//         { title: 'Passing', labels: [...], descriptions: [...],
//           athletes: [{ id, name, short, position, stats: [...] }] },
//         ...
//       ]
//     },
//     scoring_plays: [                       // NFL / soccer only
//       { period, clock, home_score, away_score, team_id, text }
//     ]
//   }
//
// Finals are cached for 12h since the payload never changes once posted.
// Live games are cached 30s so ESPN's clock/period stays fresh.

import { logger } from '../utils/logger.js'
import { supabase } from '../config/supabase.js'
import { findESPNEventId } from './espnService.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'
const SPORT_TO_PATH = {
  americanfootball_nfl: 'football/nfl',
  americanfootball_nfl_preseason: 'football/nfl',
  americanfootball_ncaaf: 'football/college-football',
  americanfootball_ufl: 'football/ufl',
  basketball_nba: 'basketball/nba',
  basketball_wnba: 'basketball/wnba',
  basketball_ncaab: 'basketball/mens-college-basketball',
  baseball_mlb: 'baseball/mlb',
  icehockey_nhl: 'hockey/nhl',
  soccer_usa_mls: 'soccer/usa.1',
  soccer_world_cup: 'soccer/fifa.world',
}

// MLB's boxscore groups are unnamed but predictable — first is batting,
// second is pitching. Same story for basketball (single "player stats"
// group). NFL/soccer name their groups explicitly. Fallback for any
// unlabeled group uses this per-sport ordinal map.
const FALLBACK_GROUP_TITLES = {
  baseball_mlb: ['Batting', 'Pitching', 'Fielding'],
  basketball_nba: ['Player Stats'],
  basketball_wnba: ['Player Stats'],
  basketball_ncaab: ['Player Stats'],
  soccer_usa_mls: ['Field Players', 'Goalkeepers'],
  soccer_world_cup: ['Field Players', 'Goalkeepers'],
}

// Title-case an ESPN group name ('kickReturns' → 'Kick Returns').
function humanizeGroupName(name) {
  if (!name) return null
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim()
}

const FINAL_TTL_MS = 12 * 60 * 60 * 1000
const LIVE_TTL_MS = 30 * 1000
const cache = new Map() // gameId → { data, expiresAt }

async function fetchSummary(sportKey, espnEventId) {
  const path = SPORT_TO_PATH[sportKey]
  if (!path || !espnEventId) return null
  const url = `${ESPN_BASE}/${path}/summary?event=${espnEventId}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN summary ${res.status} for ${sportKey} event ${espnEventId}`)
  return res.json()
}

// Season-to-date results for one team, cached per (sport, team, season).
//
// College teams play ~12 regular-season games, so the whole season fits
// where a pro sport would need truncating — and it grows week by week
// rather than being a fixed trailing window.
//
// This is the one part of the preview that costs extra ESPN requests (one
// per team), so it's cached for an hour. Results only change when a game
// finishes, and the cache is per team rather than per matchup, so a busy
// Saturday shares entries across every preview involving that team.
const seasonResultsCache = new Map() // `${path}:${teamId}:${season}` → { rows, expiresAt }
const SEASON_RESULTS_TTL_MS = 60 * 60 * 1000

// Sports whose full season fits on screen — college football plays ~12
// games, the NFL 17. Everything else keeps ESPN's trailing five, because
// 162 MLB chips is not a design.
const SEASON_RESULTS_SPORTS = new Set([
  'americanfootball_ncaaf',
  'americanfootball_nfl',
  'americanfootball_nfl_preseason',
])

async function fetchSeasonResults(espnPath, teamId, season) {
  const key = `${espnPath}:${teamId}:${season}`
  const hit = seasonResultsCache.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.rows

  let rows = []
  try {
    // seasontype=2 = regular season. Without it ESPN folds preseason
    // exhibitions in — an NFL team showed a 2-0 "This season" record in late
    // August purely from preseason games. teamRecordsService hit the same
    // trap and pins the same param for the same reason.
    const res = await fetch(`${ESPN_BASE}/${espnPath}/teams/${teamId}/schedule?season=${season}&seasontype=2`)
    if (res.ok) {
      const data = await res.json()
      for (const ev of data.events || []) {
        const comp = ev.competitions?.[0]
        if (!comp?.status?.type?.completed) continue
        // Belt and braces — the param above should already exclude these,
        // but a stray preseason row would silently distort the record.
        if (ev.seasonType?.id && String(ev.seasonType.id) !== '2') continue
        const competitors = comp.competitors || []
        const me = competitors.find((c) => String(c.team?.id) === String(teamId))
        const opp = competitors.find((c) => String(c.team?.id) !== String(teamId))
        if (!me || !opp) continue
        const myScore = Number(me.score?.value ?? me.score?.displayValue ?? me.score)
        const oppScore = Number(opp.score?.value ?? opp.score?.displayValue ?? opp.score)
        rows.push({
          date: ev.date || null,
          result: me.winner === true ? 'W' : opp.winner === true ? 'L' : 'T',
          score: Number.isFinite(myScore) && Number.isFinite(oppScore) ? `${myScore}-${oppScore}` : null,
          at_vs: me.homeAway === 'home' ? 'vs' : '@',
          opponent: opp.team?.abbreviation || opp.team?.displayName || null,
        })
      }
    }
  } catch {
    // Preview section — never let it break the box score it rides along with.
    rows = []
  }

  seasonResultsCache.set(key, { rows, expiresAt: Date.now() + SEASON_RESULTS_TTL_MS })
  return rows
}

// Pre-game preview, assembled from the same ESPN summary payload the box
// score already fetches — no extra request, except the optional
// season-results lookup above.
//
// Every section is optional and independently guarded. ESPN's coverage
// varies by sport and by how close to kickoff you ask: in Week 1 the
// `leaders` categories come back with no athletes at all because nobody
// has current-season stats yet, and `predictor` is missing for low-profile
// matchups. Anything absent is simply omitted so the client renders fewer
// cards rather than empty ones.
function extractPreview(summary) {
  const preview = {}

  const venue = summary?.gameInfo?.venue
  if (venue?.fullName) {
    const addr = venue.address || {}
    preview.venue = {
      name: venue.fullName,
      location: [addr.city, addr.state || addr.country].filter(Boolean).join(', ') || null,
    }
  }

  // Betting line. `details` is already human-readable ("TCU -9.5").
  const pick = (summary?.pickcenter || [])[0]
  if (pick?.details || pick?.overUnder != null) {
    preview.odds = {
      details: pick.details || null,
      over_under: pick.overUnder ?? null,
      provider: pick.provider?.name || null,
    }
  }

  // ESPN's matchup predictor. gameProjection is the HOME team's win chance.
  const pred = summary?.predictor
  const homePct = Number(pred?.homeTeam?.gameProjection)
  if (Number.isFinite(homePct)) {
    preview.predictor = {
      home_pct: Math.round(homePct * 10) / 10,
      away_pct: Math.round((100 - homePct) * 10) / 10,
    }
  }

  // ESPN's own preview article. The headline is the only genuinely
  // game-specific prose anywhere in the payload ("Another North Carolina vs.
  // TCU opener, this one in Ireland to open Belichick's 2nd Heels season"),
  // and it costs no extra request. Gated on type so a finished game's RECAP
  // headline — which gives away the result — never renders as a preview.
  const article = summary?.article
  if (article?.headline && /preview/i.test(article.type || '')) {
    preview.blurb = { headline: article.headline }
    // The description is otherwise redundant with the header (matchup + time),
    // but it carries the TV channel, and `broadcasts` comes back empty on a
    // lot of college games — so this is often the only place it exists.
    const watch = /how to watch:\s*([^\r\n]+)/i.exec(article.description || '')
    // Trailing punctuation varies by game ("ESPN" vs "ESPN.").
    const channel = watch?.[1]?.replace(/[.\s]+$/, '')
    if (channel) preview.blurb.broadcast = channel
  }

  // Recent form, most recent first. ESPN returns oldest-first.
  const lastFive = (summary?.lastFiveGames || [])
    .map((entry) => ({
      team_id: entry.team?.id ? String(entry.team.id) : null,
      team_abbr: entry.team?.abbreviation || null,
      games: (entry.events || [])
        .map((ev) => ({
          date: ev.gameDate || null,
          result: ev.gameResult || null,
          score: ev.score || null,
          at_vs: ev.atVs || null,
          opponent: ev.opponent?.abbreviation || ev.opponent?.displayName || null,
          opponent_logo: ev.opponent?.logos?.find((l) => (l.rel || []).includes('dark'))?.href
            || ev.opponent?.logo
            || null,
        }))
        .reverse(),
    }))
    .filter((t) => t.games.length)
  if (lastFive.length) preview.last_five = lastFive

  // Statistical leaders. Categories with no athlete are dropped, and a team
  // with no populated categories is dropped entirely — that's the Week 1
  // case, where including it would render a header over nothing.
  const leaders = (summary?.leaders || [])
    .map((entry) => ({
      team_id: entry.team?.id ? String(entry.team.id) : null,
      team_abbr: entry.team?.abbreviation || null,
      categories: (entry.leaders || [])
        .map((cat) => {
          const top = (cat.leaders || [])[0]
          if (!top?.athlete?.displayName) return null
          return {
            label: cat.displayName || cat.name || null,
            name: top.athlete.displayName,
            value: top.displayValue || null,
          }
        })
        .filter(Boolean),
    }))
    .filter((t) => t.categories.length)
  if (leaders.length) preview.leaders = leaders

  if (!Object.keys(preview).length) return null

  // last_five / season_results / leaders are keyed by ESPN team id. Game
  // Center matches them against its own team objects, which carry those ids —
  // but the Picks Game Intel modal only knows team NAMES and passes synthetic
  // {id:'away'} / {id:'home'} objects, so every one of those sections silently
  // matched nothing there. Publishing the two ids lets that caller resolve
  // them without having to plumb ESPN ids through the injuries payload.
  const competitors = summary?.header?.competitions?.[0]?.competitors || []
  for (const c of competitors) {
    if (!c.team?.id) continue
    if (c.homeAway === 'home') preview.home_team_id = String(c.team.id)
    if (c.homeAway === 'away') preview.away_team_id = String(c.team.id)
  }

  return preview
}

function normalize(sportKey, summary) {
  const header = summary?.header || {}
  const competition = header?.competitions?.[0] || {}
  const status = competition?.status?.type || {}
  const statusState = status.state || 'pre' // 'pre' | 'in' | 'post'
  const statusMap = { pre: 'upcoming', in: 'live', post: 'final' }
  const displayClock = competition?.status?.displayClock || null
  const period = competition?.status?.period || null
  const boxscore = summary?.boxscore || {}
  const players = boxscore?.players || []
  const teamMeta = new Map()
  for (const t of boxscore?.teams || []) {
    if (t.team?.id) teamMeta.set(String(t.team.id), t)
  }

  const teams = (competition?.competitors || []).map((c) => {
    const linescore = (c.linescores || []).map((ls) => (ls.value ?? ls.displayValue ?? null))
    return {
      id: String(c.team?.id || ''),
      name: c.team?.displayName || c.team?.name || null,
      short: c.team?.shortDisplayName || c.team?.name || null,
      abbr: c.team?.abbreviation || null,
      // ESPN ships several logo variants; logos[0] is the "default" one,
      // drawn for light backgrounds. On our dark UI that's how Ohio State
      // rendered as a near-black blob. Prefer the rel:'dark' entry — same
      // lesson as teamLogos.js, but this modal takes its logos straight from
      // ESPN's summary rather than that helper, so it needed fixing here too.
      logo: c.team?.logos?.find((l) => (l.rel || []).includes('dark'))?.href
        || c.team?.logo
        || c.team?.logos?.[0]?.href
        || null,
      record: c.records?.find((r) => r.name === 'overall' || r.type === 'total')?.summary
        || c.records?.[0]?.summary
        || null,
      score: c.score != null ? Number(c.score) : null,
      home_away: c.homeAway || null,
      linescore,
    }
  })

  // Line-score header labels (Q1..Q4 for football, 1..9 for MLB, H1/H2 for
  // soccer, etc). ESPN doesn't include them cleanly — infer from the length.
  const lineLen = teams.reduce((max, t) => Math.max(max, t.linescore.length), 0)
  let line_score_headers = []
  if (lineLen > 0) {
    if (sportKey.startsWith('americanfootball_')) {
      line_score_headers = Array.from({ length: lineLen }, (_, i) => (i < 4 ? `Q${i + 1}` : `OT${i - 3}`))
    } else if (sportKey.startsWith('basketball_')) {
      line_score_headers = Array.from({ length: lineLen }, (_, i) => (i < 4 ? `Q${i + 1}` : `OT${i - 3}`))
    } else if (sportKey === 'baseball_mlb') {
      line_score_headers = Array.from({ length: lineLen }, (_, i) => `${i + 1}`)
    } else if (sportKey === 'icehockey_nhl') {
      line_score_headers = Array.from({ length: lineLen }, (_, i) => (i < 3 ? `P${i + 1}` : i === 3 ? 'OT' : 'SO'))
    } else if (sportKey.startsWith('soccer_')) {
      line_score_headers = Array.from({ length: lineLen }, (_, i) => (i < 2 ? `${i + 1}H` : i === 2 ? 'ET' : 'PK'))
    } else {
      line_score_headers = Array.from({ length: lineLen }, (_, i) => `${i + 1}`)
    }
    line_score_headers.push('T')
  }

  const fallbackTitles = FALLBACK_GROUP_TITLES[sportKey] || []
  const stat_groups = {}
  for (const teamBlock of players) {
    const teamId = String(teamBlock?.team?.id || '')
    if (!teamId) continue
    const groups = []
    ;(teamBlock.statistics || []).forEach((g, idx) => {
      const title = humanizeGroupName(g.name) || fallbackTitles[idx] || `Group ${idx + 1}`
      const athletes = (g.athletes || []).map((a) => ({
        id: a.athlete?.id ? String(a.athlete.id) : null,
        name: a.athlete?.displayName || null,
        short: a.athlete?.shortName || null,
        position: a.athlete?.position?.abbreviation || null,
        headshot: a.athlete?.headshot?.href || null,
        stats: a.stats || [],
        starter: !!a.starter,
        did_not_play: !!a.didNotPlay,
      }))
      groups.push({
        title,
        labels: g.labels || [],
        descriptions: g.descriptions || [],
        totals: g.totals || null,
        athletes,
      })
    })
    stat_groups[teamId] = groups
  }

  // Scoring plays (football + soccer). Basketball/MLB rarely populate.
  const scoring_plays = (summary?.scoringPlays || []).map((p) => ({
    period: p.period?.number ?? null,
    clock: p.clock?.displayValue ?? null,
    home_score: p.homeScore ?? null,
    away_score: p.awayScore ?? null,
    team_id: p.team?.id ? String(p.team.id) : null,
    text: p.text || p.type?.text || null,
  }))

  return {
    sport_key: sportKey,
    status: statusMap[statusState] || 'upcoming',
    // shortDetail typically embeds the clock ("10:21 - 1st Quarter"),
    // description doesn't ("1st Quarter"). Prefer shortDetail so live
    // games surface the clock; finals collapse to "Final" either way.
    status_detail: status.shortDetail || status.description || null,
    period,
    display_clock: displayClock,
    teams,
    line_score_headers,
    stat_groups,
    scoring_plays,
    // Only meaningful before kickoff — once a game is live or final the box
    // score itself is the story, and the odds/predictor become noise.
    preview: statusState === 'pre' ? extractPreview(summary) : null,
  }
}

// Public entry point. Reads the game row, resolves ESPN event id, fetches
// + normalizes the summary. Caches by gameId with a longer TTL once the
// underlying game has finalized.
export async function getBoxScore(gameId) {
  const now = Date.now()
  const cached = cache.get(gameId)
  if (cached && cached.expiresAt > now) return cached.data

  const { data: game, error } = await supabase
    .from('games')
    .select('id, home_team, away_team, starts_at, status, sports!inner(key)')
    .eq('id', gameId)
    .single()
  if (error || !game) return null

  const sportKey = game.sports?.key
  if (!sportKey || !SPORT_TO_PATH[sportKey]) return null

  let normalized = null
  try {
    const espnEventId = await findESPNEventId(sportKey, game.home_team, game.away_team, game.starts_at)
    if (!espnEventId) {
      logger.warn({ gameId, sportKey, home: game.home_team, away: game.away_team }, 'No ESPN event id — skipping box score')
      return null
    }
    const summary = await fetchSummary(sportKey, espnEventId)
    if (summary) normalized = normalize(sportKey, summary)
  } catch (err) {
    logger.warn({ err: err.message, gameId, sportKey }, 'Box score fetch failed')
    return null
  }

  // College football only: swap the 5-game trailing window for the season
  // so far. A 12-game schedule fits on screen, and it fills in week by week
  // rather than reaching back into last season — which is what ESPN's
  // lastFiveGames does before a new season starts, so in Week 1 "Last 5"
  // was quietly showing 2025 results.
  //
  // Done here rather than inside normalize() so that stays synchronous, and
  // so the extra ESPN calls only happen for upcoming NCAAF games that
  // actually have a preview.
  if (normalized?.preview && SEASON_RESULTS_SPORTS.has(sportKey)) {
    // Football seasons straddle the new year — a January playoff game belongs
    // to the PREVIOUS season (Super Bowl LX in Feb 2027 is the 2026 season),
    // and college bowl games run into January too. Taking the calendar year
    // would ask ESPN for a season that hasn't been played and come back empty.
    const kickoff = new Date(game.starts_at)
    const season = kickoff.getUTCMonth() < 2 ? kickoff.getUTCFullYear() - 1 : kickoff.getUTCFullYear()
    const espnPath = SPORT_TO_PATH[sportKey]
    const rows = await Promise.all(
      (normalized.teams || []).map(async (t) => ({
        team_id: t.id ? String(t.id) : null,
        team_abbr: t.abbr || null,
        games: t.id ? await fetchSeasonResults(espnPath, t.id, season) : [],
      }))
    )
    const withGames = rows.filter((r) => r.games.length)
    if (withGames.length) {
      // Season is underway — the real thing beats the trailing window.
      delete normalized.preview.last_five
      normalized.preview.season_results = withGames
    } else {
      // Week 1: no current-season results exist yet. Dropping last_five here
      // (which is what this used to do unconditionally) left the preview with
      // only odds, predictor and venue — the "bare modal". ESPN's
      // lastFiveGames still holds last season's five, which is genuinely
      // useful as long as it isn't passed off as current form, so keep it and
      // stamp the season the client must label it with.
      if (normalized.preview.last_five) normalized.preview.last_five_season = season - 1
    }
    if (!Object.keys(normalized.preview).length) normalized.preview = null
  }

  if (normalized) {
    const ttl = normalized.status === 'final' ? FINAL_TTL_MS : LIVE_TTL_MS
    cache.set(gameId, { data: { ...normalized, game_id: gameId }, expiresAt: now + ttl })
    return cache.get(gameId).data
  }
  return null
}
