import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

// =====================================================================
// SCORING RULES
// =====================================================================

/**
 * Default NFL fantasy scoring rules. Commissioners can override any field
 * via fantasy_settings.scoring_rules. The "rec" field is set to 1 by default
 * (PPR); set it to 0.5 for Half PPR or 0 for Standard.
 *
 * Bonuses are off by default. When enabled, each tier in the bonus arrays
 * fires independently — so a 220-yard rusher with the default ladder gets
 * +5 (100) +5 (150) +5 (200) = +15 bonus pts on top of regular yardage.
 */
export const DEFAULT_SCORING_RULES = {
  // Passing
  pass_yd: 0.04,        // 1 pt per 25 yards
  pass_td: 4,
  pass_int: -2,
  pass_2pt: 2,
  // Rushing
  rush_yd: 0.1,         // 1 pt per 10 yards
  rush_td: 6,
  rush_2pt: 2,
  // Receiving
  rec: 1,               // PPR default
  rec_yd: 0.1,
  rec_td: 6,
  rec_2pt: 2,
  // Misc
  fum_lost: -2,
  // Kicker
  fgm_0_39: 3,
  fgm_40_49: 4,
  fgm_50_plus: 5,
  xpm: 1,
  // Team defense
  def_sack: 1,
  def_int: 2,
  def_fum_rec: 2,
  def_td: 6,
  def_safety: 2,
  // Points allowed brackets (max points first)
  def_pa_brackets: [
    { max: 0,  pts: 10 },
    { max: 6,  pts: 7 },
    { max: 13, pts: 4 },
    { max: 20, pts: 1 },
    { max: 27, pts: 0 },
    { max: 34, pts: -1 },
    { max: 999, pts: -4 },
  ],
  // Yardage bonuses
  bonuses_enabled: false,
  pass_yd_bonuses: [
    { threshold: 300, points: 5 },
    { threshold: 350, points: 5 },
    { threshold: 400, points: 5 },
    { threshold: 450, points: 5 },
  ],
  rush_yd_bonuses: [
    { threshold: 100, points: 5 },
    { threshold: 150, points: 5 },
    { threshold: 200, points: 5 },
    { threshold: 250, points: 5 },
    { threshold: 300, points: 5 },
  ],
  rec_yd_bonuses: [
    { threshold: 100, points: 5 },
    { threshold: 150, points: 5 },
    { threshold: 200, points: 5 },
    { threshold: 250, points: 5 },
    { threshold: 300, points: 5 },
  ],
}

/** Build a starter rule set from a preset (ppr / half_ppr / standard) */
export function buildScoringRulesFromPreset(preset = 'half_ppr') {
  const base = { ...DEFAULT_SCORING_RULES }
  if (preset === 'standard') base.rec = 0
  else if (preset === 'half_ppr') base.rec = 0.5
  else base.rec = 1 // ppr
  return base
}

/**
 * Apply a league's scoring_rules to a single nfl_player_stats row and
 * return the total fantasy points.
 */
export function applyScoringRules(stat, rules) {
  if (!stat) return 0
  const r = { ...DEFAULT_SCORING_RULES, ...(rules || {}) }
  let pts = 0

  // Passing
  pts += (Number(stat.pass_yd) || 0) * (r.pass_yd || 0)
  pts += (stat.pass_td || 0) * (r.pass_td || 0)
  pts += (stat.pass_int || 0) * (r.pass_int || 0)

  // Rushing
  pts += (Number(stat.rush_yd) || 0) * (r.rush_yd || 0)
  pts += (stat.rush_td || 0) * (r.rush_td || 0)

  // Receiving
  pts += (stat.rec || 0) * (r.rec || 0)
  pts += (Number(stat.rec_yd) || 0) * (r.rec_yd || 0)
  pts += (stat.rec_td || 0) * (r.rec_td || 0)

  // Misc
  pts += (stat.fum_lost || 0) * (r.fum_lost || 0)
  pts += (stat.two_pt || 0) * (r.pass_2pt || 0) // approximate — Sleeper rolls 2pts together

  // Kicker
  pts += (stat.fgm_0_39 || 0) * (r.fgm_0_39 || 0)
  pts += (stat.fgm_40_49 || 0) * (r.fgm_40_49 || 0)
  pts += (stat.fgm_50_plus || 0) * (r.fgm_50_plus || 0)
  pts += (stat.xpm || 0) * (r.xpm || 0)

  // Team defense
  pts += (Number(stat.def_sack) || 0) * (r.def_sack || 0)
  pts += (stat.def_int || 0) * (r.def_int || 0)
  pts += (stat.def_fum_rec || 0) * (r.def_fum_rec || 0)
  pts += (stat.def_td || 0) * (r.def_td || 0)
  pts += (stat.def_safety || 0) * (r.def_safety || 0)
  if (stat.def_pts_allowed != null && Array.isArray(r.def_pa_brackets)) {
    const pa = stat.def_pts_allowed
    for (const b of r.def_pa_brackets) {
      if (pa <= (b.max ?? 999)) {
        pts += (b.pts || 0)
        break
      }
    }
  }

  // Yardage bonuses
  if (r.bonuses_enabled) {
    const passYd = Number(stat.pass_yd) || 0
    for (const tier of r.pass_yd_bonuses || []) {
      if (passYd >= (tier.threshold || 0)) pts += (tier.points || 0)
    }
    const rushYd = Number(stat.rush_yd) || 0
    for (const tier of r.rush_yd_bonuses || []) {
      if (rushYd >= (tier.threshold || 0)) pts += (tier.points || 0)
    }
    const recYd = Number(stat.rec_yd) || 0
    for (const tier of r.rec_yd_bonuses || []) {
      if (recYd >= (tier.threshold || 0)) pts += (tier.points || 0)
    }
  }

  return Math.round(pts * 100) / 100
}

/**
 * Create fantasy league settings after the league is created.
 */
