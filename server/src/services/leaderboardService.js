import { supabase } from '../config/supabase.js'
import { fetchAll } from '../utils/fetchAll.js'

export async function getLeaderboard(scope = 'global', sportKey) {
  if (scope === 'global') {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, avatar_emoji, total_points, tier')
      .order('total_points', { ascending: false })
      .limit(100)

    if (error) throw error
    return data.map((u, i) => ({ ...u, rank: i + 1 }))
  }

  if (scope === 'props') {
    const data = await fetchAll(
      supabase
        .from('prop_picks')
        .select('user_id, points_earned, is_correct, users!inner(id, username, display_name, avatar_url, avatar_emoji, tier)')
        .eq('status', 'settled')
    )

    const statsMap = {}
    for (const pick of data || []) {
      if (!statsMap[pick.user_id]) {
        statsMap[pick.user_id] = {
          ...pick.users,
          prop_points: 0,
          total_picks: 0,
          correct_picks: 0,
        }
      }
      const s = statsMap[pick.user_id]
      s.prop_points += pick.points_earned || 0
      s.total_picks++
      if (pick.is_correct) s.correct_picks++
    }

    return Object.values(statsMap)
      .sort((a, b) => b.prop_points - a.prop_points)
      .slice(0, 100)
      .map((u, i) => ({ ...u, rank: i + 1 }))
  }

  if (scope === 'parlays') {
    const data = await fetchAll(
      supabase
        .from('parlays')
        .select('user_id, points_earned, is_correct, users!inner(id, username, display_name, avatar_url, avatar_emoji, tier)')
        .eq('status', 'settled')
    )

    const statsMap = {}
    for (const parlay of data || []) {
      if (!statsMap[parlay.user_id]) {
        statsMap[parlay.user_id] = {
          ...parlay.users,
          parlay_points: 0,
          total_parlays: 0,
          correct_parlays: 0,
        }
      }
      const s = statsMap[parlay.user_id]
      s.parlay_points += parlay.points_earned || 0
      s.total_parlays++
      if (parlay.is_correct) s.correct_parlays++
    }

    return Object.values(statsMap)
      .sort((a, b) => b.parlay_points - a.parlay_points)
      .slice(0, 100)
      .map((u, i) => ({ ...u, rank: i + 1 }))
  }

  if (scope === 'sport' && sportKey) {
    const { data: sport } = await supabase
      .from('sports')
      .select('id')
      .eq('key', sportKey)
      .single()

    if (!sport) return []

    const { data, error } = await supabase
      .from('user_sport_stats')
      .select('*, users(id, username, display_name, avatar_url, avatar_emoji, tier)')
      .eq('sport_id', sport.id)
      .order('total_points', { ascending: false })
      .limit(100)

    if (error) throw error

    return data.map((s, i) => ({
      ...s.users,
      sport_points: s.total_points,
      total_picks: s.total_picks,
      correct_picks: s.correct_picks,
      current_streak: s.current_streak,
      best_streak: s.best_streak,
      rank: i + 1,
    }))
  }

  return []
}

/**
 * Find a user's rank + row on a specific leaderboard, whether or not
 * they're in the top 100. Returns the same shape that getLeaderboard
 * returns per row (so the client can render the result with the same
 * row component). Returns null if the user hasn't appeared on that
 * leaderboard yet (e.g. hasn't made a pick for that sport).
 *
 * Performance: for global / sport we use a COUNT(*) WHERE points >
 * target to get rank in O(1). For props / parlays we reuse the same
 * full aggregation getLeaderboard uses and pluck the user's row —
 * fine at thousands of users; would need refactoring at millions.
 */
