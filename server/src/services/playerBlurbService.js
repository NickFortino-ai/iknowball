import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { fetchAll } from '../utils/fetchAll.js'

/**
 * Get the top fantasy-relevant players by position, ranked by season points.
 * Returns { QB: [...], RB: [...], WR: [...], TE: [...], DEF: [...] }
 */
const POSITION_LIMITS = { QB: 34, RB: 30, WR: 30, TE: 15, DEF: 10 }

export async function getTopPlayersByPosition(season) {
  const scoringCol = 'pts_half_ppr' // default ranking column
  const { data: stats } = await supabase
    .from('nfl_player_stats')
    .select('player_id, week')
    .eq('season', season)

  // Sum season totals per player
  const totals = {}
  for (const s of stats || []) {
    totals[s.player_id] = (totals[s.player_id] || 0) + 1
  }

  // Get all active NFL players with a team
  const players = await fetchAll(
    supabase
      .from('nfl_players')
      .select('id, full_name, position, team, injury_status, injury_body_part')
      .not('team', 'is', null)
      .in('position', ['QB', 'RB', 'WR', 'TE', 'DEF'])
  )

  // Fetch actual season point totals using the scoring column
  const playerIds = players.map((p) => p.id)
  let allStats = []
  const CHUNK = 100
  for (let i = 0; i < playerIds.length; i += CHUNK) {
    const chunk = playerIds.slice(i, i + CHUNK)
    const { data } = await supabase
      .from('nfl_player_stats')
      .select(`player_id, ${scoringCol}`)
      .in('player_id', chunk)
      .eq('season', season)
    allStats = allStats.concat(data || [])
  }

  const seasonTotals = {}
  const gamesPlayed = {}
  for (const s of allStats) {
    const pts = Number(s[scoringCol]) || 0
    seasonTotals[s.player_id] = (seasonTotals[s.player_id] || 0) + pts
    gamesPlayed[s.player_id] = (gamesPlayed[s.player_id] || 0) + 1
  }

  // Group by position and sort by season total
  const byPosition = {}
  for (const p of players) {
    if (!byPosition[p.position]) byPosition[p.position] = []
    byPosition[p.position].push({
      ...p,
      seasonPoints: Math.round((seasonTotals[p.id] || 0) * 100) / 100,
      gamesPlayed: gamesPlayed[p.id] || 0,
      avgPoints: gamesPlayed[p.id] ? Math.round((seasonTotals[p.id] || 0) / gamesPlayed[p.id] * 100) / 100 : 0,
    })
  }

  const result = {}
  for (const [pos, limit] of Object.entries(POSITION_LIMITS)) {
    const group = byPosition[pos] || []
    group.sort((a, b) => b.seasonPoints - a.seasonPoints)
    result[pos] = group.slice(0, limit)
  }

  return result
}

/**
 * Fetch recent weekly stats for a set of players (last 4 weeks).
 */
async function getRecentStats(playerIds, season, currentWeek) {
  const weeks = []
  for (let w = Math.max(1, currentWeek - 3); w <= currentWeek; w++) weeks.push(w)

  let rows = []
  const CHUNK = 100
  for (let i = 0; i < playerIds.length; i += CHUNK) {
    const chunk = playerIds.slice(i, i + CHUNK)
    const { data } = await supabase
      .from('nfl_player_stats')
      .select('player_id, week, pts_half_ppr, pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td')
      .in('player_id', chunk)
      .eq('season', season)
      .in('week', weeks)
    rows = rows.concat(data || [])
  }

  const byPlayer = {}
  for (const r of rows) {
    if (!byPlayer[r.player_id]) byPlayer[r.player_id] = []
    byPlayer[r.player_id].push(r)
  }
  return byPlayer
}

/**
 * Fetch upcoming opponent for players based on NFL schedule.
 */
