import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { logger } from '../utils/logger.js'
import { syncOdds } from '../jobs/syncOdds.js'
import { syncInjuries } from '../jobs/syncInjuries.js'
import { scoreGames } from '../jobs/scoreGames.js'
import { recalculateAllUserPoints } from '../services/scoringService.js'
import { sendEmailBlast, sendTargetedEmail, sendTemplateBracketEmail } from '../services/emailService.js'
import {
  syncPropsForGame,
  getAllPropsForGame,
  featureProp,
  unfeatureProp,
  voidProp,
  settleProps,
  getAllFeaturedProps,
} from '../services/propService.js'
import { getPlayerHeadshotUrl, refreshPlayerHeadshotCache } from '../services/espnService.js'
import { supabase } from '../config/supabase.js'
import {
  createTemplate,
  getTemplates,
  getTemplateDetails,
  updateTemplate,
  saveTemplateMatchups,
  deleteTemplate,
  getTemplateResults,
  enterTemplateResult,
  undoTemplateResult,
  setTemplateChampionshipScore,
} from '../services/bracketService.js'
import {
  syncFuturesForSport,
  getFuturesMarkets,
  closeFuturesMarket,
  settleFuturesMarket,
} from '../services/futuresService.js'
import { FUTURES_SPORT_KEYS } from '../services/oddsService.js'
import { generateWeeklyRecap } from '../jobs/generateRecap.js'
import { updateRecapContent } from '../services/recapService.js'
import { recalculateAllRecords } from '../services/recordService.js'
import { FALLBACK_TEAMS } from './teams.js'
import { snapshotRanks } from '../jobs/snapshotRanks.js'
import {
  getBannedWords,
  addBannedWord,
  removeBannedWord,
  getMutedUsers,
  muteUser,
  unmuteUser,
} from '../services/contentFilterService.js'

const router = Router()

// All admin routes require auth + admin
router.use(requireAuth, requireAdmin)

// ============================================
// Reports Management
// ============================================

