import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from './notificationService.js'
import { sendEmailToUserIds } from './emailService.js'

// Tier thresholds (mirrored from client scoring.js)
const TIER_THRESHOLDS = [
  { name: 'GOAT', minPoints: 3000 },
  { name: 'Hall of Famer', minPoints: 1000 },
  { name: 'Elite', minPoints: 500 },
  { name: 'Baller', minPoints: 100 },
]

// ── Update a record if the new value beats the current one ──────────────────
async function updateRecord(key, holderId, value, metadata = {}) {
  const { data: existing } = await supabase
    .from('records')
    .select('record_holder_id, record_value')
    .eq('record_key', key)
    .single()

  if (!existing) return false

  // Existing holder retains on tie (strict >)
  if (existing.record_value !== null && value <= existing.record_value) return false

  const previousHolderId = existing.record_holder_id
  const previousValue = existing.record_value

  // Update the record
  const { error: updateError } = await supabase
    .from('records')
    .update({
      record_holder_id: holderId,
      record_value: value,
      record_metadata: metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('record_key', key)

  if (updateError) {
    logger.error({ updateError, key }, 'Failed to update record')
    return false
  }

  // Insert history
  await supabase.from('record_history').insert({
    record_key: key,
    previous_holder_id: previousHolderId,
    new_holder_id: holderId,
    previous_value: previousValue,
    new_value: value,
    metadata,
  })

  // Get the record display name for notifications
  const { data: record } = await supabase
    .from('records')
    .select('display_name')
    .eq('record_key', key)
    .single()

  const recordName = record?.display_name || key

  // Notify the new holder
  await createNotification(
    holderId,
    'record_broken',
    `You now hold the record for ${recordName}!`,
    { recordKey: key, value }
  )

  // Send email
  try {
    await sendEmailToUserIds([holderId], () => ({
      subject: 'You Just Broke a Record on I KNOW BALL',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h1 style="font-size: 24px; margin-bottom: 8px;">New Record Holder!</h1>
          <p style="color: #aaa; font-size: 16px; margin-bottom: 24px;">
            You just set a new record for <strong>${recordName}</strong> with a value of <strong>${value}</strong>!
          </p>
          <p style="color: #888; font-size: 14px;">
            ${previousValue !== null ? `Previous record: ${previousValue}` : 'This is the first record set!'}
          </p>
          <a href="${process.env.CLIENT_URL || 'https://iknowball.club'}/hall-of-fame?section=records"
             style="display: inline-block; margin-top: 24px; padding: 12px 24px; background-color: #4f8cff; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
            View Record Book
          </a>
        </div>
      `,
    }))
  } catch (err) {
    logger.error({ err, key, holderId }, 'Failed to send record broken email')
  }

  logger.info({ key, holderId, value, previousHolderId, previousValue }, 'Record broken')
  return true
}

// ── Record Calculators ──────────────────────────────────────────────────────

// Walk settled straight picks per user ordered by settlement time, counting consecutive wins
async function calcLongestWinStreak(sportKey) {
  // If filtering by sport, resolve sport_id first
  let sportId = null
  if (sportKey) {
    const { data: sport } = await supabase.from('sports').select('id').eq('key', sportKey).single()
    if (!sport) return null
    sportId = sport.id
  }

  const { data: allPicks, error } = await supabase
    .from('picks')
    .select('id, user_id, is_correct, updated_at, games!inner(sport_id)')
    .eq('status', 'settled')
    .not('is_correct', 'is', null)

  if (error || !allPicks?.length) return null

  // Filter by sport in JS (Supabase nested join filters are unreliable)
  const picks = sportId
    ? allPicks.filter((p) => p.games.sport_id === sportId)
    : allPicks

  if (!picks.length) return null

  // Sort by settlement time (matches pick history UI and real-time streak counter)
  picks.sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))

  // Group by user
  const userPicks = {}
  for (const pick of picks) {
    if (!userPicks[pick.user_id]) userPicks[pick.user_id] = []
    userPicks[pick.user_id].push(pick)
  }

  let bestUserId = null
  let bestStreak = 0
  let bestPickIds = []

  for (const [userId, userPickList] of Object.entries(userPicks)) {
    let streak = 0
    let streakIds = []

    for (const pick of userPickList) {
      if (pick.is_correct === true) {
        streak++
        streakIds.push(pick.id)
      } else if (pick.is_correct === false) {
        // Pushes (is_correct === null) already filtered out
        if (streak > bestStreak) {
          bestStreak = streak
          bestUserId = userId
          bestPickIds = [...streakIds]
        }
        streak = 0
        streakIds = []
      }
    }

    // Check final streak
    if (streak > bestStreak) {
      bestStreak = streak
      bestUserId = userId
      bestPickIds = [...streakIds]
    }
  }

  if (!bestUserId || bestStreak === 0) return null
  return { holderId: bestUserId, value: bestStreak, metadata: { pickIds: bestPickIds.slice(-20) } }
}

async function calcLongestParlayStreak() {
  const { data: parlays, error } = await supabase
    .from('parlays')
    .select('id, user_id, is_correct')
    .eq('status', 'settled')
    .not('is_correct', 'is', null)
    .order('updated_at', { ascending: true })

  if (error || !parlays?.length) return null

  const userParlays = {}
  for (const p of parlays) {
    if (!userParlays[p.user_id]) userParlays[p.user_id] = []
    userParlays[p.user_id].push(p)
  }

  let bestUserId = null
  let bestStreak = 0
  let bestIds = []

  for (const [userId, list] of Object.entries(userParlays)) {
    let streak = 0
    let ids = []

    for (const p of list) {
      if (p.is_correct === true) {
        streak++
        ids.push(p.id)
      } else {
        if (streak > bestStreak) {
          bestStreak = streak
          bestUserId = userId
          bestIds = [...ids]
        }
        streak = 0
        ids = []
      }
    }

    if (streak > bestStreak) {
      bestStreak = streak
      bestUserId = userId
      bestIds = [...ids]
    }
  }

  if (!bestUserId || bestStreak === 0) return null
  return { holderId: bestUserId, value: bestStreak, metadata: { parlayIds: bestIds.slice(-20) } }
}

async function calcLongestPropStreak() {
  const { data: picks, error } = await supabase
    .from('prop_picks')
    .select('id, user_id, is_correct, updated_at')
    .eq('status', 'settled')
    .not('is_correct', 'is', null)

  if (error || !picks?.length) return null

  // Sort by updated_at in JS
  picks.sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))

  const userPicks = {}
  for (const p of picks) {
    if (!userPicks[p.user_id]) userPicks[p.user_id] = []
    userPicks[p.user_id].push(p)
  }

  let bestUserId = null
  let bestStreak = 0
  let bestIds = []

  for (const [userId, list] of Object.entries(userPicks)) {
    let streak = 0
    let ids = []

    for (const p of list) {
      if (p.is_correct === true) {
        streak++
        ids.push(p.id)
      } else {
        if (streak > bestStreak) {
          bestStreak = streak
          bestUserId = userId
          bestIds = [...ids]
        }
        streak = 0
        ids = []
      }
    }

    if (streak > bestStreak) {
      bestStreak = streak
      bestUserId = userId
      bestIds = [...ids]
    }
  }

  if (!bestUserId || bestStreak === 0) return null
  return { holderId: bestUserId, value: bestStreak, metadata: { propPickIds: bestIds.slice(-20) } }
}

async function calcHighestPropPct() {
  const { data: picks, error } = await supabase
    .from('prop_picks')
    .select('user_id, is_correct')
    .eq('status', 'settled')
    .not('is_correct', 'is', null)

  if (error || !picks?.length) return null

  const stats = {}
  for (const p of picks) {
    if (!stats[p.user_id]) stats[p.user_id] = { total: 0, correct: 0 }
    stats[p.user_id].total++
    if (p.is_correct) stats[p.user_id].correct++
  }

  let bestUserId = null
  let bestPct = 0

  for (const [userId, s] of Object.entries(stats)) {
    if (s.total < 20) continue
    const pct = s.correct / s.total
    if (pct > bestPct) {
      bestPct = pct
      bestUserId = userId
    }
  }

  if (!bestUserId) return null
  const s = stats[bestUserId]
  return {
    holderId: bestUserId,
    value: Math.round(bestPct * 10000) / 100, // Store as percentage with 2 decimals
    metadata: { correct: s.correct, total: s.total },
  }
}

async function calcBiggestUnderdogHit() {
  const { data: pick, error } = await supabase
    .from('picks')
    .select('id, user_id, odds_at_pick, reward_points, risk_points')
    .eq('status', 'settled')
    .eq('is_correct', true)
    .gt('odds_at_pick', 0)
    .order('odds_at_pick', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !pick) return null
  return { holderId: pick.user_id, value: pick.odds_at_pick, metadata: { pickId: pick.id } }
}

async function calcBiggestParlay() {
  const { data: parlay, error } = await supabase
    .from('parlays')
    .select('id, user_id, combined_multiplier, risk_points, reward_points')
    .eq('status', 'settled')
    .eq('is_correct', true)
    .not('combined_multiplier', 'is', null)
    .order('combined_multiplier', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !parlay) return null
  return {
    holderId: parlay.user_id,
    value: Math.round(parlay.combined_multiplier * 100) / 100,
    metadata: { parlayId: parlay.id },
  }
}

async function calcFewestPicksToTier(tierMinPoints) {
  // Get all settled items across types, ordered chronologically
  const [picksRes, parlaysRes, propsRes, futuresRes] = await Promise.all([
    supabase.from('picks').select('user_id, points_earned, updated_at').eq('status', 'settled').not('points_earned', 'is', null),
    supabase.from('parlays').select('user_id, points_earned, updated_at').eq('status', 'settled').not('points_earned', 'is', null),
    supabase.from('prop_picks').select('user_id, points_earned, updated_at').eq('status', 'settled').not('points_earned', 'is', null),
    supabase.from('futures_picks').select('user_id, points_earned, updated_at').eq('status', 'settled').not('points_earned', 'is', null),
  ])

  const allItems = [
    ...(picksRes.data || []),
    ...(parlaysRes.data || []),
    ...(propsRes.data || []),
    ...(futuresRes.data || []),
  ].sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))

  if (!allItems.length) return null

  // Replay each user's items chronologically
  const userState = {} // { cumPoints, count, reached }
  let bestUserId = null
  let bestCount = Infinity

  for (const item of allItems) {
    if (!userState[item.user_id]) {
      userState[item.user_id] = { cumPoints: 0, count: 0, reached: false }
    }
    const state = userState[item.user_id]
    if (state.reached) continue

    state.cumPoints += item.points_earned
    state.count++

    if (state.cumPoints >= tierMinPoints) {
      state.reached = true
      if (state.count < bestCount) {
        bestCount = state.count
        bestUserId = item.user_id
      }
    }
  }

  if (!bestUserId) return null
  return { holderId: bestUserId, value: bestCount, metadata: {} }
}

async function calcBiggestDogLover() {
  const { data: picks, error } = await supabase
    .from('picks')
    .select('user_id, odds_at_pick')
    .eq('status', 'settled')
    .not('odds_at_pick', 'is', null)

  if (error || !picks?.length) return null

  const stats = {}
  for (const p of picks) {
    if (!stats[p.user_id]) stats[p.user_id] = { total: 0, dogPicks: 0 }
    stats[p.user_id].total++
    if (p.odds_at_pick > 0) stats[p.user_id].dogPicks++
  }

  let bestUserId = null
  let bestPct = 0

  for (const [userId, s] of Object.entries(stats)) {
    if (s.total < 50) continue
    const pct = s.dogPicks / s.total
    if (pct > bestPct) {
      bestPct = pct
      bestUserId = userId
    }
  }

  if (!bestUserId) return null
  const s = stats[bestUserId]
  return {
    holderId: bestUserId,
    value: Math.round(bestPct * 10000) / 100,
    metadata: { dogPicks: s.dogPicks, total: s.total },
  }
}

async function calcGreatClimb() {
  // Get all snapshots
  const { data: snapshots, error } = await supabase
    .from('leaderboard_rank_snapshots')
    .select('user_id, rank')
    .eq('scope', 'global')

  if (error || !snapshots?.length) return null

  const userRanks = {}
  for (const s of snapshots) {
    if (!userRanks[s.user_id]) userRanks[s.user_id] = { max: 0, min: Infinity }
    if (s.rank > userRanks[s.user_id].max) userRanks[s.user_id].max = s.rank
    if (s.rank < userRanks[s.user_id].min) userRanks[s.user_id].min = s.rank
  }

  let bestUserId = null
  let bestClimb = 0

  for (const [userId, ranks] of Object.entries(userRanks)) {
    // Climb = worst rank - best rank (higher is better climb)
    const climb = ranks.max - ranks.min
    if (climb > bestClimb) {
      bestClimb = climb
      bestUserId = userId
    }
  }

  if (!bestUserId || bestClimb === 0) return null
  return {
    holderId: bestUserId,
    value: bestClimb,
    metadata: { worstRank: userRanks[bestUserId].max, bestRank: userRanks[bestUserId].min },
  }
}

async function calcLongestCrownTenure() {
  const { data: snapshots, error } = await supabase
    .from('crown_snapshots')
    .select('scope, user_id, snapshot_date')
    .order('scope', { ascending: true })
    .order('snapshot_date', { ascending: true })

  if (error || !snapshots?.length) return null

  let bestUserId = null
  let bestStreak = 0
  let bestScope = null

  let currentScope = null
  let currentUserId = null
  let currentStreak = 0
  let lastDate = null

  for (const snap of snapshots) {
    if (snap.scope !== currentScope) {
      // Check if previous run was the best
      if (currentStreak > bestStreak) {
        bestStreak = currentStreak
        bestUserId = currentUserId
        bestScope = currentScope
      }
      // Reset for new scope
      currentScope = snap.scope
      currentUserId = snap.user_id
      currentStreak = 1
      lastDate = snap.snapshot_date
      continue
    }

    // Same scope — check if same user and consecutive day
    const prevDate = new Date(lastDate)
    const currDate = new Date(snap.snapshot_date)
    const diffDays = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24))

    if (snap.user_id === currentUserId && diffDays === 1) {
      currentStreak++
    } else {
      if (currentStreak > bestStreak) {
        bestStreak = currentStreak
        bestUserId = currentUserId
        bestScope = currentScope
      }
      currentUserId = snap.user_id
      currentStreak = 1
    }
    lastDate = snap.snapshot_date
  }

  // Check final run
  if (currentStreak > bestStreak) {
    bestStreak = currentStreak
    bestUserId = currentUserId
    bestScope = currentScope
  }

  if (!bestUserId || bestStreak === 0) return null
  return { holderId: bestUserId, value: bestStreak, metadata: { scope: bestScope } }
}

async function calcBestFuturesHit(sportKey) {
  let query = supabase
    .from('futures_picks')
    .select('id, user_id, odds_at_submission, futures_markets!inner(sport_key)')
    .eq('status', 'settled')
    .eq('is_correct', true)
    .gt('odds_at_submission', 0)
    .order('odds_at_submission', { ascending: false })
    .limit(1)

  if (sportKey) {
    query = query.eq('futures_markets.sport_key', sportKey)
  }

  const { data: pick, error } = await query.maybeSingle()
  if (error || !pick) return null
  return { holderId: pick.user_id, value: pick.odds_at_submission, metadata: { futuresPickId: pick.id } }
}

async function calcHighestOverallWinPct() {
  // Gather all settled items
  const [picksRes, parlaysRes, propsRes, futuresRes] = await Promise.all([
    supabase.from('picks').select('user_id, is_correct').eq('status', 'settled').not('is_correct', 'is', null),
    supabase.from('parlays').select('user_id, is_correct').eq('status', 'settled').not('is_correct', 'is', null),
    supabase.from('prop_picks').select('user_id, is_correct').eq('status', 'settled').not('is_correct', 'is', null),
    supabase.from('futures_picks').select('user_id, is_correct').eq('status', 'settled'),
  ])

  const stats = {}
  for (const item of [...(picksRes.data || []), ...(parlaysRes.data || []), ...(propsRes.data || []), ...(futuresRes.data || [])]) {
    if (!stats[item.user_id]) stats[item.user_id] = { total: 0, correct: 0 }
    stats[item.user_id].total++
    if (item.is_correct) stats[item.user_id].correct++
  }

  let bestUserId = null
  let bestPct = 0

  for (const [userId, s] of Object.entries(stats)) {
    if (s.total < 100) continue
    const pct = s.correct / s.total
    if (pct > bestPct) {
      bestPct = pct
      bestUserId = userId
    }
  }

  if (!bestUserId) return null
  const s = stats[bestUserId]
  return {
    holderId: bestUserId,
    value: Math.round(bestPct * 10000) / 100,
    metadata: { correct: s.correct, total: s.total },
  }
}

// ── Full Recalculation ──────────────────────────────────────────────────────

export async function recalculateAllRecords() {
  logger.info('Starting full record recalculation')

  // Get all sports for per-sport records
  const { data: sports } = await supabase.from('sports').select('key')
  const sportKeys = (sports || []).map((s) => s.key)

  const calculators = [
    { key: 'longest_win_streak', fn: () => calcLongestWinStreak(null) },
    { key: 'longest_parlay_streak', fn: calcLongestParlayStreak },
    { key: 'longest_prop_streak', fn: calcLongestPropStreak },
    { key: 'highest_prop_pct', fn: calcHighestPropPct },
    { key: 'biggest_underdog_hit', fn: calcBiggestUnderdogHit },
    { key: 'biggest_parlay', fn: calcBiggestParlay },
    { key: 'fewest_picks_to_baller', fn: () => calcFewestPicksToTier(100) },
    { key: 'fewest_picks_to_elite', fn: () => calcFewestPicksToTier(500) },
    { key: 'fewest_picks_to_hof', fn: () => calcFewestPicksToTier(1000) },
    { key: 'fewest_picks_to_goat', fn: () => calcFewestPicksToTier(3000) },
    { key: 'biggest_dog_lover', fn: calcBiggestDogLover },
    { key: 'great_climb', fn: calcGreatClimb },
    { key: 'longest_crown_tenure', fn: calcLongestCrownTenure },
    { key: 'best_futures_hit', fn: () => calcBestFuturesHit(null) },
    { key: 'highest_overall_win_pct', fn: calcHighestOverallWinPct },
  ]

  // Add per-sport calculators
  for (const sportKey of sportKeys) {
    calculators.push({
      key: `longest_win_streak_${sportKey}`,
      fn: () => calcLongestWinStreak(sportKey),
    })
    calculators.push({
      key: `best_futures_hit_${sportKey}`,
      fn: () => calcBestFuturesHit(sportKey),
    })
  }

  let updated = 0
  for (const { key, fn } of calculators) {
    try {
      const result = await fn()
      if (result) {
        // Force-set the correct value during full recalc
        await supabase
          .from('records')
          .update({
            record_holder_id: result.holderId,
            record_value: result.value,
            record_metadata: result.metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('record_key', key)
        updated++
      } else {
        // Clear records that no longer have a valid result
        await supabase
          .from('records')
          .update({
            record_holder_id: null,
            record_value: null,
            record_metadata: {},
            updated_at: new Date().toISOString(),
          })
          .eq('record_key', key)
      }
    } catch (err) {
      logger.error({ err, key }, 'Record calculator failed')
    }
  }

  logger.info({ updated, total: calculators.length }, 'Record recalculation complete')
  return { updated, total: calculators.length }
}

// ── Real-time Check After Settle ────────────────────────────────────────────

export async function checkRecordAfterSettle(userId, type, data = {}) {
  try {
    const checks = []

    if (type === 'pick') {
      const sportKey = data.sportKey
      checks.push({ key: 'longest_win_streak', fn: () => calcLongestWinStreak(null) })
      if (sportKey) {
        checks.push({ key: `longest_win_streak_${sportKey}`, fn: () => calcLongestWinStreak(sportKey) })
      }
      if (data.isCorrect && data.odds > 0) {
        checks.push({ key: 'biggest_underdog_hit', fn: calcBiggestUnderdogHit })
      }
      checks.push({ key: 'biggest_dog_lover', fn: calcBiggestDogLover })
      checks.push({ key: 'highest_overall_win_pct', fn: calcHighestOverallWinPct })
      checks.push({ key: 'fewest_picks_to_baller', fn: () => calcFewestPicksToTier(100) })
      checks.push({ key: 'fewest_picks_to_elite', fn: () => calcFewestPicksToTier(500) })
      checks.push({ key: 'fewest_picks_to_hof', fn: () => calcFewestPicksToTier(1000) })
      checks.push({ key: 'fewest_picks_to_goat', fn: () => calcFewestPicksToTier(3000) })
    }

    if (type === 'parlay') {
      if (data.isCorrect) {
        checks.push({ key: 'longest_parlay_streak', fn: calcLongestParlayStreak })
        checks.push({ key: 'biggest_parlay', fn: calcBiggestParlay })
      }
      checks.push({ key: 'highest_overall_win_pct', fn: calcHighestOverallWinPct })
      checks.push({ key: 'fewest_picks_to_baller', fn: () => calcFewestPicksToTier(100) })
      checks.push({ key: 'fewest_picks_to_elite', fn: () => calcFewestPicksToTier(500) })
      checks.push({ key: 'fewest_picks_to_hof', fn: () => calcFewestPicksToTier(1000) })
      checks.push({ key: 'fewest_picks_to_goat', fn: () => calcFewestPicksToTier(3000) })
    }

    if (type === 'prop') {
      if (data.isCorrect) {
        checks.push({ key: 'longest_prop_streak', fn: calcLongestPropStreak })
      }
      checks.push({ key: 'highest_prop_pct', fn: calcHighestPropPct })
      checks.push({ key: 'highest_overall_win_pct', fn: calcHighestOverallWinPct })
      checks.push({ key: 'fewest_picks_to_baller', fn: () => calcFewestPicksToTier(100) })
      checks.push({ key: 'fewest_picks_to_elite', fn: () => calcFewestPicksToTier(500) })
      checks.push({ key: 'fewest_picks_to_hof', fn: () => calcFewestPicksToTier(1000) })
      checks.push({ key: 'fewest_picks_to_goat', fn: () => calcFewestPicksToTier(3000) })
    }

    if (type === 'futures') {
      if (data.isCorrect && data.odds > 0) {
        checks.push({ key: 'best_futures_hit', fn: () => calcBestFuturesHit(null) })
        if (data.sportKey) {
          checks.push({ key: `best_futures_hit_${data.sportKey}`, fn: () => calcBestFuturesHit(data.sportKey) })
        }
      }
      checks.push({ key: 'highest_overall_win_pct', fn: calcHighestOverallWinPct })
      checks.push({ key: 'fewest_picks_to_baller', fn: () => calcFewestPicksToTier(100) })
      checks.push({ key: 'fewest_picks_to_elite', fn: () => calcFewestPicksToTier(500) })
      checks.push({ key: 'fewest_picks_to_hof', fn: () => calcFewestPicksToTier(1000) })
      checks.push({ key: 'fewest_picks_to_goat', fn: () => calcFewestPicksToTier(3000) })
    }

    for (const { key, fn } of checks) {
      try {
        const result = await fn()
        if (result) {
          await updateRecord(key, result.holderId, result.value, result.metadata)
        }
      } catch (err) {
        logger.error({ err, key }, 'Real-time record check failed')
      }
    }
  } catch (err) {
    // Never block scoring
    logger.error({ err, userId, type }, 'checkRecordAfterSettle failed')
  }
}

// ── Query functions for API ─────────────────────────────────────────────────

export async function getAllRecords() {
  const { data, error } = await supabase
    .from('records')
    .select('*, users:record_holder_id(id, username, display_name, avatar_url, avatar_emoji, tier, total_points)')
    .order('category')
    .order('record_key')

  if (error) throw error

  // Organize: top-level records with sub-records nested
  const topLevel = []
  const subRecordMap = {}

  for (const record of data || []) {
    if (record.parent_record_key) {
      if (!subRecordMap[record.parent_record_key]) subRecordMap[record.parent_record_key] = []
      subRecordMap[record.parent_record_key].push(record)
    } else {
      topLevel.push(record)
    }
  }

  return topLevel.map((r) => ({
    ...r,
    sub_records: subRecordMap[r.record_key] || [],
  }))
}

export async function getRecordHistory(limit = 50) {
  const { data, error } = await supabase
    .from('record_history')
    .select('*, records(display_name), previous_user:previous_holder_id(username, display_name), new_user:new_holder_id(username, display_name)')
    .order('broken_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

export async function getRoyaltyData() {
  // Get global #1
  const { data: globalTop } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji, tier, total_points, created_at, x_handle, instagram_handle, title_preference')
    .order('total_points', { ascending: false })
    .limit(1)
    .maybeSingle()


  // Get sport leaders
  const { data: sports } = await supabase.from('sports').select('id, key, name')
  const sportCrowns = []
  for (const sport of sports || []) {
    const { data: stats } = await supabase
      .from('user_sport_stats')
      .select('user_id, total_points, users(id, username, display_name, avatar_url, avatar_emoji, tier)')
      .eq('sport_id', sport.id)
      .gt('total_points', 0)
      .order('total_points', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (stats?.users) {
      sportCrowns.push({ scope: sport.name, sportKey: sport.key, holder: stats.users, points: stats.total_points })
    }
  }

  // Props leader
  const { data: propPicks } = await supabase
    .from('prop_picks')
    .select('user_id, points_earned')
    .eq('status', 'settled')
    .not('points_earned', 'is', null)

  const propStats = {}
  for (const p of propPicks || []) {
    propStats[p.user_id] = (propStats[p.user_id] || 0) + p.points_earned
  }
  const propLeaderId = Object.entries(propStats).sort((a, b) => b[1] - a[1])[0]

  let propCrown = null
  if (propLeaderId) {
    const { data: propUser } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, avatar_emoji, tier')
      .eq('id', propLeaderId[0])
      .single()
    if (propUser) {
      propCrown = { scope: 'Props', holder: propUser, points: propLeaderId[1] }
    }
  }

  // Parlays leader
  const { data: parlayPicks } = await supabase
    .from('parlays')
    .select('user_id, points_earned')
    .eq('status', 'settled')
    .not('points_earned', 'is', null)

  const parlayStats = {}
  for (const p of parlayPicks || []) {
    parlayStats[p.user_id] = (parlayStats[p.user_id] || 0) + p.points_earned
  }
  const parlayLeaderId = Object.entries(parlayStats).sort((a, b) => b[1] - a[1])[0]

  let parlayCrown = null
  if (parlayLeaderId) {
    const { data: parlayUser } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, avatar_emoji, tier')
      .eq('id', parlayLeaderId[0])
      .single()
    if (parlayUser) {
      parlayCrown = { scope: 'Parlays', holder: parlayUser, points: parlayLeaderId[1] }
    }
  }

  return {
    globalCrown: globalTop ? { scope: 'I KNOW BALL', holder: globalTop, points: globalTop.total_points } : null,
    sportCrowns,
    propCrown,
    parlayCrown,
  }
}
