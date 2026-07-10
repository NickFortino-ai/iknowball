import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { requireFullAdmin } from '../middleware/requireFullAdmin.js'
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
import {
  ENTRY_QUESTIONS,
  EXIT_QUESTIONS,
  sportLabel as surveySportLabel,
} from '../services/surveyService.js'
import {
  listCommissionerReports,
  replyToCommissionerReport,
  resolveCommissionerReport,
} from '../services/commissionerReportService.js'

const router = Router()

// All admin routes require auth + admin
router.use(requireAuth, requireAdmin)

// ============================================
// Admin Dashboard — Phase 1 daily-pulse metrics
// ============================================

router.get('/dashboard', requireFullAdmin, async (req, res) => {
  const range = req.query.range || '30d'
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
  const now = new Date()
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
  const priorStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000).toISOString()

  // Helpers — Supabase head:true returns count without pulling rows
  const countSince = async (table, column, since) => {
    const { count } = await supabase
      .from(table)
      .select(column, { count: 'exact', head: true })
      .gte(column, since)
    return count || 0
  }
  const countBetween = async (table, column, from, to) => {
    const { count } = await supabase
      .from(table)
      .select(column, { count: 'exact', head: true })
      .gte(column, from)
      .lt(column, to)
    return count || 0
  }
  const totalCount = async (table) => {
    const { count } = await supabase.from(table).select('id', { count: 'exact', head: true })
    return count || 0
  }
  const growth = (current, prior) => {
    if (!prior) return current ? null : 0 // null → "n/a" (no prior baseline)
    return Math.round(((current - prior) / prior) * 100)
  }

  // 1. USERS
  const totalUsers = await totalCount('users')
  const newUsersThisPeriod = await countSince('users', 'created_at', periodStart)
  const newUsersPriorPeriod = await countBetween('users', 'created_at', priorStart, periodStart)
  const userGrowthPct = growth(newUsersThisPeriod, newUsersPriorPeriod)

  // 2. ENGAGEMENT — distinct users with any pick activity in last 24h
  // Uses picks.created_at as the activity proxy (don't have last_login
  // tracking and adding it just for this metric isn't worth it; making
  // a pick is a stronger engagement signal than opening the app anyway).
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const { data: dauPicks } = await supabase
    .from('picks')
    .select('user_id')
    .gte('created_at', last24h)
  const dau = new Set((dauPicks || []).map((p) => p.user_id)).size

  // 3. REVENUE — paid subscribers, MRR estimate
  const { data: paidUsers } = await supabase
    .from('users')
    .select('subscription_plan, subscription_status, is_lifetime')
    .eq('is_paid', true)
  const paidActive = (paidUsers || []).filter(
    (u) => u.subscription_status === 'active' || u.subscription_status === 'lifetime' || u.is_lifetime
  )
  const monthlyCount = paidActive.filter((u) => u.subscription_plan === 'monthly').length
  const yearlyCount = paidActive.filter((u) => u.subscription_plan === 'yearly').length
  // MRR estimate — monthly subs $1/mo + yearly subs amortized (\$10/12).
  // Lifetime subs not counted in MRR (they paid once).
  const mrrEstimate = monthlyCount * 1 + yearlyCount * (10 / 12)

  // New paid subs this period (best proxy: new-since-period users with is_paid=true)
  const { count: newPaidThisPeriod } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('is_paid', true)
    .gte('created_at', periodStart)

  // 4. LEAGUES — created in period
  const leaguesThisPeriod = await countSince('leagues', 'created_at', periodStart)
  const leaguesPriorPeriod = await countBetween('leagues', 'created_at', priorStart, periodStart)
  const leagueGrowthPct = growth(leaguesThisPeriod, leaguesPriorPeriod)

  // 5. PICKS — total made in period (single picks only; parlays + props
  // tracked separately if we want later)
  const picksThisPeriod = await countSince('picks', 'created_at', periodStart)
  const picksPriorPeriod = await countBetween('picks', 'created_at', priorStart, periodStart)
  const pickGrowthPct = growth(picksThisPeriod, picksPriorPeriod)

  // 6. PROMO CODES — count of uses per code (pulled from the
  // promo_codes table where current_uses is maintained on redemption).
  // Sorted by uses desc so the most-used codes surface first.
  const { data: promoCodes } = await supabase
    .from('promo_codes')
    .select('code, current_uses, max_uses, is_active')
    .order('current_uses', { ascending: false })

  // 7. LATEST ACTIVITY — most recent 5 signups + 5 leagues created
  const { data: recentUsers } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji, created_at')
    .order('created_at', { ascending: false })
    .limit(5)
  const { data: recentLeagues } = await supabase
    .from('leagues')
    .select('id, name, format, sport, created_at, users!leagues_commissioner_id_fkey(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(5)

  res.json({
    range,
    days,
    users: {
      total: totalUsers,
      newThisPeriod: newUsersThisPeriod,
      growthPct: userGrowthPct,
    },
    engagement: {
      dau,
    },
    revenue: {
      paidActive: paidActive.length,
      monthlyCount,
      yearlyCount,
      lifetimeCount: paidActive.filter((u) => u.is_lifetime || u.subscription_status === 'lifetime').length,
      newPaidThisPeriod: newPaidThisPeriod || 0,
      mrrEstimate: Math.round(mrrEstimate * 100) / 100,
    },
    leagues: {
      newThisPeriod: leaguesThisPeriod,
      growthPct: leagueGrowthPct,
    },
    picks: {
      newThisPeriod: picksThisPeriod,
      growthPct: pickGrowthPct,
    },
    promoCodes: promoCodes || [],
    latest: {
      users: recentUsers || [],
      leagues: recentLeagues || [],
    },
  })
})

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

// Backfill an entire NFL regular season of weekly stats. Fire-and-forget —
// returns immediately so the gateway doesn't timeout. Watch Render logs
// for progress and completion lines.
router.post('/backfill-nfl-season', async (req, res) => {
  const season = parseInt(req.body?.season || req.query?.season || '2025', 10)
  res.json({ status: 'started', season, note: 'Running in background. Check Render logs for completion.' })
  // Run after responding
  ;(async () => {
    try {
      const { backfillSeasonStats, syncPlayers } = await import('../services/sleeperService.js')
      logger.info({ season }, '[backfill] step 1/2: syncing players')
      const playersResult = await syncPlayers()
      logger.info({ playersResult }, '[backfill] step 1/2 complete')
      logger.info({ season }, '[backfill] step 2/2: syncing weekly stats')
      const result = await backfillSeasonStats(season)
      const totalUpserted = (result.weeks || []).reduce((s, w) => s + (w.upserted || 0), 0)
      logger.info({ season, totalUpserted, weeks: result.weeks?.length }, '[backfill] DONE')
    } catch (err) {
      logger.error({ err, season }, '[backfill] FAILED')
    }
  })().catch(() => {})
})

// Quick check: how many stat rows exist for a given season
router.get('/nfl-season-stats-count', async (req, res) => {
  const season = parseInt(req.query?.season || '2025', 10)
  const { count, error } = await supabase
    .from('nfl_player_stats')
    .select('id', { count: 'exact', head: true })
    .eq('season', season)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ season, count: count || 0 })
})

router.post('/sync-injuries', async (req, res) => {
  const result = await syncInjuries()
  res.json({ message: 'Injury sync complete', ...result })
})

router.post('/score-games', async (req, res) => {
  await scoreGames()
  res.json({ message: 'Game scoring complete' })
})

// One-shot APNs diagnostic. POST { userId, message? } → fires a notification
// via createNotification so the full push fanout (web push + APNs) runs.
// Returns the created notification row so we can confirm it landed.
router.post('/test-push', async (req, res) => {
  const { userId, message } = req.body || {}
  if (!userId) return res.status(400).json({ error: 'userId required' })
  const { createNotification } = await import('../services/notificationService.js')
  const note = await createNotification(
    userId,
    'survivor_result',
    message || 'Test push from I KNOW BALL server',
    {}
  )
  res.json({ ok: true, note })
})