export async function createFantasySettings(leagueId, settings = {}) {
  const {
    scoring_format = 'half_ppr',
    num_teams = 10,
    roster_slots = { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, k: 1, def: 1, bench: 6, ir: 1 },
    draft_date = null,
    draft_pick_timer = 90,
    waiver_type = 'priority',
    trade_review = 'commissioner',
    playoff_teams = 4,
    playoff_start_week = 15,
    championship_week = 17,
    season = 2026,
    format: dfsFormat,
    salary_cap,
    season_type,
    champion_metric,
    single_week,
    scoring_rules,
  } = settings

  const { data, error } = await supabase
    .from('fantasy_settings')
    .insert({
      league_id: leagueId,
      scoring_format,
      num_teams,
      roster_slots,
      draft_date,
      draft_pick_timer,
      waiver_type,
      trade_review,
      playoff_teams,
      playoff_start_week,
      championship_week,
      season,
      scoring_rules: scoring_rules || buildScoringRulesFromPreset(scoring_format),
      ...(dfsFormat && { format: dfsFormat }),
      ...(salary_cap && { salary_cap }),
      ...(season_type && { season_type }),
      ...(champion_metric && { champion_metric }),
      ...(single_week && { single_week }),
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Get fantasy settings for a league.
 */
export async function getFantasySettings(leagueId) {
  const { data, error } = await supabase
    .from('fantasy_settings')
    .select('*')
    .eq('league_id', leagueId)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Update fantasy settings (commissioner only, pre-draft).
 */
export async function updateFantasySettings(leagueId, updates) {
  const { data, error } = await supabase
    .from('fantasy_settings')
    .update(updates)
    .eq('league_id', leagueId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Generate snake draft order and pick slots.
 */
export async function initializeDraft(leagueId) {
  const settings = await getFantasySettings(leagueId)
  if (settings.draft_status !== 'pending') {
    const err = new Error('Draft has already been initialized')
    err.status = 400
    throw err
  }

  // Get league members
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)

  if (!members?.length) {
    const err = new Error('No members in this league')
    err.status = 400
    throw err
  }

  const numTeams = members.length
  const rosterSlots = settings.roster_slots
  const totalRosterSize = Object.values(rosterSlots).reduce((a, b) => a + b, 0)

  // Randomize draft order
  const shuffled = members.map((m) => m.user_id).sort(() => Math.random() - 0.5)

  // Generate snake draft picks
  const picks = []
  let pickNum = 1
  for (let round = 1; round <= totalRosterSize; round++) {
    const isReverse = round % 2 === 0
    const order = isReverse ? [...shuffled].reverse() : shuffled
    for (const userId of order) {
      picks.push({
        league_id: leagueId,
        round,
        pick_number: pickNum++,
        user_id: userId,
      })
    }
  }

  // Insert picks
  const { error: picksError } = await supabase
    .from('fantasy_draft_picks')
    .insert(picks)

  if (picksError) throw picksError

  // Update settings with draft order
  await supabase
    .from('fantasy_settings')
    .update({ draft_order: shuffled, num_teams: numTeams })
    .eq('league_id', leagueId)

  logger.info({ leagueId, numTeams, totalPicks: picks.length }, 'Draft initialized')
  return { numTeams, totalPicks: picks.length, draftOrder: shuffled }
}

/**
 * Make a draft pick.
 */
export async function makeDraftPick(leagueId, userId, playerId) {
  const settings = await getFantasySettings(leagueId)

  if (settings.draft_status === 'pending') {
    const err = new Error('Draft has not started yet')
    err.status = 400
    throw err
  }

  if (settings.draft_status === 'completed') {
    const err = new Error('Draft is already completed')
    err.status = 400
    throw err
  }

  // Get next pick
  const { data: nextPick } = await supabase
    .from('fantasy_draft_picks')
    .select('*')
    .eq('league_id', leagueId)
    .is('player_id', null)
    .order('pick_number', { ascending: true })
    .limit(1)
    .single()

  if (!nextPick) {
    const err = new Error('No picks remaining')
    err.status = 400
    throw err
  }

  if (nextPick.user_id !== userId) {
    const err = new Error('It is not your turn to pick')
    err.status = 400
    throw err
  }

  // Check player not already drafted
  const { data: existing } = await supabase
    .from('fantasy_draft_picks')
    .select('id')
    .eq('league_id', leagueId)
    .eq('player_id', playerId)
    .maybeSingle()

  if (existing) {
    const err = new Error('This player has already been drafted')
    err.status = 409
    throw err
  }

  // Make the pick
  const { data: pick, error } = await supabase
    .from('fantasy_draft_picks')
    .update({
      player_id: playerId,
      picked_at: new Date().toISOString(),
      is_auto_pick: false,
    })
    .eq('id', nextPick.id)
    .select('*, nfl_players(full_name, position, team, headshot_url)')
    .single()

  if (error) throw error

  // Add to roster
  const slot = getDefaultSlot(pick.nfl_players?.position)
  await supabase.from('fantasy_rosters').insert({
    league_id: leagueId,
    user_id: userId,
    player_id: playerId,
    slot,
    acquired_via: 'draft',
  })

  // Check if draft is complete
  const { count: remaining } = await supabase
    .from('fantasy_draft_picks')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId)
    .is('player_id', null)

  if (remaining === 0) {
    await supabase
      .from('fantasy_settings')
      .update({ draft_status: 'completed' })
      .eq('league_id', leagueId)
    logger.info({ leagueId }, 'Draft completed')
    // Auto-fill every user's starting lineup with their best players
    try {
      await autoFillLineupsForLeague(leagueId)
    } catch (err) {
      logger.error({ err, leagueId }, 'Failed to auto-fill lineups post-draft')
    }
    // Initialize waiver priority + FAAB budget for every member
    try {
      await initializeWaiverState(leagueId)
    } catch (err) {
      logger.error({ err, leagueId }, 'Failed to initialize waiver state post-draft')
    }
  }

  return { pick, remaining }
}

/**
 * Commissioner-only: record a pick for whoever is currently on the clock.
 * Used for in-person / offline drafts where the commish enters every pick
 * manually. Skips the "it is your turn" check that makeDraftPick enforces.
 */
export async function makeOfflineDraftPick(leagueId, commissionerId, playerId) {
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()
  if (!league || league.commissioner_id !== commissionerId) {
    const err = new Error('Only the commissioner can record offline picks')
    err.status = 403
    throw err
  }

  const { data: nextPick } = await supabase
    .from('fantasy_draft_picks')
    .select('user_id')
    .eq('league_id', leagueId)
    .is('player_id', null)
    .order('pick_number', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!nextPick) {
    const err = new Error('No picks remaining')
    err.status = 400
    throw err
  }

  // Delegate to makeDraftPick using the on-the-clock user's ID
  return makeDraftPick(leagueId, nextPick.user_id, playerId)
}

/**
 * After the draft completes, fill every user's starting lineup with their
 * best available players (highest projected_pts_half_ppr per position),
 * with FLEX getting the best remaining RB/WR/TE.
 */
export async function autoFillLineupsForLeague(leagueId) {
  const { data: rosters } = await supabase
    .from('fantasy_rosters')
    .select('id, user_id, player_id, slot, nfl_players(id, position, projected_pts_half_ppr)')
    .eq('league_id', leagueId)

  if (!rosters?.length) return

  // Group by user
  const byUser = {}
  for (const r of rosters) {
    if (!byUser[r.user_id]) byUser[r.user_id] = []
    byUser[r.user_id].push(r)
  }

  for (const [userId, userRows] of Object.entries(byUser)) {
    // Sort each player's row by projected points desc
    const byPos = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] }
    for (const r of userRows) {
      const pos = r.nfl_players?.position
      if (byPos[pos]) byPos[pos].push(r)
    }
    for (const arr of Object.values(byPos)) {
      arr.sort((a, b) => (b.nfl_players?.projected_pts_half_ppr || 0) - (a.nfl_players?.projected_pts_half_ppr || 0))
    }

    const assignments = {} // player_id → slot
    const used = new Set()

    function take(pos, slot) {
      const next = byPos[pos]?.find((r) => !used.has(r.player_id))
      if (next) {
        assignments[next.player_id] = slot
        used.add(next.player_id)
      }
    }

    take('QB', 'qb')
    take('RB', 'rb1')
    take('RB', 'rb2')
    take('WR', 'wr1')
    take('WR', 'wr2')
    take('WR', 'wr3')
    take('TE', 'te')
    // FLEX: best remaining RB, WR, or TE
    const flexCandidates = ['RB', 'WR', 'TE']
      .flatMap((p) => byPos[p].filter((r) => !used.has(r.player_id)))
      .sort((a, b) => (b.nfl_players?.projected_pts_half_ppr || 0) - (a.nfl_players?.projected_pts_half_ppr || 0))
    if (flexCandidates[0]) {
      assignments[flexCandidates[0].player_id] = 'flex'
      used.add(flexCandidates[0].player_id)
    }
    take('K', 'k')
    take('DEF', 'def')

    // Anything else → bench
    for (const r of userRows) {
      const newSlot = assignments[r.player_id] || 'bench'
      if (newSlot !== r.slot) {
        await supabase
          .from('fantasy_rosters')
          .update({ slot: newSlot })
          .eq('id', r.id)
      }
    }
  }
  logger.info({ leagueId, users: Object.keys(byUser).length }, 'Auto-filled post-draft lineups')
}

/**
 * Auto-pick for a user who missed their timer. First drains the user's
 * pre-rank queue (skipping any already-drafted), then falls back to the
 * best available player by Sleeper search_rank.
 */
export async function autoDraftPick(leagueId, userId) {
  // Get drafted set
  const { data: draftedIds } = await supabase
    .from('fantasy_draft_picks')
    .select('player_id')
    .eq('league_id', leagueId)
    .not('player_id', 'is', null)

  const drafted = new Set((draftedIds || []).map((d) => d.player_id))

  // 1. Try the user's pre-rank queue first
  const { data: queueRows } = await supabase
    .from('fantasy_draft_queues')
    .select('player_id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .order('rank', { ascending: true })

  let pick = null
  for (const q of queueRows || []) {
    if (!drafted.has(q.player_id)) {
      pick = { id: q.player_id }
      break
    }
  }

  // 2. Fallback: best available by Sleeper search_rank
  if (!pick) {
    const { data: bestAvailable } = await supabase
      .from('nfl_players')
      .select('id')
      .in('position', ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
      .not('team', 'is', null)
      .order('search_rank', { ascending: true })
      .limit(50)
    pick = (bestAvailable || []).find((p) => !drafted.has(p.id))
  }
  if (!pick) {
    logger.warn({ leagueId, userId }, 'No available players for auto-pick')
    return null
  }

  // Use makeDraftPick but mark as auto
  const result = await makeDraftPick(leagueId, userId, pick.id)

  // Mark as auto-pick
  await supabase
    .from('fantasy_draft_picks')
    .update({ is_auto_pick: true })
    .eq('id', result.pick.id)

  return result
}

/**
 * Start the draft.
 */
export async function startDraft(leagueId) {
  const settings = await getFantasySettings(leagueId)
  if (settings.draft_status !== 'pending') {
    const err = new Error('Draft cannot be started')
    err.status = 400
    throw err
  }

  // Check draft picks exist
  const { count } = await supabase
    .from('fantasy_draft_picks')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId)

  if (!count) {
    const err = new Error('Initialize the draft order first')
    err.status = 400
    throw err
  }

  await supabase
    .from('fantasy_settings')
    .update({ draft_status: 'in_progress', draft_started_at: new Date().toISOString() })
    .eq('league_id', leagueId)

  logger.info({ leagueId }, 'Draft started')
  return { status: 'in_progress' }
}

/**
 * Look up the global rank of a user's team in this league. Returns the
 * format group definition, the user's row, and the top 10 + 2 above/below
 * the user (sandwich) for context. Null if no group exists yet.
 */
export async function getGlobalRank(leagueId, userId) {
  // First find the user's row
  const { data: mine } = await supabase
    .from('fantasy_global_rankings')
    .select('format_hash, total_points, games_played, rank_in_group')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!mine) {
    // No ranking row — figure out why so the UI can explain it
    // 1. Has the cron ever run at all?
    const { count: anyGroups } = await supabase
      .from('fantasy_format_groups')
      .select('format_hash', { count: 'exact', head: true })
    if (!anyGroups) {
      return { status: 'pending', reason: 'not_yet_computed' }
    }

    // 2. Does this league use custom scoring rules?
    const { data: settings } = await supabase
      .from('fantasy_settings')
      .select('scoring_rules, num_teams, scoring_format')
      .eq('league_id', leagueId)
      .single()

    const hasCustomRules = !!(settings?.scoring_rules && Object.keys(settings.scoring_rules).length)
    return {
      status: 'no_group',
      reason: hasCustomRules ? 'custom_rules' : 'unique_format',
      league_settings: settings || null,
    }
  }

  // Format group details
  const { data: group } = await supabase
    .from('fantasy_format_groups')
    .select('*')
    .eq('format_hash', mine.format_hash)
    .single()

  if (!group) return null

  // Top 10
  const { data: top10 } = await supabase
    .from('fantasy_global_rankings')
    .select('rank_in_group, total_points, games_played, league_id, user_id, leagues(name), users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('format_hash', mine.format_hash)
    .order('rank_in_group', { ascending: true })
    .limit(10)

  // Sandwich (2 above, user, 2 below) — only if user is outside top 10
  let sandwich = null
  if (mine.rank_in_group > 10) {
    const lo = Math.max(1, mine.rank_in_group - 2)
    const hi = mine.rank_in_group + 2
    const { data: surround } = await supabase
      .from('fantasy_global_rankings')
      .select('rank_in_group, total_points, games_played, league_id, user_id, leagues(name), users(id, username, display_name, avatar_url, avatar_emoji)')
      .eq('format_hash', mine.format_hash)
      .gte('rank_in_group', lo)
      .lte('rank_in_group', hi)
      .order('rank_in_group', { ascending: true })
    sandwich = surround || []
  }

  return {
    status: 'ok',
    format: group,
    me: mine,
    top10: top10 || [],
    sandwich,
  }
}

/**
 * Get a user's per-league custom rankings. If empty, lazily seeds with the
 * top 200 active players ordered by the league's scoring projection.
 * Returns a flat ordered list with full player data joined.
 */
const RANKINGS_SEED_SIZE = 200
const SCORING_PROJ_COL = {
  ppr: 'projected_pts_ppr',
  half_ppr: 'projected_pts_half_ppr',
  standard: 'projected_pts_std',
}

async function seedUserRankings(leagueId, userId) {
  const settings = await getFantasySettings(leagueId)
  const projCol = SCORING_PROJ_COL[settings?.scoring_format] || 'projected_pts_half_ppr'

  const { data: top } = await supabase
    .from('nfl_players')
    .select(`id, ${projCol}`)
    .in('position', ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
    .not('team', 'is', null)
    .order(projCol, { ascending: false, nullsFirst: false })
    .limit(RANKINGS_SEED_SIZE)

  if (!top?.length) return
  const rows = top.map((p, i) => ({
    league_id: leagueId,
    user_id: userId,
    player_id: p.id,
    rank: i,
  }))
  const { error } = await supabase.from('fantasy_user_rankings').insert(rows)
  if (error) throw error
}

export async function getMyRankings(leagueId, userId) {
  const { data: existing, error: existingErr } = await supabase
    .from('fantasy_user_rankings')
    .select('player_id, rank')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .limit(1)
  if (existingErr) throw existingErr

  if (!existing?.length) {
    await seedUserRankings(leagueId, userId)
  }

  const { data, error } = await supabase
    .from('fantasy_user_rankings')
    .select('player_id, rank, nfl_players(id, full_name, position, team, headshot_url, injury_status, bye_week, projected_pts_half_ppr, projected_pts_ppr, projected_pts_std, search_rank)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .order('rank', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Replace a user's rankings with the given ordered list of player IDs.
 * Wipes existing and re-inserts in order — simple and correct.
 */
export async function setMyRankings(leagueId, userId, playerIds) {
  if (!Array.isArray(playerIds)) {
    const err = new Error('playerIds must be an array')
    err.status = 400
    throw err
  }
  await supabase
    .from('fantasy_user_rankings')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)

  if (!playerIds.length) return { count: 0 }
  const rows = playerIds.map((pid, i) => ({
    league_id: leagueId,
    user_id: userId,
    player_id: pid,
    rank: i,
  }))
  const { error } = await supabase.from('fantasy_user_rankings').insert(rows)
  if (error) throw error
  return { count: rows.length }
}

/**
 * Wipe + re-seed from current ADP. Used when projections have shifted and
 * the user wants a fresh starting point.
 */
export async function resetMyRankings(leagueId, userId) {
  await supabase
    .from('fantasy_user_rankings')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)
  await seedUserRankings(leagueId, userId)
  return { reset: true }
}

/**
 * Pause an in-progress draft (commissioner only — caller must enforce).
 * Autopick loop will skip paused drafts entirely.
 */
export async function pauseDraft(leagueId) {
  const settings = await getFantasySettings(leagueId)
  if (settings.draft_status !== 'in_progress') {
    const err = new Error('Only an in-progress draft can be paused')
    err.status = 400
    throw err
  }
  await supabase
    .from('fantasy_settings')
    .update({ draft_status: 'paused' })
    .eq('league_id', leagueId)
  logger.info({ leagueId }, 'Draft paused')
  return { status: 'paused' }
}

/**
 * Resume a paused draft. Stamps draft_resumed_at so the autopick clock
 * baseline starts fresh — users don't get insta-picked because their clock
 * "ran out" while paused.
 */
export async function resumeDraft(leagueId) {
  const settings = await getFantasySettings(leagueId)
  if (settings.draft_status !== 'paused') {
    const err = new Error('Only a paused draft can be resumed')
    err.status = 400
    throw err
  }
  await supabase
    .from('fantasy_settings')
    .update({ draft_status: 'in_progress', draft_resumed_at: new Date().toISOString() })
    .eq('league_id', leagueId)
  logger.info({ leagueId }, 'Draft resumed')
  return { status: 'in_progress' }
}

/**
 * Get a user's pre-rank draft queue (ordered).
 */
export async function getDraftQueue(leagueId, userId) {
  const { data, error } = await supabase
    .from('fantasy_draft_queues')
    .select('player_id, rank, nfl_players(id, full_name, position, team, headshot_url, injury_status, search_rank)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .order('rank', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Replace a user's draft queue with the given ordered list of player IDs.
 * The order of the array is the rank (index 0 = top).
 */
export async function setDraftQueue(leagueId, userId, playerIds) {
  if (!Array.isArray(playerIds)) {
    const err = new Error('playerIds must be an array')
    err.status = 400
    throw err
  }
  // Wipe existing
  await supabase
    .from('fantasy_draft_queues')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)

  if (!playerIds.length) return { count: 0 }

  const rows = playerIds.map((pid, i) => ({
    league_id: leagueId,
    user_id: userId,
    player_id: pid,
    rank: i,
  }))
  const { error } = await supabase.from('fantasy_draft_queues').insert(rows)
  if (error) throw error
  return { count: rows.length }
}

/**
 * Compute traditional fantasy league standings from fantasy_matchups.
 *
 * Wins/losses/ties are counted only from `status='completed'` matchups
 * (which means scoreFantasyMatchupsWeek has flipped them to completed
 * after the late Monday Night Football tick). PF/PA accumulate across
 * all scored matchups regardless of status, so users see live totals
 * during the week, but W/L only updates once Monday night is over.
 *
 * Sorted by wins DESC, then PF DESC as the tiebreaker.
 */
export async function getFantasyStandings(leagueId) {
  // Pull league members for the base list (so 0-game teams still show up)
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)

  if (!members?.length) return []

  // All matchups for this league, ordered so we can compute streaks chronologically
  const { data: matchups } = await supabase
    .from('fantasy_matchups')
    .select('week, home_user_id, away_user_id, home_points, away_points, status')
    .eq('league_id', leagueId)
    .order('week', { ascending: true })

  // Initialize per-user buckets
  const tally = {}
  for (const m of members) {
    tally[m.user_id] = {
      user_id: m.user_id,
      user: m.users,
      wins: 0,
      losses: 0,
      ties: 0,
      pf: 0,
      pa: 0,
      results: [], // chronological 'W'|'L'|'T' for streak calc
    }
  }

  for (const m of (matchups || [])) {
    const home = tally[m.home_user_id]
    const away = tally[m.away_user_id]
    if (!home || !away) continue
    const hp = Number(m.home_points) || 0
    const ap = Number(m.away_points) || 0
    // PF/PA always accumulate (live during the week)
    home.pf += hp; home.pa += ap
    away.pf += ap; away.pa += hp
    // W/L/T only count once the matchup is completed (post-MNF tick)
    if (m.status !== 'completed') continue
    if (hp > ap) {
      home.wins++; away.losses++
      home.results.push('W'); away.results.push('L')
    } else if (ap > hp) {
      away.wins++; home.losses++
      away.results.push('W'); home.results.push('L')
    } else {
      home.ties++; away.ties++
      home.results.push('T'); away.results.push('T')
    }
  }

  // Compute streak from the tail of results
  function computeStreak(results) {
    if (!results.length) return null
    const last = results[results.length - 1]
    let n = 0
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i] === last) n++
      else break
    }
    return `${last}${n}`
  }

  const standings = Object.values(tally).map((t) => ({
    user: t.user,
    user_id: t.user_id,
    wins: t.wins,
    losses: t.losses,
    ties: t.ties,
    pf: Number(t.pf.toFixed(1)),
    pa: Number(t.pa.toFixed(1)),
    streak: computeStreak(t.results),
    games_played: t.wins + t.losses + t.ties,
  }))

  // Sort: wins DESC, then PF DESC as tiebreaker
  standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    return b.pf - a.pf
  })

  return standings.map((s, i) => ({ ...s, rank: i + 1 }))
}