export async function getUserRankOnLeaderboard(userId, scope = 'global', sportKey) {
  if (scope === 'global') {
    const { data: user } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, avatar_emoji, total_points, tier')
      .eq('id', userId)
      .maybeSingle()
    if (!user) return null
    const { count: higher } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .gt('total_points', user.total_points ?? 0)
    return { ...user, rank: (higher || 0) + 1 }
  }

  if (scope === 'sport' && sportKey) {
    const { data: sport } = await supabase
      .from('sports')
      .select('id')
      .eq('key', sportKey)
      .maybeSingle()
    if (!sport) return null

    const { data: row } = await supabase
      .from('user_sport_stats')
      .select('*, users(id, username, display_name, avatar_url, avatar_emoji, tier)')
      .eq('user_id', userId)
      .eq('sport_id', sport.id)
      .maybeSingle()
    if (!row) return null

    const { count: higher } = await supabase
      .from('user_sport_stats')
      .select('id', { count: 'exact', head: true })
      .eq('sport_id', sport.id)
      .gt('total_points', row.total_points ?? 0)

    return {
      ...row.users,
      sport_points: row.total_points,
      total_picks: row.total_picks,
      correct_picks: row.correct_picks,
      current_streak: row.current_streak,
      best_streak: row.best_streak,
      rank: (higher || 0) + 1,
    }
  }

  if (scope === 'props' || scope === 'parlays') {
    const board = await getLeaderboard(scope)
    // getLeaderboard slices to top 100 — but the aggregation inside
    // processes all users, so if the target isn't in the slice we
    // need to re-aggregate without the slice. Cheapest approach:
    // compute it fresh here.
    const table = scope === 'props' ? 'prop_picks' : 'parlays'
    const pointsField = scope === 'props' ? 'prop_points' : 'parlay_points'
    const countField = scope === 'props' ? 'total_picks' : 'total_parlays'
    const correctField = scope === 'props' ? 'correct_picks' : 'correct_parlays'

    // Fast path: user is in top 100 → use that row directly
    const inBoard = board.find((u) => u.id === userId)
    if (inBoard) return inBoard

    // Slow path: re-aggregate from the raw picks / parlays
    const data = await fetchAll(
      supabase
        .from(table)
        .select('user_id, points_earned, is_correct, users!inner(id, username, display_name, avatar_url, avatar_emoji, tier)')
        .eq('status', 'settled')
    )
    const statsMap = {}
    for (const p of data || []) {
      if (!statsMap[p.user_id]) {
        statsMap[p.user_id] = {
          ...p.users,
          [pointsField]: 0,
          [countField]: 0,
          [correctField]: 0,
        }
      }
      const s = statsMap[p.user_id]
      s[pointsField] += p.points_earned || 0
      s[countField]++
      if (p.is_correct) s[correctField]++
    }
    const sorted = Object.values(statsMap).sort((a, b) => b[pointsField] - a[pointsField])
    const idx = sorted.findIndex((s) => s.id === userId)
    if (idx === -1) return null
    return { ...sorted[idx], rank: idx + 1 }
  }

  return null
}

const VALID_TIERS = ['Lost', 'Rookie', 'Baller', 'Elite', 'Hall of Famer', 'GOAT']

export async function getUsersByTier(tierName) {
  if (!VALID_TIERS.includes(tierName)) {
    throw Object.assign(new Error(`Invalid tier: ${tierName}`), { status: 400 })
  }

  const data = await fetchAll(
    supabase
      .from('users')
      .select('id, username, display_name, avatar_url, avatar_emoji, total_points, tier')
      .eq('tier', tierName)
      .order('total_points', { ascending: false })
  )
  return data
}

export async function getRecordHolders(userId) {
  const { data, error } = await supabase
    .from('records')
    .select('record_key, display_name, record_value')
    .eq('record_holder_id', userId)
    .is('parent_record_key', null)

  if (error || !data?.length) return []

  return data.map((r) => ({
    key: r.record_key,
    label: r.display_name,
    value: r.record_value,
  }))
}

export async function getAllCrownHolders() {
  const holders = {}

  const globalBoard = await getLeaderboard('global')
  if (globalBoard.length > 0) {
    const u = globalBoard[0]
    holders['I KNOW BALL'] = { id: u.id, display_name: u.display_name, username: u.username }
  }

  const propsBoard = await getLeaderboard('props')
  if (propsBoard.length > 0) {
    const u = propsBoard[0]
    holders['Props'] = { id: u.id, display_name: u.display_name, username: u.username }
  }

  const parlaysBoard = await getLeaderboard('parlays')
  if (parlaysBoard.length > 0) {
    const u = parlaysBoard[0]
    holders['Parlays'] = { id: u.id, display_name: u.display_name, username: u.username }
  }

  const { data: sports } = await supabase.from('sports').select('key, name')
  for (const sport of sports || []) {
    const sportBoard = await getLeaderboard('sport', sport.key)
    if (sportBoard.length > 0) {
      const u = sportBoard[0]
      holders[sport.name] = { id: u.id, display_name: u.display_name, username: u.username }
    }
  }

  return holders
}

export async function getCrowns(userId) {
  const crowns = []

  // Check global leaderboard
  const globalBoard = await getLeaderboard('global')
  if (globalBoard.length > 0 && globalBoard[0].id === userId) {
    crowns.push('I KNOW BALL')
  }

  // Check props leaderboard
  const propsBoard = await getLeaderboard('props')
  if (propsBoard.length > 0 && propsBoard[0].id === userId) {
    crowns.push('Props')
  }

  // Check parlays leaderboard
  const parlaysBoard = await getLeaderboard('parlays')
  if (parlaysBoard.length > 0 && parlaysBoard[0].id === userId) {
    crowns.push('Parlays')
  }

  // Check each sport leaderboard
  const { data: sports } = await supabase.from('sports').select('key, name')
  for (const sport of sports || []) {
    const sportBoard = await getLeaderboard('sport', sport.key)
    if (sportBoard.length > 0 && sportBoard[0].id === userId) {
      crowns.push(sport.name)
    }
  }

  return crowns
}