router.get('/reports', async (req, res) => {
  const { status } = req.query
  let query = supabase
    .from('reports')
    .select('*, reporter:users!reports_reporter_id_fkey(id, username), reported:users!reports_reported_user_id_fkey(id, username, avatar_url, avatar_emoji)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error

  // Fetch reported content for each report
  const enriched = await Promise.all((data || []).map(async (report) => {
    let content = null
    if (report.target_type === 'hot_take' && report.target_id) {
      const { data: ht } = await supabase.from('hot_takes').select('id, content, image_url, video_url').eq('id', report.target_id).maybeSingle()
      content = ht
    } else if (report.target_type === 'comment' && report.target_id) {
      const { data: c } = await supabase.from('comments').select('id, content').eq('id', report.target_id).maybeSingle()
      content = c
    }
    return { ...report, reported_content: content }
  }))

  res.json(enriched)
})

router.patch('/reports/:id', async (req, res) => {
  const { status, action } = req.body
  if (!status) {
    return res.status(400).json({ error: 'status is required' })
  }

  const updates = { status, reviewed_at: new Date().toISOString() }
  const { data: report, error } = await supabase
    .from('reports')
    .update(updates)
    .eq('id', req.params.id)
    .select('*, reporter:users!reports_reporter_id_fkey(id, username), reported:users!reports_reported_user_id_fkey(id, username)')
    .single()

  if (error) throw error

  // Handle content removal action
  if (action === 'remove_content' && report) {
    if (report.target_type === 'hot_take' && report.target_id) {
      await supabase.from('hot_takes').delete().eq('id', report.target_id)
    } else if (report.target_type === 'comment' && report.target_id) {
      await supabase.from('comments').delete().eq('id', report.target_id)
    } else if (report.target_type === 'profile_picture') {
      await supabase.from('users').update({ avatar_url: null }).eq('id', report.reported_user_id)
    }
  }

  res.json(report)
})

// System actions
router.post('/sync-odds', async (req, res) => {
  const results = await syncOdds({ force: true })
  res.json({ message: 'Odds sync complete', results })
})

// Backfill an entire NFL regular season of weekly stats. Also syncs players
// first so the FK from nfl_player_stats → nfl_players is satisfied for the
// full roster — otherwise upsert chunks fail silently.
router.post('/backfill-nfl-season', async (req, res) => {
  const season = parseInt(req.body?.season || req.query?.season || '2025', 10)
  const { backfillSeasonStats, syncPlayers } = await import('../services/sleeperService.js')
  logger.info({ season }, 'Backfill: syncing players first')
  const playersResult = await syncPlayers()
  logger.info({ playersResult }, 'Backfill: now syncing stats')
  const result = await backfillSeasonStats(season)
  res.json({ players: playersResult, ...result })
})

router.post('/sync-injuries', async (req, res) => {
  const result = await syncInjuries()
  res.json({ message: 'Injury sync complete', ...result })
})

router.post('/score-games', async (req, res) => {
  await scoreGames()
  res.json({ message: 'Game scoring complete' })
})

router.post('/recalculate-points', async (req, res) => {
  const results = await recalculateAllUserPoints()
  res.json({ message: `Recalculated points for ${results.length} users`, corrections: results })
})

router.post('/recalculate-records', async (req, res) => {
  await snapshotRanks()
  const result = await recalculateAllRecords()
  res.json({ message: `Record recalculation complete`, ...result })
})

router.post('/email-blast', async (req, res) => {
  const { subject, body, scheduled_at } = req.body
  if (!subject || !body) {
    return res.status(400).json({ error: 'subject and body are required' })
  }
  if (scheduled_at) {
    await supabase.from('email_logs').insert({
      type: 'blast', subject, body,
      scheduled_at: new Date(scheduled_at).toISOString(),
      email_status: 'scheduled',
      total: 0, sent: 0, failed: 0,
    })
    return res.json({ scheduled: true, scheduled_at })
  }
  const result = await sendEmailBlast(subject, body)
  res.json(result)
})

router.post('/email-targeted', async (req, res) => {
  const { subject, body, usernames, scheduled_at } = req.body
  if (!subject || !body || !usernames?.length) {
    return res.status(400).json({ error: 'subject, body, and usernames are required' })
  }
  if (scheduled_at) {
    await supabase.from('email_logs').insert({
      type: 'targeted', subject, body,
      recipients_requested: usernames,
      scheduled_at: new Date(scheduled_at).toISOString(),
      email_status: 'scheduled',
      total: usernames.length, sent: 0, failed: 0,
    })
    return res.json({ scheduled: true, scheduled_at })
  }
  const result = await sendTargetedEmail(subject, body, usernames)
  res.json(result)
})

router.post('/email-template-blast', async (req, res) => {
  const { subject, body, templateId, scheduled_at } = req.body
  if (!subject || !body || !templateId) {
    return res.status(400).json({ error: 'subject, body, and templateId are required' })
  }
  if (scheduled_at) {
    await supabase.from('email_logs').insert({
      type: 'template_blast', subject, body,
      recipients_requested: [templateId],
      scheduled_at: new Date(scheduled_at).toISOString(),
      email_status: 'scheduled',
      total: 0, sent: 0, failed: 0,
    })
    return res.json({ scheduled: true, scheduled_at })
  }
  const result = await sendTemplateBracketEmail(subject, body, templateId)
  res.json(result)
})

router.get('/email-logs', async (req, res) => {
  const { data, error } = await supabase
    .from('email_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  res.json(data)
})

// Weekly recap
router.post('/generate-recap', async (req, res) => {
  await generateWeeklyRecap()
  res.json({ message: 'Weekly recap generated' })
})

// Edit recap content
router.patch('/recaps/:id', async (req, res) => {
  const { recap_content } = req.body
  if (!recap_content?.trim()) {
    return res.status(400).json({ error: 'recap_content is required' })
  }
  const updated = await updateRecapContent(req.params.id, recap_content)
  res.json(updated)
})

// Props management
router.post('/props/sync', async (req, res) => {
  const { gameId, markets } = req.body
  if (!gameId) {
    return res.status(400).json({ error: 'gameId is required' })
  }
  const result = await syncPropsForGame(gameId, markets)
  res.json(result)
})

router.get('/props/game/:gameId', async (req, res) => {
  const props = await getAllPropsForGame(req.params.gameId)
  res.json(props)
})

router.get('/props/featured', async (req, res) => {
  const props = await getAllFeaturedProps()
  res.json(props)
})

router.post('/props/feature', async (req, res) => {
  const { propId, featuredDate } = req.body
  if (!propId || !featuredDate) {
    return res.status(400).json({ error: 'propId and featuredDate are required' })
  }

  // Look up player headshot from ESPN
  const { data: prop } = await supabase
    .from('player_props')
    .select('player_name, games!inner(sports!inner(key))')
    .eq('id', propId)
    .single()

  let headshot = null
  if (prop?.player_name) {
    const sportKey = prop.games?.sports?.key || 'basketball_nba'
    const sportPath = sportKey === 'baseball_mlb' ? 'baseball/mlb' : 'basketball/nba'
    await refreshPlayerHeadshotCache(sportPath)
    headshot = getPlayerHeadshotUrl(prop.player_name, sportPath)
  }

  const result = await featureProp(propId, featuredDate, headshot)
  res.json(result)
})

router.post('/props/:propId/unfeature', async (req, res) => {
  const result = await unfeatureProp(req.params.propId)
  res.json(result)
})

router.post('/props/:propId/void', async (req, res) => {
  const result = await voidProp(req.params.propId)
  res.json(result)
})

router.post('/props/settle', async (req, res) => {
  const { settlements } = req.body
  if (!settlements?.length) {
    return res.status(400).json({ error: 'settlements array is required' })
  }
  const results = await settleProps(settlements)
  res.json(results)
})

// Team names from games (for bracket autocomplete)
router.get('/teams', async (req, res) => {
  const { sport } = req.query
  if (!sport) {
    return res.status(400).json({ error: 'sport query param is required' })
  }

  const { data: sportRow } = await supabase
    .from('sports')
    .select('id')
    .eq('key', sport)
    .single()

  if (!sportRow) return res.json([])

  const { data: games, error } = await supabase
    .from('games')
    .select('home_team, away_team')
    .eq('sport_id', sportRow.id)

  if (error) return res.json([])

  const teamSet = new Set()
  for (const g of games || []) {
    if (g.home_team) teamSet.add(g.home_team)
    if (g.away_team) teamSet.add(g.away_team)
  }

  // Merge fallback teams so all known teams appear in autocomplete
  for (const t of FALLBACK_TEAMS[sport] || []) {
    teamSet.add(t)
  }

  res.json([...teamSet].sort())
})

// ============================================
// Bracket Templates
// ============================================

router.get('/bracket-templates', async (req, res) => {
  const templates = await getTemplates({ sport: req.query.sport })
  res.json(templates)
})

router.get('/bracket-templates/:id', async (req, res) => {
  const template = await getTemplateDetails(req.params.id)
  res.json(template)
})

router.post('/bracket-templates', async (req, res) => {
  const { name, sport, team_count, description, rounds, regions, picks_available_at, series_format,
          bracket_image, bracket_image_x, bracket_image_y, bracket_image_scale, bracket_image_opacity, bracket_image_position } = req.body
  if (!name || !sport || !team_count) {
    return res.status(400).json({ error: 'name, sport, and team_count are required' })
  }
  const template = await createTemplate(req.user.id, {
    name, sport, team_count, description, rounds, regions, picks_available_at, series_format,
    bracket_image, bracket_image_x, bracket_image_y, bracket_image_scale, bracket_image_opacity, bracket_image_position,
  })
  res.status(201).json(template)
})

router.patch('/bracket-templates/:id', async (req, res) => {
  const template = await updateTemplate(req.params.id, req.user.id, req.body)
  res.json(template)
})

router.get('/bracket-templates/:id/user-count', async (req, res) => {
  const { data: tournaments } = await supabase
    .from('bracket_tournaments')
    .select('league_id')
    .eq('template_id', req.params.id)

  if (!tournaments?.length) return res.json({ count: 0 })

  const leagueIds = tournaments.map((t) => t.league_id)
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .in('league_id', leagueIds)

  const uniqueUserIds = new Set((members || []).map((m) => m.user_id))
  res.json({ count: uniqueUserIds.size })
})

router.post('/bracket-templates/:id/matchups', async (req, res) => {
  const { matchups } = req.body
  if (!matchups) {
    return res.status(400).json({ error: 'matchups array is required' })
  }
  const result = await saveTemplateMatchups(req.params.id, req.user.id, matchups)
  res.json(result)
})

router.delete('/bracket-templates/:id', async (req, res) => {
  await deleteTemplate(req.params.id, req.user.id)
  res.status(204).end()
})

// Template Results
router.get('/bracket-templates/:id/results', async (req, res) => {
  const results = await getTemplateResults(req.params.id)
  res.json(results)
})

router.post('/bracket-templates/:id/results', async (req, res) => {
  const { template_matchup_id, winner, score_top, score_bottom, series_wins_top, series_wins_bottom } = req.body
  if (!template_matchup_id || !winner) {
    return res.status(400).json({ error: 'template_matchup_id and winner are required' })
  }
  const result = await enterTemplateResult(req.params.id, template_matchup_id, winner, score_top ?? null, score_bottom ?? null, series_wins_top ?? null, series_wins_bottom ?? null)
  res.json(result)
})

router.delete('/bracket-templates/:id/results/:matchupId', async (req, res) => {
  await undoTemplateResult(req.params.id, req.params.matchupId)
  res.status(204).end()
})

router.post('/bracket-templates/:id/championship-score', async (req, res) => {
  const { total_score } = req.body
  if (total_score == null || !Number.isInteger(total_score) || total_score < 0) {
    return res.status(400).json({ error: 'total_score must be a non-negative integer' })
  }
  const result = await setTemplateChampionshipScore(req.params.id, total_score)
  // Trigger league completion immediately so commissioners don't have to wait
  // up to 15 minutes for the cron — fire and forget, don't block the response.
  ;(async () => {
    try {
      const { completeLeagues } = await import('../jobs/completeLeagues.js')
      await completeLeagues()
    } catch (err) {
      logger.error({ err }, 'Failed to trigger league completion after championship score')
    }
  })()
  res.json(result)
})

// ============================================
// Futures
// ============================================

// Create a custom futures market (conference, division, MVP, etc.)
router.post('/futures/create', async (req, res) => {
  const { sport_key, title, outcomes } = req.body
  if (!sport_key || !title || !outcomes?.length) {
    return res.status(400).json({ error: 'sport_key, title, and outcomes array required' })
  }

  const { data, error } = await supabase
    .from('futures_markets')
    .insert({
      sport_key,
      futures_sport_key: `custom_${sport_key}`,
      external_event_id: `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      title,
      outcomes,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

// Update outcomes/odds on an existing futures market
router.patch('/futures/markets/:marketId', async (req, res) => {
  const { title, outcomes } = req.body
  const updates = { updated_at: new Date().toISOString() }
  if (title) updates.title = title
  if (outcomes) updates.outcomes = outcomes

  const { data, error } = await supabase
    .from('futures_markets')
    .update(updates)
    .eq('id', req.params.marketId)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/futures/sync', async (req, res) => {
  const { sportKey } = req.body
  if (!sportKey) {
    return res.status(400).json({ error: 'sportKey is required' })
  }
  const result = await syncFuturesForSport(sportKey)
  res.json(result)
})

router.post('/futures/sync-all', async (req, res) => {
  const sports = Object.keys(FUTURES_SPORT_KEYS)
  let total = 0
  for (const sportKey of sports) {
    const { synced } = await syncFuturesForSport(sportKey)
    total += synced
  }
  res.json({ synced: total })
})

router.get('/futures/markets', async (req, res) => {
  const markets = await getFuturesMarkets(req.query.sport, null)
  res.json(markets)
})

router.post('/futures/markets/:marketId/close', async (req, res) => {
  await closeFuturesMarket(req.params.marketId)
  res.json({ message: 'Market closed' })
})

router.post('/futures/settle', async (req, res) => {
  const { marketId, winningOutcome } = req.body
  if (!marketId || !winningOutcome) {
    return res.status(400).json({ error: 'marketId and winningOutcome are required' })
  }
  const result = await settleFuturesMarket(marketId, winningOutcome)
  res.json(result)
})

// ============================================
// Content Moderation
// ============================================

// Banned words CRUD
router.get('/banned-words', async (req, res) => {
  const words = await getBannedWords()
  res.json(words)
})

router.post('/banned-words', async (req, res) => {
  const { word } = req.body
  if (!word?.trim()) {
    return res.status(400).json({ error: 'word is required' })
  }
  const created = await addBannedWord(word)
  res.status(201).json(created)
})

router.delete('/banned-words/:id', async (req, res) => {
  await removeBannedWord(req.params.id)
  res.status(204).end()
})

// User mute/unmute
router.get('/muted-users', async (req, res) => {
  const users = await getMutedUsers()
  res.json(users)
})

router.post('/users/:id/mute', async (req, res) => {
  await muteUser(req.params.id)
  res.json({ message: 'User muted' })
})

router.post('/users/:id/unmute', async (req, res) => {
  await unmuteUser(req.params.id)
  res.json({ message: 'User unmuted' })
})

// ============================================
// Player Position Overrides
// ============================================

router.get('/player-position-overrides', async (req, res) => {
  const { data, error } = await supabase
    .from('player_position_overrides')
    .select('*')
    .order('player_name')
  if (error) throw error
  res.json(data || [])
})

router.post('/player-position-overrides', async (req, res) => {
  const { player_name, position, sport_key } = req.body
  if (!player_name?.trim() || !position?.trim()) {
    return res.status(400).json({ error: 'player_name and position are required' })
  }
  const { data, error } = await supabase
    .from('player_position_overrides')
    .upsert({ player_name: player_name.trim(), position: position.trim(), sport_key: sport_key || 'basketball_nba' }, { onConflict: 'player_name,sport_key' })
    .select()
    .single()
  if (error) throw error
  res.status(201).json(data)
})

router.get('/player-search', async (req, res) => {
  const { q } = req.query
  if (!q || q.length < 2) return res.json([])

  // Search DFS salaries for recent players
  const { data } = await supabase
    .from('nba_dfs_salaries')
    .select('player_name, position, team')
    .ilike('player_name', `%${q}%`)
    .order('game_date', { ascending: false })
    .limit(50)

  // Deduplicate by player name, keep most recent
  const seen = new Map()
  for (const p of data || []) {
    if (!seen.has(p.player_name)) seen.set(p.player_name, p)
  }
  res.json([...seen.values()].slice(0, 10))
})

router.delete('/player-position-overrides/:id', async (req, res) => {
  const { error } = await supabase
    .from('player_position_overrides')
    .delete()
    .eq('id', req.params.id)
  if (error) throw error
  res.status(204).end()
})

// ============================================
// Fantasy Football - Sleeper Sync
// ============================================

import { syncPlayers, syncSchedule, syncWeeklyStats, syncProjections, getNFLState } from '../services/sleeperService.js'
import { generateSalaries, setSalaries } from '../services/dfsService.js'
import { generateNBASalaries, setNBASalaries } from '../services/nbaDfsService.js'
import { generateMLBSalaries } from '../services/mlbDfsService.js'

router.post('/fantasy/sync-players', async (req, res) => {
  const result = await syncPlayers()
  res.json(result)
})

router.post('/fantasy/sync-schedule', async (req, res) => {
  const season = req.body.season || 2026
  const result = await syncSchedule(season)
  res.json(result)
})

router.post('/fantasy/sync-stats', async (req, res) => {
  const { season = 2026, week = 1 } = req.body
  const result = await syncWeeklyStats(season, week)
  res.json(result)
})

router.post('/fantasy/score-nfl-dfs-week', async (req, res) => {
  const { season = 2026, week } = req.body
  if (!week) return res.status(400).json({ error: 'week required' })
  const { scoreNflDfsWeek } = await import('../services/dfsService.js')
  const result = await scoreNflDfsWeek(week, season)
  res.json(result)
})

router.post('/fantasy/sync-projections', async (req, res) => {
  const season = req.body.season || 2026
  const result = await syncProjections(season)
  res.json(result)
})

router.get('/fantasy/nfl-state', async (req, res) => {
  const state = await getNFLState()
  res.json(state)
})

// DFS Salary Management
router.post('/dfs/generate-salaries', async (req, res) => {
  const { week = 1, season = 2026 } = req.body
  const result = await generateSalaries(week, season)
  res.json(result)
})

router.post('/dfs/salaries', async (req, res) => {
  const { salaries } = req.body
  if (!salaries?.length) return res.status(400).json({ error: 'salaries array required' })
  const result = await setSalaries(salaries)
  res.json(result)
})

// NBA DFS
router.post('/nba-dfs/generate-salaries', async (req, res) => {
  const { date, season = 2026 } = req.body
  if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' })
  // Run in background — too many ESPN API calls to complete in request timeout
  res.json({ message: 'NBA salary generation started', date })
  generateNBASalaries(date, season).catch((err) => logger.error({ err, date }, 'Background NBA salary generation failed'))
})

router.post('/nba-dfs/salaries', async (req, res) => {
  const { salaries } = req.body
  if (!salaries?.length) return res.status(400).json({ error: 'salaries array required' })
  const result = await setNBASalaries(salaries)
  res.json(result)
})

// MLB DFS salary generation
router.post('/mlb-dfs/generate-salaries', async (req, res) => {
  const { date, season } = req.body
  if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' })
  res.json({ message: 'MLB salary generation started', date })
  generateMLBSalaries(date, season || 2026).catch((err) => logger.error({ err, date }, 'Background MLB salary generation failed'))
})

// Backdrop submissions
import { getPendingSubmissions, approveSubmission, rejectSubmission } from '../services/backdropSubmissionService.js'

router.get('/backdrop-submissions', async (req, res) => {
  const data = await getPendingSubmissions()
  res.json(data)
})

router.post('/backdrop-submissions/:id/approve', async (req, res) => {
  const result = await approveSubmission(req.params.id, req.user.id)
  res.json(result)
})

router.post('/backdrop-submissions/:id/reject', async (req, res) => {
  const { reason } = req.body
  if (!reason) return res.status(400).json({ error: 'Rejection reason is required' })
  await rejectSubmission(req.params.id, req.user.id, reason)
  res.json({ success: true })
})

// Pending counts for admin badge indicators
router.get('/pending-counts', async (req, res) => {
  const [reports, backdrops] = await Promise.all([
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('backdrop_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  res.json({
    reports: reports.count || 0,
    backdrops: backdrops.count || 0,
  })
})

export default router
