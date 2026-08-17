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
import { sportsDayBoundsUtc, toSportsDay } from '../utils/sportsDay.js'
import { getTeamRecords, lookupRecord, lookupShortName } from '../services/teamRecordsService.js'
import { warmMlbLinescores, getMlbLinescoreForGame } from '../services/mlbLinescoresService.js'

const router = Router()

// Sport keys to include in the strip. NFL rolls up regular + preseason
// via expandSportFamily so the NFL column shows both.
const STRIP_SPORTS = ['nfl', 'nba', 'mlb', 'wnba', 'mls', 'ncaaf', 'ncaab']
const SHORT_TO_FULL = {
  nfl: 'americanfootball_nfl',
  nba: 'basketball_nba',
  mlb: 'baseball_mlb',
  wnba: 'basketball_wnba',
  mls: 'soccer_usa_mls',
  ncaaf: 'americanfootball_ncaaf',
  ncaab: 'basketball_ncaab',
}

// Per-bucket caps: high enough to cover a full daily slate for any
// sport we surface — MLB has 15 games some nights, NFL Sunday runs
// 13 games. Previously capped at 8 which silently dropped a couple
// per full MLB night ('why isn't Giants @ Padres showing?').
const UPCOMING_LIMIT = 20
const RECENT_LIMIT = 20
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
// 30-day window handles the gap between preseason weeks and Week 1 for
// NFL (and any long weekly-cadence gap for NCAAF). Daily-cadence sports
// (MLB, MLS, NCAAB) have a "today only" filter downstream that keeps
// their upcoming column from spilling into the following weeks.
const UPCOMING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

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
  if (!sports?.length) return res.json({ nfl: emptyCol(), nba: emptyCol(), mlb: emptyCol(), wnba: emptyCol(), mls: emptyCol(), ncaaf: emptyCol(), ncaab: emptyCol() })

  const sportIdToShort = {}
  for (const s of sports) {
    // Reverse-map full sport key → short key, folding preseason back into 'nfl'.
    if (s.key === 'americanfootball_nfl_preseason' || s.key === 'americanfootball_nfl') sportIdToShort[s.id] = 'nfl'
    else if (s.key === 'basketball_nba') sportIdToShort[s.id] = 'nba'
    else if (s.key === 'baseball_mlb') sportIdToShort[s.id] = 'mlb'
    else if (s.key === 'basketball_wnba') sportIdToShort[s.id] = 'wnba'
    else if (s.key === 'soccer_usa_mls') sportIdToShort[s.id] = 'mls'
    else if (s.key === 'americanfootball_ncaaf') sportIdToShort[s.id] = 'ncaaf'
    else if (s.key === 'basketball_ncaab') sportIdToShort[s.id] = 'ncaab'
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
      .select('id, sport_id, home_team, away_team, home_score, away_score, live_home_score, live_away_score, period, clock, starts_at, status, updated_at')
      .in('sport_id', sportIds)
      .eq('status', 'live')
      .gte('updated_at', liveStaleCutoff)
      .order('starts_at', { ascending: true }),
    supabase
      .from('games')
      .select('id, sport_id, home_team, away_team, home_score, away_score, live_home_score, live_away_score, period, clock, starts_at, status')
      .in('sport_id', sportIds)
      .eq('status', 'upcoming')
      .gte('starts_at', nowIso)
      .lte('starts_at', upcomingCutoff)
      .order('starts_at', { ascending: true }),
    supabase
      .from('games')
      .select('id, sport_id, home_team, away_team, home_score, away_score, live_home_score, live_away_score, period, clock, starts_at, status')
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
    // MLS + NCAA records aren't cached today (teamRecordsService only
    // covers the four US majors). Lookups will render teams without
    // records, which is fine.
    mls: 'soccer_usa_mls',
    ncaaf: 'americanfootball_ncaaf',
    ncaab: 'basketball_ncaab',
  }
  const out = { nfl: emptyCol(), nba: emptyCol(), mlb: emptyCol(), wnba: emptyCol(), mls: emptyCol(), ncaaf: emptyCol(), ncaab: emptyCol() }
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

  // Daily-cadence sports with substantial slates (MLB, MLS, NCAAB —
  // CFB nominally plays Sat only but still gets the same treatment
  // for consistency): when there are games left today the upcoming
  // column shouldn't spill into tomorrow — users can drill in for
  // the full schedule. If today has zero upcoming (all done), keep
  // the wider window so the card still shows something (tomorrow's
  // slate).
  const todayPt = toSportsDay(new Date().toISOString())
  // Daily-cadence sports only. NFL + NCAAF are weekly and rely on the
  // 30-day window to surface next week's slate during off-days.
  for (const key of ['mlb', 'mls', 'ncaab']) {
    const todayUpcoming = out[key].upcoming.filter((g) => toSportsDay(g.starts_at) === todayPt)
    if (todayUpcoming.length) out[key].upcoming = todayUpcoming
  }

  // MLB linescores for both live + final buckets. Live cache is
  // short-TTL inside the service so in-progress hits/errors stay fresh.
  await attachMlbLinescores(out.mlb.live, 'baseball_mlb')
  await attachMlbLinescores(out.mlb.recent, 'baseball_mlb')

  // Short cache header — clients also poll but this dampens repeat
  // landing-page hits from the same session/CDN.
  res.set('Cache-Control', 'public, max-age=15')
  res.json(out)
})

