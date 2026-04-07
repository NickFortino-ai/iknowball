import crypto from 'crypto'
import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

/**
 * Build a stable hash of the league's format. Two teams are only ranked
 * against each other if every component of this hash matches:
 *   - num_teams (member count)
 *   - scoring_format (ppr/half_ppr/standard)
 *   - roster_slots (JSONB, key-sorted)
 *   - scoring_rules (JSONB, key-sorted, optional)
 */
function stableStringify(obj) {
  if (obj == null) return 'null'
  if (typeof obj !== 'object' || Array.isArray(obj)) return JSON.stringify(obj)
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

function formatHashOf(numTeams, scoringFormat, rosterSlots, scoringRules) {
  const payload = JSON.stringify({
    n: numTeams,
    s: scoringFormat,
    r: stableStringify(rosterSlots || {}),
    c: stableStringify(scoringRules || null),
  })
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16)
}

function buildFormatLabel(numTeams, scoringFormat, rosterSlots) {
  const sf = scoringFormat === 'ppr' ? 'PPR' : scoringFormat === 'half_ppr' ? 'Half-PPR' : 'Standard'
  const slotBits = []
  if (rosterSlots?.qb) slotBits.push(`${rosterSlots.qb}QB`)
  if (rosterSlots?.rb) slotBits.push(`${rosterSlots.rb}RB`)
  if (rosterSlots?.wr) slotBits.push(`${rosterSlots.wr}WR`)
  if (rosterSlots?.te) slotBits.push(`${rosterSlots.te}TE`)
  if (rosterSlots?.flex) slotBits.push(`${rosterSlots.flex}FLEX`)
  if (rosterSlots?.superflex) slotBits.push(`${rosterSlots.superflex}SF`)
  if (rosterSlots?.k) slotBits.push(`${rosterSlots.k}K`)
  if (rosterSlots?.def) slotBits.push(`${rosterSlots.def}DEF`)
  return `${numTeams}-team ${sf} · ${slotBits.join('/')}`
}

/**
 * Recompute fantasy_format_groups + fantasy_global_rankings from scratch.
 * Cheap enough to run nightly: O(leagues × members) reads + a few hundred upserts.
 */
export async function computeFantasyGlobalRankings() {
  const start = Date.now()

  // Pull all fantasy leagues with their settings
  const { data: settings, error: settingsErr } = await supabase
    .from('fantasy_settings')
    .select('league_id, num_teams, scoring_format, roster_slots, scoring_rules, leagues!inner(id, format)')
  if (settingsErr) {
    logger.error({ err: settingsErr }, 'Failed to fetch fantasy settings')
    return
  }
  const fantasyLeagues = (settings || []).filter((s) => s.leagues?.format === 'fantasy' && s.num_teams)

  if (!fantasyLeagues.length) {
    logger.info('No fantasy leagues to rank')
    return
  }

  // Group leagues by format hash
  const groups = new Map() // hash → { leagues: [], num_teams, scoring_format, roster_slots, scoring_rules }
  for (const s of fantasyLeagues) {
    const hash = formatHashOf(s.num_teams, s.scoring_format, s.roster_slots, s.scoring_rules)
    if (!groups.has(hash)) {
      groups.set(hash, {
        format_hash: hash,
        num_teams: s.num_teams,
        scoring_format: s.scoring_format,
        roster_slots: s.roster_slots,
        scoring_rules: s.scoring_rules,
        label: buildFormatLabel(s.num_teams, s.scoring_format, s.roster_slots),
        leagueIds: [],
      })
    }
    groups.get(hash).leagueIds.push(s.league_id)
  }

  // Wipe old data — we recompute fresh each run
  await supabase.from('fantasy_global_rankings').delete().neq('format_hash', '___nope___')
  await supabase.from('fantasy_format_groups').delete().neq('format_hash', '___nope___')

  let totalRankings = 0
  let totalGroups = 0

  for (const group of groups.values()) {
    // Skip groups with fewer than 2 leagues — single-league groups aren't a meaningful comparison
    if (group.leagueIds.length < 2) continue

    // Pull every matchup row for these leagues
    const { data: matchups } = await supabase
      .from('fantasy_matchups')
      .select('league_id, week, home_user_id, away_user_id, home_points, away_points, status')
      .in('league_id', group.leagueIds)

    if (!matchups?.length) continue

    // Aggregate per (league_id, user_id) → { total_points, games_played }
    const teamTotals = new Map() // key=`${league_id}:${user_id}` → { total_points, games_played }
    function add(leagueId, userId, points, isCompleted) {
      if (points == null) return
      const key = `${leagueId}:${userId}`
      const cur = teamTotals.get(key) || { league_id: leagueId, user_id: userId, total_points: 0, games_played: 0 }
      cur.total_points += Number(points) || 0
      if (isCompleted) cur.games_played += 1
      teamTotals.set(key, cur)
    }
    for (const m of matchups) {
      const completed = m.status === 'completed'
      // Count even non-completed weeks for live points, but games_played only when completed
      add(m.league_id, m.home_user_id, m.home_points, completed)
      add(m.league_id, m.away_user_id, m.away_points, completed)
    }

    // Sort and rank
    const ranked = Array.from(teamTotals.values()).sort((a, b) => b.total_points - a.total_points)
    if (ranked.length < 2) continue

    // Insert format group row
    await supabase.from('fantasy_format_groups').insert({
      format_hash: group.format_hash,
      num_teams: group.num_teams,
      scoring_format: group.scoring_format,
      roster_slots: group.roster_slots,
      scoring_rules: group.scoring_rules,
      label: group.label,
      league_count: group.leagueIds.length,
      team_count: ranked.length,
    })
    totalGroups++

    // Insert ranking rows in batches of 100
    const rows = ranked.map((t, i) => ({
      format_hash: group.format_hash,
      league_id: t.league_id,
      user_id: t.user_id,
      total_points: Number(t.total_points.toFixed(2)),
      games_played: t.games_played,
      rank_in_group: i + 1,
    }))
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100)
      const { error } = await supabase.from('fantasy_global_rankings').insert(batch)
      if (error) {
        logger.error({ err: error, format_hash: group.format_hash }, 'Failed to insert ranking batch')
        break
      }
    }
    totalRankings += rows.length
  }

  logger.info({ groups: totalGroups, rankings: totalRankings, ms: Date.now() - start }, 'Fantasy global rankings computed')
}
