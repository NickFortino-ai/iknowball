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

function normalize(sportKey, summary) {
  const header = summary?.header || {}
  const competition = header?.competitions?.[0] || {}
  const status = competition?.status?.type || {}
  const statusState = status.state || 'pre' // 'pre' | 'in' | 'post'
  const statusMap = { pre: 'upcoming', in: 'live', post: 'final' }
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
      logo: c.team?.logo || c.team?.logos?.[0]?.href || null,
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
    status_detail: status.description || status.shortDetail || null,
    teams,
    line_score_headers,
    stat_groups,
    scoring_plays,
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

  if (normalized) {
    const ttl = normalized.status === 'final' ? FINAL_TTL_MS : LIVE_TTL_MS
    cache.set(gameId, { data: { ...normalized, game_id: gameId }, expiresAt: now + ttl })
    return cache.get(gameId).data
  }
  return null
}
