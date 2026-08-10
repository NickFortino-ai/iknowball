// Public landing-page scores strip. Aggregates upcoming + live + recent
// finals for NFL / NBA / MLB / WNBA in one round-trip so the homepage
// can render 4 sport columns without fanning out 12 requests.
//
// No auth: this endpoint drives the LANDING page (which is visible to
// logged-out users), so gating on requireAuth would break the whole
// point. All returned data is public game info already visible via
// the Odds API + ESPN.

import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { expandSportFamily } from '../utils/nflFamily.js'
import { sportsDayBoundsUtc } from '../utils/sportsDay.js'
import { getTeamRecords, lookupRecord, lookupShortName } from '../services/teamRecordsService.js'

const router = Router()

// Sport keys to include in the strip. NFL rolls up regular + preseason
// via expandSportFamily so the NFL column shows both.
const STRIP_SPORTS = ['nfl', 'nba', 'mlb', 'wnba']
const SHORT_TO_FULL = {
  nfl: 'americanfootball_nfl',
  nba: 'basketball_nba',
  mlb: 'baseball_mlb',
  wnba: 'basketball_wnba',
}

// Per-bucket caps: keep the payload small even for a Sunday NFL slate
// or a full MLB night.
const UPCOMING_LIMIT = 8
const RECENT_LIMIT = 6
// Recent-finals window: 30h covers overnight games that finished after
// midnight but started yesterday.
const RECENT_WINDOW_MS = 30 * 60 * 60 * 1000
// Zombie-live guard: a real live game gets updated_at bumped every
// 15-30s by the score-sync cron. If a row's status='live' but
// updated_at is more than 6h stale, the sync stopped touching it —
// almost always means the cron missed the transition to 'final' and
// the game ended long ago. Excluding these keeps months-old ghosts
// (see /server/scripts diagnostics) off the landing page.
const LIVE_STALE_CUTOFF_MS = 6 * 60 * 60 * 1000
// Upcoming window: 7 days lets the NFL column show the coming Sunday
// slate even when browsing on Wednesday; MLB/NBA/WNBA still see ~2-3
// days of games since their cadence is daily.
const UPCOMING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

router.get('/strip', async (req, res) => {
  const now = new Date()
  const nowIso = now.toISOString()
  const recentCutoff = new Date(now.getTime() - RECENT_WINDOW_MS).toISOString()
  const upcomingCutoff = new Date(now.getTime() + UPCOMING_WINDOW_MS).toISOString()
  const liveStaleCutoff = new Date(now.getTime() - LIVE_STALE_CUTOFF_MS).toISOString()

  // Resolve all sport_ids we care about in one shot. Includes NFL
  // preseason as a distinct sports row so the NFL column captures both.
  const allSportKeys = [...new Set(STRIP_SPORTS.flatMap((s) => expandSportFamily(SHORT_TO_FULL[s])))]
  const { data: sports, error: sportsErr } = await supabase
    .from('sports')
    .select('id, key')
    .in('key', allSportKeys)
  if (sportsErr) return res.status(500).json({ error: sportsErr.message })
  if (!sports?.length) return res.json({ nfl: emptyCol(), nba: emptyCol(), mlb: emptyCol(), wnba: emptyCol() })

  const sportIdToShort = {}
  for (const s of sports) {
    // Reverse-map full sport key → short key, folding preseason back into 'nfl'.
    if (s.key === 'americanfootball_nfl_preseason' || s.key === 'americanfootball_nfl') sportIdToShort[s.id] = 'nfl'
    else if (s.key === 'basketball_nba') sportIdToShort[s.id] = 'nba'
    else if (s.key === 'baseball_mlb') sportIdToShort[s.id] = 'mlb'
    else if (s.key === 'basketball_wnba') sportIdToShort[s.id] = 'wnba'
  }
  // sport_ids are UUIDs — pass the map keys through as strings, NOT
  // Number()-cast (that was returning NaN and blowing up the .in()).
  const sportIds = Object.keys(sportIdToShort)

  // Three parallel queries — live, upcoming (windowed), recent finals
  // (windowed). Fewer queries than per-sport-per-bucket, and partitioned
  // in JS below.
  const [liveRes, upcomingRes, recentRes] = await Promise.all([
    supabase
      .from('games')
      .select('id, sport_id, home_team, away_team, home_score, away_score, starts_at, status, updated_at')
      .in('sport_id', sportIds)
      .eq('status', 'live')
      .gte('updated_at', liveStaleCutoff)
      .order('starts_at', { ascending: true }),
    supabase
      .from('games')
      .select('id, sport_id, home_team, away_team, home_score, away_score, starts_at, status')
      .in('sport_id', sportIds)
      .eq('status', 'upcoming')
      .gte('starts_at', nowIso)
      .lte('starts_at', upcomingCutoff)
      .order('starts_at', { ascending: true }),
    supabase
      .from('games')
      .select('id, sport_id, home_team, away_team, home_score, away_score, starts_at, status')
      .in('sport_id', sportIds)
      .eq('status', 'final')
      .gte('starts_at', recentCutoff)
      .order('starts_at', { ascending: false }),
  ])

  if (liveRes.error || upcomingRes.error || recentRes.error) {
    return res.status(500).json({ error: 'scores fetch failed' })
  }

  // Warm per-sport team-record caches in parallel with the DB queries
  // above (which already ran). First hit per sport per server-restart
  // takes ~500ms; subsequent hits are instant (1h TTL). Safe to run
  // as fire-and-forget from the request path — if a record is missing,
  // the team just renders without one.
  const recordSportKeys = ['americanfootball_nfl', 'basketball_nba', 'baseball_mlb', 'basketball_wnba']
  await Promise.all(recordSportKeys.map((k) => getTeamRecords(k)))

  // Bucket by short sport key.
  const shortToFullForRecords = {
    nfl: 'americanfootball_nfl', nba: 'basketball_nba',
    mlb: 'baseball_mlb', wnba: 'basketball_wnba',
  }
  const out = { nfl: emptyCol(), nba: emptyCol(), mlb: emptyCol(), wnba: emptyCol() }
  const attach = (s, g) => shape(g, shortToFullForRecords[s])
  for (const g of liveRes.data || []) {
    const s = sportIdToShort[g.sport_id]
    if (s) out[s].live.push(attach(s, g))
  }
  for (const g of upcomingRes.data || []) {
    const s = sportIdToShort[g.sport_id]
    if (s && out[s].upcoming.length < UPCOMING_LIMIT) out[s].upcoming.push(attach(s, g))
  }
  for (const g of recentRes.data || []) {
    const s = sportIdToShort[g.sport_id]
    if (s && out[s].recent.length < RECENT_LIMIT) out[s].recent.push(attach(s, g))
  }

  // Short cache header — clients also poll but this dampens repeat
  // landing-page hits from the same session/CDN.
  res.set('Cache-Control', 'public, max-age=15')
  res.json(out)
})