/**
 * Build the draft-context view of a player. Returns prior-season totals,
 * per-week log, ADP rank, projection, injury info, and recent news.
 *
 * Used by the new DraftPlayerDetailModal during the draft. The existing
 * in-season getPlayerDetail / PlayerDetailModal is intentionally untouched
 * so the in-season experience can never be broken by changes here.
 *
 * If `leagueId` is provided we use that league's scoring rules; otherwise
 * (mock draft) we fall back to the requested scoring_format.
 */
export async function getDraftPlayerDetail(playerId, { leagueId = null, scoringFormat = 'ppr' } = {}) {
  // Player core
  const { data: player } = await supabase
    .from('nfl_players')
    .select('id, full_name, position, team, headshot_url, injury_status, injury_body_part, bye_week, search_rank, projected_pts_ppr, projected_pts_half_ppr, projected_pts_std, age, years_exp, college, height, weight, espn_id')
    .eq('id', playerId)
    .single()

  if (!player) {
    const err = new Error('Player not found')
    err.status = 404
    throw err
  }

  // Resolve scoring rules — league overrides take precedence
  let rules = null
  let resolvedScoring = scoringFormat
  if (leagueId) {
    const { data: settings } = await supabase
      .from('fantasy_settings')
      .select('scoring_format, scoring_rules')
      .eq('league_id', leagueId)
      .single()
    if (settings) {
      resolvedScoring = settings.scoring_format
      rules = settings.scoring_rules
    }
  }
  if (!rules) {
    rules = buildScoringRulesFromPreset(resolvedScoring)
  }

  // Find the most recent season for which we have stats for this player
  const { data: latestRow } = await supabase
    .from('nfl_player_stats')
    .select('season')
    .eq('player_id', playerId)
    .order('season', { ascending: false })
    .limit(1)
    .maybeSingle()

  let priorSeason = null
  let weeklyStats = []
  let priorTotals = null
  if (latestRow?.season) {
    priorSeason = latestRow.season
    const { data: rows } = await supabase
      .from('nfl_player_stats')
      .select('*')
      .eq('player_id', playerId)
      .eq('season', priorSeason)
      .order('week', { ascending: true })

    weeklyStats = (rows || []).map((w) => ({
      ...w,
      pts: Number(applyScoringRules(w, rules).toFixed(2)),
    }))

    if (weeklyStats.length) {
      const totals = {}
      const numericKeys = [
        'pass_att','pass_cmp','pass_yd','pass_td','pass_int',
        'rush_att','rush_yd','rush_td',
        'rec_tgt','rec','rec_yd','rec_td',
        'fum_lost','two_pt',
        'fgm','fga','fgm_0_39','fgm_40_49','fgm_50_plus','xpm','xpa',
        'def_td','def_int','def_sack','def_fum_rec','def_safety',
      ]
      for (const k of numericKeys) totals[k] = 0
      let totalPts = 0
      for (const w of weeklyStats) {
        for (const k of numericKeys) totals[k] += Number(w[k]) || 0
        totalPts += w.pts || 0
      }
      priorTotals = {
        season: priorSeason,
        games_played: weeklyStats.length,
        total_pts: Number(totalPts.toFixed(1)),
        avg_pts: Number((totalPts / weeklyStats.length).toFixed(1)),
        ...totals,
      }
    }
  }

  // News (reuse the helper used by the in-season modal)
  let news = []
  try {
    news = await fetchEspnPlayerNews(player.espn_id, player.position)
  } catch {}

  return {
    player,
    scoring: { format: resolvedScoring, rules },
    prior: priorTotals,
    weekly_stats: weeklyStats,
    news,
  }
}

/**
 * Pre-start heads-up: 10 minutes before a draft is scheduled to start, send
 * every league member a notification. Deduped via draft_pre_start_notified_at.
 */
export async function processDraftPreStartNotifications() {
  const now = Date.now()
  const tenMinFromNow = new Date(now + 10 * 60 * 1000).toISOString()
  const fiveMinFromNow = new Date(now + 5 * 60 * 1000).toISOString()

  // Drafts pending, scheduled in the next ~10 min, not yet notified
  const { data: pending } = await supabase
    .from('fantasy_settings')
    .select('league_id, draft_date')
    .eq('draft_status', 'pending')
    .not('draft_date', 'is', null)
    .is('draft_pre_start_notified_at', null)
    .gte('draft_date', fiveMinFromNow)
    .lte('draft_date', tenMinFromNow)

  if (!pending?.length) return 0

  let notified = 0
  for (const row of pending) {
    try {
      const { createNotification } = await import('./notificationService.js')
      const { data: members } = await supabase
        .from('league_members')
        .select('user_id')
        .eq('league_id', row.league_id)
      for (const m of members || []) {
        await createNotification(m.user_id, 'fantasy_draft_starting_soon',
          'Your fantasy draft starts in 10 minutes — get ready!',
          { leagueId: row.league_id })
      }
      await supabase
        .from('fantasy_settings')
        .update({ draft_pre_start_notified_at: new Date().toISOString() })
        .eq('league_id', row.league_id)
      notified++
    } catch (err) {
      logger.error({ err, leagueId: row.league_id }, 'Pre-start draft notification failed')
    }
  }
  return notified
}

/**
 * Scheduled draft starter: scan every pending draft whose draft_date has
 * arrived and start it. If the commissioner never randomized the order,
 * we auto-initialize first so the league isn't stuck. Notifies all members.
 *
 * Returns the number of drafts started.
 */
export async function processScheduledDraftStarts() {
  const nowIso = new Date().toISOString()
  const { data: pending } = await supabase
    .from('fantasy_settings')
    .select('league_id, draft_date')
    .eq('draft_status', 'pending')
    .not('draft_date', 'is', null)
    .lte('draft_date', nowIso)

  if (!pending?.length) return 0

  let started = 0
  for (const row of pending) {
    try {
      // Make sure pick slots exist; if not, randomize first
      const { count } = await supabase
        .from('fantasy_draft_picks')
        .select('id', { count: 'exact', head: true })
        .eq('league_id', row.league_id)

      if (!count) {
        try {
          await initializeDraft(row.league_id)
        } catch (err) {
          logger.error({ err, leagueId: row.league_id }, 'Scheduled draft: failed to auto-initialize order')
          continue
        }
      }

      await startDraft(row.league_id)
      started++
      logger.info({ leagueId: row.league_id }, 'Scheduled draft started')

      // Notify every league member
      try {
        const { createNotification } = await import('./notificationService.js')
        const { data: members } = await supabase
          .from('league_members')
          .select('user_id')
          .eq('league_id', row.league_id)
        for (const m of members || []) {
          await createNotification(m.user_id, 'fantasy_draft_started',
            'Your fantasy draft has started — get on the clock!',
            { leagueId: row.league_id })
        }
      } catch (err) {
        logger.error({ err, leagueId: row.league_id }, 'Failed to send draft started notifications')
      }
    } catch (err) {
      logger.error({ err, leagueId: row.league_id }, 'Scheduled draft start failed')
    }
  }
  return started
}

/**
 * Tick-loop helper: scan every in-progress draft, find the on-the-clock pick,
 * and if its deadline has passed, auto-pick for that user.
 *
 * Deadline = (last completed pick's picked_at OR draft_started_at) + draft_pick_timer.
 * Returns the number of autopicks made.
 */
