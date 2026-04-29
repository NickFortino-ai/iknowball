import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

/**
 * Score every sacks_picks row. Reads idp_sack from nfl_player_stats for
 * each (player, season, week) and writes the live count back to the pick.
 * Idempotent — only updates when the value has changed. Called from the
 * NFL stats sync loop alongside scoreAllTdPassPicks so scores update mid-game.
 */
export async function scoreAllSacksPicks() {
  const { data: picks } = await supabase
    .from('sacks_picks')
    .select('id, sleeper_player_id, season, week, sacks')
  if (!picks?.length) return { scored: 0 }

  const playerIds = [...new Set(picks.map((p) => p.sleeper_player_id))]
  const seasons = [...new Set(picks.map((p) => p.season))]

  const { data: statRows } = await supabase
    .from('nfl_player_stats')
    .select('player_id, season, week, idp_sack')
    .in('player_id', playerIds)
    .in('season', seasons)
  const statMap = {}
  for (const s of statRows || []) {
    statMap[`${s.player_id}|${s.season}|${s.week}`] = Number(s.idp_sack) || 0
  }

  let scored = 0
  for (const p of picks) {
    const live = statMap[`${p.sleeper_player_id}|${p.season}|${p.week}`] || 0
    const current = Number(p.sacks) || 0
    if (live !== current) {
      const { error } = await supabase
        .from('sacks_picks')
        .update({ sacks: live, scored_at: new Date().toISOString() })
        .eq('id', p.id)
      if (!error) scored++
    }
  }
  if (scored > 0) logger.info({ scored }, 'Sacks Contest picks scored')
  return { scored }
}
