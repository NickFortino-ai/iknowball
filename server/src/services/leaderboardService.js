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

export async function getRecordHolders(userId) {
  const records = []

  const [streakResult, parlayResult, underdogResult] = await Promise.all([
    // 1. Longest streak
    supabase.from('user_sport_stats')
      .select('user_id, best_streak, sports(name)')
      .order('best_streak', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // 2. Biggest parlay win
    supabase.from('parlays')
      .select('user_id, risk_points, reward_points')
      .eq('is_correct', true).eq('status', 'settled')
      .order('reward_points', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // 3. Biggest underdog win
    supabase.from('picks')
      .select('user_id, risk_points, reward_points, odds_at_pick')
      .eq('is_correct', true).eq('status', 'settled').gt('odds_at_pick', 0)
      .order('reward_points', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // Longest streak
  if (streakResult.data && streakResult.data.user_id === userId) {
    records.push({
      key: 'longest_streak',
      label: 'Longest Streak',
      detail: `${streakResult.data.best_streak} (${streakResult.data.sports?.name})`,
    })
  }

  // Biggest parlay win
  if (parlayResult.data && parlayResult.data.user_id === userId) {
    records.push({
      key: 'biggest_parlay',
      label: 'Biggest Parlay',
      detail: `${parlayResult.data.risk_points} → ${parlayResult.data.reward_points}`,
    })
  }

  // Biggest underdog win
  if (underdogResult.data && underdogResult.data.user_id === userId) {
    records.push({
      key: 'biggest_underdog',
      label: 'Biggest Underdog Win',
      detail: `${underdogResult.data.risk_points} → ${underdogResult.data.reward_points}`,
    })
  }

  return records
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