// One-shot backfill for dates whose MLB stats got zeroed out by the
// 2026-06-09 stat-group matcher regression. POST { dates: ['YYYY-MM-DD', ...] }.
router.post('/backfill-mlb-stats', async (req, res) => {
  const { dates } = req.body || {}
  if (!Array.isArray(dates) || !dates.length) {
    return res.status(400).json({ error: 'dates array required (e.g. ["2026-06-08", "2026-06-09"])' })
  }
  const {
    fetchCompletedGameStats: fetchMlb,
    upsertPlayerStats: upsertMlb,
    scoreRosters: scoreMlbRosters,
  } = await import('../jobs/scoreMLBDFS.js')
  const season = 2026
  const results = []
  for (const date of dates) {
    try {
      const { playerStats, allFinal } = await fetchMlb(date)
      if (playerStats.length) await upsertMlb(playerStats, date, season)
      // Stats alone don't update users' MLB DFS league standings —
      // scoreRosters reads mlb_dfs_player_stats and writes
      // points_earned per roster slot + roster total_points + nightly
      // results. Call it here so the backfill fully closes the loop.
      let rostersUpdated = false
      if (playerStats.length) {
        await scoreMlbRosters(date, season, allFinal)
        rostersUpdated = true
      }
      results.push({ date, rowsUpserted: playerStats.length, rostersUpdated, allFinal })
    } catch (err) {
      logger.error({ err, date }, 'MLB stat backfill failed for date')
      results.push({ date, error: err.message })
    }
  }
  res.json({ message: 'MLB stat backfill complete', results })
})

router.post('/recalculate-points', async (req, res) => {
  const results = await recalculateAllUserPoints()
  res.json({ message: `Recalculated points for ${results.length} users`, corrections: results })
})

// One-off repair: regenerate league_weeks for a survivor league using the
// current settings.pick_frequency, remapping existing picks to the new
// periods. Handles the "toggled weekly ↔ daily after generation" case.
router.post('/leagues/:id/regenerate-survivor-periods', async (req, res) => {
  const { regenerateSurvivorPeriods } = await import('../services/survivorService.js')
  try {
    const result = await regenerateSurvivorPeriods(req.params.id)
    res.json({ message: 'Survivor periods regenerated', ...result })
  } catch (err) {
    logger.error({ err, leagueId: req.params.id }, 'Failed to regenerate survivor periods')
    res.status(500).json({ error: err.message })
  }
})

// Debug: look up a user's survivor picks in a specific league, with the
// pick timestamps side-by-side with each period's window. Lets us
// investigate "I thought I picked on time but the app says I missed it"
// reports without needing raw DB access.
// Query params: league_name (case-insensitive contains) + username.
router.get('/survivor/pick-history', async (req, res) => {
  const { league_name, username } = req.query
  if (!league_name || !username) {
    return res.status(400).json({ error: 'league_name and username required' })
  }
  const { data: leagueRows } = await supabase
    .from('leagues')
    .select('id, name, format, starts_at, settings')
    .eq('format', 'survivor')
    .ilike('name', `%${league_name}%`)
    .limit(5)
  const league = (leagueRows || [])[0]
  if (!league) return res.status(404).json({ error: 'League not found', matches: leagueRows })

  const { data: user } = await supabase
    .from('users')
    .select('id, username, display_name')
    .ilike('username', username)
    .maybeSingle()
  if (!user) return res.status(404).json({ error: 'User not found' })

  const { data: member } = await supabase
    .from('league_members')
    .select('lives_remaining, is_alive, joined_at')
    .eq('league_id', league.id)
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: weeks } = await supabase
    .from('league_weeks')
    .select('id, week_number, starts_at, ends_at')
    .eq('league_id', league.id)
    .order('week_number', { ascending: true })

  const { data: picks } = await supabase
    .from('survivor_picks')
    .select('id, league_week_id, team_name, status, created_at, updated_at, games(starts_at, home_team, away_team, winner)')
    .eq('league_id', league.id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const picksByWeek = {}
  for (const p of picks || []) picksByWeek[p.league_week_id] = p

  const timeline = (weeks || []).slice(0, 10).map((w) => {
    const p = picksByWeek[w.id]
    return {
      week_number: w.week_number,
      starts_at: w.starts_at,
      ends_at: w.ends_at,
      pick: p ? {
        team: p.team_name,
        status: p.status,
        created_at: p.created_at,
        game_starts_at: p.games?.starts_at,
        game_winner: p.games?.winner,
      } : null,
    }
  })

  res.json({
    league: { id: league.id, name: league.name, starts_at: league.starts_at, pick_frequency: league.settings?.pick_frequency },
    user: { id: user.id, username: user.username, display_name: user.display_name },
    member,
    total_periods: (weeks || []).length,
    total_picks: (picks || []).length,
    timeline,
  })
})

router.post('/recalculate-records', async (req, res) => {
  await snapshotRanks()
  const result = await recalculateAllRecords()
  res.json({ message: `Record recalculation complete`, ...result })
})

// Set a single remote-config knob (e.g. news_tab_order). The client GET
// /app-config endpoint is public + cacheable; this write goes through
// admin and is bounded by `app_config` table's PK so payloads stay tiny.
router.patch('/app-config', async (req, res) => {
  const { key, value } = req.body || {}
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'key is required' })
  }
  if (value === undefined) {
    return res.status(400).json({ error: 'value is required' })
  }
  const { data, error } = await supabase
    .from('app_config')
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: req.user.id }, { onConflict: 'key' })
    .select()
    .single()
  if (error) {
    return res.status(500).json({ error: 'Failed to update config' })
  }
  res.json(data)
})