// NFL schedule for the week scrubber. Returns the ordered week list
// (PRE 1-3 from ESPN's calendar + WEEK 1-18 from ESPN's calendar)
// plus the current NFL week + season_type. Prior versions derived
// preseason from the games table, but the odds API only publishes
// ~1-2 weeks ahead so PRE 2/3 were missing until a few days out.
router.get('/nfl-schedule', async (req, res) => {
  const { getNflCalendar } = await import('../services/nflCalendarService.js')
  const cal = await getNflCalendar()
  const weeks = [...cal.preseason, ...cal.regular]

  // Current week + season_type.
  let current = null
  try {
    const { getCurrentNflWeek } = await import('../services/tdPassService.js')
    const state = await getCurrentNflWeek()
    current = {
      season: state?.season || cal.season,
      week: state?.week || 1,
      season_type: state?.isPreSeason ? 'pre' : 'regular',
    }
  } catch {}

  res.set('Cache-Control', 'public, max-age=300')
  res.json({ season: cal.season, current, weeks })
})

// All games for one NFL (season, week). Both regular and preseason
// weeks pull their date window from ESPN's calendar (see
// nflCalendarService); we then query the games table for anything
// in that window. Games with no odds yet just won't appear, which
// is fine — the scrubber button still shows so the user knows the
// week exists.
router.get('/nfl-week', async (req, res) => {
  const week = Number(req.query.week)
  const seasonType = String(req.query.type || 'regular').toLowerCase() // 'pre' | 'regular'
  if (!week) return res.status(400).json({ error: 'week required' })

  const { getNflWeekWindow } = await import('../services/nflCalendarService.js')
  const window = await getNflWeekWindow(week, seasonType)
  if (!window) return res.json([])

  const startUtc = `${window.start}T00:00:00Z`
  const endD = new Date(`${window.end}T00:00:00Z`)
  endD.setUTCDate(endD.getUTCDate() + 2)
  const endUtc = endD.toISOString()

  const sportKeys = seasonType === 'pre' ? ['americanfootball_nfl_preseason'] : ['americanfootball_nfl']
  const { data: sports } = await supabase.from('sports').select('id, key').in('key', sportKeys)
  const sportIds = (sports || []).map((s) => s.id)
  if (!sportIds.length) return res.json([])

  const liveStaleCutoff = new Date(Date.now() - LIVE_STALE_CUTOFF_MS).toISOString()
  const [liveRes, weekRes] = await Promise.all([
    supabase
      .from('games')
      .select('id, home_team, away_team, home_score, away_score, live_home_score, live_away_score, period, clock, starts_at, status')
      .in('sport_id', sportIds)
      .eq('status', 'live')
      .gte('updated_at', liveStaleCutoff)
      .order('starts_at', { ascending: true }),
    supabase
      .from('games')
      .select('id, home_team, away_team, home_score, away_score, live_home_score, live_away_score, period, clock, starts_at, status')
      .in('sport_id', sportIds)
      .in('status', ['upcoming', 'final'])
      .gte('starts_at', startUtc)
      .lt('starts_at', endUtc)
      .order('starts_at', { ascending: true }),
  ])
  if (liveRes.error || weekRes.error) return res.status(500).json({ error: 'nfl-week fetch failed' })

  await getTeamRecords('americanfootball_nfl')
  const seen = new Set()
  const out = []
  for (const g of liveRes.data || []) { seen.add(g.id); out.push(shape(g, 'americanfootball_nfl')) }
  for (const g of weekRes.data || []) { if (!seen.has(g.id)) out.push(shape(g, 'americanfootball_nfl')) }
  out.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))

  res.set('Cache-Control', 'public, max-age=15')
  res.json(out)
})

