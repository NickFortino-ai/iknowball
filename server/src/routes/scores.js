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
// Upcoming window: 7 days lets the NFL column show the coming Sunday
// slate even when browsing on Wednesday; MLB/NBA/WNBA still see ~2-3
// days of games since their cadence is daily.
const UPCOMING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

router.get('/strip', async (req, res) => {
  const now = new Date()
  const nowIso = now.toISOString()
  const recentCutoff = new Date(now.getTime() - RECENT_WINDOW_MS).toISOString()
  const upcomingCutoff = new Date(now.getTime() + UPCOMING_WINDOW_MS).toISOString()

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
  const sportIds = Object.keys(sportIdToShort).map(Number)

  // Three parallel queries — live, upcoming (windowed), recent finals
  // (windowed). Fewer queries than per-sport-per-bucket, and partitioned
  // in JS below.
  const [liveRes, upcomingRes, recentRes] = await Promise.all([
    supabase
      .from('games')
      .select('id, sport_id, home_team, away_team, home_score, away_score, starts_at, status')
      .in('sport_id', sportIds)
      .eq('status', 'live')
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

  // Bucket by short sport key.
  const out = { nfl: emptyCol(), nba: emptyCol(), mlb: emptyCol(), wnba: emptyCol() }
  for (const g of liveRes.data || []) {
    const s = sportIdToShort[g.sport_id]
    if (s) out[s].live.push(shape(g))
  }
  for (const g of upcomingRes.data || []) {
    const s = sportIdToShort[g.sport_id]
    if (s && out[s].upcoming.length < UPCOMING_LIMIT) out[s].upcoming.push(shape(g))
  }
  for (const g of recentRes.data || []) {
    const s = sportIdToShort[g.sport_id]
    if (s && out[s].recent.length < RECENT_LIMIT) out[s].recent.push(shape(g))
  }

  // Short cache header — clients also poll but this dampens repeat
  // landing-page hits from the same session/CDN.
  res.set('Cache-Control', 'public, max-age=15')
  res.json(out)
})

function emptyCol() {
  return { live: [], upcoming: [], recent: [] }
}

function shape(g) {
  return {
    id: g.id,
    home_team: g.home_team,
    away_team: g.away_team,
    home_score: g.home_score,
    away_score: g.away_score,
    starts_at: g.starts_at,
    status: g.status,
  }
}

export default router