router.post('/email-blast', requireFullAdmin, async (req, res) => {
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

router.post('/email-targeted', requireFullAdmin, async (req, res) => {
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

router.post('/email-template-blast', requireFullAdmin, async (req, res) => {
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

router.get('/email-logs', requireFullAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('email_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  res.json(data)
})

// League search (for email link insertion)
router.get('/leagues/search', async (req, res) => {
  const { q } = req.query
  if (!q || q.length < 2) return res.json([])
  const { data, error } = await supabase
    .from('leagues')
    .select('id, name, sport, format, status, invite_code')
    .ilike('name', `%${q}%`)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  res.json(data)
})

// =====================================================================
// User Lookup
// =====================================================================
router.get('/users/lookup', async (req, res) => {
  const { user_id } = req.query
  if (!user_id) return res.status(400).json({ error: 'user_id required' })

  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji, total_points, tier, is_paid, is_lifetime, subscription_status, subscription_expires_at, subscription_plan, payment_source, stripe_customer_id, created_at')
    .eq('id', user_id)
    .single()
  if (error) throw error

  // Email lives on auth.users, not public.users — fetch it separately so
  // the admin panel can display it (used when texting/emailing a user
  // a temporary password). Non-fatal if it fails.
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(user_id)
    if (authUser?.user?.email) user.email = authUser.user.email
  } catch { /* swallow — email is best-effort */ }

  // Recent picks
  const { data: picks } = await supabase
    .from('picks')
    .select('id, picked_team, status, is_correct, points_earned, created_at, games(home_team, away_team, starts_at, status)')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(20)

  // Leagues
  const { data: memberships } = await supabase
    .from('league_members')
    .select('league_id, joined_at, leagues(name, format, sport, status)')
    .eq('user_id', user_id)
    .order('joined_at', { ascending: false })
    .limit(20)

  res.json({ user, picks: picks || [], leagues: (memberships || []).map(m => ({ ...m.leagues, league_id: m.league_id, joined_at: m.joined_at })) })
})

// =====================================================================
// Subscription Override
// =====================================================================
router.post('/users/subscription', async (req, res) => {
  const { user_id, subscription_status, subscription_plan, subscription_expires_at, is_paid, is_lifetime, payment_source } = req.body
  if (!user_id) return res.status(400).json({ error: 'user_id required' })

  const update = {}
  if (subscription_status !== undefined) update.subscription_status = subscription_status
  if (subscription_plan !== undefined) update.subscription_plan = subscription_plan
  if (subscription_expires_at !== undefined) update.subscription_expires_at = subscription_expires_at
  if (is_paid !== undefined) update.is_paid = is_paid
  if (is_lifetime !== undefined) update.is_lifetime = is_lifetime
  if (payment_source !== undefined) update.payment_source = payment_source

  if (!Object.keys(update).length) return res.status(400).json({ error: 'No fields to update' })

  const { error } = await supabase.from('users').update(update).eq('id', user_id)
  if (error) throw error

  logger.info({ user_id, update, admin: req.user.id }, 'Admin subscription override')
  res.json({ success: true })
})

// =====================================================================
// Password Reset (admin-set new password for a user)
// Used when a user can't receive recovery emails — admin types a
// temporary password here and texts it to them. requireFullAdmin
// because this can take over any account.
// =====================================================================
router.post('/users/:id/set-password', requireFullAdmin, async (req, res) => {
  const { password } = req.body
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'password must be a string of at least 8 characters' })
  }
  const { error } = await supabase.auth.admin.updateUserById(req.params.id, { password })
  if (error) {
    logger.error({ err: error, user_id: req.params.id, admin: req.user.id }, 'Admin password reset failed')
    return res.status(500).json({ error: error.message })
  }
  logger.info({ user_id: req.params.id, admin: req.user.id }, 'Admin set new password for user')
  res.json({ success: true })
})

// =====================================================================
// Game Status Override
// =====================================================================
router.get('/games/search', async (req, res) => {
  const { q, status } = req.query
  if (!q || q.length < 2) return res.json([])
  const query = supabase
    .from('games')
    .select('id, home_team, away_team, status, starts_at, winner, home_score, away_score')
    .or(`home_team.ilike.%${q}%,away_team.ilike.%${q}%`)
    .order('starts_at', { ascending: false })
    .limit(15)
  if (status) query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  res.json(data)
})

router.post('/games/override', async (req, res) => {
  const { game_id, status, winner, home_score, away_score } = req.body
  if (!game_id || !status) return res.status(400).json({ error: 'game_id and status required' })

  // Fetch sport_id so the downstream pickem/league/parlay scoring chain
  // (mirrored from scoreGames.js) has the same context it does on a
  // normal cron-driven final.
  const { data: gameRow } = await supabase
    .from('games')
    .select('id, sport_id')
    .eq('id', game_id)
    .single()
  if (!gameRow) return res.status(404).json({ error: 'game not found' })

  const update = { status, updated_at: new Date().toISOString() }
  if (winner !== undefined) update.winner = winner
  if (home_score !== undefined) update.home_score = home_score
  if (away_score !== undefined) update.away_score = away_score

  const { error } = await supabase.from('games').update(update).eq('id', game_id)
  if (error) throw error

  logger.info({ game_id, update, admin: req.user.id }, 'Admin game status override')

  // If the override is flipping the game to final with a winner, mirror
  // the downstream-scoring chain that scoreGames runs after a normal
  // finalization. Without this, a stuck-postponed game corrected via
  // override leaves survivor / pickem / parlay / bracket picks unsettled.
  const downstreamRan = { picks: false, parlays: false, survivor: false, leaguePicks: false, bracket: false }
  if (status === 'final' && winner) {
    try {
      const { scoreCompletedGame, scoreParlayLegs } = await import('../services/scoringService.js')
      const { scoreSurvivorPicks } = await import('../services/survivorService.js')
      const { scoreLeaguePicks } = await import('../services/leaguePickService.js')
      const { scoreBracketMatchups } = await import('../services/bracketService.js')
      await scoreCompletedGame(game_id, winner, gameRow.sport_id); downstreamRan.picks = true
      await scoreParlayLegs(game_id, winner); downstreamRan.parlays = true
      await scoreSurvivorPicks(game_id, winner); downstreamRan.survivor = true
      await scoreLeaguePicks(game_id, winner); downstreamRan.leaguePicks = true
      // Bracket scoring needs team names + scores; only attempt if we
      // have both. Falls through silently if not relevant.
      if (home_score != null && away_score != null) {
        const { data: g } = await supabase
          .from('games')
          .select('home_team, away_team, sports!inner(key)')
          .eq('id', game_id)
          .single()
        if (g) {
          await scoreBracketMatchups(g.home_team, g.away_team, winner, home_score, away_score, g.sports.key)
          downstreamRan.bracket = true
        }
      }
    } catch (err) {
      logger.error({ err, game_id }, 'Admin override downstream scoring failed')
      return res.json({ success: true, downstreamRan, error: err.message })
    }
  }

  res.json({ success: true, downstreamRan })
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
    const sportPath = sportKey === 'baseball_mlb' ? 'baseball/mlb'
      : sportKey === 'basketball_wnba' ? 'basketball/wnba'
      : 'basketball/nba'
    await refreshPlayerHeadshotCache(sportPath)
    headshot = getPlayerHeadshotUrl(prop.player_name, sportPath)

    // Fallback: ESPN's team-roster endpoint excludes some players we still
    // want headshots for (40-man shuttle / IL / spot starts — e.g. J.T. Ginn
    // pitching for the A's wasn't in the team roster). Our DFS salary sync
    // uses the per-game scoreboard rosters (broader) and already stores the
    // ESPN headshot URL, so check there as a backstop. Normalize-name match
    // handles drift between odds-feed and ESPN spellings ("JT Ginn" vs
    // "J.T. Ginn", etc.) — same rule the cache uses.
    if (!headshot) {
      const salaryTable = sportKey === 'baseball_mlb' ? 'mlb_dfs_salaries'
        : sportKey === 'basketball_wnba' ? 'wnba_dfs_salaries'
        : sportKey === 'basketball_nba' ? 'nba_dfs_salaries'
        : null
      if (salaryTable) {
        // Search the last 7 days of salary rows (not just today onward)
        // — recent call-ups like Nick Kurtz showed up in yesterday's
        // salary sync but the prop was featured pre-game when today's
        // run hadn't happened yet. Wider window catches those without
        // weakening the most-recent-first ordering below.
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400e3)
          .toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
        const { data: salaryRows } = await supabase
          .from(salaryTable)
          .select('player_name, headshot_url, game_date')
          .gte('game_date', sevenDaysAgo)
          .not('headshot_url', 'is', null)
          .order('game_date', { ascending: false })
          .limit(1000)
        const norm = (n) => (n || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()
        const target = norm(prop.player_name)
        const match = (salaryRows || []).find((r) => norm(r.player_name) === target)
        if (match) headshot = match.headshot_url
      }
    }
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
  const { name, sport, team_count, description, rounds, regions, picks_available_at, ends_at, series_format,
          bracket_image, bracket_image_x, bracket_image_y, bracket_image_scale, bracket_image_opacity, bracket_image_position } = req.body
  if (!name || !sport || !team_count) {
    return res.status(400).json({ error: 'name, sport, and team_count are required' })
  }
  const template = await createTemplate(req.user.id, {
    name, sport, team_count, description, rounds, regions, picks_available_at, ends_at, series_format,
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

import { syncPlayers, syncSchedule, syncWeeklyStats, syncProjections, syncWeeklyProjections, syncByeWeeks, getNFLState, enrichEspnIds } from '../services/sleeperService.js'
import { generateSalaries, setSalaries } from '../services/dfsService.js'
import { generateNBASalaries, setNBASalaries } from '../services/nbaDfsService.js'
import { generateWNBASalaries, setWNBASalaries } from '../services/wnbaDfsService.js'
import { generateMLBSalaries, setMLBSalaries } from '../services/mlbDfsService.js'

router.post('/fantasy/sync-players', async (req, res) => {
  const result = await syncPlayers()
  res.json(result)
})

// Derive and stamp each NFL team's bye week onto every player on that
// team. Lets you populate bye_weeks immediately after an NFL schedule
// publish or mid-season trade rather than waiting on the 3 AM cron.
router.post('/fantasy/sync-bye-weeks', async (req, res) => {
  const season = req.body?.season || (await getNFLState())?.season
  if (!season) return res.status(400).json({ error: 'season unknown' })
  const result = await syncByeWeeks(season)
  res.json({ season, ...result })
})

// Fill in nfl_players.espn_id for active players Sleeper didn't have IDs for.
// Walks each NFL team roster on ESPN (32 calls) — run in background to avoid
// request timeout.
router.post('/fantasy/enrich-espn-ids', async (req, res) => {
  res.json({ message: 'ESPN ID enrichment started — runs in background' })
  enrichEspnIds().catch((err) => logger.error({ err }, 'Background ESPN ID enrichment failed'))
})

// Pull Sleeper's per-week point projections for the target (season, week)
// into nfl_player_projections. Used as the season-level signal for DFS
// pricing, particularly for Week 1 cold start.
router.post('/fantasy/sync-weekly-projections', async (req, res) => {
  const season = parseInt(req.body.season, 10)
  if (!Number.isInteger(season)) {
    return res.status(400).json({ error: 'season required (integer)' })
  }
  // If a specific week is provided, sync that one. Otherwise loop 1-18
  // (the nightly cron's full pass) so admin can backfill all weekly
  // projections with one click — useful after a schema change adds new
  // columns (e.g. the idp_* fields in migration 232).
  const week = req.body.week != null ? parseInt(req.body.week, 10) : null
  try {
    if (week != null && Number.isInteger(week)) {
      const result = await syncWeeklyProjections(season, week)
      return res.json(result)
    }
    const perWeek = []
    for (let w = 1; w <= 18; w++) {
      try {
        const r = await syncWeeklyProjections(season, w)
        perWeek.push({ week: w, ...r })
      } catch (err) {
        logger.error({ err, season, week: w }, 'Per-week projections sync failed')
        perWeek.push({ week: w, error: err.message })
      }
    }
    const totalUpdated = perWeek.reduce((sum, r) => sum + (r.updated || 0), 0)
    res.json({ season, weeks_attempted: 18, total_updated: totalUpdated, per_week: perWeek })
  } catch (err) {
    logger.error({ err, season }, 'Weekly projections sync failed')
    res.status(500).json({ error: err.message })
  }
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

// Recovery: merge two NFL player IDs into one. Used when Sleeper renumbers
// a player and our nfl_players table ends up with both rows. The Postgres
// function migrates every FK reference inside a single transaction, so a
// partial failure rolls everything back.
router.post('/players/merge-nfl-id', async (req, res) => {
  const { old_id, new_id } = req.body
  if (!old_id || !new_id) {
    return res.status(400).json({ error: 'old_id and new_id are required' })
  }
  if (old_id === new_id) {
    return res.status(400).json({ error: 'old_id and new_id are the same' })
  }
  try {
    const { data, error } = await supabase.rpc('merge_nfl_player_id', {
      p_old_id: old_id,
      p_new_id: new_id,
    })
    if (error) {
      logger.error({ error, old_id, new_id }, 'merge_nfl_player_id RPC failed')
      return res.status(500).json({ error: error.message || 'Merge failed' })
    }
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Recovery: nuke and recompute a single fantasy week from raw stats.
// One-click reset if anything ever drifts during a real game day. Re-runs
// stat sync, then re-scores both salary cap (dfs_weekly_results) and
// traditional H2H (fantasy_matchups) for the given week.
router.post('/fantasy/recompute-week', async (req, res) => {
  const { season = 2026, week } = req.body
  if (!week) return res.status(400).json({ error: 'week required' })
  try {
    const { syncWeeklyStats } = await import('../services/sleeperService.js')
    const { scoreNflDfsWeek } = await import('../services/dfsService.js')
    const { scoreFantasyMatchupsWeek } = await import('../services/fantasyService.js')

    const statsResult = await syncWeeklyStats(season, week)
    const dfsResult = await scoreNflDfsWeek(week, season)
    const traditionalResult = await scoreFantasyMatchupsWeek(week, season)

    res.json({
      ok: true,
      season,
      week,
      stats: statsResult,
      salary_cap: dfsResult,
      traditional: traditionalResult,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
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
  // Run in background — too many ESPN API calls to complete in request timeout
  res.json({ message: 'NFL salary generation started', week, season })
  generateSalaries(week, season).catch((err) => logger.error({ err, week, season }, 'Background NFL salary generation failed'))
})

// List NFL DFS salaries for a given week with player names/positions/teams.
// Optional filters: position (single position or 'ALL'), search (player name substring).
router.get('/dfs/salaries', async (req, res) => {
  const week = parseInt(req.query.week, 10)
  const season = parseInt(req.query.season, 10)
  if (!Number.isInteger(week) || !Number.isInteger(season)) {
    return res.status(400).json({ error: 'week and season query params required (integers)' })
  }
  const position = req.query.position && req.query.position !== 'ALL' ? String(req.query.position) : null
  const search = req.query.search ? String(req.query.search).trim() : ''

  let query = supabase
    .from('dfs_weekly_salaries')
    .select('id, player_id, salary, algorithm_salary, manually_set, updated_at, nfl_players!inner(id, full_name, position, team, headshot_url, injury_status)')
    .eq('nfl_week', week)
    .eq('season', season)
    .order('salary', { ascending: false })
    .limit(1000)

  if (position) {
    query = query.eq('nfl_players.position', position)
  }
  if (search) {
    query = query.ilike('nfl_players.full_name', `%${search}%`)
  }

  const { data, error } = await query
  if (error) {
    logger.error({ error, week, season }, 'Failed to fetch DFS salaries')
    return res.status(500).json({ error: error.message })
  }

  // Flatten the player join for easier client consumption
  const rows = (data || []).map((r) => ({
    id: r.id,
    player_id: r.player_id,
    salary: r.salary,
    algorithm_salary: r.algorithm_salary,
    manually_set: r.manually_set,
    updated_at: r.updated_at,
    full_name: r.nfl_players?.full_name,
    position: r.nfl_players?.position,
    team: r.nfl_players?.team,
    headshot_url: r.nfl_players?.headshot_url,
    injury_status: r.nfl_players?.injury_status,
  }))
  res.json({ rows, count: rows.length })
})

// Set a manual salary override for one player+week+season.
router.patch('/dfs/salaries/:id', async (req, res) => {
  const id = req.params.id
  const salary = parseInt(req.body.salary, 10)
  if (!Number.isInteger(salary) || salary < 0) {
    return res.status(400).json({ error: 'salary must be a non-negative integer' })
  }
  const { data, error } = await supabase
    .from('dfs_weekly_salaries')
    .update({ salary, manually_set: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, salary, manually_set, updated_at')
    .single()
  if (error) {
    logger.error({ error, id, salary }, 'Failed to update DFS salary')
    return res.status(500).json({ error: error.message })
  }
  res.json(data)
})

// Clear the manual override and restore the algorithm-computed salary.
router.post('/dfs/salaries/:id/reset', async (req, res) => {
  const id = req.params.id
  const { data: existing, error: fetchErr } = await supabase
    .from('dfs_weekly_salaries')
    .select('id, algorithm_salary')
    .eq('id', id)
    .single()
  if (fetchErr || !existing) {
    return res.status(404).json({ error: 'salary row not found' })
  }
  const restored = existing.algorithm_salary ?? 0
  const { data, error } = await supabase
    .from('dfs_weekly_salaries')
    .update({ salary: restored, manually_set: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, salary, manually_set, algorithm_salary, updated_at')
    .single()
  if (error) {
    return res.status(500).json({ error: error.message })
  }
  res.json(data)
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

// NBA DFS salary editor — list with filters
router.get('/nba-dfs/salaries', async (req, res) => {
  const date = req.query.date
  const season = parseInt(req.query.season, 10)
  if (!date || !Number.isInteger(season)) {
    return res.status(400).json({ error: 'date (YYYY-MM-DD) and season query params required' })
  }
  const position = req.query.position && req.query.position !== 'ALL' ? String(req.query.position) : null
  const search = req.query.search ? String(req.query.search).trim() : ''

  let query = supabase
    .from('nba_dfs_salaries')
    .select('id, espn_player_id, player_name, team, position, salary, algorithm_salary, manually_set, headshot_url, injury_status, opponent, updated_at')
    .eq('game_date', date)
    .eq('season', season)
    .order('salary', { ascending: false })
    .limit(500)

  if (position) query = query.eq('position', position)
  if (search) query = query.ilike('player_name', `%${search}%`)

  const { data, error } = await query
  if (error) {
    logger.error({ error, date, season }, 'Failed to fetch NBA DFS salaries')
    return res.status(500).json({ error: error.message })
  }
  const rows = (data || []).map((r) => ({
    id: r.id,
    espn_player_id: r.espn_player_id,
    full_name: r.player_name,
    position: r.position,
    team: r.team,
    salary: r.salary,
    algorithm_salary: r.algorithm_salary,
    manually_set: r.manually_set,
    headshot_url: r.headshot_url,
    injury_status: r.injury_status,
    opponent: r.opponent,
    updated_at: r.updated_at,
  }))
  res.json({ rows, count: rows.length })
})

router.patch('/nba-dfs/salaries/:id', async (req, res) => {
  const id = req.params.id
  const salary = parseInt(req.body.salary, 10)
  if (!Number.isInteger(salary) || salary < 0) {
    return res.status(400).json({ error: 'salary must be a non-negative integer' })
  }
  const { data, error } = await supabase
    .from('nba_dfs_salaries')
    .update({ salary, manually_set: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, salary, manually_set, updated_at')
    .single()
  if (error) {
    logger.error({ error, id, salary }, 'Failed to update NBA DFS salary')
    return res.status(500).json({ error: error.message })
  }
  res.json(data)
})

router.post('/nba-dfs/salaries/:id/reset', async (req, res) => {
  const id = req.params.id
  const { data: existing, error: fetchErr } = await supabase
    .from('nba_dfs_salaries')
    .select('id, algorithm_salary')
    .eq('id', id)
    .single()
  if (fetchErr || !existing) {
    return res.status(404).json({ error: 'salary row not found' })
  }
  const restored = existing.algorithm_salary ?? 0
  const { data, error } = await supabase
    .from('nba_dfs_salaries')
    .update({ salary: restored, manually_set: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, salary, manually_set, algorithm_salary, updated_at')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// MLB DFS salary generation
router.post('/mlb-dfs/generate-salaries', async (req, res) => {
  const { date, season } = req.body
  if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' })
  res.json({ message: 'MLB salary generation started', date })
  generateMLBSalaries(date, season || 2026).catch((err) => logger.error({ err, date }, 'Background MLB salary generation failed'))
})

router.post('/mlb-dfs/salaries', async (req, res) => {
  const { salaries } = req.body
  if (!salaries?.length) return res.status(400).json({ error: 'salaries array required' })
  const result = await setMLBSalaries(salaries)
  res.json(result)
})

// MLB DFS salary editor — list with filters
router.get('/mlb-dfs/salaries', async (req, res) => {
  const date = req.query.date
  const season = parseInt(req.query.season, 10)
  if (!date || !Number.isInteger(season)) {
    return res.status(400).json({ error: 'date (YYYY-MM-DD) and season query params required' })
  }
  const position = req.query.position && req.query.position !== 'ALL' ? String(req.query.position) : null
  const search = req.query.search ? String(req.query.search).trim() : ''

  let query = supabase
    .from('mlb_dfs_salaries')
    .select('id, espn_player_id, player_name, team, position, salary, algorithm_salary, manually_set, headshot_url, injury_status, opponent, updated_at')
    .eq('game_date', date)
    .eq('season', season)
    .order('salary', { ascending: false })
    .limit(500)

  if (position) query = query.eq('position', position)
  if (search) query = query.ilike('player_name', `%${search}%`)

  const { data, error } = await query
  if (error) {
    logger.error({ error, date, season }, 'Failed to fetch MLB DFS salaries')
    return res.status(500).json({ error: error.message })
  }
  const rows = (data || []).map((r) => ({
    id: r.id,
    espn_player_id: r.espn_player_id,
    full_name: r.player_name,
    position: r.position,
    team: r.team,
    salary: r.salary,
    algorithm_salary: r.algorithm_salary,
    manually_set: r.manually_set,
    headshot_url: r.headshot_url,
    injury_status: r.injury_status,
    opponent: r.opponent,
    updated_at: r.updated_at,
  }))
  res.json({ rows, count: rows.length })
})

router.patch('/mlb-dfs/salaries/:id', async (req, res) => {
  const id = req.params.id
  const salary = parseInt(req.body.salary, 10)
  if (!Number.isInteger(salary) || salary < 0) {
    return res.status(400).json({ error: 'salary must be a non-negative integer' })
  }
  const { data, error } = await supabase
    .from('mlb_dfs_salaries')
    .update({ salary, manually_set: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, salary, manually_set, updated_at')
    .single()
  if (error) {
    logger.error({ error, id, salary }, 'Failed to update MLB DFS salary')
    return res.status(500).json({ error: error.message })
  }
  res.json(data)
})

router.post('/mlb-dfs/salaries/:id/reset', async (req, res) => {
  const id = req.params.id
  const { data: existing, error: fetchErr } = await supabase
    .from('mlb_dfs_salaries')
    .select('id, algorithm_salary')
    .eq('id', id)
    .single()
  if (fetchErr || !existing) {
    return res.status(404).json({ error: 'salary row not found' })
  }
  const restored = existing.algorithm_salary ?? 0
  const { data, error } = await supabase
    .from('mlb_dfs_salaries')
    .update({ salary: restored, manually_set: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, salary, manually_set, algorithm_salary, updated_at')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// WNBA DFS salary generation
router.post('/wnba-dfs/generate-salaries', async (req, res) => {
  const { date, season } = req.body
  if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' })
  res.json({ message: 'WNBA salary generation started', date })
  generateWNBASalaries(date, season || 2026).catch((err) => logger.error({ err, date }, 'Background WNBA salary generation failed'))
})

router.post('/wnba-dfs/salaries', async (req, res) => {
  const { salaries } = req.body
  if (!salaries?.length) return res.status(400).json({ error: 'salaries array required' })
  const result = await setWNBASalaries(salaries)
  res.json(result)
})

// WNBA DFS salary editor — list with filters
router.get('/wnba-dfs/salaries', async (req, res) => {
  const date = req.query.date
  const season = parseInt(req.query.season, 10)
  if (!date || !Number.isInteger(season)) {
    return res.status(400).json({ error: 'date (YYYY-MM-DD) and season query params required' })
  }
  const position = req.query.position && req.query.position !== 'ALL' ? String(req.query.position) : null
  const search = req.query.search ? String(req.query.search).trim() : ''

  let query = supabase
    .from('wnba_dfs_salaries')
    .select('id, espn_player_id, player_name, team, position, salary, algorithm_salary, manually_set, headshot_url, injury_status, opponent, updated_at')
    .eq('game_date', date)
    .eq('season', season)
    .order('salary', { ascending: false })
    .limit(500)

  if (position) query = query.eq('position', position)
  if (search) query = query.ilike('player_name', `%${search}%`)

  const { data, error } = await query
  if (error) {
    logger.error({ error, date, season }, 'Failed to fetch WNBA DFS salaries')
    return res.status(500).json({ error: error.message })
  }
  // Map to the shape the editor expects (full_name parity with NFL editor)
  const rows = (data || []).map((r) => ({
    id: r.id,
    espn_player_id: r.espn_player_id,
    full_name: r.player_name,
    position: r.position,
    team: r.team,
    salary: r.salary,
    algorithm_salary: r.algorithm_salary,
    manually_set: r.manually_set,
    headshot_url: r.headshot_url,
    injury_status: r.injury_status,
    opponent: r.opponent,
    updated_at: r.updated_at,
  }))
  res.json({ rows, count: rows.length })
})

router.patch('/wnba-dfs/salaries/:id', async (req, res) => {
  const id = req.params.id
  const salary = parseInt(req.body.salary, 10)
  if (!Number.isInteger(salary) || salary < 0) {
    return res.status(400).json({ error: 'salary must be a non-negative integer' })
  }
  const { data, error } = await supabase
    .from('wnba_dfs_salaries')
    .update({ salary, manually_set: true, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, salary, manually_set, updated_at')
    .single()
  if (error) {
    logger.error({ error, id, salary }, 'Failed to update WNBA DFS salary')
    return res.status(500).json({ error: error.message })
  }
  res.json(data)
})

router.post('/wnba-dfs/salaries/:id/reset', async (req, res) => {
  const id = req.params.id
  const { data: existing, error: fetchErr } = await supabase
    .from('wnba_dfs_salaries')
    .select('id, algorithm_salary')
    .eq('id', id)
    .single()
  if (fetchErr || !existing) {
    return res.status(404).json({ error: 'salary row not found' })
  }
  const restored = existing.algorithm_salary ?? 0
  const { data, error } = await supabase
    .from('wnba_dfs_salaries')
    .update({ salary: restored, manually_set: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, salary, manually_set, algorithm_salary, updated_at')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
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

// =====================================================================
// Player Blurbs
// =====================================================================

// List players for the blurbs admin panel (ranked by season points, with blurb status)
router.get('/blurbs/players', async (req, res) => {
  const season = Number(req.query.season) || new Date().getFullYear()
  const position = req.query.position || null
  const sport = (req.query.sport || 'nfl').toLowerCase()

  const { getTopPlayersByPosition, getPlayersForSport } = await import('../services/playerBlurbService.js')

  let players
  if (sport === 'nfl') {
    // Admin needs the full active roster, not the top-N fantasy cut — they're
    // writing notes for backups and rookies too (e.g. Fernando Mendoza, Kenneth
    // Gainwell). The search bar narrows things down client-side.
    const byPosition = await getTopPlayersByPosition(season, { unlimited: true })
    if (position && position !== 'all') {
      players = byPosition[position.toUpperCase()] || []
    } else {
      players = Object.values(byPosition).flat().sort((a, b) => b.seasonPoints - a.seasonPoints)
    }
  } else {
    players = await getPlayersForSport(sport)
    if (position && position !== 'all') {
      players = players.filter((p) => (p.position || '').toUpperCase() === position.toUpperCase())
    }
  }

  // Attach current blurb status for each player. Scope by sport so an NBA
  // espn_player_id doesn't accidentally match a same-string NFL player_id.
  // Query blurbs across ALL alias ids per player — Sleeper stubs sometimes
  // leave two nfl_players rows for the same person, and a blurb written
  // against one id needs to surface when we display the (deduped) canonical
  // row. Fall back to [p.id] when aliasIds isn't populated (non-NFL sports
  // don't run the dedupe pass).
  const idToCanonical = new Map()
  const allBlurbLookupIds = []
  for (const p of players) {
    const ids = (p.aliasIds && p.aliasIds.length) ? p.aliasIds : [p.id]
    for (const aid of ids) {
      idToCanonical.set(aid, p.id)
      allBlurbLookupIds.push(aid)
    }
  }
  if (allBlurbLookupIds.length) {
    const { data: blurbs } = await supabase
      .from('player_blurbs')
      .select('player_id, status, id, content')
      .eq('sport', sport)
      .in('player_id', allBlurbLookupIds)
      .in('status', ['draft', 'published'])
    const blurbMap = {}
    for (const b of blurbs || []) {
      const canonical = idToCanonical.get(b.player_id) || b.player_id
      // Prefer the draft over the published one. The published blurb is
      // already live; the draft is what needs admin attention (publish
      // or edit). Surfacing only the published one made fresh drafts
      // written on top of an existing published blurb effectively
      // invisible — no Draft badge, no Publish button, no contribution
      // to the Publish All Drafts count.
      if (!blurbMap[canonical] || b.status === 'draft') blurbMap[canonical] = b
    }
    for (const p of players) {
      p.blurb = blurbMap[p.id] || null
    }
  }

  res.json(players)
})

// Generate AI blurbs for selected player IDs
router.post('/blurbs/generate', async (req, res) => {
  const { playerIds, season, week } = req.body
  if (!playerIds?.length) return res.status(400).json({ error: 'playerIds required' })
  const { generateBlurbs } = await import('../services/playerBlurbService.js')
  try {
    const result = await generateBlurbs(playerIds, season || new Date().getFullYear(), week || 1)
    res.json(result)
  } catch (err) {
    logger.error({ err }, 'Blurb generation failed')
    res.status(500).json({ error: err.message })
  }
})

// Create a manual blurb
router.post('/blurbs', async (req, res) => {
  const { player_id, content, season, week, sport } = req.body
  if (!player_id || !content) return res.status(400).json({ error: 'player_id and content required' })
  const { data, error } = await supabase
    .from('player_blurbs')
    .insert({
      player_id,
      content,
      status: 'draft',
      season: season || new Date().getFullYear(),
      week,
      generated_by: 'manual',
      sport: (sport || 'nfl').toLowerCase(),
    })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Update a blurb's content
router.patch('/blurbs/:id', async (req, res) => {
  const { content } = req.body
  if (!content) return res.status(400).json({ error: 'content required' })
  const { data, error } = await supabase
    .from('player_blurbs')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Publish a single blurb (archives previous published for same player)
router.post('/blurbs/:id/publish', async (req, res) => {
  const { publishBlurb } = await import('../services/playerBlurbService.js')
  try {
    const result = await publishBlurb(req.params.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// Publish all draft blurbs at once
router.post('/blurbs/publish-all', async (req, res) => {
  const { publishAllDrafts } = await import('../services/playerBlurbService.js')
  try {
    const result = await publishAllDrafts()
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get blurb history for a player (admin view)
router.get('/blurbs/player/:playerId/history', async (req, res) => {
  const { getPlayerBlurbHistory } = await import('../services/playerBlurbService.js')
  const history = await getPlayerBlurbHistory(req.params.playerId)
  res.json(history)
})

// Delete a blurb
router.delete('/blurbs/:id', async (req, res) => {
  const { error } = await supabase
    .from('player_blurbs')
    .delete()
    .eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ deleted: true })
})

// ============================================
// Season Dates
// ============================================

router.get('/season-dates', requireAuth, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('season_dates')
    .select('*')
    .order('season_year', { ascending: false })
    .order('sport_key')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

router.post('/season-dates', requireAuth, requireAdmin, async (req, res) => {
  const { sport_key, season_year, regular_season_starts_at, regular_season_ends_at, playoff_ends_at } = req.body
  if (!sport_key || !season_year || !regular_season_ends_at) {
    return res.status(400).json({ error: 'sport_key, season_year, and regular_season_ends_at are required' })
  }

  const { data, error } = await supabase
    .from('season_dates')
    .upsert({
      sport_key,
      season_year: Number(season_year),
      regular_season_starts_at: regular_season_starts_at || null,
      regular_season_ends_at,
      playoff_ends_at: playoff_ends_at || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'sport_key,season_year' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Clamp leagues in this sport whose end date falls past the season-end
  // signal. Two modes:
  // - playoff_ends_at SET: sweep every league (any duration) ending past
  //   playoff_ends_at. Custom-range contests tied to the season (3-point
  //   contest, HR Derby, all-star events, etc.) should end when the
  //   playoffs do — same impetus as full_season leagues.
  // - playoff_ends_at NOT set: conservative — only full_season leagues
  //   get clamped to regular_season_ends_at. Without a playoff signal we
  //   can't tell whether a custom-range league was meant to be
  //   regular-season-bound (mis-set) or playoff-extended (correct).
  //
  // Both modes additionally require `starts_at <= clampTarget` so a brand
  // new offseason league (created AFTER the season ended) doesn't get
  // swept up by stale season_dates rows.
  const clampTarget = playoff_ends_at || regular_season_ends_at
  const isPlayoffClamp = !!playoff_ends_at
  const EXCLUDED_FORMATS = ['squares', 'bracket', 'survivor']
  // Formats that only run through the regular season. Even when the admin
  // sets playoff_ends_at, these should stay clamped to regular_season_ends_at
  // — they prorate winner bonuses over regular-season length and don't score
  // playoff games in any coherent way. Kept in sync with the same set in
  // completeLeagues.js. Fantasy is handled separately (salary cap only).
  const REGULAR_SEASON_ONLY_FORMATS = new Set([
    'sacks', 'ints', 'tackles', 'receptions', 'td_pass',
    'nba_dfs', 'mlb_dfs', 'wnba_dfs',
    'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point',
  ])
  let leagueQuery = supabase
    .from('leagues')
    .select('id, format, ends_at')
    .eq('sport', sport_key)
    .neq('status', 'completed')
    .gt('ends_at', clampTarget)
    .lte('starts_at', clampTarget)
  if (!isPlayoffClamp) {
    leagueQuery = leagueQuery.eq('duration', 'full_season')
  }
  const { data: leagues, error: leagueErr } = await leagueQuery

  if (!leagueErr && leagues?.length) {
    let clamped = 0
    for (const league of leagues) {
      if (EXCLUDED_FORMATS.includes(league.format)) continue
      let leagueClampTarget = clampTarget
      // Traditional fantasy with playoffs — skip. Salary cap fantasy is a
      // regular-season contest — clamp to regular_season_ends_at.
      if (league.format === 'fantasy') {
        const { data: settings } = await supabase
          .from('fantasy_settings')
          .select('format, playoff_teams')
          .eq('league_id', league.id)
          .single()
        if (settings?.format !== 'salary_cap') continue
        leagueClampTarget = regular_season_ends_at
      } else if (REGULAR_SEASON_ONLY_FORMATS.has(league.format)) {
        leagueClampTarget = regular_season_ends_at
      }
      await supabase
        .from('leagues')
        .update({ ends_at: leagueClampTarget, updated_at: new Date().toISOString() })
        .eq('id', league.id)
      clamped++
    }
    logger.info({ sportKey: sport_key, seasonYear: season_year, clamped, total: leagues.length, clampTarget, mode: playoff_ends_at ? 'playoff' : 'regular' }, 'Clamped full_season league end dates')
  }

  // Coverage gap: leagues sitting between regular_season_ends_at and
  // playoff_ends_at slip through the main clamp filter (ends_at < clampTarget
  // when clampTarget = playoff_ends_at), but regular-season-only leagues in
  // that band should still be snapped to regular_season_ends_at.
  if (isPlayoffClamp) {
    const gapFormats = ['fantasy', ...REGULAR_SEASON_ONLY_FORMATS]
    const { data: gapLeagues } = await supabase
      .from('leagues')
      .select('id, format')
      .eq('sport', sport_key)
      .in('format', gapFormats)
      .neq('status', 'completed')
      .gt('ends_at', regular_season_ends_at)
      .lte('ends_at', playoff_ends_at)
      .lte('starts_at', regular_season_ends_at)
    if (gapLeagues?.length) {
      for (const league of gapLeagues) {
        if (league.format === 'fantasy') {
          const { data: settings } = await supabase
            .from('fantasy_settings')
            .select('format')
            .eq('league_id', league.id)
            .single()
          if (settings?.format !== 'salary_cap') continue
        }
        await supabase
          .from('leagues')
          .update({ ends_at: regular_season_ends_at, updated_at: new Date().toISOString() })
          .eq('id', league.id)
      }
      logger.info({ sportKey: sport_key, seasonYear: season_year, count: gapLeagues.length }, 'Clamped gap-band regular-season-only leagues to regular season end')
    }
  }

  // Background-trigger completeLeagues so freshly-clamped leagues finalize
  // right away (award points, send notifications, mark status=completed)
  // instead of waiting up to 15 min for the next cron tick. Fire-and-forget
  // — admin gets the response immediately; leagues complete in the
  // background within a few seconds.
  import('../jobs/completeLeagues.js').then(({ completeLeagues }) => {
    completeLeagues().catch((err) => logger.error({ err }, 'Background completeLeagues after season_dates update failed'))
  })

  res.json(data)
})

router.delete('/season-dates/:id', requireAuth, requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from('season_dates')
    .delete()
    .eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ deleted: true })
})

// ── App-wide settings (public read, admin write) ────────────────────
router.get('/app-settings/:key', async (req, res) => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value, updated_at')
    .eq('key', req.params.key)
    .maybeSingle()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || null)
})

router.put('/app-settings/:key', requireAuth, requireAdmin, async (req, res) => {
  const { value } = req.body
  if (value === undefined) return res.status(400).json({ error: 'value required' })
  const { data, error } = await supabase
    .from('app_settings')
    .upsert({ key: req.params.key, value, updated_at: new Date().toISOString(), updated_by: req.user.id }, { onConflict: 'key' })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ── User Surveys ─────────────────────────────────────────────────────
// Three lists: eligible (not started, designatable), in_progress
// (designated + started, not yet ended), completed (ended, responses
// viewable). Designation flips `survey_enabled` on the league.

router.get('/surveys/leagues', async (req, res) => {
  const nowIso = new Date().toISOString()
  const { data: leagues, error } = await supabase
    .from('leagues')
    .select('id, name, sport, format, starts_at, ends_at, survey_enabled, status, created_at')
    .order('starts_at', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })

  const eligible = []
  const inProgress = []
  const completed = []
  for (const l of leagues || []) {
    const started = l.starts_at && l.starts_at <= nowIso
    const ended = l.ends_at && l.ends_at <= nowIso
    if (!started && !l.survey_enabled && l.status !== 'archived' && l.status !== 'completed') {
      eligible.push(l)
    } else if (l.survey_enabled && started && !ended) {
      inProgress.push(l)
    } else if (l.survey_enabled && ended) {
      completed.push(l)
    } else if (l.survey_enabled && !started) {
      // Designated but not started yet — show in eligible so admin can
      // un-designate before lock-in.
      eligible.push(l)
    }
  }

  // For in_progress and completed, fetch response counts in one round
  // trip per bucket.
  const tally = async (ids) => {
    if (!ids.length) return {}
    const { data: rows } = await supabase
      .from('user_surveys')
      .select('league_id, survey_type, submitted_at, dismissed_at')
      .in('league_id', ids)
    const map = {}
    for (const id of ids) map[id] = { entry: 0, exit: 0, dismissed: 0 }
    for (const r of rows || []) {
      if (!map[r.league_id]) continue
      if (r.submitted_at) map[r.league_id][r.survey_type] = (map[r.league_id][r.survey_type] || 0) + 1
      else if (r.dismissed_at) map[r.league_id].dismissed += 1
    }
    return map
  }
  const inProgressCounts = await tally(inProgress.map((l) => l.id))
  const completedCounts = await tally(completed.map((l) => l.id))
  const memberCount = async (ids) => {
    if (!ids.length) return {}
    const { data: rows } = await supabase
      .from('league_members')
      .select('league_id')
      .in('league_id', ids)
    const counts = {}
    for (const r of rows || []) counts[r.league_id] = (counts[r.league_id] || 0) + 1
    return counts
  }
  const inProgressMembers = await memberCount(inProgress.map((l) => l.id))
  const completedMembers = await memberCount(completed.map((l) => l.id))

  res.json({
    eligible,
    in_progress: inProgress.map((l) => ({
      ...l,
      counts: inProgressCounts[l.id],
      member_count: inProgressMembers[l.id] || 0,
    })),
    completed: completed.map((l) => ({
      ...l,
      counts: completedCounts[l.id],
      member_count: completedMembers[l.id] || 0,
    })),
  })
})

router.post('/surveys/designate', async (req, res) => {
  const { league_id, enabled } = req.body
  if (!league_id || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'league_id and enabled required' })
  }
  const { data: league } = await supabase
    .from('leagues')
    .select('id, starts_at, status')
    .eq('id', league_id)
    .maybeSingle()
  if (!league) return res.status(404).json({ error: 'league not found' })

  // Lock once started — admin can't toggle mid-experiment via this route.
  // (We still allow disabling pre-start.)
  const nowIso = new Date().toISOString()
  if (league.starts_at && league.starts_at <= nowIso) {
    return res.status(400).json({ error: 'league already started; designation locked' })
  }

  const { error } = await supabase
    .from('leagues')
    .update({ survey_enabled: enabled })
    .eq('id', league_id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

router.get('/surveys/responses', async (req, res) => {
  const { league_id } = req.query
  if (!league_id) return res.status(400).json({ error: 'league_id required' })

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, sport, format, starts_at, ends_at')
    .eq('id', league_id)
    .maybeSingle()
  if (!league) return res.status(404).json({ error: 'league not found' })

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, joined_at, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', league_id)

  const { data: surveys } = await supabase
    .from('user_surveys')
    .select('user_id, survey_type, responses, submitted_at, dismissed_at')
    .eq('league_id', league_id)

  const byUser = {}
  for (const m of members || []) {
    byUser[m.user_id] = {
      user: m.users || { id: m.user_id },
      joined_at: m.joined_at,
      entry: null,
      exit: null,
      entry_dismissed_at: null,
      exit_dismissed_at: null,
    }
  }
  for (const s of surveys || []) {
    if (!byUser[s.user_id]) {
      byUser[s.user_id] = {
        user: { id: s.user_id },
        joined_at: null,
        entry: null,
        exit: null,
        entry_dismissed_at: null,
        exit_dismissed_at: null,
      }
    }
    const slot = byUser[s.user_id]
    if (s.submitted_at) slot[s.survey_type] = { responses: s.responses, submitted_at: s.submitted_at }
    if (s.dismissed_at) slot[`${s.survey_type}_dismissed_at`] = s.dismissed_at
  }

  // Aggregates — only for fully numeric (Q4) we can compute mean; others
  // are categorical so we count.
  const tally = (key, surveyType) => {
    const counts = {}
    let sum = 0
    let numericN = 0
    let n = 0
    for (const u of Object.values(byUser)) {
      const r = u[surveyType]?.responses?.[key]
      if (r === undefined || r === null || r === '') continue
      n += 1
      if (typeof r === 'number' || /^[0-9]+$/.test(String(r))) {
        sum += Number(r); numericN += 1
      }
      counts[r] = (counts[r] || 0) + 1
    }
    return { counts, mean: numericN ? sum / numericN : null, n }
  }

  const entryQs = ENTRY_QUESTIONS.map((q) => ({ id: q.id, prompt: q.prompt, ...tally(q.id, 'entry') }))
  const exitQs = EXIT_QUESTIONS.map((q) => ({ id: q.id, prompt: q.prompt, ...tally(q.id, 'exit') }))

  res.json({
    league: { ...league, sport_label: surveySportLabel(league.sport) },
    entry_questions: ENTRY_QUESTIONS,
    exit_questions: EXIT_QUESTIONS,
    aggregates: { entry: entryQs, exit: exitQs },
    responses: Object.values(byUser).sort((a, b) =>
      (a.user.display_name || a.user.username || '').localeCompare(b.user.display_name || b.user.username || '')
    ),
  })
})

// CSV download. Rows: one row per (user × surveyType). Columns: user
// identifiers + each question id.
router.get('/surveys/responses.csv', async (req, res) => {
  const { league_id } = req.query
  if (!league_id) return res.status(400).json({ error: 'league_id required' })

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name')
    .eq('id', league_id)
    .maybeSingle()
  if (!league) return res.status(404).json({ error: 'league not found' })

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, users(username, display_name)')
    .eq('league_id', league_id)

  const { data: surveys } = await supabase
    .from('user_surveys')
    .select('user_id, survey_type, responses, submitted_at, dismissed_at')
    .eq('league_id', league_id)

  const memberByUser = {}
  for (const m of members || []) memberByUser[m.user_id] = m.users

  const escape = (s) => {
    if (s === null || s === undefined) return ''
    const str = String(s)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`
    return str
  }

  const headerKeys = [
    'survey_type', 'user_id', 'username', 'display_name', 'submitted_at', 'dismissed_at',
    ...ENTRY_QUESTIONS.map((q) => `entry_${q.id}`),
    ...EXIT_QUESTIONS.map((q) => `exit_${q.id}`),
  ]
  const lines = [headerKeys.join(',')]

  for (const s of surveys || []) {
    const u = memberByUser[s.user_id] || {}
    const row = {
      survey_type: s.survey_type,
      user_id: s.user_id,
      username: u.username || '',
      display_name: u.display_name || '',
      submitted_at: s.submitted_at || '',
      dismissed_at: s.dismissed_at || '',
    }
    if (s.survey_type === 'entry') {
      for (const q of ENTRY_QUESTIONS) row[`entry_${q.id}`] = s.responses?.[q.id] ?? ''
    } else {
      for (const q of EXIT_QUESTIONS) row[`exit_${q.id}`] = s.responses?.[q.id] ?? ''
    }
    lines.push(headerKeys.map((k) => escape(row[k] ?? '')).join(','))
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="surveys-${league.name.replace(/[^a-z0-9-]/gi, '_')}.csv"`)
  res.send(lines.join('\n'))
})

// One-shot: send the OG welcome notification to every is_og user that
// hasn't already received one. Idempotent — calling twice won't double up.
router.post('/ogs/notify-welcome', async (req, res) => {
  const { createNotification } = await import('../services/notificationService.js')
  const { data: ogs } = await supabase
    .from('users')
    .select('id, username')
    .eq('is_og', true)
  if (!ogs?.length) return res.json({ sent: 0, skipped: 0 })

  const ids = ogs.map((o) => o.id)
  const { data: existing } = await supabase
    .from('notifications')
    .select('user_id')
    .eq('type', 'og_welcome')
    .in('user_id', ids)
  const already = new Set((existing || []).map((n) => n.user_id))

  const message = 'You are officially an IKB OG. You have been instrumental in bringing this app to life. Thank you so much.'
  let sent = 0
  let skipped = 0
  for (const og of ogs) {
    if (already.has(og.id)) { skipped++; continue }
    try {
      await createNotification(og.id, 'og_welcome', message, {})
      sent++
    } catch (err) {
      logger.error({ err, userId: og.id }, 'Failed to send OG welcome')
    }
  }
  res.json({ sent, skipped, total: ogs.length })
})

// ============================================
// Commissioner "Report a Problem" support tickets
// ============================================
router.get('/commissioner-reports', async (req, res) => {
  try {
    const reports = await listCommissionerReports({ status: req.query.status })
    res.json(reports)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/commissioner-reports/:id/reply', async (req, res) => {
  try {
    const reply = req.body?.reply
    if (!reply || typeof reply !== 'string' || !reply.trim()) {
      return res.status(400).json({ error: 'Reply is required' })
    }
    const result = await replyToCommissionerReport(req.params.id, req.user.id, reply)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

router.post('/commissioner-reports/:id/resolve', async (req, res) => {
  try {
    const result = await resolveCommissionerReport(req.params.id, req.user.id)
    res.json(result)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