// NCAAF schedule + current-week helper — mirrors /nfl-schedule so the
// drill-in can render a week scrubber for college football instead of
// the 7-day date strip. Week windows sourced from ESPN's calendar.
router.get('/ncaaf-schedule', async (req, res) => {
  const { getNcaafCalendar } = await import('../services/ncaafCalendarService.js')
  const cal = await getNcaafCalendar()
  const weeks = cal.regular
  // "Current" derived from calendar windows against now (PT).
  const todayPt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const current = weeks.find((w) => w.start <= todayPt && w.end >= todayPt)
    || weeks.find((w) => w.start > todayPt) // pre-season: highlight week 1
    || weeks[weeks.length - 1] // post-season: last week
    || null
  res.set('Cache-Control', 'public, max-age=300')
  res.json({
    season: cal.season,
    current: current ? { season: cal.season, week: current.week, season_type: 'regular' } : null,
    weeks,
  })
})

// All games for one NCAAF (season, week). Same shape as /nfl-week.
router.get('/ncaaf-week', async (req, res) => {
  const week = Number(req.query.week)
  if (!week) return res.status(400).json({ error: 'week required' })

  const { getNcaafWeekWindow } = await import('../services/ncaafCalendarService.js')
  const window = await getNcaafWeekWindow(week)
  if (!window) return res.json([])

  const startUtc = `${window.start}T00:00:00Z`
  const endD = new Date(`${window.end}T00:00:00Z`)
  endD.setUTCDate(endD.getUTCDate() + 2)
  const endUtc = endD.toISOString()

  const { data: sports } = await supabase.from('sports').select('id, key').eq('key', 'americanfootball_ncaaf')
  const sportIds = (sports || []).map((s) => s.id)
  if (!sportIds.length) return res.json([])

  const liveStaleCutoff = new Date(Date.now() - LIVE_STALE_CUTOFF_MS).toISOString()
  const [liveRes, weekRes] = await Promise.all([
    supabase
      .from('games')
      .select('id, home_team, away_team, home_score, away_score, live_home_score, live_away_score, period, clock, starts_at, status')
      .in('sport_id', sportIds)
      .eq('status', 'live')
      .gte('updated_at', liveStaleCutoff)
      .order('starts_at', { ascending: true }),
    supabase
      .from('games')
      .select('id, home_team, away_team, home_score, away_score, live_home_score, live_away_score, period, clock, starts_at, status')
      .in('sport_id', sportIds)
      .in('status', ['upcoming', 'final'])
      .gte('starts_at', startUtc)
      .lt('starts_at', endUtc)
      .order('starts_at', { ascending: true }),
  ])
  if (liveRes.error || weekRes.error) return res.status(500).json({ error: 'ncaaf-week fetch failed' })

  const seen = new Set()
  const out = []
  for (const g of liveRes.data || []) { seen.add(g.id); out.push(shape(g, 'americanfootball_ncaaf')) }
  for (const g of weekRes.data || []) { if (!seen.has(g.id)) out.push(shape(g, 'americanfootball_ncaaf')) }
  out.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))

  // Attach AP Top 25 ranks. Standings table already has team_id
  // per row + team_name / short_name, so use it to bridge each
  // game's home_team / away_team → espn_team_id → rank.
  try {
    const { getStandingsTable } = await import('../services/teamRecordsService.js')
    const { getNcaafApRankings } = await import('../services/ncaafRankingsService.js')
    const [standings, rankById] = await Promise.all([
      getStandingsTable('americanfootball_ncaaf'),
      getNcaafApRankings(),
    ])
    const nameToId = new Map()
    for (const row of standings || []) {
      if (!row.team_id) continue
      const id = String(row.team_id)
      if (row.team_name) nameToId.set(row.team_name.toLowerCase(), id)
      if (row.short_name) nameToId.set(row.short_name.toLowerCase(), id)
    }
    for (const g of out) {
      const homeId = nameToId.get((g.home_team || '').toLowerCase())
      const awayId = nameToId.get((g.away_team || '').toLowerCase())
      const homeRank = homeId ? rankById.get(homeId) : null
      const awayRank = awayId ? rankById.get(awayId) : null
      if (homeRank) g.home_rank = homeRank
      if (awayRank) g.away_rank = awayRank
    }
  } catch { /* rank attachment is best-effort */ }

  res.set('Cache-Control', 'public, max-age=15')
  res.json(out)
})

