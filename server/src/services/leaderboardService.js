import { supabase } from '../config/supabase.js'

export async function getLeaderboard(scope = 'global', sportKey) {
  if (scope === 'global') {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, total_points, tier')
      .order('total_points', { ascending: false })
      .limit(100)

    if (error) throw error
    return data.map((u, i) => ({ ...u, rank: i + 1 }))
  }

  if (scope === 'props') {
    const { data, error } = await supabase
      .from('prop_picks')
      .select('user_id, points_earned, is_correct, users!inner(id, username, display_name, avatar_url, tier)')
      .eq('status', 'settled')

    if (error) throw error

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
    const { data, error } = await supabase
      .from('parlays')
      .select('user_id, points_earned, is_correct, users!inner(id, username, display_name, avatar_url, tier)')
      .eq('status', 'settled')

    if (error) throw error

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
      .select('*, users(id, username, display_name, avatar_url, tier)')
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

const VALID_TIERS = ['Lost', 'Rookie', 'Baller', 'Elite', 'Hall of Famer', 'GOAT']

export async function getUsersByTier(tierName) {
  if (!VALID_TIERS.includes(tierName)) {
    throw Object.assign(new Error(`Invalid tier: ${tierName}`), { status: 400 })
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, total_points, tier')
    .eq('tier', tierName)
    .order('total_points', { ascending: false })

  if (error) throw error
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