async function getUpcomingMatchups(players, season, nextWeek) {
  const teams = [...new Set(players.map((p) => p.team).filter(Boolean))]
  const { data: schedule } = await supabase
    .from('nfl_schedule')
    .select('home_team, away_team, game_date')
    .eq('season', season)
    .eq('week', nextWeek)

  const matchupByTeam = {}
  for (const g of schedule || []) {
    matchupByTeam[g.home_team] = { opponent: g.away_team, location: 'home', date: g.game_date }
    matchupByTeam[g.away_team] = { opponent: g.home_team, location: 'away', date: g.game_date }
  }
  return matchupByTeam
}

/**
 * Generate AI blurbs for a batch of players using Claude Haiku.
 * Each call handles 10-12 players. Returns array of { playerId, content }.
 */
async function generateBlurbBatch(players, recentStats, matchups) {
  const playerData = players.map((p) => {
    const recent = recentStats[p.id] || []
    recent.sort((a, b) => b.week - a.week)
    const matchup = matchups[p.team]

    return {
      id: p.id,
      name: p.full_name,
      position: p.position,
      team: p.team,
      seasonPoints: p.seasonPoints,
      gamesPlayed: p.gamesPlayed,
      avgPoints: p.avgPoints,
      injury: p.injury_status ? { status: p.injury_status, bodyPart: p.injury_body_part } : null,
      recentWeeks: recent.map((r) => ({
        week: r.week,
        pts: Number(r.pts_half_ppr) || 0,
        passYd: r.pass_yd, passTd: r.pass_td, passInt: r.pass_int,
        rushYd: r.rush_yd, rushTd: r.rush_td,
        rec: r.rec, recYd: r.rec_yd, recTd: r.rec_td,
      })),
      nextMatchup: matchup || null,
    }
  })

  const prompt = `You are a fantasy football analyst writing player notes for a fantasy football app called "I KNOW BALL". Write a concise 2-4 sentence analysis for each player below. Your tone should be confident and analytical but not exaggerated — blend fantasy analyst insight with factual neutrality.

For each player, cover:
- Recent performance trend (reference actual stats from the data)
- Upcoming matchup context if available (opponent, home/away)
- Injury note if applicable (only if injury data is present)
- A brief verdict on their outlook

Rules:
- ONLY reference stats and facts from the data provided — do not invent or assume information
- Use half-PPR scoring context
- Keep each blurb to 2-4 sentences
- Do not use emojis
- For defenses, focus on points allowed and key defensive stats

Return a JSON array with objects: { "id": "player_id", "content": "blurb text" }
Return ONLY the JSON array, no other text.

Player data:
${JSON.stringify(playerData, null, 2)}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Claude API error ${response.status}: ${body}`)
  }

  const result = await response.json()
  const text = result.content[0].text.trim()

  // Parse JSON from response (handle possible markdown wrapping)
  const jsonStr = text.startsWith('[') ? text : text.match(/\[[\s\S]*\]/)?.[0]
  if (!jsonStr) {
    logger.error({ text: text.slice(0, 200) }, 'Failed to parse blurb JSON from Claude')
    return []
  }

  try {
    return JSON.parse(jsonStr)
  } catch (err) {
    logger.error({ err, text: text.slice(0, 200) }, 'Failed to parse blurb JSON')
    return []
  }
}

/**
 * Generate blurbs for specific player IDs (admin-triggered).
 * Creates draft blurbs in the DB.
 */
