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
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + 3)

  const { data, error } = await supabase
    .from('games')
    .select('sport_id, sports!inner(key, name)')
    .eq('status', 'upcoming')
    .lte('starts_at', cutoff.toISOString())

  if (error) throw error

  const counts = {}
  for (const game of data) {
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