// Per-sport ALL games for a given PT calendar date — powers the drill-
// in `/scores/:sport` page's date scrubber. Returns upcoming, live,
// and final together (unlike /finals which is finals-only for the
// landing card's back-arrow). Same zombie-live filter as /strip so
// month-old ghost games don't leak in.
router.get('/day', async (req, res) => {
  const shortSport = String(req.query.sport || '').toLowerCase()
  const date = String(req.query.date || '')
  const full = SHORT_TO_FULL[shortSport]
  if (!full) return res.status(400).json({ error: 'sport must be one of nfl/nba/mlb/wnba/mls/ncaaf/ncaab' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })

  const { startUtc, endUtc } = sportsDayBoundsUtc(date)
  if (!startUtc) return res.status(400).json({ error: 'invalid date' })

  const keys = expandSportFamily(full)
  const { data: sports } = await supabase.from('sports').select('id, key').in('key', keys)
  const sportIds = (sports || []).map((s) => s.id)
  if (!sportIds.length) return res.json([])

  const liveStaleCutoff = new Date(Date.now() - LIVE_STALE_CUTOFF_MS).toISOString()

  // Two parallel queries: live rows (with staleness guard) + non-live
  // rows for the target PT day. Merge so a live game that started
  // yesterday PT still shows up on today's slate.
  const [liveRes, dayRes] = await Promise.all([
    supabase
      .from('games')
      .select('id, home_team, away_team, home_score, away_score, live_home_score, live_away_score, period, clock, starts_at, status')
      .in('sport_id', sportIds)
      .eq('status', 'live')
      .gte('updated_at', liveStaleCutoff)
      .order('starts_at', { ascending: true }),
    supabase
      .from('games')
      .select('id, home_team, away_team, home_score, away_score, live_home_score, live_away_score, period, clock, starts_at, status')
      .in('sport_id', sportIds)
      .in('status', ['upcoming', 'final'])
      .gte('starts_at', startUtc)
      .lt('starts_at', endUtc)
      .order('starts_at', { ascending: true }),
  ])

  if (liveRes.error || dayRes.error) return res.status(500).json({ error: 'day fetch failed' })

  await getTeamRecords(full)

  // De-dupe: a live game will appear in liveRes AND possibly in dayRes
  // if its starts_at is today. Prefer the live row.
  const seen = new Set()
  const out = []
  for (const g of liveRes.data || []) { seen.add(g.id); out.push(shape(g, full)) }
  for (const g of dayRes.data || []) { if (!seen.has(g.id)) out.push(shape(g, full)) }
  out.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))

  await attachMlbLinescores(out, full)

  res.set('Cache-Control', 'public, max-age=15')
  res.json(out)
})

// Full standings for a sport — powers the drill-in page's sidebar.
// Uses the same ESPN standings feed that teamRecordsService caches;
// this exposes the whole table (rank, team, W, L, PCT) instead of
// just the per-team record lookup.
router.get('/standings', async (req, res) => {
  const shortSport = String(req.query.sport || '').toLowerCase()
  const full = SHORT_TO_FULL[shortSport]
  if (!full) return res.status(400).json({ error: 'sport must be one of nfl/nba/mlb/wnba/mls/ncaaf/ncaab' })

  const { getStandingsTable } = await import('../services/teamRecordsService.js')
  const standings = await getStandingsTable(full)
  // Attach AP Top 25 rank for NCAAF so the sidebar can render "#5"
  // badges next to team names.
  if (shortSport === 'ncaaf' && standings.length) {
    const { getNcaafApRankings } = await import('../services/ncaafRankingsService.js')
    const rankById = await getNcaafApRankings()
    for (const row of standings) {
      const id = row.team_id ? String(row.team_id) : null
      const rank = id ? rankById.get(id) : null
      if (rank) row.rank = rank
    }
  }
  res.set('Cache-Control', 'public, max-age=300')
  res.json(standings)
})