export async function generateBlurbs(playerIds, season, currentWeek) {
  // Fetch player info
  const players = await fetchAll(
    supabase
      .from('nfl_players')
      .select('id, full_name, position, team, injury_status, injury_body_part')
      .in('id', playerIds)
  )

  // Get season totals for ranking context
  let allStats = []
  const CHUNK = 100
  for (let i = 0; i < playerIds.length; i += CHUNK) {
    const chunk = playerIds.slice(i, i + CHUNK)
    const { data } = await supabase
      .from('nfl_player_stats')
      .select('player_id, pts_half_ppr')
      .in('player_id', chunk)
      .eq('season', season)
    allStats = allStats.concat(data || [])
  }

  const seasonTotals = {}
  const gamesPlayed = {}
  for (const s of allStats) {
    const pts = Number(s.pts_half_ppr) || 0
    seasonTotals[s.player_id] = (seasonTotals[s.player_id] || 0) + pts
    gamesPlayed[s.player_id] = (gamesPlayed[s.player_id] || 0) + 1
  }

  const enrichedPlayers = players.map((p) => ({
    ...p,
    seasonPoints: Math.round((seasonTotals[p.id] || 0) * 100) / 100,
    gamesPlayed: gamesPlayed[p.id] || 0,
    avgPoints: gamesPlayed[p.id] ? Math.round((seasonTotals[p.id] || 0) / gamesPlayed[p.id] * 100) / 100 : 0,
  }))

  const recentStats = await getRecentStats(playerIds, season, currentWeek)
  const matchups = await getUpcomingMatchups(enrichedPlayers, season, currentWeek + 1)

  // Batch players in groups of 12
  const BATCH = 12
  let generated = 0
  for (let i = 0; i < enrichedPlayers.length; i += BATCH) {
    const batch = enrichedPlayers.slice(i, i + BATCH)
    try {
      const blurbs = await generateBlurbBatch(batch, recentStats, matchups)
      for (const blurb of blurbs) {
        if (!blurb.id || !blurb.content) continue
        const { error } = await supabase
          .from('player_blurbs')
          .insert({
            player_id: blurb.id,
            content: blurb.content,
            status: 'draft',
            season,
            week: currentWeek,
            generated_by: 'ai',
          })
        if (error) {
          logger.error({ error, playerId: blurb.id }, 'Failed to insert blurb')
        } else {
          generated++
        }
      }
    } catch (err) {
      logger.error({ err, batchStart: i }, 'Failed to generate blurb batch')
    }
  }

  logger.info({ generated, requested: playerIds.length }, 'AI blurb generation complete')
  return { generated }
}

/**
 * Publish a blurb. Archives any existing published blurb for the same player.
 */
export async function publishBlurb(blurbId) {
  const { data: blurb } = await supabase
    .from('player_blurbs')
    .select('id, player_id')
    .eq('id', blurbId)
    .single()
  if (!blurb) throw Object.assign(new Error('Blurb not found'), { status: 404 })

  // Archive any currently published blurb for this player
  await supabase
    .from('player_blurbs')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('player_id', blurb.player_id)
    .eq('status', 'published')

  const { error } = await supabase
    .from('player_blurbs')
    .update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', blurbId)

  if (error) throw error
  return { published: true }
}

/**
 * Bulk publish all draft blurbs.
 */
export async function publishAllDrafts() {
  // Get all draft blurbs with their player_ids
  const drafts = await fetchAll(
    supabase.from('player_blurbs').select('id, player_id').eq('status', 'draft')
  )
  if (!drafts.length) return { published: 0 }

  // Archive existing published blurbs for these players
  const playerIds = [...new Set(drafts.map((d) => d.player_id))]
  for (let i = 0; i < playerIds.length; i += 100) {
    const chunk = playerIds.slice(i, i + 100)
    await supabase
      .from('player_blurbs')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .in('player_id', chunk)
      .eq('status', 'published')
  }

  // Publish all drafts
  const ids = drafts.map((d) => d.id)
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    await supabase
      .from('player_blurbs')
      .update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', chunk)
  }

  return { published: drafts.length }
}

/**
 * Get the published blurb for a player (user-facing).
 */
export async function getPublishedBlurb(playerId) {
  const { data } = await supabase
    .from('player_blurbs')
    .select('id, content, season, week, published_at')
    .eq('player_id', playerId)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

/**
 * Get all blurbs for a player (admin — includes drafts and archived).
 */
export async function getPlayerBlurbHistory(playerId) {
  const { data } = await supabase
    .from('player_blurbs')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
  return data || []
}
