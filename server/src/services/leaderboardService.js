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
