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