// Per-sport historical finals for a given PT calendar date. Powers
// the Final section's date scrubber on the landing card — user taps
// the left arrow, we hit this with date=YYYY-MM-DD.
//
// Cache header is generous (5min) because finals for a completed
// past day never change — no reason to keep hitting the DB.
router.get('/finals', async (req, res) => {
  const shortSport = String(req.query.sport || '').toLowerCase()
  const date = String(req.query.date || '')
  const full = SHORT_TO_FULL[shortSport]
  if (!full) return res.status(400).json({ error: 'sport must be one of nfl/nba/mlb/wnba' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })

  const { startUtc, endUtc } = sportsDayBoundsUtc(date)
  if (!startUtc) return res.status(400).json({ error: 'invalid date' })

  const keys = expandSportFamily(full)
  const { data: sports } = await supabase.from('sports').select('id, key').in('key', keys)
  const sportIds = (sports || []).map((s) => s.id)
  if (!sportIds.length) return res.json([])

  const { data: games, error } = await supabase
    .from('games')
    .select('id, sport_id, home_team, away_team, home_score, away_score, starts_at, status')
    .in('sport_id', sportIds)
    .eq('status', 'final')
    .gte('starts_at', startUtc)
    .lt('starts_at', endUtc)
    .order('starts_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  // Warm the record cache for the requested sport before mapping.
  await getTeamRecords(full)
  res.set('Cache-Control', 'public, max-age=300')
  res.json((games || []).map((g) => shape(g, full)))
})

function emptyCol() {
  return { live: [], upcoming: [], recent: [] }
}

function shape(g, sportFullKey) {
  const homeRec = sportFullKey ? lookupRecord(sportFullKey, g.home_team) : null
  const awayRec = sportFullKey ? lookupRecord(sportFullKey, g.away_team) : null
  const homeShort = sportFullKey ? lookupShortName(sportFullKey, g.home_team) : null
  const awayShort = sportFullKey ? lookupShortName(sportFullKey, g.away_team) : null
  return {
    id: g.id,
    // Full names retained so the client can fall back if a short
    // name isn't in the record cache yet (first request per sport
    // per server-restart).
    home_team: g.home_team,
    away_team: g.away_team,
    // City-stripped display names (Lions, Braves, Red Sox) — nicer
    // to render on the strip than 'Detroit Lions'.
    home_short: homeShort,
    away_short: awayShort,
    home_score: g.home_score,
    away_score: g.away_score,
    starts_at: g.starts_at,
    status: g.status,
    home_record: homeRec ? formatRecord(homeRec) : null,
    away_record: awayRec ? formatRecord(awayRec) : null,
  }
}

function formatRecord(r) {
  if (r.t > 0) return `${r.w}-${r.l}-${r.t}`
  return `${r.w}-${r.l}`
}

export default router