// Per-sport stat leaders — top 10 per category, categories tailored
// per sport (see statLeadersService.SPORT_CONFIG). Powers the landing
// card's top-3 preview and the drill-in page's full leaders block.
// 5-min cache header; ESPN data underneath is refreshed once an hour
// per sport by the service's in-memory cache.
router.get('/leaders', async (req, res) => {
  const shortSport = String(req.query.sport || '').toLowerCase()
  const full = SHORT_TO_FULL[shortSport]
  if (!full) return res.status(400).json({ error: 'sport must be one of nfl/nba/mlb/wnba/mls/ncaaf/ncaab' })
  const { getStatLeaders } = await import('../services/statLeadersService.js')
  const data = await getStatLeaders(full)
  res.set('Cache-Control', 'public, max-age=300')
  res.json(data)
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
  if (!full) return res.status(400).json({ error: 'sport must be one of nfl/nba/mlb/wnba/mls/ncaaf/ncaab' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' })

  const { startUtc, endUtc } = sportsDayBoundsUtc(date)
  if (!startUtc) return res.status(400).json({ error: 'invalid date' })

  const keys = expandSportFamily(full)
  const { data: sports } = await supabase.from('sports').select('id, key').in('key', keys)
  const sportIds = (sports || []).map((s) => s.id)
  if (!sportIds.length) return res.json([])

  const { data: games, error } = await supabase
    .from('games')
    .select('id, sport_id, home_team, away_team, home_score, away_score, live_home_score, live_away_score, period, clock, starts_at, status')
    .in('sport_id', sportIds)
    .eq('status', 'final')
    .gte('starts_at', startUtc)
    .lt('starts_at', endUtc)
    .order('starts_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })

  // Warm the record cache for the requested sport before mapping.
  await getTeamRecords(full)
  const shaped = (games || []).map((g) => shape(g, full))
  await attachMlbLinescores(shaped, full)
  res.set('Cache-Control', 'public, max-age=300')
  res.json(shaped)
})

function emptyCol() {
  return { live: [], upcoming: [], recent: [] }
}

function shape(g, sportFullKey) {
  const homeRec = sportFullKey ? lookupRecord(sportFullKey, g.home_team) : null
  const awayRec = sportFullKey ? lookupRecord(sportFullKey, g.away_team) : null
  const homeShort = sportFullKey ? lookupShortName(sportFullKey, g.home_team) : null
  const awayShort = sportFullKey ? lookupShortName(sportFullKey, g.away_team) : null
  // syncLiveScores writes in-progress scores to live_home_score /
  // live_away_score (a shadow column), and only copies them into
  // home_score / away_score when the game finalizes. So for live
  // games, prefer the live_* column; for finals, prefer home_score.
  const isLive = g.status === 'live'
  const homeScore = isLive
    ? (g.live_home_score ?? g.home_score)
    : (g.home_score ?? g.live_home_score)
  const awayScore = isLive
    ? (g.live_away_score ?? g.away_score)
    : (g.away_score ?? g.live_away_score)
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
    home_score: homeScore,
    away_score: awayScore,
    starts_at: g.starts_at,
    status: g.status,
    period: g.period ?? null,
    clock: g.clock ?? null,
    home_record: homeRec ? formatRecord(homeRec) : null,
    away_record: awayRec ? formatRecord(awayRec) : null,
  }
}

function formatRecord(r) {
  if (r.t > 0) return `${r.w}-${r.l}-${r.t}`
  return `${r.w}-${r.l}`
}

// For MLB games, look up R/H/E from cached ESPN scoreboard data
// (see mlbLinescoresService). One ESPN call per unique date; each
// game's row gets a { home, away } { r, h, e } block attached.
// Applies to both live and final games — the linescore service
// short-TTLs today's cache so live hits/errors stay fresh.
async function attachMlbLinescores(games, sportFullKey) {
  if (sportFullKey !== 'baseball_mlb') return
  const dates = new Set()
  for (const g of games) {
    if (g.status === 'final' || g.status === 'live') dates.add(toSportsDay(g.starts_at))
  }
  await Promise.all([...dates].map((d) => warmMlbLinescores(d)))
  for (const g of games) {
    if (g.status !== 'final' && g.status !== 'live') continue
    const d = toSportsDay(g.starts_at)
    const ls = await getMlbLinescoreForGame(d, g.away_team, g.home_team)
    if (ls) g.linescore = ls
  }
}

// Per-game post-game box score for the tap-in modal. Public (no auth)
// like the rest of /scores — same reason: this is visible to logged-out
// users clicking a final card. Returns null when we can't resolve an
// ESPN event id (rare: pre-season, obscure teams).
router.get('/box/:game_id', async (req, res) => {
  const { getBoxScore } = await import('../services/boxScoreService.js')
  const data = await getBoxScore(req.params.game_id)
  if (!data) return res.status(404).json({ error: 'box score not available' })
  res.set('Cache-Control', 'public, max-age=30')
  res.json(data)
})

export default router
