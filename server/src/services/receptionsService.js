import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

/**
 * Score every receptions_picks row. Reads `rec` from nfl_player_stats for
 * each (player, season, week) and writes the live count back to the pick.
 * Idempotent — only updates when the value has changed. Called from the
 * NFL stats sync loop alongside the other single-stat scorers.
 */
export async function scoreAllReceptionsPicks() {
  const { data: picks } = await supabase
    .from('receptions_picks')
    .select('id, sleeper_player_id, season, week, receptions')
  if (!picks?.length) return { scored: 0 }

  const playerIds = [...new Set(picks.map((p) => p.sleeper_player_id))]
  const seasons = [...new Set(picks.map((p) => p.season))]

  const { data: statRows } = await supabase
    .from('nfl_player_stats')
    .select('player_id, season, week, rec')
    .in('player_id', playerIds)
    .in('season', seasons)
  const statMap = {}
  for (const s of statRows || []) {
    statMap[`${s.player_id}|${s.season}|${s.week}`] = Number(s.rec) || 0
  }

  let scored = 0
  for (const p of picks) {
    const live = statMap[`${p.sleeper_player_id}|${p.season}|${p.week}`] || 0
    const current = Number(p.receptions) || 0
    if (live !== current) {
      const { error } = await supabase
        .from('receptions_picks')
        .update({ receptions: live, scored_at: new Date().toISOString() })
        .eq('id', p.id)
      if (!error) scored++
    }
  }
  if (scored > 0) logger.info({ scored }, 'Receptions Contest picks scored')
  return { scored }
}