export async function processDraftAutopicks() {
  const { data: liveDrafts } = await supabase
    .from('fantasy_settings')
    .select('league_id, draft_pick_timer, draft_started_at, draft_resumed_at')
    .eq('draft_status', 'in_progress')

  if (!liveDrafts?.length) return 0

  let autopicks = 0
  for (const d of liveDrafts) {
    const timerSec = d.draft_pick_timer || 90
    try {
      // Next on-the-clock pick (earliest unfilled)
      const { data: nextPick } = await supabase
        .from('fantasy_draft_picks')
        .select('id, user_id, pick_number')
        .eq('league_id', d.league_id)
        .is('player_id', null)
        .order('pick_number', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!nextPick) continue

      // Most recent completed pick (for the deadline baseline)
      const { data: lastPick } = await supabase
        .from('fantasy_draft_picks')
        .select('picked_at')
        .eq('league_id', d.league_id)
        .not('player_id', 'is', null)
        .order('pick_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Baseline = max(last pick, draft start, draft resume)
      const candidates = []
      if (lastPick?.picked_at) candidates.push(new Date(lastPick.picked_at).getTime())
      if (d.draft_started_at) candidates.push(new Date(d.draft_started_at).getTime())
      if (d.draft_resumed_at) candidates.push(new Date(d.draft_resumed_at).getTime())
      const baselineMs = candidates.length ? Math.max(...candidates) : null
      if (baselineMs == null) continue
      const elapsedSec = (Date.now() - baselineMs) / 1000
      if (elapsedSec < timerSec) continue

      // Time's up — autopick for the on-the-clock user
      logger.info({ leagueId: d.league_id, userId: nextPick.user_id, pickNumber: nextPick.pick_number, elapsedSec }, 'Draft pick timer expired — auto-picking')
      await autoDraftPick(d.league_id, nextPick.user_id)
      autopicks++
    } catch (err) {
      logger.error({ err, leagueId: d.league_id }, 'Draft autopick tick failed for league')
    }
  }
  return autopicks
}

/**
 * Self-rescheduling tick loop. Runs every 10 seconds — well below the
 * minimum 30-second pick timer we'd realistically allow, so users always
 * get auto-picked within a few seconds of their clock hitting zero.
 */
let _draftTickTimer = null
const DRAFT_TICK_MS = 10 * 1000
export function startDraftAutopickLoop() {
  async function tick() {
    try {
      await processDraftPreStartNotifications()
    } catch (err) {
      logger.error({ err }, 'Draft pre-start notification tick error')
    }
    try {
      await processScheduledDraftStarts()
    } catch (err) {
      logger.error({ err }, 'Scheduled draft start tick error')
    }
    try {
      await processDraftAutopicks()
    } catch (err) {
      logger.error({ err }, 'Draft autopick loop tick error')
    }
    _draftTickTimer = setTimeout(tick, DRAFT_TICK_MS)
  }
  _draftTickTimer = setTimeout(tick, 5000)
}

export function stopDraftAutopickLoop() {
  if (_draftTickTimer) {
    clearTimeout(_draftTickTimer)
    _draftTickTimer = null
  }
}

/**
 * Get draft board (all picks with player data).
 */
export async function getDraftBoard(leagueId) {
  const [settingsRes, picksRes] = await Promise.all([
    supabase.from('fantasy_settings').select('*').eq('league_id', leagueId).single(),
    supabase.from('fantasy_draft_picks')
      .select('*, nfl_players(id, full_name, position, team, headshot_url), users(id, username, display_name, avatar_url, avatar_emoji)')
      .eq('league_id', leagueId)
      .order('pick_number', { ascending: true }),
  ])

  if (settingsRes.error) throw settingsRes.error

  return {
    settings: settingsRes.data,
    picks: picksRes.data || [],
  }
}

/**
 * Get user's fantasy roster.
 */
export async function getRoster(leagueId, userId) {
  const { data, error } = await supabase
    .from('fantasy_rosters')
    .select('*, nfl_players(id, full_name, position, team, headshot_url, injury_status, bye_week)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)

  if (error) throw error
  return data || []
}

/**
 * Search available players (not on any roster in this league).
 */
export async function searchAvailablePlayers(leagueId, query, position = null) {
  // Get all rostered player IDs
  const { data: rostered } = await supabase
    .from('fantasy_rosters')
    .select('player_id')
    .eq('league_id', leagueId)

  const rosteredIds = (rostered || []).map((r) => r.player_id)

  // Also exclude drafted players
  const { data: drafted } = await supabase
    .from('fantasy_draft_picks')
    .select('player_id')
    .eq('league_id', leagueId)
    .not('player_id', 'is', null)

  const draftedIds = (drafted || []).map((d) => d.player_id)
  const excludeIds = [...new Set([...rosteredIds, ...draftedIds])]

  // Pull a wider set so we can compute positional ranks across all
  // available players (not just the top 50 by raw search_rank).
  let dbQuery = supabase
    .from('nfl_players')
    .select('id, full_name, position, team, headshot_url, search_rank, injury_status, projected_pts_half_ppr, bye_week')
    .not('team', 'is', null)
    .order('projected_pts_half_ppr', { ascending: false, nullsFirst: false })
    .limit(400)

  if (query) {
    dbQuery = dbQuery.ilike('full_name', `%${query}%`)
  }
  if (position) {
    dbQuery = dbQuery.eq('position', position)
  }

  const { data, error } = await dbQuery
  if (error) throw error

  const excludeSet = new Set(excludeIds)
  const available = (data || []).filter((p) => !excludeSet.has(p.id))

  // Compute positional rank among ALL still-available players (regardless
  // of the current position filter) so the badge stays meaningful.
  // For that we need a second pass without the position filter.
  let posRanks = null
  if (position) {
    const { data: allPos } = await supabase
      .from('nfl_players')
      .select('id, position, projected_pts_half_ppr, search_rank')
      .eq('position', position)
      .not('team', 'is', null)
      .order('projected_pts_half_ppr', { ascending: false, nullsFirst: false })
      .limit(400)
    posRanks = {}
    let r = 0
    for (const p of allPos || []) {
      if (excludeSet.has(p.id)) continue
      r++
      posRanks[p.id] = r
    }
  } else {
    // Compute per-position ranks across the unfiltered pull
    const byPos = {}
    for (const p of available) {
      if (!byPos[p.position]) byPos[p.position] = []
      byPos[p.position].push(p)
    }
    posRanks = {}
    for (const arr of Object.values(byPos)) {
      arr.sort((a, b) => (b.projected_pts_half_ppr || 0) - (a.projected_pts_half_ppr || 0))
      arr.forEach((p, i) => { posRanks[p.id] = i + 1 })
    }
  }

  return available.slice(0, 50).map((p) => ({
    ...p,
    pos_rank: posRanks?.[p.id] || null,
  }))
}

/**
 * Set a user's lineup for the current week.
 *
 * Accepts a flat array of { player_id, slot } and updates fantasy_rosters
 * accordingly. Validates that:
 *  - Every player belongs to the user's roster
 *  - Each starter slot is allowed for the player's position
 *  - Locked players (game already started or finished) keep their existing slot
 *  - All required starter slots are filled
 *
 * Bench / IR are catch-alls — anything not explicitly assigned to a starter
 * slot or IR ends up in bench.
 */
const STARTER_SLOTS_TRAD = ['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3', 'te', 'flex', 'k', 'def']
const SLOT_POSITIONS = {
  qb: ['QB'],
  rb1: ['RB'],
  rb2: ['RB'],
  wr1: ['WR'],
  wr2: ['WR'],
  wr3: ['WR'],
  te: ['TE'],
  flex: ['RB', 'WR', 'TE'],
  k: ['K'],
  def: ['DEF'],
  bench: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
  ir: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
}

export async function setFantasyLineup(leagueId, userId, slotAssignments) {
  // slotAssignments: array of { player_id, slot }
  if (!Array.isArray(slotAssignments) || !slotAssignments.length) {
    const err = new Error('slotAssignments required')
    err.status = 400
    throw err
  }

  // 1. Get the user's current roster joined to nfl_players for position
  const { data: roster } = await supabase
    .from('fantasy_rosters')
    .select('id, player_id, slot, nfl_players(id, position, team)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)

  if (!roster?.length) {
    const err = new Error('You do not have a roster in this league')
    err.status = 404
    throw err
  }

  const rosterByPlayerId = {}
  for (const r of roster) rosterByPlayerId[r.player_id] = r

  // 2. Validate each assignment
  for (const a of slotAssignments) {
    const r = rosterByPlayerId[a.player_id]
    if (!r) {
      const err = new Error(`Player ${a.player_id} is not on your roster`)
      err.status = 400
      throw err
    }
    const allowed = SLOT_POSITIONS[a.slot]
    if (!allowed) {
      const err = new Error(`Invalid slot: ${a.slot}`)
      err.status = 400
      throw err
    }
    if (!allowed.includes(r.nfl_players?.position)) {
      const err = new Error(`Player ${r.nfl_players?.position} cannot fill slot ${a.slot}`)
      err.status = 400
      throw err
    }
  }

  // 3. Lock check — for any player whose team has already started a game this week,
  // skip the assignment if it would change their existing slot.
  // We use the most recent unfinished week from nfl_schedule.
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('season')
    .eq('league_id', leagueId)
    .single()
  const season = settings?.season || new Date().getUTCFullYear()
  const today = new Date().toISOString().split('T')[0]
  const { data: playedToday } = await supabase
    .from('nfl_schedule')
    .select('home_team, away_team, status')
    .eq('season', season)
    .lte('game_date', today)
    .neq('status', 'scheduled')

  const lockedTeams = new Set()
  for (const g of playedToday || []) {
    if (g.status === 'in_progress' || g.status === 'complete') {
      lockedTeams.add(g.home_team)
      lockedTeams.add(g.away_team)
    }
  }

  // 4. Build the final slot map (default everything to bench, then apply assignments)
  const newSlotByPlayer = {}
  for (const r of roster) {
    // If player is on a locked team, preserve current slot
    if (lockedTeams.has(r.nfl_players?.team)) {
      newSlotByPlayer[r.player_id] = r.slot
    } else {
      newSlotByPlayer[r.player_id] = 'bench'
    }
  }
  for (const a of slotAssignments) {
    const r = rosterByPlayerId[a.player_id]
    // Don't change locked players via assignment either
    if (lockedTeams.has(r.nfl_players?.team)) continue
    newSlotByPlayer[a.player_id] = a.slot
  }

  // 5. Validate every starter slot is filled exactly once (skip if user is mid-flow)
  const starterCounts = {}
  for (const slot of STARTER_SLOTS_TRAD) starterCounts[slot] = 0
  for (const playerId of Object.keys(newSlotByPlayer)) {
    const slot = newSlotByPlayer[playerId]
    if (STARTER_SLOTS_TRAD.includes(slot)) starterCounts[slot]++
  }
  for (const [slot, count] of Object.entries(starterCounts)) {
    if (count > 1) {
      const err = new Error(`Multiple players assigned to ${slot}`)
      err.status = 400
      throw err
    }
  }

  // 6. Persist — one update per row that changed
  let updated = 0
  for (const r of roster) {
    const newSlot = newSlotByPlayer[r.player_id]
    if (newSlot !== r.slot) {
      const { error } = await supabase
        .from('fantasy_rosters')
        .update({ slot: newSlot })
        .eq('id', r.id)
      if (error) {
        logger.error({ error, rosterId: r.id }, 'Failed to update lineup slot')
      } else {
        updated++
      }
    }
  }

  return { updated, locked_teams: [...lockedTeams] }
}

/**
 * Add a free-agent player to a user's roster, optionally swapping out a player.
 *
 * Validates:
 *  - The added player isn't already on someone's roster in this league
 *  - The dropped player IS on the user's roster
 *  - The dropped player's team isn't currently locked (game in progress / done)
 *
 * The added player goes to the bench by default — user can move to a starter
 * slot via setFantasyLineup afterward.
 */
export async function addDropPlayer(leagueId, userId, addPlayerId, dropPlayerId) {
  if (!addPlayerId) {
    const err = new Error('add_player_id required')
    err.status = 400
    throw err
  }

  // Verify the added player exists and is a valid NFL player
  const { data: addPlayer } = await supabase
    .from('nfl_players')
    .select('id, full_name, position, team, status')
    .eq('id', addPlayerId)
    .single()
  if (!addPlayer) {
    const err = new Error('Player not found')
    err.status = 404
    throw err
  }

  // Verify the player isn't already rostered in this league
  const { data: existing } = await supabase
    .from('fantasy_rosters')
    .select('id, user_id')
    .eq('league_id', leagueId)
    .eq('player_id', addPlayerId)
    .maybeSingle()
  if (existing) {
    const err = new Error('Player is already rostered in this league')
    err.status = 409
    throw err
  }

  // If dropping, verify ownership and lock state
  let dropRow = null
  if (dropPlayerId) {
    const { data: dropRoster } = await supabase
      .from('fantasy_rosters')
      .select('id, user_id, slot, nfl_players(team)')
      .eq('league_id', leagueId)
      .eq('player_id', dropPlayerId)
      .single()
    if (!dropRoster || dropRoster.user_id !== userId) {
      const err = new Error('You can only drop a player from your own roster')
      err.status = 403
      throw err
    }
    dropRow = dropRoster

    // Lock check: if dropped player's team has already started this week, block
    const { data: settings } = await supabase
      .from('fantasy_settings')
      .select('season')
      .eq('league_id', leagueId)
      .single()
    const season = settings?.season || new Date().getUTCFullYear()
    const today = new Date().toISOString().split('T')[0]
    const { data: lockedGames } = await supabase
      .from('nfl_schedule')
      .select('home_team, away_team, status')
      .eq('season', season)
      .lte('game_date', today)
      .neq('status', 'scheduled')
    const lockedTeams = new Set()
    for (const g of lockedGames || []) {
      lockedTeams.add(g.home_team)
      lockedTeams.add(g.away_team)
    }
    if (lockedTeams.has(dropRow.nfl_players?.team)) {
      const err = new Error("Can't drop a player whose game has already started")
      err.status = 400
      throw err
    }
  }

  // Drop first (if applicable), then add to bench
  if (dropRow) {
    await supabase.from('fantasy_rosters').delete().eq('id', dropRow.id)
  }
  const { error: insertErr } = await supabase
    .from('fantasy_rosters')
    .insert({
      league_id: leagueId,
      user_id: userId,
      player_id: addPlayerId,
      slot: 'bench',
    })
  if (insertErr) {
    logger.error({ insertErr, addPlayerId }, 'Failed to add player to roster')
    throw insertErr
  }

  return { added: addPlayer.full_name, dropped: dropPlayerId || null }
}

function getDefaultSlot(position) {
  switch (position) {
    case 'QB': return 'qb'
    case 'RB': return 'bench' // Will be assigned properly during lineup setting
    case 'WR': return 'bench'
    case 'TE': return 'bench'
    case 'K': return 'k'
    case 'DEF': return 'def'
    default: return 'bench'
  }
}

/**
 * Generate weekly H2H matchups for the regular season.
 */
export async function generateMatchups(leagueId) {
  const settings = await getFantasySettings(leagueId)

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)

  const userIds = (members || []).map((m) => m.user_id)
  const n = userIds.length

  if (n < 2) {
    const err = new Error('Need at least 2 teams for matchups')
    err.status = 400
    throw err
  }

  // Round-robin schedule generation
  const regularSeasonWeeks = settings.playoff_start_week - 1
  const matchups = []

  // If odd number of teams, add a bye placeholder
  const teams = [...userIds]
  if (teams.length % 2 !== 0) teams.push(null) // bye

  const half = teams.length / 2

  for (let week = 1; week <= regularSeasonWeeks; week++) {
    const roundIdx = (week - 1) % (teams.length - 1)

    // Rotate teams (keep first team fixed)
    const rotated = [teams[0]]
    for (let i = 1; i < teams.length; i++) {
      const idx = ((i - 1 + roundIdx) % (teams.length - 1)) + 1
      rotated.push(teams[idx])
    }

    for (let i = 0; i < half; i++) {
      const home = rotated[i]
      const away = rotated[teams.length - 1 - i]
      if (home && away) {
        matchups.push({
          league_id: leagueId,
          week,
          home_user_id: home,
          away_user_id: away,
        })
      }
    }
  }

  const { error } = await supabase
    .from('fantasy_matchups')
    .insert(matchups)

  if (error) throw error

  logger.info({ leagueId, matchups: matchups.length, weeks: regularSeasonWeeks }, 'Matchups generated')
  return { matchups: matchups.length, weeks: regularSeasonWeeks }
}

// =====================================================================
// STAT CORRECTIONS
// =====================================================================

/**
 * Detect stat corrections by comparing pre-upsert vs post-upsert pts.
 *
 * Only called after a sync that ran outside the live game window — during
 * games, points naturally fluctuate and aren't "corrections."
 *
 * For each player whose half-PPR points changed by >= 0.1, notify every
 * roster owner (traditional starters + bench, salary cap rosters for the
 * affected week). Dedup on (player_id, week, season, old_pts → new_pts) so
 * the same correction never fires twice.
 */
const STAT_CORRECTION_THRESHOLD = 0.1

export async function detectAndNotifyStatCorrections(week, season, newRows, oldStatsByPlayer) {
  const corrections = []
  for (const r of newRows) {
    const old = oldStatsByPlayer[r.player_id]
    if (!old) continue
    // Don't fire for first-time inserts (old row had no points yet)
    if (old.pts_half_ppr == null) continue
    const oldPts = Number(old.pts_half_ppr) || 0
    const newPts = Number(r.pts_half_ppr) || 0
    if (Math.abs(newPts - oldPts) >= STAT_CORRECTION_THRESHOLD) {
      corrections.push({
        player_id: r.player_id,
        old_pts: Math.round(oldPts * 10) / 10,
        new_pts: Math.round(newPts * 10) / 10,
        delta: Math.round((newPts - oldPts) * 10) / 10,
      })
    }
  }

  if (!corrections.length) return { detected: 0, notified: 0 }

  // Find every fantasy league roster row containing any corrected player
  const playerIds = corrections.map((c) => c.player_id)
  const correctionByPlayer = {}
  for (const c of corrections) correctionByPlayer[c.player_id] = c

  // Player names for the notification copy
  const { data: playerInfo } = await supabase
    .from('nfl_players')
    .select('id, full_name')
    .in('id', playerIds)
  const nameById = {}
  for (const p of playerInfo || []) nameById[p.id] = p.full_name

  // Traditional fantasy rosters (any slot — bench too)
  const { data: tradRows } = await supabase
    .from('fantasy_rosters')
    .select('user_id, league_id, player_id, leagues(name, format)')
    .in('player_id', playerIds)

  // Salary cap rosters for this week
  const { data: dfsSlots } = await supabase
    .from('dfs_roster_slots')
    .select('player_id, dfs_rosters!inner(user_id, league_id, nfl_week, season, leagues(name))')
    .in('player_id', playerIds)
    .eq('dfs_rosters.nfl_week', week)
    .eq('dfs_rosters.season', season)

  const ownerships = []
  for (const r of tradRows || []) {
    if (r.leagues?.format !== 'fantasy') continue
    ownerships.push({
      user_id: r.user_id,
      league_id: r.league_id,
      league_name: r.leagues?.name || 'your league',
      player_id: r.player_id,
    })
  }
  for (const s of dfsSlots || []) {
    ownerships.push({
      user_id: s.dfs_rosters.user_id,
      league_id: s.dfs_rosters.league_id,
      league_name: s.dfs_rosters.leagues?.name || 'your league',
      player_id: s.player_id,
    })
  }

  if (!ownerships.length) return { detected: corrections.length, notified: 0 }

  // Dedup against existing stat-correction notifications already sent for the
  // same player/week/season/new_pts (so the same correction never fires twice)
  const { data: existingNotifs } = await supabase
    .from('notifications')
    .select('user_id, metadata')
    .eq('type', 'fantasy_stat_correction')
    .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())

  const sentSet = new Set()
  for (const n of existingNotifs || []) {
    const md = n.metadata || {}
    if (md.player_id && md.week === week && md.season === season && md.new_pts != null) {
      sentSet.add(`${n.user_id}|${md.player_id}|${md.week}|${md.season}|${md.new_pts}`)
    }
  }

  let notified = 0
  for (const own of ownerships) {
    const c = correctionByPlayer[own.player_id]
    const dedupKey = `${own.user_id}|${own.player_id}|${week}|${season}|${c.new_pts}`
    if (sentSet.has(dedupKey)) continue
    sentSet.add(dedupKey)
    const playerName = nameById[own.player_id] || 'A player'
    const direction = c.delta > 0 ? 'gained' : 'lost'
    const absDelta = Math.abs(c.delta).toFixed(1)
    try {
      const { createNotification } = await import('./notificationService.js')
      await createNotification(own.user_id, 'fantasy_stat_correction',
        `${playerName} stat correction in ${own.league_name}: ${direction} ${absDelta} pts (now ${c.new_pts}).`,
        {
          leagueId: own.league_id,
          player_id: own.player_id,
          week,
          season,
          old_pts: c.old_pts,
          new_pts: c.new_pts,
          delta: c.delta,
        })
      notified++
    } catch (err) {
      logger.error({ err, ownership: own }, 'Failed to send stat correction notification')
    }
  }

  logger.info({ detected: corrections.length, notified, week, season }, 'Stat corrections processed')
  return { detected: corrections.length, notified }
}

// =====================================================================
// PLAYER DETAIL
// =====================================================================

// In-memory cache for ESPN player news (espn_id → { fetchedAt, items })
const PLAYER_NEWS_CACHE = new Map()
const PLAYER_NEWS_TTL_MS = 30 * 60 * 1000 // 30 minutes

async function fetchEspnPlayerNews(espnId) {
  if (!espnId) return []
  const cached = PLAYER_NEWS_CACHE.get(espnId)
  if (cached && Date.now() - cached.fetchedAt < PLAYER_NEWS_TTL_MS) {
    return cached.items
  }
  try {
    const res = await fetch(`https://site.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${espnId}/news`)
    if (!res.ok) {
      logger.warn({ espnId, status: res.status }, 'ESPN player news fetch failed')
      return []
    }
    const data = await res.json()
    const items = (data.articles || []).slice(0, 15).map((a) => ({
      headline: a.headline || a.shortHeadline || null,
      description: a.description || null,
      type: a.type || null,
      published: a.published || null,
      images: (a.images || [])
        .filter((img) => img.url)
        .slice(0, 1)
        .map((img) => ({ url: img.url, alt: img.alt || null })),
    })).filter((a) => a.headline)
    PLAYER_NEWS_CACHE.set(espnId, { fetchedAt: Date.now(), items })
    return items
  } catch (err) {
    logger.error({ err, espnId }, 'Failed to fetch ESPN player news')
    return []
  }
}

/**
 * Get a player's full detail for a fantasy league context:
 *   - profile (name, position, team, headshot, injury_status)
 *   - per-week stats this season (for the previous-games table)
 *   - current/most-recent week's stats expanded for the live stat line
 *
 * Per-week pts uses the league's scoring format. The 'current' week is
 * determined by Sleeper's NFL state when called.
 */
export async function getPlayerDetail(leagueId, playerId) {
  const settings = await getFantasySettings(leagueId)
  const leagueRules = settings?.scoring_rules || buildScoringRulesFromPreset(settings?.scoring_format)
  const season = settings?.season || new Date().getUTCFullYear()

  const { data: player } = await supabase
    .from('nfl_players')
    .select('id, full_name, position, team, headshot_url, injury_status, injury_body_part, age, years_exp, college, height, weight, number, espn_id, projected_pts_half_ppr')
    .eq('id', playerId)
    .single()

  if (!player) {
    const err = new Error('Player not found')
    err.status = 404
    throw err
  }

  const { data: weeks } = await supabase
    .from('nfl_player_stats')
    .select('week, season, pass_att, pass_cmp, pass_yd, pass_td, pass_int, rush_yd, rush_td, rec_tgt, rec, rec_yd, rec_td, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, xpm, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed')
    .eq('player_id', playerId)
    .eq('season', season)
    .order('week', { ascending: true })

  // Apply this league's scoring rules to each week, so the per-week pts the
  // user sees in the modal exactly match what their team would have scored.
  const weeklyStats = (weeks || []).map((w) => ({
    week: w.week,
    pts: applyScoringRules(w, leagueRules),
    pass_att: w.pass_att || 0,
    pass_cmp: w.pass_cmp || 0,
    pass_yd: Number(w.pass_yd) || 0,
    pass_td: w.pass_td || 0,
    pass_int: w.pass_int || 0,
    rush_yd: Number(w.rush_yd) || 0,
    rush_td: w.rush_td || 0,
    rec_tgt: w.rec_tgt || 0,
    rec: w.rec || 0,
    rec_yd: Number(w.rec_yd) || 0,
    rec_td: w.rec_td || 0,
    fum_lost: w.fum_lost || 0,
    fgm: (w.fgm_0_39 || 0) + (w.fgm_40_49 || 0) + (w.fgm_50_plus || 0),
    fgm_50_plus: w.fgm_50_plus || 0,
    xpm: w.xpm || 0,
    def_td: w.def_td || 0,
    def_int: w.def_int || 0,
    def_sack: Number(w.def_sack) || 0,
    def_fum_rec: w.def_fum_rec || 0,
    def_safety: w.def_safety || 0,
    def_pts_allowed: w.def_pts_allowed,
  }))

  const totalPts = weeklyStats.reduce((sum, w) => sum + w.pts, 0)
  const gamesPlayed = weeklyStats.length
  const avgPts = gamesPlayed > 0 ? totalPts / gamesPlayed : 0

  // Determine "current" week — most recent stat row, else fall back to season-high week
  const currentWeek = weeklyStats.length ? weeklyStats[weeklyStats.length - 1] : null

  // Look up the richer ESPN injury detail (body part + short comment) from
  // the team_intel table populated by the syncInjuries cron.
  let injuryDetail = null
  if (player.team) {
    // ESPN team_intel uses team_name as the full team display name. Sleeper
    // gives us the abbreviation, so we have to look up by the player's full
    // name across the team's injuries array.
    const { data: intelRows } = await supabase
      .from('team_intel')
      .select('team_name, injuries')
      .eq('sport_key', 'americanfootball_nfl')
    for (const row of intelRows || []) {
      const match = (row.injuries || []).find((i) => i.name === player.full_name)
      if (match) {
        injuryDetail = {
          status: match.status || player.injury_status,
          detail: match.detail || null,
          body_part: player.injury_body_part || null,
        }
        break
      }
    }
  }
  // Fall back to the Sleeper-provided fields if ESPN didn't have a match
  if (!injuryDetail && (player.injury_status || player.injury_body_part)) {
    injuryDetail = {
      status: player.injury_status,
      detail: null,
      body_part: player.injury_body_part || null,
    }
  }

  // ESPN player news (commentary, recaps, analysis, fantasy notes)
  const news = await fetchEspnPlayerNews(player.espn_id)

  return {
    player: {
      id: player.id,
      full_name: player.full_name,
      position: player.position,
      team: player.team,
      headshot_url: player.headshot_url,
      injury_status: player.injury_status,
      injury_body_part: player.injury_body_part,
      age: player.age,
      years_exp: player.years_exp,
      college: player.college,
      height: player.height,
      weight: player.weight,
      number: player.number,
      projected_pts_half_ppr: player.projected_pts_half_ppr,
    },
    season_summary: {
      season,
      games_played: gamesPlayed,
      total_pts: Math.round(totalPts * 10) / 10,
      avg_pts: Math.round(avgPts * 10) / 10,
    },
    current_week: currentWeek,
    weekly_stats: weeklyStats,
    injury_detail: injuryDetail,
    news,
  }
}

// =====================================================================
// WAIVERS
// =====================================================================

/**
 * Initialize per-user waiver state for a league. Called once after the draft
 * completes — sets each member's starting priority (reverse draft order if
 * available, else random) and FAAB budget.
 */
export async function initializeWaiverState(leagueId) {
  const settings = await getFantasySettings(leagueId)
  if (!settings) return

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
  if (!members?.length) return

  // Reverse draft order = standard inverse-of-draft waiver order. Worst draft
  // pick gets best waiver priority. We approximate by pulling fantasy_settings
  // .draft_order if present, else just use member order.
  const draftOrder = Array.isArray(settings.draft_order) ? settings.draft_order : null
  const orderedUsers = draftOrder
    ? [...draftOrder].reverse()
    : members.map((m) => m.user_id)

  const rows = orderedUsers.map((userId, i) => ({
    league_id: leagueId,
    user_id: userId,
    priority: i + 1,
    faab_remaining: settings.faab_starting_budget || 100,
  }))

  // Make sure every member is in the list (in case draftOrder was incomplete)
  const seen = new Set(orderedUsers)
  for (const m of members) {
    if (!seen.has(m.user_id)) {
      rows.push({
        league_id: leagueId,
        user_id: m.user_id,
        priority: rows.length + 1,
        faab_remaining: settings.faab_starting_budget || 100,
      })
    }
  }

  const { error } = await supabase
    .from('fantasy_waiver_state')
    .upsert(rows, { onConflict: 'league_id,user_id' })
  if (error) logger.error({ error, leagueId }, 'Failed to initialize waiver state')
  else logger.info({ leagueId, members: rows.length }, 'Waiver state initialized')
}

export async function getWaiverState(leagueId, userId) {
  const { data } = await supabase
    .from('fantasy_waiver_state')
    .select('*')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

export async function getWaiverStateForLeague(leagueId) {
  const { data } = await supabase
    .from('fantasy_waiver_state')
    .select('*, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)
    .order('priority', { ascending: true })
  return data || []
}

/**
 * Submit a new waiver claim. Validates ownership, available player, FAAB budget,
 * and replaces any existing pending claim from the same user for the same player.
 */
export async function submitWaiverClaim(leagueId, userId, addPlayerId, dropPlayerId, bidAmount = 0) {
  if (!addPlayerId) {
    const err = new Error('add_player_id required')
    err.status = 400
    throw err
  }

  // Check the player isn't already rostered
  const { data: existing } = await supabase
    .from('fantasy_rosters')
    .select('id')
    .eq('league_id', leagueId)
    .eq('player_id', addPlayerId)
    .maybeSingle()
  if (existing) {
    const err = new Error('Player is already rostered')
    err.status = 409
    throw err
  }

  // Check drop player belongs to the user (if specified)
  if (dropPlayerId) {
    const { data: dropRoster } = await supabase
      .from('fantasy_rosters')
      .select('user_id')
      .eq('league_id', leagueId)
      .eq('player_id', dropPlayerId)
      .single()
    if (!dropRoster || dropRoster.user_id !== userId) {
      const err = new Error('You can only drop your own players')
      err.status = 403
      throw err
    }
  }

  // FAAB budget check
  const settings = await getFantasySettings(leagueId)
  if (settings?.waiver_type === 'faab') {
    if (bidAmount < 0) {
      const err = new Error('Bid must be non-negative')
      err.status = 400
      throw err
    }
    const state = await getWaiverState(leagueId, userId)
    if (!state) {
      const err = new Error('Waiver state not initialized — draft not complete?')
      err.status = 400
      throw err
    }
    if (bidAmount > state.faab_remaining) {
      const err = new Error(`Bid exceeds your FAAB budget ($${state.faab_remaining})`)
      err.status = 400
      throw err
    }
  }

  // Replace any existing pending claim from this user for the same player
  await supabase
    .from('fantasy_waiver_claims')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('add_player_id', addPlayerId)
    .eq('status', 'pending')

  const { data, error } = await supabase
    .from('fantasy_waiver_claims')
    .insert({
      league_id: leagueId,
      user_id: userId,
      add_player_id: addPlayerId,
      drop_player_id: dropPlayerId || null,
      bid_amount: bidAmount,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function cancelWaiverClaim(claimId, userId) {
  const { data: claim } = await supabase
    .from('fantasy_waiver_claims')
    .select('*')
    .eq('id', claimId)
    .single()
  if (!claim || claim.user_id !== userId) {
    const err = new Error('Claim not found')
    err.status = 404
    throw err
  }
  if (claim.status !== 'pending') {
    const err = new Error('Claim is no longer pending')
    err.status = 400
    throw err
  }
  await supabase
    .from('fantasy_waiver_claims')
    .update({ status: 'cancelled', processed_at: new Date().toISOString() })
    .eq('id', claimId)
  return { cancelled: true }
}

export async function getMyWaiverClaims(leagueId, userId) {
  const { data } = await supabase
    .from('fantasy_waiver_claims')
    .select('*, add_player:nfl_players!fantasy_waiver_claims_add_player_id_fkey(id, full_name, position, team, headshot_url), drop_player:nfl_players!fantasy_waiver_claims_drop_player_id_fkey(id, full_name, position, team, headshot_url)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  return data || []
}

/**
 * Process all pending waiver claims for a single league.
 *
 * Algorithm:
 *   FAAB: process players one at a time. For each player, the highest bid wins.
 *         Tiebreak by waiver priority (lower = better). Winner pays the bid.
 *   Priority/Rolling: process players one at a time. For each player, the
 *         claimant with the lowest waiver priority number wins. Winner moves
 *         to the back of the queue.
 *
 * Each successful claim adds the player to the user's bench (and drops the
 * specified drop player if set). Failed claims get fail_reason set.
 */
export async function processLeagueWaivers(leagueId) {
  const settings = await getFantasySettings(leagueId)
  if (!settings) return { processed: 0 }
  const isFaab = settings.waiver_type === 'faab'

  const { data: claims } = await supabase
    .from('fantasy_waiver_claims')
    .select('*')
    .eq('league_id', leagueId)
    .eq('status', 'pending')
  if (!claims?.length) return { processed: 0 }

  // Group by add_player_id
  const claimsByPlayer = {}
  for (const c of claims) {
    if (!claimsByPlayer[c.add_player_id]) claimsByPlayer[c.add_player_id] = []
    claimsByPlayer[c.add_player_id].push(c)
  }

  // Get current waiver state for tiebreak / priority sort
  const stateRows = await getWaiverStateForLeague(leagueId)
  const stateByUser = {}
  for (const s of stateRows) stateByUser[s.user_id] = s

  let processed = 0
  for (const [playerId, playerClaims] of Object.entries(claimsByPlayer)) {
    // Confirm the player isn't already rostered (could have been added since claim)
    const { data: roster } = await supabase
      .from('fantasy_rosters')
      .select('id')
      .eq('league_id', leagueId)
      .eq('player_id', playerId)
      .maybeSingle()
    if (roster) {
      // Player is no longer free — fail every claim
      for (const c of playerClaims) {
        await supabase
          .from('fantasy_waiver_claims')
          .update({ status: 'failed', fail_reason: 'Player no longer available', processed_at: new Date().toISOString() })
          .eq('id', c.id)
      }
      continue
    }

    // Sort to find the winner
    let winner
    if (isFaab) {
      playerClaims.sort((a, b) => {
        if (b.bid_amount !== a.bid_amount) return b.bid_amount - a.bid_amount
        const aPri = stateByUser[a.user_id]?.priority || 999
        const bPri = stateByUser[b.user_id]?.priority || 999
        return aPri - bPri
      })
      // Re-validate the top bid against current FAAB
      while (playerClaims.length) {
        const top = playerClaims[0]
        const state = stateByUser[top.user_id]
        if (!state || top.bid_amount > state.faab_remaining) {
          await supabase
            .from('fantasy_waiver_claims')
            .update({ status: 'failed', fail_reason: 'Insufficient FAAB', processed_at: new Date().toISOString() })
            .eq('id', top.id)
          playerClaims.shift()
          continue
        }
        winner = top
        break
      }
    } else {
      playerClaims.sort((a, b) => {
        const aPri = stateByUser[a.user_id]?.priority || 999
        const bPri = stateByUser[b.user_id]?.priority || 999
        return aPri - bPri
      })
      winner = playerClaims[0]
    }

    if (!winner) continue

    // Apply the winning claim: drop player if specified, then add new player
    let addOk = false
    try {
      if (winner.drop_player_id) {
        await supabase
          .from('fantasy_rosters')
          .delete()
          .eq('league_id', leagueId)
          .eq('player_id', winner.drop_player_id)
          .eq('user_id', winner.user_id)
      }
      const { error: insertErr } = await supabase
        .from('fantasy_rosters')
        .insert({
          league_id: leagueId,
          user_id: winner.user_id,
          player_id: winner.add_player_id,
          slot: 'bench',
          acquired_via: 'waiver',
        })
      if (insertErr) throw insertErr
      addOk = true
    } catch (err) {
      logger.error({ err, claimId: winner.id }, 'Failed to apply waiver claim')
      await supabase
        .from('fantasy_waiver_claims')
        .update({ status: 'failed', fail_reason: 'Roster update failed', processed_at: new Date().toISOString() })
        .eq('id', winner.id)
      continue
    }

    // Mark winner awarded
    await supabase
      .from('fantasy_waiver_claims')
      .update({ status: 'awarded', processed_at: new Date().toISOString() })
      .eq('id', winner.id)
    processed++

    // Update waiver state
    if (isFaab) {
      const newRemaining = (stateByUser[winner.user_id]?.faab_remaining || 0) - winner.bid_amount
      await supabase
        .from('fantasy_waiver_state')
        .update({ faab_remaining: newRemaining, updated_at: new Date().toISOString() })
        .eq('league_id', leagueId)
        .eq('user_id', winner.user_id)
      stateByUser[winner.user_id].faab_remaining = newRemaining
    } else {
      // Rolling priority: winner goes to the back, everyone else with worse
      // priority moves up by 1
      const winnerPri = stateByUser[winner.user_id]?.priority || stateRows.length
      const maxPri = stateRows.length
      // Move winner to back
      await supabase
        .from('fantasy_waiver_state')
        .update({ priority: maxPri, updated_at: new Date().toISOString() })
        .eq('league_id', leagueId)
        .eq('user_id', winner.user_id)
      stateByUser[winner.user_id].priority = maxPri
      // Bump everyone after winner up by 1
      for (const s of stateRows) {
        if (s.user_id !== winner.user_id && s.priority > winnerPri) {
          await supabase
            .from('fantasy_waiver_state')
            .update({ priority: s.priority - 1, updated_at: new Date().toISOString() })
            .eq('league_id', leagueId)
            .eq('user_id', s.user_id)
          stateByUser[s.user_id].priority = s.priority - 1
        }
      }
    }

    // Notify winner
    try {
      const { createNotification } = await import('./notificationService.js')
      const { data: addPlayer } = await supabase.from('nfl_players').select('full_name').eq('id', winner.add_player_id).single()
      await createNotification(winner.user_id, 'fantasy_waiver_awarded',
        `You won the waiver claim for ${addPlayer?.full_name || 'your player'}!`,
        { leagueId, playerId: winner.add_player_id })
    } catch (err) { logger.error({ err }, 'Failed to send awarded notification') }

    // Fail and notify the losers
    for (const loser of playerClaims) {
      if (loser.id === winner.id) continue
      await supabase
        .from('fantasy_waiver_claims')
        .update({ status: 'failed', fail_reason: 'Outbid by another claim', processed_at: new Date().toISOString() })
        .eq('id', loser.id)
      try {
        const { createNotification } = await import('./notificationService.js')
        const { data: addPlayer } = await supabase.from('nfl_players').select('full_name').eq('id', loser.add_player_id).single()
        await createNotification(loser.user_id, 'fantasy_waiver_failed',
          `Your waiver claim for ${addPlayer?.full_name || 'a player'} was unsuccessful.`,
          { leagueId, playerId: loser.add_player_id })
      } catch (err) { logger.error({ err }, 'Failed to send failed notification') }
    }
  }

  logger.info({ leagueId, processed }, 'Waivers processed for league')
  return { processed }
}

/**
 * Process every traditional fantasy league with pending claims.
 * Called by the weekly waiver cron.
 */
export async function processAllPendingWaivers() {
  const { data: leagues } = await supabase
    .from('fantasy_settings')
    .select('league_id')
  if (!leagues?.length) return
  for (const l of leagues) {
    try {
      await processLeagueWaivers(l.league_id)
    } catch (err) {
      logger.error({ err, leagueId: l.league_id }, 'processLeagueWaivers failed')
    }
  }
}

// =====================================================================
// TRADES
// =====================================================================

/**
 * Propose a trade. proposerItems = array of player_ids the proposer is sending,
 * receiverItems = array of player_ids the receiver is sending back.
 */
export async function proposeTrade(leagueId, proposerUserId, receiverUserId, proposerPlayerIds, receiverPlayerIds, message) {
  if (proposerUserId === receiverUserId) {
    const err = new Error("Can't trade with yourself")
    err.status = 400
    throw err
  }
  if (!proposerPlayerIds?.length && !receiverPlayerIds?.length) {
    const err = new Error('Trade must include at least one player')
    err.status = 400
    throw err
  }

  // Verify all players belong to the right rosters
  const allPlayerIds = [...(proposerPlayerIds || []), ...(receiverPlayerIds || [])]
  const { data: rosters } = await supabase
    .from('fantasy_rosters')
    .select('user_id, player_id')
    .eq('league_id', leagueId)
    .in('player_id', allPlayerIds)

  const ownerByPlayer = {}
  for (const r of rosters || []) ownerByPlayer[r.player_id] = r.user_id

  for (const pid of proposerPlayerIds || []) {
    if (ownerByPlayer[pid] !== proposerUserId) {
      const err = new Error("You don't own all the players you're sending")
      err.status = 400
      throw err
    }
  }
  for (const pid of receiverPlayerIds || []) {
    if (ownerByPlayer[pid] !== receiverUserId) {
      const err = new Error("Receiver doesn't own one of the requested players")
      err.status = 400
      throw err
    }
  }

  // Insert trade
  const { data: trade, error: tradeErr } = await supabase
    .from('fantasy_trades')
    .insert({
      league_id: leagueId,
      proposer_user_id: proposerUserId,
      receiver_user_id: receiverUserId,
      message: message || null,
    })
    .select()
    .single()
  if (tradeErr) throw tradeErr

  // Insert items
  const items = [
    ...(proposerPlayerIds || []).map((pid) => ({
      trade_id: trade.id,
      from_user_id: proposerUserId,
      to_user_id: receiverUserId,
      player_id: pid,
    })),
    ...(receiverPlayerIds || []).map((pid) => ({
      trade_id: trade.id,
      from_user_id: receiverUserId,
      to_user_id: proposerUserId,
      player_id: pid,
    })),
  ]
  if (items.length) {
    const { error: itemsErr } = await supabase.from('fantasy_trade_items').insert(items)
    if (itemsErr) throw itemsErr
  }

  // Notify the receiver
  try {
    const { createNotification } = await import('./notificationService.js')
    const { data: league } = await supabase.from('leagues').select('name').eq('id', leagueId).single()
    await createNotification(
      receiverUserId,
      'fantasy_trade_proposed',
      `You have a new trade proposal in ${league?.name || 'your league'}`,
      { leagueId, tradeId: trade.id, actorId: proposerUserId },
    )
  } catch (err) {
    logger.error({ err, tradeId: trade.id }, 'Failed to send trade notification')
  }

  return trade
}

/**
 * Accept a pending trade. Atomically swaps player ownership.
 */
export async function acceptTrade(tradeId, userId) {
  const { data: trade } = await supabase
    .from('fantasy_trades')
    .select('*, fantasy_trade_items(*)')
    .eq('id', tradeId)
    .single()
  if (!trade) {
    const err = new Error('Trade not found')
    err.status = 404
    throw err
  }
  if (trade.status !== 'pending') {
    const err = new Error(`Trade is already ${trade.status}`)
    err.status = 400
    throw err
  }
  if (trade.receiver_user_id !== userId) {
    const err = new Error('Only the receiver can accept this trade')
    err.status = 403
    throw err
  }

  // Apply the swap: update fantasy_rosters.user_id for each item
  for (const item of trade.fantasy_trade_items || []) {
    const { error } = await supabase
      .from('fantasy_rosters')
      .update({ user_id: item.to_user_id, slot: 'bench' })
      .eq('league_id', trade.league_id)
      .eq('player_id', item.player_id)
    if (error) {
      logger.error({ error, tradeId, playerId: item.player_id }, 'Failed to apply trade item')
      throw error
    }
  }

  await supabase
    .from('fantasy_trades')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', tradeId)

  // Notify the proposer
  try {
    const { createNotification } = await import('./notificationService.js')
    const { data: league } = await supabase.from('leagues').select('name').eq('id', trade.league_id).single()
    await createNotification(
      trade.proposer_user_id,
      'fantasy_trade_accepted',
      `Your trade in ${league?.name || 'your league'} was accepted`,
      { leagueId: trade.league_id, tradeId, actorId: userId },
    )
  } catch (err) {
    logger.error({ err }, 'Failed to send trade-accepted notification')
  }

  return { accepted: true }
}

export async function declineTrade(tradeId, userId) {
  const { data: trade } = await supabase
    .from('fantasy_trades')
    .select('*')
    .eq('id', tradeId)
    .single()
  if (!trade) {
    const err = new Error('Trade not found')
    err.status = 404
    throw err
  }
  if (trade.status !== 'pending') {
    const err = new Error(`Trade is already ${trade.status}`)
    err.status = 400
    throw err
  }
  if (trade.receiver_user_id !== userId) {
    const err = new Error('Only the receiver can decline this trade')
    err.status = 403
    throw err
  }

  await supabase
    .from('fantasy_trades')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', tradeId)

  try {
    const { createNotification } = await import('./notificationService.js')
    const { data: league } = await supabase.from('leagues').select('name').eq('id', trade.league_id).single()
    await createNotification(
      trade.proposer_user_id,
      'fantasy_trade_declined',
      `Your trade in ${league?.name || 'your league'} was declined`,
      { leagueId: trade.league_id, tradeId, actorId: userId },
    )
  } catch (err) {
    logger.error({ err }, 'Failed to send trade-declined notification')
  }

  return { declined: true }
}

export async function cancelTrade(tradeId, userId) {
  const { data: trade } = await supabase.from('fantasy_trades').select('*').eq('id', tradeId).single()
  if (!trade) {
    const err = new Error('Trade not found')
    err.status = 404
    throw err
  }
  if (trade.proposer_user_id !== userId) {
    const err = new Error('Only the proposer can cancel this trade')
    err.status = 403
    throw err
  }
  if (trade.status !== 'pending') {
    const err = new Error(`Trade is already ${trade.status}`)
    err.status = 400
    throw err
  }
  await supabase
    .from('fantasy_trades')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', tradeId)
  return { cancelled: true }
}

export async function getTradesForLeague(leagueId) {
  const { data, error } = await supabase
    .from('fantasy_trades')
    .select(`
      *,
      proposer:users!fantasy_trades_proposer_user_id_fkey(id, username, display_name, avatar_url, avatar_emoji),
      receiver:users!fantasy_trades_receiver_user_id_fkey(id, username, display_name, avatar_url, avatar_emoji),
      fantasy_trade_items(*, nfl_players(id, full_name, position, team, headshot_url))
    `)
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Generate playoff bracket matchups for a traditional fantasy league.
 *
 * Called once when the regular season ends. Reads playoff_teams,
 * playoff_start_week, and championship_week from settings, then seeds
 * the bracket based on regular-season standings (using the same
 * tiebreakers as final standings).
 *
 * Single-elimination. With N playoff teams:
 *   - 4 teams: 2 rounds (semis + champ)   → start week + 1 wk
 *   - 6 teams: 3 rounds (top 2 byes + QF + SF + champ) → start week + 2 wks
 *   - 8 teams: 3 rounds (QF + SF + champ) → start week + 2 wks
 *
 * Inserts new fantasy_matchups for each round. Round 1 (start_week)
 * matchups have known users seeded by rank. Later rounds are placeholders
 * — the user-id columns get filled when the prior round completes.
 */
export async function generatePlayoffBracket(leagueId) {
  const settings = await getFantasySettings(leagueId)
  if (!settings || settings.format === 'salary_cap') return null

  const playoffTeams = settings.playoff_teams || 4
  const startWeek = settings.playoff_start_week || 15
  const championshipWeek = settings.championship_week || 17

  // Avoid double-generating
  const { data: existing } = await supabase
    .from('fantasy_matchups')
    .select('id')
    .eq('league_id', leagueId)
    .gte('week', startWeek)
    .limit(1)
  if (existing?.length) {
    logger.info({ leagueId }, 'Playoff matchups already exist, skipping')
    return null
  }

  // Compute standings using the same logic as completeLeagues
  const { data: regSeasonMatchups } = await supabase
    .from('fantasy_matchups')
    .select('home_user_id, away_user_id, home_points, away_points, status')
    .eq('league_id', leagueId)
    .lt('week', startWeek)
    .eq('status', 'completed')

  if (!regSeasonMatchups?.length) {
    logger.warn({ leagueId }, 'Cannot generate playoff bracket — no completed regular-season matchups')
    return null
  }

  const userStats = {}
  const h2hWins = {}
  for (const m of regSeasonMatchups) {
    if (!userStats[m.home_user_id]) userStats[m.home_user_id] = { user_id: m.home_user_id, wins: 0, losses: 0, pf: 0, pa: 0 }
    if (!userStats[m.away_user_id]) userStats[m.away_user_id] = { user_id: m.away_user_id, wins: 0, losses: 0, pf: 0, pa: 0 }
    if (!h2hWins[m.home_user_id]) h2hWins[m.home_user_id] = {}
    if (!h2hWins[m.away_user_id]) h2hWins[m.away_user_id] = {}

    userStats[m.home_user_id].pf += Number(m.home_points)
    userStats[m.away_user_id].pf += Number(m.away_points)
    userStats[m.home_user_id].pa += Number(m.away_points)
    userStats[m.away_user_id].pa += Number(m.home_points)

    if (m.home_points > m.away_points) {
      userStats[m.home_user_id].wins++
      userStats[m.away_user_id].losses++
      h2hWins[m.home_user_id][m.away_user_id] = (h2hWins[m.home_user_id][m.away_user_id] || 0) + 1
    } else if (m.away_points > m.home_points) {
      userStats[m.away_user_id].wins++
      userStats[m.home_user_id].losses++
      h2hWins[m.away_user_id][m.home_user_id] = (h2hWins[m.away_user_id][m.home_user_id] || 0) + 1
    }
  }

  const sorted = Object.values(userStats).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    const aBeatB = h2hWins[a.user_id]?.[b.user_id] || 0
    const bBeatA = h2hWins[b.user_id]?.[a.user_id] || 0
    if (aBeatB !== bBeatA) return bBeatA - aBeatB
    if (b.pf !== a.pf) return b.pf - a.pf
    return a.pa - b.pa
  })

  const seeds = sorted.slice(0, playoffTeams)
  if (seeds.length < playoffTeams) {
    logger.warn({ leagueId, have: seeds.length, want: playoffTeams }, 'Not enough teams for full playoff bracket')
  }

  const inserts = []

  // Pair seeds in standard bracket order based on bracket size
  if (playoffTeams === 4) {
    // Semis: 1v4, 2v3 → champ
    inserts.push({ league_id: leagueId, week: startWeek, home_user_id: seeds[0]?.user_id, away_user_id: seeds[3]?.user_id })
    inserts.push({ league_id: leagueId, week: startWeek, home_user_id: seeds[1]?.user_id, away_user_id: seeds[2]?.user_id })
  } else if (playoffTeams === 6) {
    // Round 1: 3v6, 4v5 (top 2 have byes) → semis next week
    inserts.push({ league_id: leagueId, week: startWeek, home_user_id: seeds[2]?.user_id, away_user_id: seeds[5]?.user_id })
    inserts.push({ league_id: leagueId, week: startWeek, home_user_id: seeds[3]?.user_id, away_user_id: seeds[4]?.user_id })
  } else if (playoffTeams === 8) {
    // QF: 1v8, 2v7, 3v6, 4v5
    inserts.push({ league_id: leagueId, week: startWeek, home_user_id: seeds[0]?.user_id, away_user_id: seeds[7]?.user_id })
    inserts.push({ league_id: leagueId, week: startWeek, home_user_id: seeds[1]?.user_id, away_user_id: seeds[6]?.user_id })
    inserts.push({ league_id: leagueId, week: startWeek, home_user_id: seeds[2]?.user_id, away_user_id: seeds[5]?.user_id })
    inserts.push({ league_id: leagueId, week: startWeek, home_user_id: seeds[3]?.user_id, away_user_id: seeds[4]?.user_id })
  }

  // Filter incomplete pairs
  const valid = inserts.filter((m) => m.home_user_id && m.away_user_id)

  if (!valid.length) return null
  const { error } = await supabase.from('fantasy_matchups').insert(valid)
  if (error) {
    logger.error({ error, leagueId }, 'Failed to insert playoff matchups')
    return null
  }

  logger.info({ leagueId, playoffTeams, startWeek, championshipWeek, generated: valid.length }, 'Playoff bracket generated')
  return { generated: valid.length, seeds: seeds.map((s) => ({ user_id: s.user_id, wins: s.wins, losses: s.losses })) }
}

/**
 * Score every traditional H2H fantasy matchup for a given week+season.
 *
 * Persists home_points / away_points / status onto fantasy_matchups so that:
 *   - Live H2H view reads pre-computed totals (faster, fewer per-call joins)
 *   - completeLeagues can compute final standings from W/L records
 *
 * Should be called after nfl_player_stats is fresh for the week.
 * Mirrors scoreNflDfsWeek (salary cap) but for traditional starting lineups
 * — reads roster slots and treats every non-bench/IR slot as starting.
 */
const STARTER_SLOT_KEYS = new Set(['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'wr3', 'te', 'flex', 'k', 'def'])

export async function scoreFantasyMatchupsWeek(week, season) {
  // 1. Find every traditional fantasy league that has a matchup for this week
  const { data: matchups } = await supabase
    .from('fantasy_matchups')
    .select('id, league_id, week, home_user_id, away_user_id')
    .eq('week', week)

  if (!matchups?.length) {
    logger.info({ week, season }, 'No fantasy H2H matchups for week')
    return { scored: 0 }
  }

  const leagueIds = [...new Set(matchups.map((m) => m.league_id))]

  // 2. Per-league scoring rules
  const { data: settingsRows } = await supabase
    .from('fantasy_settings')
    .select('league_id, scoring_format, scoring_rules, format')
    .in('league_id', leagueIds)
  const rulesByLeague = {}
  const isTraditional = {}
  for (const s of settingsRows || []) {
    rulesByLeague[s.league_id] = s.scoring_rules || buildScoringRulesFromPreset(s.scoring_format)
    isTraditional[s.league_id] = s.format !== 'salary_cap'
  }

  // 3. Get every active starting roster (slot in starter set, not bench/IR)
  const userIds = [...new Set(matchups.flatMap((m) => [m.home_user_id, m.away_user_id]))]
  const { data: rosterRows } = await supabase
    .from('fantasy_rosters')
    .select('league_id, user_id, player_id, slot')
    .in('league_id', leagueIds)
    .in('user_id', userIds)

  // 4. Fetch stats for all rostered starting players
  const allPlayerIds = [...new Set((rosterRows || [])
    .filter((r) => STARTER_SLOT_KEYS.has((r.slot || '').toLowerCase()))
    .map((r) => r.player_id))]

  const statsMap = {}
  if (allPlayerIds.length) {
    const { data: stats } = await supabase
      .from('nfl_player_stats')
      .select('player_id, pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, xpm, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed')
      .eq('week', week)
      .eq('season', season)
      .in('player_id', allPlayerIds)
    for (const st of stats || []) statsMap[st.player_id] = st
  }

  // 5. Sum starter points per (league, user) using each league's own rules
  const userPointsMap = {} // `${leagueId}|${userId}` → sum
  for (const r of rosterRows || []) {
    if (!STARTER_SLOT_KEYS.has((r.slot || '').toLowerCase())) continue
    if (!isTraditional[r.league_id]) continue
    const rules = rulesByLeague[r.league_id]
    const st = statsMap[r.player_id]
    const pts = applyScoringRules(st, rules)
    const key = `${r.league_id}|${r.user_id}`
    userPointsMap[key] = (userPointsMap[key] || 0) + pts
  }

  // 6. Determine if the week is "complete" — all NFL games for this week are final
  // For now we mark status='active' until the cron explicitly finalizes via the
  // late-night Monday tick. The complete-leagues code already accepts 'completed'
  // matchups for standings; we'll flip status to 'completed' once Monday games end.
  const now = new Date()
  const easternHour = parseInt(new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getHours(), 10)
  const easternDay = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay()
  // Mark completed if it's after 3 AM Tuesday Eastern (post-MNF)
  const weekIsFinal = (easternDay === 2 && easternHour >= 3) || (easternDay > 2 && easternDay !== 0)

  // 7. Update each matchup with home/away points
  let scored = 0
  for (const m of matchups) {
    if (!isTraditional[m.league_id]) continue
    const homePts = userPointsMap[`${m.league_id}|${m.home_user_id}`] || 0
    const awayPts = userPointsMap[`${m.league_id}|${m.away_user_id}`] || 0
    const { error } = await supabase
      .from('fantasy_matchups')
      .update({
        home_points: Math.round(homePts * 100) / 100,
        away_points: Math.round(awayPts * 100) / 100,
        status: weekIsFinal ? 'completed' : 'active',
      })
      .eq('id', m.id)
    if (error) {
      logger.error({ error, matchupId: m.id }, 'Failed to update fantasy matchup score')
    } else {
      scored++
    }
  }

  logger.info({ week, season, scored, leagues: leagueIds.length }, 'Fantasy H2H matchup scoring complete')

  // After scoring, see if any league just finished its regular season — if so,
  // generate the playoff bracket. We check leagues whose playoff_start_week
  // equals next week (so the week we just scored was the last regular week).
  if (weekIsFinal) {
    for (const leagueId of leagueIds) {
      const settings = await getFantasySettings(leagueId)
      if (!settings || settings.format === 'salary_cap') continue
      const startWeek = settings.playoff_start_week || 15
      if (week === startWeek - 1) {
        try {
          await generatePlayoffBracket(leagueId)
        } catch (err) {
          logger.error({ err, leagueId }, 'Failed to generate playoff bracket')
        }
      }
    }
  }

  return { scored }
}
