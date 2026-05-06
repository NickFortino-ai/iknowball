import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { logger } from '../utils/logger.js'

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports'
const ESPN_PATHS = {
  basketball_nba: 'basketball/nba',
  basketball_ncaab: 'basketball/mens-college-basketball',
  basketball_wnba: 'basketball/wnba',
  americanfootball_nfl: 'football/nfl',
  americanfootball_ncaaf: 'football/college-football',
  baseball_mlb: 'baseball/mlb',
  icehockey_nhl: 'hockey/nhl',
  soccer_usa_mls: 'soccer/usa.1',
  americanfootball_ufl: 'football/ufl',
}

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  const { sport, status, days } = req.query

  let query = supabase
    .from('games')
    .select('*, sports!inner(key, name)')
    .order('starts_at', { ascending: true })

  if (sport) {
    query = query.eq('sports.key', sport)
  }
  if (status) {
    query = query.eq('status', status)
  }
  if (days) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + Number(days))
    query = query.lte('starts_at', cutoff.toISOString())
  }

  const { data, error } = await query
  if (error) throw error

  res.json(data)
})

router.get('/active-sports', requireAuth, async (req, res) => {
  // Match the picks page's day-picker window exactly: only count games whose
  // ET calendar day is today, tomorrow, or the day after. A rolling 72-hour
  // cutoff doesn't work — at 11pm ET it includes day-offset-3 games (e.g.
  // WNBA games at 7:30pm ET three days out) that the picks day-picker
  // can't actually reach. Result: tab appears tappable but list is empty.
  const tz = 'America/New_York'
  const dayKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)
  const now = new Date()
  const validDays = new Set([
    dayKey(now),
    dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
    dayKey(new Date(now.getTime() + 48 * 60 * 60 * 1000)),
  ])
  // Pull a slightly wider rolling window from the DB (4 days), then filter
  // by ET calendar day in JS. Cheap — active-sports counts are small.
  const sqlCutoff = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000)

  const { data, error } = await supabase
    .from('games')
    .select('sport_id, sports!inner(key, name), starts_at')
    .eq('status', 'upcoming')
    .lte('starts_at', sqlCutoff.toISOString())

  if (error) throw error

  const counts = {}
  for (const game of data) {
    const gameDay = dayKey(new Date(game.starts_at))
    if (!validDays.has(gameDay)) continue
    const key = game.sports.key
    if (!counts[key]) {
      counts[key] = { key, name: game.sports.name, count: 0 }
    }
    counts[key].count++
  }

  res.json(Object.values(counts))
})

// Enriched game intel from ESPN — team records, recent form, probable pitchers (MLB)
router.get('/:id/intel', requireAuth, async (req, res) => {
  const { data: game, error } = await supabase
    .from('games')
    .select('*, sports(key, name)')
    .eq('id', req.params.id)
    .single()

  if (error || !game) return res.status(404).json({ error: 'Game not found' })

  const sportKey = game.sports?.key
  const espnPath = ESPN_PATHS[sportKey]
  if (!espnPath) return res.json({ game })

  try {
    // Fetch scoreboard for the game's date (use ET to avoid UTC date shift)
    const gameDate = new Date(game.starts_at)
    const etDate = new Date(gameDate.toLocaleString('en-US', { timeZone: 'America/New_York' }))
    const dateStr = `${etDate.getFullYear()}${String(etDate.getMonth() + 1).padStart(2, '0')}${String(etDate.getDate()).padStart(2, '0')}`
    const url = `${ESPN_BASE}/${espnPath}/scoreboard?dates=${dateStr}`
    const espnRes = await fetch(url)
    if (!espnRes.ok) return res.json({ game })
    const espnData = await espnRes.json()

    // Match our game to an ESPN event
    const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    const matchTeam = (a, b) => {
      const an = normalize(a)
      const bn = normalize(b)
      if (an === bn || an.includes(bn) || bn.includes(an)) return true
      const al = an.split(/\s+/).pop()
      const bl = bn.split(/\s+/).pop()
      return al.length > 2 && al === bl
    }

    const espnEvent = (espnData.events || []).find((ev) => {
      const comp = ev.competitions?.[0]
      if (!comp) return false
      const home = comp.competitors?.find((c) => c.homeAway === 'home')
      const away = comp.competitors?.find((c) => c.homeAway === 'away')
      return home && away && matchTeam(home.team?.displayName || '', game.home_team) && matchTeam(away.team?.displayName || '', game.away_team)
    })

    if (!espnEvent) return res.json({ game })

    const comp = espnEvent.competitions[0]
    const home = comp.competitors.find((c) => c.homeAway === 'home')
    const away = comp.competitors.find((c) => c.homeAway === 'away')

    // Team records
    const homeRecord = home.records?.find((r) => r.name === 'overall' || r.type === 'total')?.summary || home.records?.[0]?.summary || null
    const awayRecord = away.records?.find((r) => r.name === 'overall' || r.type === 'total')?.summary || away.records?.[0]?.summary || null

    // Recent form (last 10)
    const homeLast10 = home.records?.find((r) => r.name === 'Last Ten Games' || r.name === 'last10')?.summary || null
    const awayLast10 = away.records?.find((r) => r.name === 'Last Ten Games' || r.name === 'last10')?.summary || null

    // Probable pitchers (MLB) — from competitor.probables
    let homePitcher = null
    let awayPitcher = null
    if (sportKey === 'baseball_mlb') {
      const extractPitcher = (competitor) => {
        const prob = competitor.probables?.find((p) => p.abbreviation === 'SP')
        if (!prob?.athlete) return null
        return {
          name: prob.athlete.displayName,
          headshot: prob.athlete.headshot || null,
          record: prob.record || null,
          stats: prob.statistics?.length
            ? prob.statistics.map((s) => `${s.abbreviation}: ${s.displayValue}`).join(', ')
            : null,
        }
      }
      homePitcher = extractPitcher(home)
      awayPitcher = extractPitcher(away)
    }

    res.json({
      game,
      homeRecord,
      awayRecord,
      homeLast10,
      awayLast10,
      homePitcher,
      awayPitcher,
    })
  } catch (err) {
    logger.warn({ err: err.message, gameId: game.id }, 'Failed to fetch game intel from ESPN')
    res.json({ game })
  }
})

router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('games')
    .select('*, sports(key, name)')
    .eq('id', req.params.id)
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Game not found' })
  }

  res.json(data)
})

export default router
