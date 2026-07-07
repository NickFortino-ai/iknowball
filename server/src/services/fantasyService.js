import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { effectiveAdp as computeEffectiveAdp } from '../utils/effectiveAdp.js'
import { getLeagueSyncInfo } from './draftPrepService.js'
import { fetchAll } from '../utils/fetchAll.js'

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
  fgmiss_0_39: -3,
  fgmiss_40_49: -2,
  fgmiss_50_plus: -1,
  xpm: 1,
  xpmiss: -1,
  // Team defense
  def_sack: 1,
  def_int: 2,
  def_fum_rec: 2,
  def_td: 6,
  def_safety: 2,
  // IDP — applied only when a player has the corresponding idp_* stat, so
  // having these in DEFAULT_SCORING_RULES is harmless for team-DEF leagues
  // (their players have no idp_* stats and these contribute zero).
  idp_tkl_solo: 1,
  idp_tkl_ast: 0.5,
  idp_tkl_loss: 2,
  idp_sack: 2,
  idp_int: 3,
  idp_pass_def: 1,
  idp_qb_hit: 0,
  idp_ff: 2,
  idp_fum_rec: 2,
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
  // Two-point conversions. Sleeper rolls all 2pt types into a single
  // `two_pt` field — no type distinction at the source. We infer the
  // most-likely type from the same stat row's offensive activity:
  // a passer (pass_att > 0) is presumed to have thrown the 2pt, a
  // rusher (rush_att > 0) ran it, a receiver (rec_tgt > 0) caught it.
  // For a row that ONLY has two_pt (rare — a 2pt-only appearance like
  // a special-teams contributor), fall back to the average of the
  // three rates. With default rules all three are 2 so this is a no-op
  // for standard leagues; custom rules that differentiate types get
  // approximated correctly when there's any other offensive activity
  // and split the difference when there isn't.
  if (stat.two_pt) {
    let twoPtRate
    if ((stat.pass_att || 0) > 0) twoPtRate = r.pass_2pt || 0
    else if ((stat.rush_att || 0) > 0) twoPtRate = r.rush_2pt || 0
    else if ((stat.rec_tgt || 0) > 0 || (stat.rec || 0) > 0) twoPtRate = r.rec_2pt || 0
    else twoPtRate = ((r.pass_2pt || 0) + (r.rush_2pt || 0) + (r.rec_2pt || 0)) / 3
    pts += stat.two_pt * twoPtRate
  }

  // Kicker
  pts += (stat.fgm_0_39 || 0) * (r.fgm_0_39 || 0)
  pts += (stat.fgm_40_49 || 0) * (r.fgm_40_49 || 0)
  pts += (stat.fgm_50_plus || 0) * (r.fgm_50_plus || 0)
  pts += (stat.fgmiss_0_39 || 0) * (r.fgmiss_0_39 || 0)
  pts += (stat.fgmiss_40_49 || 0) * (r.fgmiss_40_49 || 0)
  pts += (stat.fgmiss_50_plus || 0) * (r.fgmiss_50_plus || 0)
  pts += (stat.xpm || 0) * (r.xpm || 0)
  // xpa (attempts) - xpm (made) = misses. No dedicated xpmiss field
  // needed since we already sync both from Sleeper.
  const xpMisses = Math.max(0, (Number(stat.xpa) || 0) - (Number(stat.xpm) || 0))
  pts += xpMisses * (r.xpmiss || 0)

  // Team defense
  pts += (Number(stat.def_sack) || 0) * (r.def_sack || 0)
  pts += (stat.def_int || 0) * (r.def_int || 0)
  pts += (stat.def_fum_rec || 0) * (r.def_fum_rec || 0)
  pts += (stat.def_td || 0) * (r.def_td || 0)
  pts += (stat.def_safety || 0) * (r.def_safety || 0)
  // Defense points-allowed bracket — gate on actual offensive activity so an
  // offensive player whose nfl_player_stats row happens to have
  // def_pts_allowed=0 (instead of null — seeder or sync gap) doesn't silently
  // pick up the shutout bonus. A real DEF row has no offensive activity, so
  // we only apply the bracket when pass/rush/rec activity is zero across
  // the board. Sim league exposed this: Cook with 21 carries + 68 rush_yd
  // + def_pts_allowed=0 was getting +10 pts (6.8 rushing + 10 shutout = 16.8).
  if (stat.def_pts_allowed != null && Array.isArray(r.def_pa_brackets)) {
    const hasOffensiveActivity =
      (Number(stat.pass_yd) || 0) > 0 || (Number(stat.rush_yd) || 0) > 0 ||
      (Number(stat.rec_yd) || 0) > 0 || (stat.pass_td || 0) > 0 ||
      (stat.rush_td || 0) > 0 || (stat.rec_td || 0) > 0 ||
      (stat.rec || 0) > 0 || (stat.rec_tgt || 0) > 0 ||
      (stat.rush_att || 0) > 0 || (stat.pass_att || 0) > 0 ||
      (stat.fgm_0_39 || 0) > 0 || (stat.fgm_40_49 || 0) > 0 ||
      (stat.fgm_50_plus || 0) > 0 || (stat.xpm || 0) > 0
    if (!hasOffensiveActivity) {
      const pa = stat.def_pts_allowed
      for (const b of r.def_pa_brackets) {
        if (pa <= (b.max ?? 999)) {
          pts += (b.pts || 0)
          break
        }
      }
    }
  }

  // IDP — only active when the player has individual-defensive stats.
  // Team-DEF rows have no idp_* values, so every term contributes zero and
  // this block is effectively a no-op for non-IDP leagues.
  pts += (Number(stat.idp_tkl_solo) || 0) * (r.idp_tkl_solo || 0)
  pts += (Number(stat.idp_tkl_ast) || 0) * (r.idp_tkl_ast || 0)
  pts += (Number(stat.idp_tkl_loss) || 0) * (r.idp_tkl_loss || 0)
  pts += (Number(stat.idp_sack) || 0) * (r.idp_sack || 0)
  pts += (stat.idp_int || 0) * (r.idp_int || 0)
  pts += (Number(stat.idp_pass_def) || 0) * (r.idp_pass_def || 0)
  pts += (Number(stat.idp_qb_hit) || 0) * (r.idp_qb_hit || 0)
  pts += (stat.idp_ff || 0) * (r.idp_ff || 0)
  pts += (stat.idp_fum_rec || 0) * (r.idp_fum_rec || 0)

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

// IDP positions per Sleeper player.position values. Used by the
// projection compute path to decide whether to derive points from
// raw IDP stat projections instead of reading the offense-only
// pre-baked total (which scores defenders as ~0).
const IDP_POSITIONS = new Set([
  'DL', 'DE', 'DT', 'NT',
  'LB', 'ILB', 'OLB', 'MLB',
  'DB', 'CB', 'S', 'FS', 'SS',
])

/**
 * Returns projected points for a player for one week, choosing between:
 *  - applyScoringRules over raw IDP stat fields (for defenders)
 *  - pre-baked pts_* total (for everyone else)
 * Falls back to the pre-baked total if no projection row exists.
 */
export function computeIdpAwareProjection(projRow, position, projCol, rules) {
  if (!projRow) return null
  if (IDP_POSITIONS.has(position)) {
    return applyScoringRules({
      idp_sack: projRow.idp_sack || 0,
      idp_int: projRow.idp_int || 0,
      idp_tkl_solo: projRow.idp_tkl_solo || 0,
      idp_tkl_ast: projRow.idp_tkl_ast || 0,
      idp_tkl_loss: projRow.idp_tkl_loss || 0,
      idp_pass_def: projRow.idp_pass_def || 0,
      idp_qb_hit: projRow.idp_qb_hit || 0,
      idp_ff: projRow.idp_ff || 0,
      idp_fum_rec: projRow.idp_fum_rec || 0,
    }, rules)
  }
  return projRow[projCol]
}

/**
 * Playoff start week is derived from bracket size + championship week, not
 * commish-picked. 4 teams = 2 rounds (semis, finals). 6-8 teams = 3 rounds
 * (wild card / quarters, semis, finals). Fewer than 3 or more than 8 falls
 * back to a safe 3-round default. Server is authoritative — client sends
 * are ignored on both create and update.
 */
function derivePlayoffStartWeek(playoffTeams, championshipWeek) {
  const rounds = playoffTeams <= 2 ? 1 : playoffTeams <= 4 ? 2 : 3
  return championshipWeek - (rounds - 1)
}

/**
 * Create fantasy league settings after the league is created.
 */
export async function createFantasySettings(leagueId, settings = {}) {
  const {
    scoring_format = 'half_ppr',
    num_teams = 10,
    roster_slots = { qb: 1, rb: 2, wr: 3, te: 1, flex: 1, k: 1, def: 1, bench: 6, ir: 1 },
    draft_date = null,
    draft_pick_timer = 90,
    draft_mode = 'live',
    draft_location = null,
    waiver_type = 'priority',
    trade_review = 'commissioner',
    playoff_teams = 4,
    championship_week = 17,
    season = 2026,
    format: dfsFormat,
    salary_cap,
    season_type,
    champion_metric,
    single_week,
    scoring_rules,
    pick_reuse,
  } = settings

  const { data, error } = await supabase
    .from('fantasy_settings')
    .insert({
      league_id: leagueId,
      scoring_format,
      // Salary cap sends num_teams: null (no H2H schedule); DB has a
      // NOT NULL constraint, so coerce null → 10 as a harmless
      // placeholder. Destructuring default above only handles
      // undefined, not null.
      num_teams: num_teams ?? 10,
      roster_slots,
      draft_date,
      draft_pick_timer,
      draft_mode,
      draft_location,
      waiver_type,
      trade_review,
      playoff_teams,
      // Server-authoritative — ignore any incoming client value.
      playoff_start_week: derivePlayoffStartWeek(playoff_teams, championship_week),
      championship_week,
      season,
      scoring_rules: scoring_rules || buildScoringRulesFromPreset(scoring_format),
      ...(dfsFormat && { format: dfsFormat }),
      ...(salary_cap && { salary_cap }),
      ...(season_type && { season_type }),
      ...(champion_metric && { champion_metric }),
      // Salary cap "This Week" leagues pass single_week=null from the
      // client (no picker). Resolve to the current NFL week server-side
      // so the league is always pegged to whatever week is in progress
      // when it was created. NBA/WNBA single-night still pass an
      // explicit single_week from the client's date picker.
      ...(single_week
        ? { single_week }
        : (season_type === 'single_week' && dfsFormat !== 'nba_dfs' && dfsFormat !== 'wnba_dfs')
          ? { single_week: (await (async () => {
              try {
                const { getCurrentNflWeek } = await import('./tdPassService.js')
                const { week } = await getCurrentNflWeek()
                return week
              } catch { return 1 }
            })()) }
          : {}),
      ...(pick_reuse && { pick_reuse }),
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
  // Ensure scoring_rules is always populated (build from preset if not stored)
  if (data && !data.scoring_rules) {
    data.scoring_rules = buildScoringRulesFromPreset(data.scoring_format)
  }
  return data
}

/**
 * Update fantasy settings (commissioner only, pre-draft).
 */
// Fields that can only be changed before the draft completes
const PRESEASON_ONLY_FIELDS = new Set([
  'scoring_format', 'scoring_rules', 'roster_slots', 'waiver_type',
  'faab_starting_budget', 'num_teams', 'playoff_teams',
  'playoff_start_week', 'championship_week', 'format',
])

// Fields the commissioner can change during the season
const SEASON_ALLOWED_FIELDS = new Set([
  'trade_deadline', 'trade_review', 'current_week',
])

export async function updateFantasySettings(leagueId, updates) {
  let current = await getFantasySettings(leagueId)
  // Lazy-init: pre-existing single-stat contest leagues were created before
  // we started inserting a fantasy_settings row for them. Create one now so
  // the commissioner edit lands somewhere instead of throwing.
  if (!current) {
    const { data: league } = await supabase
      .from('leagues')
      .select('format')
      .eq('id', leagueId)
      .single()
    const isSingleStatContest = league && ['sacks', 'ints', 'tackles', 'receptions', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point'].includes(league.format)
    if (isSingleStatContest) {
      current = await createFantasySettings(leagueId, { format: league.format })
    }
  }
  const draftDone = current?.draft_status === 'completed'

  if (draftDone) {
    const blocked = Object.keys(updates).filter((k) => PRESEASON_ONLY_FIELDS.has(k))
    if (blocked.length) {
      const err = new Error(`Cannot change ${blocked.join(', ')} after the draft has completed`)
      err.status = 400
      throw err
    }
  }

  // Changing num_teams: validate against allowed counts, current member count,
  // and keep leagues.max_members in sync so joins aren't blocked / over-allowed.
  if (updates.num_teams != null && updates.num_teams !== current?.num_teams) {
    const isTraditional = (current?.format || 'traditional') !== 'salary_cap'
    if (isTraditional && !VALID_FANTASY_TEAM_COUNTS.includes(updates.num_teams)) {
      const err = new Error(`Number of teams must be one of ${VALID_FANTASY_TEAM_COUNTS.join(', ')}`)
      err.status = 400
      throw err
    }
    const { count: memberCount } = await supabase
      .from('league_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
    if (memberCount && updates.num_teams < memberCount) {
      const err = new Error(`Can't shrink below current member count (${memberCount}). Use the resize flow to drop members first.`)
      err.status = 400
      throw err
    }
    const { error: leagueErr } = await supabase
      .from('leagues')
      .update({ max_members: updates.num_teams })
      .eq('id', leagueId)
    if (leagueErr) throw leagueErr
  }

  // If playoff_teams or championship_week is being changed, recompute
  // playoff_start_week from them. Server is authoritative — a client
  // that tries to send playoff_start_week directly is overridden.
  if (updates.playoff_teams != null || updates.championship_week != null) {
    const nextTeams = updates.playoff_teams ?? current?.playoff_teams ?? 4
    const nextChamp = updates.championship_week ?? current?.championship_week ?? 17
    updates.playoff_start_week = derivePlayoffStartWeek(nextTeams, nextChamp)
  } else if (updates.playoff_start_week != null) {
    // Client tried to set it directly without changing teams/champ_week —
    // ignore. Fields it should recompute from didn't change, so no update needed.
    delete updates.playoff_start_week
  }

  const { data, error } = await supabase
    .from('fantasy_settings')
    .update(updates)
    .eq('league_id', leagueId)
    .select()
    .single()

  if (error) throw error

  // If roster_slots changed, normalize every member's roster — orphan slots
  // (e.g. wr3 in a wr=2 league) get demoted to bench and any newly empty
  // starter slot gets back-filled from the bench. Without this step a
  // commissioner shrinking 'wr' from 3 to 2 leaves stranded rows that
  // count toward the cap but don't render anywhere in the UI.
  if (updates.roster_slots) {
    try {
      await normalizeAllRostersForLeague(leagueId)
    } catch (err) {
      logger.error({ err, leagueId }, 'Failed to normalize rosters after roster_slots change')
    }
  }

  // If draft_date changed (first-time set OR reschedule), notify every
  // member. First-time set gets "scheduled" wording; reschedule gets
  // "rescheduled" wording. Skip if the field wasn't in updates at all,
  // or if the value is unchanged, or if being cleared to null.
  if (Object.prototype.hasOwnProperty.call(updates, 'draft_date') && updates.draft_date && updates.draft_date !== current?.draft_date) {
    try {
      const isFirstTime = !current?.draft_date
      const { data: league } = await supabase
        .from('leagues')
        .select('name')
        .eq('id', leagueId)
        .single()
      const { data: members } = await supabase
        .from('league_members')
        .select('user_id')
        .eq('league_id', leagueId)
      // Render in PT (with zone label) so a UTC-hosted server doesn't
      // shift the time forward. Members in other timezones see a labeled
      // PT time — still unambiguous, just requires a mental convert.
      const when = new Date(updates.draft_date).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        timeZone: 'America/Los_Angeles', timeZoneName: 'short',
      })
      const leaguePrefix = league?.name ? `${league.name}: ` : ''
      const message = isFirstTime
        ? `${leaguePrefix}Draft scheduled for ${when}`
        : `${leaguePrefix}Draft rescheduled to ${when}`
      const { createNotification } = await import('./notificationService.js')
      for (const m of members || []) {
        await createNotification(m.user_id, 'fantasy_draft_scheduled', message, {
          leagueId,
          leagueName: league?.name,
          draftDate: updates.draft_date,
          isReschedule: !isFirstTime,
        })
      }
    } catch (err) {
      logger.error({ err, leagueId }, 'Failed to send draft-scheduled notifications')
    }
  }

  return data
}

async function normalizeAllRostersForLeague(leagueId) {
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
  for (const m of members || []) {
    await fillEmptyStarterSlots(leagueId, m.user_id)
  }
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
  const totalRosterSize = Object.entries(rosterSlots).reduce((a, [k, v]) => a + (k === 'ir' ? 0 : v), 0)

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

  // Notify every member that the order has been set, with their slot.
  // Lets people anticipate and look forward to their pick number.
  try {
    const { data: leagueRow } = await supabase
      .from('leagues')
      .select('name')
      .eq('id', leagueId)
      .single()
    const leagueName = leagueRow?.name || 'your league'
    const { createNotification } = await import('./notificationService.js')
    for (let i = 0; i < shuffled.length; i++) {
      const userId = shuffled[i]
      const slot = i + 1
      await createNotification(
        userId,
        'fantasy_draft_order_set',
        `${leagueName} draft order is set — you're picking #${slot} of ${numTeams}.`,
        { leagueId, slot, total: numTeams },
      )
    }
  } catch (err) {
    logger.error({ err, leagueId }, 'Failed to send draft order notifications')
  }

  logger.info({ leagueId, numTeams, totalPicks: picks.length }, 'Draft initialized')
  return { numTeams, totalPicks: picks.length, draftOrder: shuffled }
}

/**
 * Rebuild the draft order + pick slots from a commissioner-supplied
 * ordered array of user_ids. Used for manual reorder AND "randomize
 * again" (client shuffles + sends). Only valid while draft_status is
 * 'pending' — once the draft has started, positions are locked.
 */
export async function reorderDraft(leagueId, commissionerId, order) {
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id, name')
    .eq('id', leagueId)
    .single()
  if (!league || league.commissioner_id !== commissionerId) {
    const err = new Error('Only the commissioner can reorder the draft')
    err.status = 403
    throw err
  }
  const settings = await getFantasySettings(leagueId)
  if (settings?.draft_status !== 'pending') {
    const err = new Error('Draft has already started — order is locked')
    err.status = 400
    throw err
  }
  // Manual reorder is only exposed for offline drafts, where the
  // commissioner may need to enter a real-world randomization (out of
  // a hat, dice, etc.). Live drafts stick with the initial randomize.
  if (settings?.draft_mode !== 'offline') {
    const err = new Error('Manual reorder is only available for offline drafts')
    err.status = 400
    throw err
  }
  if (!Array.isArray(order) || !order.length) {
    const err = new Error('order (array of user_ids) required')
    err.status = 400
    throw err
  }

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)

  const memberSet = new Set((members || []).map((m) => m.user_id))
  const orderSet = new Set(order)
  // Must be a permutation of the current member set — same length, same
  // members, no duplicates. Prevents kicking someone out of the draft or
  // adding a stranger via a hand-crafted payload.
  if (orderSet.size !== order.length) {
    const err = new Error('order contains duplicate user_ids')
    err.status = 400
    throw err
  }
  if (orderSet.size !== memberSet.size || [...orderSet].some((id) => !memberSet.has(id))) {
    const err = new Error('order must contain every league member exactly once')
    err.status = 400
    throw err
  }

  const numTeams = order.length
  const rosterSlots = settings.roster_slots
  const totalRosterSize = Object.entries(rosterSlots).reduce((a, [k, v]) => a + (k === 'ir' ? 0 : v), 0)

  // Rebuild snake picks with the new order
  const picks = []
  let pickNum = 1
  for (let round = 1; round <= totalRosterSize; round++) {
    const isReverse = round % 2 === 0
    const roundOrder = isReverse ? [...order].reverse() : order
    for (const userId of roundOrder) {
      picks.push({
        league_id: leagueId,
        round,
        pick_number: pickNum++,
        user_id: userId,
      })
    }
  }

  await supabase.from('fantasy_draft_picks').delete().eq('league_id', leagueId)
  const { error: insertErr } = await supabase.from('fantasy_draft_picks').insert(picks)
  if (insertErr) throw insertErr

  await supabase
    .from('fantasy_settings')
    .update({ draft_order: order, num_teams: numTeams })
    .eq('league_id', leagueId)

  // Notify each member of their new slot. Reuses fantasy_draft_order_set
  // (already in the notif type constraint from initializeDraft's first
  // fire). Members can silence via notification preferences if the
  // commish is trigger-happy.
  try {
    const leagueName = league?.name || 'your league'
    const { createNotification } = await import('./notificationService.js')
    for (let i = 0; i < order.length; i++) {
      await createNotification(
        order[i],
        'fantasy_draft_order_set',
        `${leagueName} draft order updated — you're now picking #${i + 1} of ${numTeams}.`,
        { leagueId, slot: i + 1, total: numTeams },
      )
    }
  } catch (err) {
    logger.error({ err, leagueId }, 'Failed to send draft-reorder notifications')
  }

  logger.info({ leagueId, numTeams, totalPicks: picks.length }, 'Draft reordered')
  return { numTeams, totalPicks: picks.length, draftOrder: order }
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
    // Generate the regular-season matchup schedule
    try {
      await generateMatchups(leagueId)
    } catch (err) {
      logger.error({ err, leagueId }, 'Failed to generate matchups post-draft')
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
 * Start a draft in offline mode. Commissioner enters all picks manually
 * after an in-person draft. No timers, no autopick.
 */
export async function startOfflineDraft(leagueId, commissionerId) {
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()
  if (!league || league.commissioner_id !== commissionerId) {
    const err = new Error('Only the commissioner can start an offline draft')
    err.status = 403
    throw err
  }

  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('draft_status')
    .eq('league_id', leagueId)
    .single()

  if (settings?.draft_status !== 'pending') {
    const err = new Error('Draft has already been started')
    err.status = 400
    throw err
  }

  // Verify pick slots exist
  const { count } = await supabase
    .from('fantasy_draft_picks')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId)
  if (!count) {
    const err = new Error('Initialize draft order first')
    err.status = 400
    throw err
  }

  await supabase
    .from('fantasy_settings')
    .update({ draft_status: 'in_progress', draft_started_at: new Date().toISOString(), draft_mode: 'offline' })
    .eq('league_id', leagueId)

  return { status: 'in_progress', mode: 'offline' }
}

/**
 * Commissioner undo: revert the most recent draft pick. Removes the player
 * from the roster and clears the pick slot so it can be re-picked.
 */
export async function undoLastDraftPick(leagueId, commissionerId) {
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()
  if (!league || league.commissioner_id !== commissionerId) {
    const err = new Error('Only the commissioner can undo picks')
    err.status = 403
    throw err
  }

  // Find the most recent completed pick
  const { data: lastPick } = await supabase
    .from('fantasy_draft_picks')
    .select('id, player_id, user_id, pick_number')
    .eq('league_id', leagueId)
    .not('player_id', 'is', null)
    .order('pick_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!lastPick) {
    const err = new Error('No picks to undo')
    err.status = 400
    throw err
  }

  // Remove player from roster. Delete is by (league_id, user_id, player_id)
  // not primary key, so verify the row count as a silent-noop guard.
  const { error: rosterDelErr, count: rosterDeletedCount } = await supabase
    .from('fantasy_rosters')
    .delete({ count: 'exact' })
    .eq('league_id', leagueId)
    .eq('user_id', lastPick.user_id)
    .eq('player_id', lastPick.player_id)
  if (rosterDelErr) {
    logger.error({ err: rosterDelErr, leagueId, lastPick }, 'undo draft pick: roster delete failed')
    throw rosterDelErr
  }
  if ((rosterDeletedCount ?? 0) !== 1) {
    logger.error({ leagueId, lastPick, rosterDeletedCount }, 'undo draft pick: expected to delete 1 roster row but did not')
    const err = new Error('Failed to undo the draft pick — refresh and try again')
    err.status = 500
    throw err
  }

  // Clear the pick slot
  await supabase
    .from('fantasy_draft_picks')
    .update({ player_id: null, picked_at: null, is_auto_pick: null })
    .eq('id', lastPick.id)

  // If draft was completed, revert to in_progress
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('draft_status')
    .eq('league_id', leagueId)
    .single()

  if (settings?.draft_status === 'completed') {
    await supabase
      .from('fantasy_settings')
      .update({ draft_status: 'in_progress' })
      .eq('league_id', leagueId)
  }

  return { undone: lastPick }
}

/**
 * After the draft completes, fill every user's starting lineup using
 * DRAFT ORDER: the first player drafted at each position becomes the
 * starter, subsequent picks fall to FLEX (if eligible) or BENCH.
 *
 * Slot count comes from the league's `roster_slots` config so leagues
 * with non-default lineups (e.g., 2WR instead of 3) don't get extra
 * players forced into nonexistent starter slots.
 */
export async function autoFillLineupsForLeague(leagueId) {
  const settings = await getFantasySettings(leagueId)
  const rosterSlots = settings?.roster_slots || { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, k: 1, def: 1, bench: 6 }

  // Build the ordered starter slot plan. Keys must match STARTER_SLOTS_TRAD
  // convention (qb / rb1..rbN / wr1..wrN / te / flex / k / def). FLEX accepts
  // RB/WR/TE; SUPERFLEX (if config has it) additionally accepts QB.
  const starterPlan = []
  if ((rosterSlots.qb || 0) >= 1) starterPlan.push({ key: 'qb', accepts: ['QB'] })
  for (let i = 1; i <= (rosterSlots.rb || 0); i++) starterPlan.push({ key: `rb${i}`, accepts: ['RB'] })
  for (let i = 1; i <= (rosterSlots.wr || 0); i++) starterPlan.push({ key: `wr${i}`, accepts: ['WR'] })
  if ((rosterSlots.te || 0) >= 1) starterPlan.push({ key: 'te', accepts: ['TE'] })
  if ((rosterSlots.flex || 0) >= 1) starterPlan.push({ key: 'flex', accepts: ['RB', 'WR', 'TE'] })
  if ((rosterSlots.superflex || 0) >= 1) starterPlan.push({ key: 'superflex', accepts: ['QB', 'RB', 'WR', 'TE'] })
  if ((rosterSlots.k || 0) >= 1) starterPlan.push({ key: 'k', accepts: ['K'] })
  if ((rosterSlots.def || 0) >= 1) starterPlan.push({ key: 'def', accepts: ['DEF'] })
  // IDP slots — DL accepts the D-line family, LB the linebacker family,
  // DB the corners, S the safeties. Position values mirror what Sleeper
  // stamps on nfl_players.position.
  for (let i = 1; i <= (rosterSlots.dl || 0); i++) starterPlan.push({ key: `dl${i}`, accepts: ['DE', 'DT', 'NT', 'DL'] })
  for (let i = 1; i <= (rosterSlots.lb || 0); i++) starterPlan.push({ key: `lb${i}`, accepts: ['LB', 'ILB', 'OLB', 'MLB'] })
  for (let i = 1; i <= (rosterSlots.db || 0); i++) starterPlan.push({ key: `db${i}`, accepts: ['CB', 'DB'] })
  for (let i = 1; i <= (rosterSlots.s || 0); i++) starterPlan.push({ key: `s${i}`, accepts: ['S', 'FS', 'SS'] })

  // Picks in draft order — earliest pick at each position wins the starter slot.
  const { data: picks } = await supabase
    .from('fantasy_draft_picks')
    .select('user_id, player_id, pick_number, nfl_players(position)')
    .eq('league_id', leagueId)
    .not('player_id', 'is', null)
    .order('pick_number', { ascending: true })

  if (!picks?.length) return

  const { data: rosters } = await supabase
    .from('fantasy_rosters')
    .select('id, user_id, player_id, slot')
    .eq('league_id', leagueId)

  // Map player_id → roster row id so we can update by id later
  const rosterByPlayer = {}
  for (const r of rosters || []) rosterByPlayer[r.player_id] = r

  // Group picks by user, keep draft-order via the picks query above
  const picksByUser = {}
  for (const p of picks) {
    if (!picksByUser[p.user_id]) picksByUser[p.user_id] = []
    picksByUser[p.user_id].push(p)
  }

  let updatedTotal = 0
  for (const [userId, userPicks] of Object.entries(picksByUser)) {
    const slotByKey = {} // key (e.g. 'rb1') → player_id

    for (const pick of userPicks) {
      const pos = pick.nfl_players?.position
      if (!pos) continue
      for (const slotDef of starterPlan) {
        if (!slotDef.accepts.includes(pos)) continue
        if (slotByKey[slotDef.key]) continue
        slotByKey[slotDef.key] = pick.player_id
        break
      }
    }

    // Inverse: player_id → slot
    const slotByPlayer = {}
    for (const [key, playerId] of Object.entries(slotByKey)) slotByPlayer[playerId] = key

    for (const pick of userPicks) {
      const rosterRow = rosterByPlayer[pick.player_id]
      if (!rosterRow) continue
      const newSlot = slotByPlayer[pick.player_id] || 'bench'
      if (newSlot === rosterRow.slot) continue
      const { error } = await supabase
        .from('fantasy_rosters')
        .update({ slot: newSlot })
        .eq('id', rosterRow.id)
      if (error) {
        logger.error({ error, rosterId: rosterRow.id, leagueId, userId, newSlot }, 'Failed to update roster slot')
      } else {
        updatedTotal++
      }
    }
  }

  logger.info({ leagueId, users: Object.keys(picksByUser).length, updated: updatedTotal }, 'Auto-filled post-draft lineups')
}

/**
 * Promote bench-eligible players into any empty starter slots for one
 * user. Used after trades and waiver swaps so vacated lineup slots get
 * refilled instead of sitting empty while new players pile up on the
 * bench — which would otherwise leave the lineup looking incomplete and
 * trip the roster-cap check on the next add.
 */
async function fillEmptyStarterSlots(leagueId, userId) {
  if (!leagueId || !userId) return
  const settings = await getFantasySettings(leagueId)
  const rosterSlots = settings?.roster_slots || { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, k: 1, def: 1, bench: 6 }

  const starterPlan = []
  if ((rosterSlots.qb || 0) >= 1) starterPlan.push({ key: 'qb', accepts: ['QB'] })
  for (let i = 1; i <= (rosterSlots.rb || 0); i++) starterPlan.push({ key: `rb${i}`, accepts: ['RB'] })
  for (let i = 1; i <= (rosterSlots.wr || 0); i++) starterPlan.push({ key: `wr${i}`, accepts: ['WR'] })
  if ((rosterSlots.te || 0) >= 1) starterPlan.push({ key: 'te', accepts: ['TE'] })
  if ((rosterSlots.flex || 0) >= 1) starterPlan.push({ key: 'flex', accepts: ['RB', 'WR', 'TE'] })
  if ((rosterSlots.superflex || 0) >= 1) starterPlan.push({ key: 'superflex', accepts: ['QB', 'RB', 'WR', 'TE'] })
  if ((rosterSlots.k || 0) >= 1) starterPlan.push({ key: 'k', accepts: ['K'] })
  if ((rosterSlots.def || 0) >= 1) starterPlan.push({ key: 'def', accepts: ['DEF'] })
  // IDP slots — DL accepts the D-line family, LB the linebacker family,
  // DB the corners, S the safeties. Position values mirror what Sleeper
  // stamps on nfl_players.position.
  for (let i = 1; i <= (rosterSlots.dl || 0); i++) starterPlan.push({ key: `dl${i}`, accepts: ['DE', 'DT', 'NT', 'DL'] })
  for (let i = 1; i <= (rosterSlots.lb || 0); i++) starterPlan.push({ key: `lb${i}`, accepts: ['LB', 'ILB', 'OLB', 'MLB'] })
  for (let i = 1; i <= (rosterSlots.db || 0); i++) starterPlan.push({ key: `db${i}`, accepts: ['CB', 'DB'] })
  for (let i = 1; i <= (rosterSlots.s || 0); i++) starterPlan.push({ key: `s${i}`, accepts: ['S', 'FS', 'SS'] })
  const starterKeys = new Set(starterPlan.map((s) => s.key))

  const { data: roster } = await supabase
    .from('fantasy_rosters')
    .select('id, slot, player_id, nfl_players(position)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
  if (!roster?.length) return

  // Step 1: demote orphan starter rows. A row counts as orphan if its slot
  // looks starter-shaped (qb/rb*/wr*/te/flex/superflex/k/def) but isn't in
  // the league's current starter plan — e.g. 'wr3' in a wr=2 league after a
  // commissioner shrunk the position count, or after a draft that ran with
  // a different config.
  function isOrphanStarterSlot(slot) {
    if (!slot) return false
    const s = String(slot).toLowerCase()
    if (starterKeys.has(s)) return false
    if (s === 'bench' || s.startsWith('bench')) return false
    if (s === 'ir' || s.startsWith('ir')) return false
    // Slot looks like a starter key (qb / rb1 / wr1 / te / flex / etc.) but
    // isn't valid for this league — orphan.
    return /^(qb|te|flex|superflex|k|def|rb[0-9]+|wr[0-9]+|dl[0-9]+|lb[0-9]+|db[0-9]+|s[0-9]+)$/.test(s)
  }
  for (const r of roster) {
    if (!isOrphanStarterSlot(r.slot)) continue
    const { error } = await supabase
      .from('fantasy_rosters')
      .update({ slot: 'bench' })
      .eq('id', r.id)
    if (error) {
      logger.error({ error, leagueId, userId, oldSlot: r.slot }, 'Failed to demote orphan slot')
      continue
    }
    r.slot = 'bench'
  }

  const filledStarterKeys = new Set(
    roster.filter((r) => starterKeys.has(r.slot)).map((r) => r.slot)
  )

  // Step 2: walk slot plan in priority order; promote the first eligible
  // benched player into each empty starter slot.
  for (const slotDef of starterPlan) {
    if (filledStarterKeys.has(slotDef.key)) continue
    const candidate = roster.find((r) => {
      const pos = r.nfl_players?.position
      if (!pos || !slotDef.accepts.includes(pos)) return false
      if (starterKeys.has(r.slot)) return false // already in another starter slot
      if (r.slot && r.slot.startsWith('ir')) return false // skip IR
      return true
    })
    if (!candidate) continue
    const { error } = await supabase
      .from('fantasy_rosters')
      .update({ slot: slotDef.key })
      .eq('id', candidate.id)
    if (error) {
      logger.error({ error, leagueId, userId, slot: slotDef.key }, 'Failed to promote bench player')
      continue
    }
    candidate.slot = slotDef.key
    filledStarterKeys.add(slotDef.key)
  }
}

/**
 * Auto-pick for a user who missed their timer. Order of preference:
 *   1. The user's in-room draft queue (fantasy_draft_queues)
 *   2. The user's big-board rankings (fantasy_user_rankings — the same
 *      table their Draft Prep / My Rankings board writes to)
 *   3. League-wide ADP fallback (nfl_players.search_rank)
 */
export async function autoDraftPick(leagueId, userId) {
  // Get drafted set
  const { data: draftedIds } = await supabase
    .from('fantasy_draft_picks')
    .select('player_id')
    .eq('league_id', leagueId)
    .not('player_id', 'is', null)

  const drafted = new Set((draftedIds || []).map((d) => d.player_id))

  // 1. Try the user's in-room draft queue first
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

  // 2. Fallback: best available from the user's big-board rankings.
  //    If the league is synced to Draft Prep, the rankings live in
  //    draft_prep_rankings — same branch logic getMyRankings uses.
  if (!pick) {
    const syncInfo = await getLeagueSyncInfo(leagueId, userId)
    let rankingRows = null
    if (syncInfo.isSynced) {
      const { data } = await supabase
        .from('draft_prep_rankings')
        .select('player_id')
        .eq('user_id', userId)
        .eq('roster_config_hash', syncInfo.roster_config_hash)
        .eq('scoring_format', syncInfo.scoring_format)
        .order('rank', { ascending: true })
      rankingRows = data
    } else {
      const { data } = await supabase
        .from('fantasy_user_rankings')
        .select('player_id')
        .eq('league_id', leagueId)
        .eq('user_id', userId)
        .order('rank', { ascending: true })
      rankingRows = data
    }
    for (const r of rankingRows || []) {
      if (!drafted.has(r.player_id)) {
        pick = { id: r.player_id }
        break
      }
    }
  }

  // 3. Fallback: best available by Sleeper search_rank (league-wide ADP)
  if (!pick) {
    const { data: bestAvailable } = await supabase
      .from('nfl_players')
      .select('id')
      .in('position', ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
      .not('team', 'is', null)
      .order('search_rank', { ascending: true })
      .limit(300)
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
 * top 400 active players ordered by the league's scoring projection.
 * Returns a flat ordered list with full player data joined.
 */
const RANKINGS_SEED_SIZE = 400
const SCORING_PROJ_COL = {
  ppr: 'projected_pts_ppr',
  half_ppr: 'projected_pts_half_ppr',
  standard: 'projected_pts_std',
}

async function seedUserRankings(leagueId, userId) {
  const settings = await getFantasySettings(leagueId)
  const scoringFormat = settings?.scoring_format || 'half_ppr'
  const rosterSlots = settings?.roster_slots || {}
  const isSuperflex = (rosterSlots.superflex || 0) > 0 || (rosterSlots.qb || 0) >= 2

  // Pull every draftable player so we can rank them ourselves with the
  // same effective-ADP function the draft player browser uses. This
  // means new league copies seed in the EXACT order the user will see
  // on the draft board (scoring-aware + SuperFlex-aware).
  // DEFs queried separately so they're guaranteed in the pool even though
  // they typically have very high (or null) search_rank values.
  const [offensiveResult, defResult] = await Promise.all([
    supabase
      .from('nfl_players')
      .select('id, position, search_rank, adp_ppr, adp_half_ppr')
      .in('position', ['QB', 'RB', 'WR', 'TE', 'K'])
      .not('team', 'is', null)
      .order('search_rank', { ascending: true, nullsFirst: false })
      .limit(800),
    supabase
      .from('nfl_players')
      .select('id, position, search_rank, adp_ppr, adp_half_ppr')
      .eq('position', 'DEF')
      .not('team', 'is', null),
  ])
  const pool = [...(offensiveResult.data || []), ...(defResult.data || [])]

  if (!pool.length) return

  const ranked = pool
    .map((p) => ({ ...p, _adp: computeEffectiveAdp(p, scoringFormat, isSuperflex) }))
    .sort((a, b) => a._adp - b._adp)
    .slice(0, RANKINGS_SEED_SIZE)

  const rows = ranked.map((p, i) => ({
    league_id: leagueId,
    user_id: userId,
    player_id: p.id,
    rank: i,
  }))
  const { error } = await supabase.from('fantasy_user_rankings').insert(rows)
  if (error) throw error
}

export async function getMyRankings(leagueId, userId) {
  // Check if this league is synced to draft prep
  const syncInfo = await getLeagueSyncInfo(leagueId, userId)
  if (syncInfo.isSynced) {
    const { data, error } = await supabase
      .from('draft_prep_rankings')
      .select('player_id, rank, nfl_players(id, full_name, position, team, headshot_url, injury_status, bye_week, projected_pts_half_ppr, projected_pts_ppr, projected_pts_std, search_rank)')
      .eq('user_id', userId)
      .eq('roster_config_hash', syncInfo.roster_config_hash)
      .eq('scoring_format', syncInfo.scoring_format)
      .order('rank', { ascending: true })
    if (error) throw error
    return data || []
  }

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

  // If synced, write to draft prep rankings (same underlying data)
  const syncInfo = await getLeagueSyncInfo(leagueId, userId)
  if (syncInfo.isSynced) {
    await supabase
      .from('draft_prep_rankings')
      .delete()
      .eq('user_id', userId)
      .eq('roster_config_hash', syncInfo.roster_config_hash)
      .eq('scoring_format', syncInfo.scoring_format)

    if (!playerIds.length) return { count: 0 }
    const rows = playerIds.map((pid, i) => ({
      user_id: userId,
      roster_config_hash: syncInfo.roster_config_hash,
      scoring_format: syncInfo.scoring_format,
      player_id: pid,
      rank: i,
    }))
    const { error } = await supabase.from('draft_prep_rankings').insert(rows)
    if (error) throw error
    return { count: rows.length }
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
  // If synced, reset draft prep rankings instead
  const syncInfo = await getLeagueSyncInfo(leagueId, userId)
  if (syncInfo.isSynced) {
    const { data: settings } = await supabase
      .from('fantasy_settings')
      .select('roster_slots')
      .eq('league_id', leagueId)
      .single()
    const { resetDraftPrepRankings } = await import('./draftPrepService.js')
    await resetDraftPrepRankings(userId, syncInfo.roster_config_hash, syncInfo.scoring_format, settings?.roster_slots)
    return { reset: true }
  }

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
 * Commissioner sets a user's autodraft status.
 * When enabled, the user's picks fire immediately (no timer wait).
 */
export async function setUserAutoDraft(leagueId, userId, enabled) {
  const settings = await getFantasySettings(leagueId)
  if (settings.draft_status !== 'in_progress') {
    const err = new Error('Draft must be in progress')
    err.status = 400
    throw err
  }
  const current = settings.auto_drafting_users || []
  let updated
  if (enabled) {
    updated = current.includes(userId) ? current : [...current, userId]
  } else {
    updated = current.filter((id) => id !== userId)
  }
  await supabase
    .from('fantasy_settings')
    .update({ auto_drafting_users: updated })
    .eq('league_id', leagueId)
  logger.info({ leagueId, userId, enabled }, 'Autodraft status updated')
  return { auto_drafting_users: updated }
}

/**
 * User cancels their own autodraft. Also resets the timer baseline
 * so they get a fresh pick clock if they're currently on the clock.
 */
export async function cancelMyAutoDraft(leagueId, userId) {
  const settings = await getFantasySettings(leagueId)
  if (settings.draft_status !== 'in_progress') {
    const err = new Error('Draft must be in progress')
    err.status = 400
    throw err
  }
  const updated = (settings.auto_drafting_users || []).filter((id) => id !== userId)
  await supabase
    .from('fantasy_settings')
    .update({ auto_drafting_users: updated, draft_resumed_at: new Date().toISOString() })
    .eq('league_id', leagueId)
  logger.info({ leagueId, userId }, 'User cancelled autodraft')
  return { auto_drafting_users: updated }
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
  // Pull league members for the base list (so 0-game teams still show up).
  // final_rank is set by finalizeFantasyChampion and drives the sort order
  // on completed leagues; null for active/open leagues.
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, fantasy_team_name, fantasy_clinched_at, fantasy_eliminated_at, final_rank, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)

  if (!members?.length) return []

  // Detect completed state so we can override the wins-DESC sort with
  // playoff-aware final placement (see the sort branch below).
  const { data: leagueRow } = await supabase
    .from('leagues')
    .select('status')
    .eq('id', leagueId)
    .maybeSingle()
  const isCompleted = leagueRow?.status === 'completed'

  // For salary_cap leagues, sort respects champion_metric. Traditional
  // fantasy uses the H2H record (wins DESC, PF tiebreak) regardless.
  const { data: settingsRow } = await supabase
    .from('fantasy_settings')
    .select('format, champion_metric')
    .eq('league_id', leagueId)
    .maybeSingle()
  const isSalaryCap = settingsRow?.format === 'salary_cap'
  const championMetric = settingsRow?.champion_metric || 'total_points'

  // All matchups for this league, ordered so we can compute streaks
  // chronologically. Paginate for safety — very large leagues with long
  // seasons could approach the 1000-row cap.
  const matchups = await fetchAll(
    supabase
      .from('fantasy_matchups')
      .select('week, home_user_id, away_user_id, home_points, away_points, status')
      .eq('league_id', leagueId)
      .order('week', { ascending: true })
  )

  // Initialize per-user buckets
  const tally = {}
  for (const m of members) {
    tally[m.user_id] = {
      user_id: m.user_id,
      user: m.users,
      fantasy_team_name: m.fantasy_team_name || null,
      fantasy_clinched_at: m.fantasy_clinched_at || null,
      fantasy_eliminated_at: m.fantasy_eliminated_at || null,
      final_rank: m.final_rank || null,
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
    fantasy_team_name: t.fantasy_team_name,
    fantasy_clinched_at: t.fantasy_clinched_at,
    fantasy_eliminated_at: t.fantasy_eliminated_at,
    final_rank: t.final_rank,
    wins: t.wins,
    losses: t.losses,
    ties: t.ties,
    pf: Number(t.pf.toFixed(1)),
    pa: Number(t.pa.toFixed(1)),
    streak: computeStreak(t.results),
    games_played: t.wins + t.losses + t.ties,
  }))

  // Sort. Default cases:
  //   - Completed traditional fantasy: sort by final_rank ASC (playoff-
  //     aware placement set by finalizeFantasyChampion). Members without
  //     a final_rank (shouldn't happen post-finalize, but fall through
  //     safely) drop to the bottom.
  //   - Salary cap w/ total_points metric: PF DESC, wins tiebreak
  //   - Everything else: wins DESC, PF tiebreak
  if (isCompleted && !isSalaryCap) {
    standings.sort((a, b) => {
      const aR = a.final_rank ?? 999
      const bR = b.final_rank ?? 999
      if (aR !== bR) return aR - bR
      // Same-rank fallback (shouldn't happen): wins DESC
      if (b.wins !== a.wins) return b.wins - a.wins
      return b.pf - a.pf
    })
  } else if (isSalaryCap && championMetric === 'total_points') {
    standings.sort((a, b) => {
      if (b.pf !== a.pf) return b.pf - a.pf
      return b.wins - a.wins
    })
  } else {
    standings.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      return b.pf - a.pf
    })
  }

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
  // Exclude season 9999 (reserved for gameday simulator)
  const { data: latestRow } = await supabase
    .from('nfl_player_stats')
    .select('season')
    .eq('player_id', playerId)
    .lt('season', 9999)
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
        'fgm','fga','fgm_0_39','fgm_40_49','fgm_50_plus',
        'fgmiss_0_39','fgmiss_40_49','fgmiss_50_plus','xpm','xpa',
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
 * Auto-randomize draft order 60 minutes before draft if commish hasn't.
 * This lets the draft board preview appear for all members in the final hour.
 */
export async function autoInitializeDraftOrder() {
  const sixtyMinFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const nowIso = new Date().toISOString()

  // Find drafts within 60 minutes that haven't been initialized yet
  const { data: candidates } = await supabase
    .from('fantasy_settings')
    .select('league_id, draft_date')
    .eq('draft_status', 'pending')
    .not('draft_date', 'is', null)
    .lte('draft_date', sixtyMinFromNow)
    .gt('draft_date', nowIso)

  if (!candidates?.length) return 0

  let initialized = 0
  for (const row of candidates) {
    // Check if picks already exist (order already randomized)
    const { count } = await supabase
      .from('fantasy_draft_picks')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', row.league_id)

    if (count > 0) continue // already initialized

    try {
      await initializeDraft(row.league_id)
      logger.info({ leagueId: row.league_id }, 'Auto-initialized draft order at T-60min')
      initialized++
    } catch (err) {
      logger.error({ err, leagueId: row.league_id }, 'Failed to auto-initialize draft order')
    }
  }
  return initialized
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
      // Underfill check before starting. Traditional fantasy only — pull
      // the league's settings + member count to decide whether to proceed.
      const { data: settings } = await supabase
        .from('fantasy_settings')
        .select('format, num_teams')
        .eq('league_id', row.league_id)
        .single()
      if (settings?.format === 'traditional') {
        const { count: memberCount } = await supabase
          .from('league_members')
          .select('id', { count: 'exact', head: true })
          .eq('league_id', row.league_id)
        const underfill = computeFantasyUnderfillState(memberCount || 0, settings.num_teams)
        if (underfill.state === 'below_threshold') {
          logger.warn({ leagueId: row.league_id, memberCount }, 'Scheduled draft: below threshold, auto-canceling league')
          try { await cancelFantasyLeague(row.league_id, { reason: 'underfilled' }) }
          catch (err) { logger.error({ err, leagueId: row.league_id }, 'Auto-cancel failed') }
          continue
        }
        if (underfill.state === 'resizable') {
          logger.warn({ leagueId: row.league_id, memberCount, willResizeTo: underfill.targetEven }, 'Scheduled draft: auto-resizing league')
          try { await resizeFantasyLeague(row.league_id, { reason: 'underfilled' }) }
          catch (err) {
            logger.error({ err, leagueId: row.league_id }, 'Auto-resize failed — skipping draft start')
            continue
          }
        }
      }

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
    .select('league_id, draft_pick_timer, draft_started_at, draft_resumed_at, draft_mode, auto_drafting_users')
    .eq('draft_status', 'in_progress')

  if (!liveDrafts?.length) return 0

  let autopicks = 0
  for (const d of liveDrafts) {
    // Skip offline drafts — commissioner enters picks manually, no timer
    if (d.draft_mode === 'offline') continue
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

      // If on-the-clock user is flagged as auto-drafting, pick immediately (no timer wait)
      if ((d.auto_drafting_users || []).includes(nextPick.user_id)) {
        logger.info({ leagueId: d.league_id, userId: nextPick.user_id, pickNumber: nextPick.pick_number }, 'Auto-drafting user on clock — instant pick')
        await autoDraftPick(d.league_id, nextPick.user_id)
        autopicks++
        continue
      }

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
 * Valid traditional fantasy team counts. Anything else is "underfilled" and
 * the commish gets pinged. The auto-action will resize down to the closest
 * valid count >= 6 by dropping the most recent signups.
 */
export const VALID_FANTASY_TEAM_COUNTS = [6, 8, 10, 12, 14, 16, 20]
export const MIN_FANTASY_TEAMS = 6

/**
 * Computes the underfill state for a traditional fantasy league:
 *   - 'ok'              → member count is in VALID_FANTASY_TEAM_COUNTS and matches num_teams
 *   - 'resizable'       → member count >= 6 but doesn't match num_teams or is odd; auto-resizable
 *   - 'below_threshold' → member count < 6; can only be cancelled or wait
 *
 * Returns { state, currentCount, targetEven, willDrop }
 *   targetEven  = the closest valid even count <= currentCount (snapped down)
 *   willDrop    = how many recent members the auto-action would drop
 */
export function computeFantasyUnderfillState(currentCount, numTeams) {
  if (currentCount < MIN_FANTASY_TEAMS) {
    return { state: 'below_threshold', currentCount, targetEven: null, willDrop: 0 }
  }
  // Snap down to the largest valid count that is <= currentCount
  const targetEven = [...VALID_FANTASY_TEAM_COUNTS]
    .filter((n) => n <= currentCount)
    .pop() ?? MIN_FANTASY_TEAMS
  if (currentCount === targetEven && currentCount === numTeams) {
    return { state: 'ok', currentCount, targetEven, willDrop: 0 }
  }
  return {
    state: 'resizable',
    currentCount,
    targetEven,
    willDrop: currentCount - targetEven,
  }
}

/**
 * Underfill notification cron. Runs every tick, finds traditional fantasy
 * leagues with a draft_date in the next 3 days that don't have a valid
 * member count, and sends the commish an alert at three windows:
 *
 *   T-3 days (and any time before that within the 3-day window)
 *   T-1 day  (only if not yet resolved)
 *   T-10 min (last warning)
 *
 * Each window is gated by a timestamp on fantasy_settings so the commish
 * doesn't get spammed. If the league is resolved (member count valid),
 * we leave the timestamps alone in case it goes underfilled again.
 */
export async function processFantasyUnderfillNotifications() {
  const now = Date.now()
  const threeDaysOut = new Date(now + 3 * 86400000).toISOString()

  const { data: candidates } = await supabase
    .from('fantasy_settings')
    .select('league_id, draft_date, num_teams, format, underfill_notified_3d_at, underfill_notified_1d_at, underfill_notified_10m_at, leagues!inner(name, visibility, commissioner_id, status)')
    .eq('format', 'traditional')
    .eq('draft_status', 'pending')
    .not('draft_date', 'is', null)
    .lte('draft_date', threeDaysOut)
  if (!candidates?.length) return 0

  let sent = 0
  for (const row of candidates) {
    try {
      const draftAt = new Date(row.draft_date).getTime()
      const msUntil = draftAt - now
      // Skip leagues whose draft already passed (handled by scheduled-start)
      if (msUntil < -60 * 1000) continue
      // Skip cancelled / completed leagues
      if (row.leagues?.status && !['open', 'active'].includes(row.leagues.status)) continue

      const { count: memberCount } = await supabase
        .from('league_members')
        .select('id', { count: 'exact', head: true })
        .eq('league_id', row.league_id)
      const state = computeFantasyUnderfillState(memberCount || 0, row.num_teams)
      if (state.state === 'ok') continue

      const commishId = row.leagues?.commissioner_id
      const leagueName = row.leagues?.name || 'your league'
      if (!commishId) continue

      // Decide which window we're in and whether we've already sent it
      let window = null
      let columnToStamp = null
      const ONE_DAY = 86400000
      const TEN_MIN = 10 * 60 * 1000
      if (msUntil > ONE_DAY && !row.underfill_notified_3d_at) {
        window = '3d'; columnToStamp = 'underfill_notified_3d_at'
      } else if (msUntil > TEN_MIN && msUntil <= ONE_DAY && !row.underfill_notified_1d_at) {
        window = '1d'; columnToStamp = 'underfill_notified_1d_at'
      } else if (msUntil <= TEN_MIN && !row.underfill_notified_10m_at) {
        window = '10m'; columnToStamp = 'underfill_notified_10m_at'
      }
      if (!window) continue

      const { createNotification } = await import('./notificationService.js')
      const headline =
        window === '10m' ? `URGENT: ${leagueName} draft starts in ~10 min and isn't full`
        : window === '1d' ? `${leagueName} draft is tomorrow and the league isn't full`
        : `${leagueName} is underfilled — your draft is in 3 days`

      const body = state.state === 'below_threshold'
        ? `Only ${memberCount} of ${row.num_teams} have joined. IKB doesn't run traditional fantasy leagues with fewer than 6 members. Postpone the draft to give people more time to join, and make sure the league is set to open so anyone on IKB can join. Let’s prevent having to cancel.`
        : `Only ${memberCount} of ${row.num_teams} have joined. You can resize the league down to ${state.targetEven} (drops the ${state.willDrop} most recent signup${state.willDrop === 1 ? '' : 's'}), postpone the draft, or cancel.`

      await createNotification(commishId, 'fantasy_league_underfilled', `${headline}. ${body}`, {
        leagueId: row.league_id,
        currentCount: memberCount,
        targetCount: row.num_teams,
        state: state.state,
        willResizeTo: state.targetEven,
      })

      await supabase
        .from('fantasy_settings')
        .update({ [columnToStamp]: new Date().toISOString() })
        .eq('league_id', row.league_id)

      sent++
    } catch (err) {
      logger.error({ err, leagueId: row.league_id }, 'Underfill notification failed')
    }
  }
  return sent
}

/**
 * Auto-cancel traditional fantasy leagues that have no draft date AND are
 * underfilled (< 6 members) once the NFL season has started (any Week 1
 * game is live or final).
 *
 * Safety: only cancels leagues where ALL of these are true:
 *   1. format = 'traditional'
 *   2. draft_status = 'pending' (never drafted)
 *   3. draft_date IS NULL
 *   4. member count < 6
 *   5. At least one NFL Week 1 game is live or final
 */
export async function autoCancelDatelessUnderfilled() {
  // Check if NFL season has started — any Week 1 game live or final
  const { data: sportRow } = await supabase
    .from('sports')
    .select('id')
    .eq('key', 'americanfootball_nfl')
    .single()
  if (!sportRow) return 0

  // Look for a Week 1 game that has started. We check the games table
  // for NFL games with status live/final in the current season's early window.
  // Since we don't store "week" on the games table, check if ANY NFL game is
  // live or final in the last 7 days (covers the first week of games).
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count: startedGames } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .eq('sport_id', sportRow.id)
    .in('status', ['live', 'final'])
    .gte('starts_at', sevenDaysAgo)
  if (!startedGames) return 0

  // Find all traditional fantasy leagues with no draft date, still pending
  const { data: candidates } = await supabase
    .from('fantasy_settings')
    .select('league_id, num_teams, leagues!inner(status)')
    .eq('format', 'traditional')
    .eq('draft_status', 'pending')
    .is('draft_date', null)
  if (!candidates?.length) return 0

  let canceled = 0
  for (const row of candidates) {
    if (row.leagues?.status && !['open', 'active'].includes(row.leagues.status)) continue

    const { count: memberCount } = await supabase
      .from('league_members')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', row.league_id)

    if ((memberCount || 0) >= MIN_FANTASY_TEAMS) continue

    // All 5 conditions met — safe to cancel
    logger.info({ leagueId: row.league_id, memberCount }, 'Auto-canceling dateless underfilled league — NFL season has started')
    try {
      await cancelFantasyLeague(row.league_id, { reason: 'underfilled_season_started' })
      canceled++
    } catch (err) {
      logger.error({ err, leagueId: row.league_id }, 'Failed to auto-cancel dateless underfilled league')
    }
  }
  return canceled
}

/**
 * Drop the most recent signups from a fantasy league until the member count
 * matches the closest valid even number (>= 6). Updates fantasy_settings.
 * num_teams to match. Sends `fantasy_league_member_dropped` notifications to
 * removed users and `fantasy_league_resized` notifications to survivors.
 *
 * No-ops if the league is already valid. Returns { dropped, newSize, dropped_user_ids }.
 */
export async function resizeFantasyLeague(leagueId, options = {}) {
  const { reason = 'underfilled' } = options
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('league_id, num_teams, format, draft_status')
    .eq('league_id', leagueId)
    .single()
  if (!settings || settings.format !== 'traditional') {
    const err = new Error('Only traditional fantasy leagues can be resized')
    err.status = 400
    throw err
  }
  // Resize can only run before rosters exist. Post-draft, dropping a member
  // would orphan their fantasy_rosters rows (no code path here cleans them
  // up + returns their players to the pool). If mid-season member removal
  // is ever needed, build a separate flow that also handles roster cleanup.
  if (settings.draft_status === 'completed') {
    const err = new Error('Cannot resize a league after the draft has completed')
    err.status = 400
    throw err
  }

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, role, joined_at, created_at')
    .eq('league_id', leagueId)
    .order('joined_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
  const list = members || []
  const state = computeFantasyUnderfillState(list.length, settings.num_teams)
  if (state.state === 'ok') return { dropped: 0, newSize: list.length, dropped_user_ids: [] }
  if (state.state === 'below_threshold') {
    const err = new Error('Cannot resize a league with fewer than 6 members — cancel instead')
    err.status = 400
    throw err
  }

  // Drop the LAST N members (most recent signups). Never drop the
  // commissioner — protect them at index 0.
  const willDrop = state.willDrop
  const sortedByRecency = [...list].reverse() // most recent first
  const dropTargets = []
  for (const m of sortedByRecency) {
    if (dropTargets.length >= willDrop) break
    if (m.role === 'commissioner') continue
    dropTargets.push(m.user_id)
  }
  if (!dropTargets.length) {
    return { dropped: 0, newSize: list.length, dropped_user_ids: [] }
  }

  // Get league name for notification text
  const { data: league } = await supabase
    .from('leagues')
    .select('name')
    .eq('id', leagueId)
    .single()
  const leagueName = league?.name || 'your league'

  // Remove the dropped members
  await supabase
    .from('league_members')
    .delete()
    .in('user_id', dropTargets)
    .eq('league_id', leagueId)

  // Update num_teams + max_members to the new size
  const newSize = state.targetEven
  await supabase
    .from('fantasy_settings')
    .update({ num_teams: newSize })
    .eq('league_id', leagueId)
  await supabase
    .from('leagues')
    .update({ max_members: newSize })
    .eq('id', leagueId)

  // Notify dropped users — deep link to /leagues so they can join another
  const { createNotification } = await import('./notificationService.js')
  for (const uid of dropTargets) {
    try {
      await createNotification(
        uid,
        'fantasy_league_member_dropped',
        `${leagueName} didn't get enough sign-ups and had to shrink. Because you were the most recent to join, you were removed. Try joining another open fantasy league!`,
        { leagueId, leagueName, reason },
      )
    } catch (err) { logger.error({ err, uid }, 'dropped notification failed') }
  }

  // Notify surviving members of the resize
  const survivors = list.filter((m) => !dropTargets.includes(m.user_id))
  for (const m of survivors) {
    try {
      await createNotification(
        m.user_id,
        'fantasy_league_resized',
        `${leagueName} was resized to ${newSize} teams because not enough people joined.`,
        { leagueId, newSize },
      )
    } catch (err) { logger.error({ err, uid: m.user_id }, 'resize notification failed') }
  }

  logger.info({ leagueId, dropped: dropTargets.length, newSize }, 'Fantasy league resized')
  return { dropped: dropTargets.length, newSize, dropped_user_ids: dropTargets }
}

/**
 * Cancel a fantasy league. Notifies every member with the cancel reason
 * and a nudge to join a salary cap league instead. Then deletes the league
 * (cascade removes settings, rosters, draft picks, etc.).
 *
 * No commissioner check — caller is responsible for authorization.
 */
export async function cancelFantasyLeague(leagueId, options = {}) {
  const { reason = 'underfilled' } = options
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, format')
    .eq('id', leagueId)
    .single()
  if (!league) return { canceled: false }

  const { data: members } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
  const memberIds = (members || []).map((m) => m.user_id)

  const { createNotification } = await import('./notificationService.js')
  const message = reason === 'underfilled'
    ? `${league.name} was canceled because fewer than 6 people joined. IKB doesn't run traditional fantasy leagues that small. Try a Weekly Salary Cap fantasy league instead — fresh lineup every week, no roster commitment.`
    : `${league.name} was canceled by the commissioner.`
  for (const uid of memberIds) {
    try {
      await createNotification(uid, 'fantasy_league_canceled', message, { leagueName: league.name, reason })
    } catch (err) { logger.error({ err, uid }, 'cancel notification failed') }
  }

  // Delete the league (cascades to fantasy_settings, rosters, picks, etc.)
  await supabase.from('leagues').delete().eq('id', leagueId)
  logger.info({ leagueId, reason, members: memberIds.length }, 'Fantasy league canceled')
  return { canceled: true, notified: memberIds.length }
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
      await processFantasyUnderfillNotifications()
    } catch (err) {
      logger.error({ err }, 'Fantasy underfill notification tick error')
    }
    try {
      await autoCancelDatelessUnderfilled()
    } catch (err) {
      logger.error({ err }, 'Dateless underfill auto-cancel tick error')
    }
    try {
      await autoInitializeDraftOrder()
    } catch (err) {
      logger.error({ err }, 'Auto-initialize draft order tick error')
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
  const rows = data || []
  if (!rows.length) return rows

  // Overlay admin position overrides (e.g. Micah Parsons → "LB/DL")
  // so hybrid IDPs get dual-slot eligibility in the client. Silently
  // no-op for players without an override.
  const overrideMap = await loadNflPositionOverrides()
  for (const r of rows) applyNflPositionOverride(r, overrideMap)

  // Enrich with live current-week fantasy points so the My Team view can
  // show running totals during games. We compute using the league's own
  // scoring rules (or preset) so the points match what the user will see
  // on the live matchup page.
  try {
    const { getCurrentNflWeek } = await import('./tdPassService.js')
    const { season, week } = await getCurrentNflWeek()
    const { data: settings } = await supabase
      .from('fantasy_settings')
      .select('scoring_format, scoring_rules')
      .eq('league_id', leagueId)
      .single()
    const rules = settings?.scoring_rules || buildScoringRulesFromPreset(settings?.scoring_format)
    const playerIds = rows.map((r) => r.player_id).filter(Boolean)
    if (playerIds.length) {
      const { data: stats } = await supabase
        .from('nfl_player_stats')
        .select('player_id, pass_att, pass_cmp, pass_yd, pass_td, pass_int, rush_att, rush_yd, rush_td, rec, rec_yd, rec_td, rec_tgt, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, fgmiss_0_39, fgmiss_40_49, fgmiss_50_plus, xpm, xpa, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed, idp_tkl_solo, idp_tkl_ast, idp_tkl_loss, idp_sack, idp_int, idp_pass_def, idp_qb_hit, idp_ff, idp_fum_rec')
        .eq('week', week)
        .eq('season', season)
        .in('player_id', playerIds)
      const ptsByPlayer = {}
      const statsByPlayer = {}
      for (const st of stats || []) {
        ptsByPlayer[st.player_id] = Math.round(applyScoringRules(st, rules) * 100) / 100
        // fgm is a derived field that the client stat-line formatter expects
        statsByPlayer[st.player_id] = {
          ...st,
          fgm: (st.fgm_0_39 || 0) + (st.fgm_40_49 || 0) + (st.fgm_50_plus || 0),
        }
      }
      for (const r of rows) {
        r.live_points = ptsByPlayer[r.player_id] ?? 0
        r.week_stats = statsByPlayer[r.player_id] || null
        r.live_week = week
      }

      // Weekly Sleeper projection for this (season, week) — drives the
      // Set Lineup sit/start view. Zero for bye-week players. IDP
      // defenders get points computed via applyScoringRules over raw
      // idp_* stat projections so they don't show as 0 in IDP leagues.
      const projCol = settings?.scoring_format === 'ppr' ? 'pts_ppr'
        : settings?.scoring_format === 'standard' ? 'pts_std'
        : 'pts_half_ppr'
      const { data: projRows } = await supabase
        .from('nfl_player_projections')
        .select(`player_id, ${projCol}, idp_sack, idp_int, idp_tkl_solo, idp_tkl_ast, idp_tkl_loss, idp_pass_def, idp_qb_hit, idp_ff, idp_fum_rec`)
        .eq('season', season)
        .eq('week', week)
        .in('player_id', playerIds)
      const projRowByPlayer = {}
      for (const p of projRows || []) projRowByPlayer[p.player_id] = p
      for (const r of rows) {
        const onBye = r.nfl_players?.bye_week === week
        const computed = computeIdpAwareProjection(projRowByPlayer[r.player_id], r.nfl_players?.position, projCol, rules)
        r.weekly_projection = onBye ? 0 : (computed != null ? Math.round(computed * 10) / 10 : null)
      }
    }
  } catch (err) {
    logger.warn({ err, leagueId, userId }, 'Failed to enrich roster with live points')
  }

  // Enrich with cumulative season stats + total season fantasy points
  try {
    const { data: settings } = await supabase
      .from('fantasy_settings')
      .select('scoring_format, scoring_rules, season')
      .eq('league_id', leagueId)
      .single()
    const season = settings?.season || new Date().getFullYear()
    const rules = settings?.scoring_rules || buildScoringRulesFromPreset(settings?.scoring_format)
    const playerIds = rows.map((r) => r.player_id).filter(Boolean)
    if (playerIds.length) {
      const { data: allStats } = await supabase
        .from('nfl_player_stats')
        .select('player_id, pass_att, pass_cmp, pass_yd, pass_td, pass_int, rush_att, rush_yd, rush_td, rec, rec_yd, rec_td, rec_tgt, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, fgmiss_0_39, fgmiss_40_49, fgmiss_50_plus, xpm, xpa, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed, idp_tkl_solo, idp_tkl_ast, idp_tkl_loss, idp_sack, idp_int, idp_pass_def, idp_qb_hit, idp_ff, idp_fum_rec')
        .eq('season', season)
        .in('player_id', playerIds)
      const agg = {}
      const seasonPts = {}
      for (const st of allStats || []) {
        if (!agg[st.player_id]) agg[st.player_id] = {}
        const a = agg[st.player_id]
        for (const key of Object.keys(st)) {
          if (key === 'player_id') continue
          a[key] = (a[key] || 0) + (Number(st[key]) || 0)
        }
        // Accumulate per-week fantasy points using league scoring rules
        seasonPts[st.player_id] = (seasonPts[st.player_id] || 0) + applyScoringRules(st, rules)
      }
      // Compute fgm from component fields
      for (const pid of Object.keys(agg)) {
        agg[pid].fgm = (agg[pid].fgm_0_39 || 0) + (agg[pid].fgm_40_49 || 0) + (agg[pid].fgm_50_plus || 0)
      }
      for (const r of rows) {
        r.season_stats = agg[r.player_id] || null
        r.season_points = seasonPts[r.player_id] != null ? Math.round(seasonPts[r.player_id] * 100) / 100 : null
      }
    }
  } catch (err) {
    logger.warn({ err, leagueId, userId }, 'Failed to enrich roster with season stats')
  }

  // Current-week opponent for each player. Drives the "vs MIA" / "@ MIA"
  // marker on the My Team row so users can see who their starters face
  // before kickoff. Null opponent (when the map IS populated) = bye week
  // for that team. We deliberately leave the field undefined when the map
  // is empty (offseason / no schedule loaded) so the client can tell
  // "data not available" apart from "actually on bye" and not flag
  // every player as BYE during the offseason.
  try {
    const { getCurrentNflWeek } = await import('./tdPassService.js')
    const { season: curSeason, week: curWeek } = await getCurrentNflWeek()
    const oppMap = await getCurrentWeekMatchupMap(curSeason, curWeek)
    if (oppMap.size > 0) {
      for (const r of rows) {
        const team = r.nfl_players?.team
        const matchup = team ? oppMap.get(team) : null
        r.current_week_opponent = matchup?.opponent || null
        r.current_week_is_home = matchup?.is_home ?? null
      }
    }
  } catch (err) {
    logger.warn({ err, leagueId, userId }, 'Failed to enrich roster with current-week opponent')
  }

  return rows
}

/**
 * Build a Map<team_abbr, { opponent, is_home }> for one NFL week from the
 * Sleeper-sourced nfl_schedule. Teams on bye that week are absent from
 * the map (the caller can render BYE for them). Used by both getRoster
 * and searchAvailablePlayers so the My Team row, the Available Players
 * row, and the matchup view all surface the same opponent info pre-
 * kickoff — without needing the live-scoreboard call.
 */
async function getCurrentWeekMatchupMap(season, week) {
  if (!season || !week) return new Map()
  const { data: rows } = await supabase
    .from('nfl_schedule')
    .select('home_team, away_team')
    .eq('season', season)
    .eq('week', week)
  const map = new Map()
  for (const row of rows || []) {
    if (row.home_team) map.set(row.home_team, { opponent: row.away_team, is_home: true })
    if (row.away_team) map.set(row.away_team, { opponent: row.home_team, is_home: false })
  }
  return map
}

/**
 * Search available players (not on any roster in this league).
 */
// Stat columns we expose for sorting in the available-players browse
const STAT_COLUMNS = [
  'pts', 'pass_yd', 'pass_td', 'pass_int', 'rush_att', 'rush_yd', 'rush_td',
  'rec_tgt', 'rec', 'rec_yd', 'rec_td', 'fum_lost', 'fgm', 'xpm',
  // IDP stat columns for sort support in IDP leagues
  'idp_tkl_solo', 'idp_tkl_ast', 'idp_tkl_loss', 'idp_sack', 'idp_int',
  'idp_pass_def', 'idp_ff', 'idp_fum_rec',
]

// Roll granular NFL position codes up into fantasy-slot families so
// UI filters, stat displays, and roster-slot matching can work on a
// single canonical value. DE / DT / NT collapse to DL; ILB / OLB /
// MLB collapse to LB; CB collapses to DB; FS / SS collapse to S.
// Non-defender positions pass through unchanged.
//
// Dual-eligibility: an admin override of "LB/DL" (or "DE/LB", etc.)
// splits on "/", maps each part, and joins the unique family results
// back with "/". Enables hybrid edge / off-ball players (Micah Parsons
// types) to slot at either family. Order preserved for stable display.
function normalizeSinglePosition(pos) {
  if (pos === 'DE' || pos === 'DT' || pos === 'NT') return 'DL'
  if (pos === 'ILB' || pos === 'OLB' || pos === 'MLB') return 'LB'
  if (pos === 'CB') return 'DB'
  if (pos === 'FS' || pos === 'SS') return 'S'
  return pos
}
function normalizePosition(pos) {
  if (!pos || !pos.includes('/')) return normalizeSinglePosition(pos)
  const parts = pos.split('/').map((p) => normalizeSinglePosition(p.trim())).filter(Boolean)
  const seen = new Set()
  const dedup = []
  for (const p of parts) { if (!seen.has(p)) { seen.add(p); dedup.push(p) } }
  return dedup.join('/')
}

const IDP_FAMILIES = new Set(['DL', 'LB', 'DB', 'S'])

// Split-aware position eligibility for a slot. Handles dual-position
// admin overrides like "LB/DL" (either family is eligible). Mirrors the
// client's isPositionEligibleForSlot in FantasyMyTeam.jsx so client and
// server agree on which slots a hybrid player can fill.
function isPositionEligibleForSlot(playerPosition, slotAllowed) {
  if (!playerPosition || !slotAllowed) return false
  const parts = playerPosition.split('/').map((p) => p.trim()).filter(Boolean)
  return parts.some((p) => slotAllowed.includes(p))
}

// Fetch admin position overrides keyed by lowercased full_name so a
// caller can overlay them onto nfl_players rows. The overrides table
// is name-keyed (not id-keyed) because it's shared with DFS services
// that historically matched by name.
async function loadNflPositionOverrides() {
  const { data } = await supabase
    .from('player_position_overrides')
    .select('player_name, position, sport_key')
    .eq('sport_key', 'americanfootball_nfl')
  const map = {}
  for (const o of data || []) {
    if (o.player_name && o.position) map[o.player_name.toLowerCase()] = o.position
  }
  return map
}

// Overlay one player's override onto their position field. Safe to
// call with a row that lacks full_name (no-op).
function applyNflPositionOverride(row, overrideMap) {
  if (!row || !overrideMap) return row
  const name = row.full_name || row.nfl_players?.full_name
  if (!name) return row
  const override = overrideMap[name.toLowerCase()]
  if (!override) return row
  if (row.position !== undefined) row.position = override
  if (row.nfl_players?.position !== undefined) row.nfl_players.position = override
  return row
}

export async function searchAvailablePlayers(leagueId, query, position = null, sort = null) {
  // Read league settings first — we need draft_status to decide whether to
  // exclude drafted-but-not-yet-rostered players (only meaningful during a
  // live draft).
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('scoring_format, roster_slots, draft_status, season, format, season_type, single_week')
    .eq('league_id', leagueId)
    .single()

  // Get all rostered player IDs
  const { data: rostered } = await supabase
    .from('fantasy_rosters')
    .select('player_id')
    .eq('league_id', leagueId)

  const rosteredIds = (rostered || []).map((r) => r.player_id)

  // Also exclude drafted players — but ONLY while the draft is in progress.
  // fantasy_draft_picks rows persist forever with the picked player_id, so
  // once the draft is complete this filter would hide any drafted player
  // who's since been dropped (via free-agent swap, trade drop, or waivers),
  // making them invisible in "available players". Post-draft, rosteredIds
  // is the authoritative source.
  let draftedIds = []
  if (settings?.draft_status && settings.draft_status !== 'completed') {
    const { data: drafted } = await supabase
      .from('fantasy_draft_picks')
      .select('player_id')
      .eq('league_id', leagueId)
      .not('player_id', 'is', null)
    draftedIds = (drafted || []).map((d) => d.player_id)
  }
  const excludeIds = [...new Set([...rosteredIds, ...draftedIds])]
  const scoringFormat = settings?.scoring_format || 'half_ppr'
  const rosterSlots = settings?.roster_slots || {}
  const isSuperflex = (rosterSlots.superflex || 0) > 0 || (rosterSlots.qb || 0) >= 2

  // Salary cap "This Week" leagues: the player pool collapses to only
  // teams whose game IS this week AND hasn't kicked off yet. Bye-week
  // teams disappear (they're not in the week's schedule at all),
  // already-kicked-off teams disappear (their lock has tripped).
  // Built once here and applied as a post-rank filter so ADP / overall
  // ranks still reflect the full draftable pool, not the truncated slice.
  let salaryCapWeekFilter = null
  if (settings?.format === 'salary_cap' && settings?.season_type === 'single_week' && settings?.single_week && settings?.season) {
    const wk = settings.single_week
    const seasonYear = settings.season
    const { data: schedRows } = await supabase
      .from('nfl_schedule')
      .select('home_team, away_team, game_date')
      .eq('season', seasonYear)
      .eq('week', wk)
    const teamsThisWeek = new Set()
    const dates = new Set()
    for (const s of schedRows || []) {
      if (s.home_team) teamsThisWeek.add(s.home_team)
      if (s.away_team) teamsThisWeek.add(s.away_team)
      if (s.game_date) dates.add(s.game_date)
    }
    // Lift kickoff timestamps from games table to determine which
    // teams have already started.
    const kickedOff = new Set()
    const sortedDates = [...dates].sort()
    if (sortedDates.length) {
      const { data: nflSport } = await supabase
        .from('sports')
        .select('id')
        .eq('key', 'americanfootball_nfl')
        .single()
      if (nflSport?.id) {
        const minDate = sortedDates[0]
        const maxDate = sortedDates[sortedDates.length - 1]
        const nowIso = new Date().toISOString()
        const { data: kicked } = await supabase
          .from('games')
          .select('home_team, away_team, starts_at')
          .eq('sport_id', nflSport.id)
          .gte('starts_at', `${minDate}T00:00:00Z`)
          .lt('starts_at', `${maxDate}T23:59:59Z`)
          .lte('starts_at', nowIso)
        for (const g of kicked || []) {
          // games table uses full team names; map to Sleeper abbrev
          const home = NFL_FULL_TO_ABBR[g.home_team]
          const away = NFL_FULL_TO_ABBR[g.away_team]
          if (home) kickedOff.add(home)
          if (away) kickedOff.add(away)
        }
      }
    }
    // Eligible teams = playing this week AND not yet kicked off
    salaryCapWeekFilter = new Set(
      [...teamsThisWeek].filter((t) => !kickedOff.has(t))
    )
  }

  // Pull the full draftable pool — we need to compute overall + positional
  // ranks across the entire available list, NOT just the post-filter slice.
  // (Drops status='Active' filter so DEFs are included.)
  // Parallel queries so all 32 defenses are guaranteed in the pool — a
  // unified query with limit 500 + ADP sort would sink DEFs (which all
  // default to _adp=9999) below the slice cutoff and leave them out.
  // IDP slots add a 4th branch so defensive individuals show up in the
  // draft pool for leagues that have LB/DL/DB/S configured.
  const hasIdp = (rosterSlots.lb || 0) + (rosterSlots.dl || 0)
    + (rosterSlots.db || 0) + (rosterSlots.s || 0) > 0
  const PLAYER_SELECT = 'id, full_name, position, team, headshot_url, search_rank, injury_status, projected_pts_half_ppr, bye_week, adp_ppr, adp_half_ppr'
  const idpQuery = hasIdp
    ? supabase
        .from('nfl_players')
        .select(PLAYER_SELECT)
        .in('position', ['DE', 'DT', 'NT', 'DL', 'LB', 'ILB', 'OLB', 'MLB', 'CB', 'S', 'FS', 'SS', 'DB'])
        .not('team', 'is', null)
        .order('search_rank', { ascending: true, nullsFirst: false })
        .limit(500)
    : Promise.resolve({ data: [], error: null })
  const [offensiveRes, kickerRes, defRes, idpRes] = await Promise.all([
    supabase
      .from('nfl_players')
      .select(PLAYER_SELECT)
      .in('position', ['QB', 'RB', 'WR', 'TE'])
      .not('team', 'is', null)
      .order('search_rank', { ascending: true, nullsFirst: false })
      .limit(800),
    supabase
      .from('nfl_players')
      .select(PLAYER_SELECT)
      .eq('position', 'K')
      .not('team', 'is', null),
    supabase
      .from('nfl_players')
      .select(PLAYER_SELECT)
      .eq('position', 'DEF')
      .not('team', 'is', null),
    idpQuery,
  ])
  if (offensiveRes.error) throw offensiveRes.error
  if (kickerRes.error) throw kickerRes.error
  if (defRes.error) throw defRes.error
  if (idpRes.error) throw idpRes.error
  const allPlayers = [
    ...(offensiveRes.data || []),
    ...(kickerRes.data || []),
    ...(defRes.data || []),
    ...(idpRes.data || []),
  ]
  const error = null

  // Overlay admin position overrides before anything downstream reads
  // .position — including the IDP family split, per-position rank
  // counter, filter matching, and the returned player rows.
  const overrideMap = await loadNflPositionOverrides()
  for (const p of allPlayers) applyNflPositionOverride(p, overrideMap)

  // YTD aggregate stats for browse + sorting.
  // Pre-draft: show last season's stats so users can evaluate players.
  // Post-draft: show current season stats (zeros until games start).
  const season = settings?.season || new Date().getUTCFullYear()
  const draftDone = settings?.draft_status === 'completed' || settings?.draft_status === 'in_progress'
  const statSeason = draftDone ? season : season - 1
  const pointsCol = scoringFormat === 'ppr' ? 'pts_ppr' : scoringFormat === 'standard' ? 'pts_std' : 'pts_half_ppr'
  const statRows = await fetchAll(
    supabase
      .from('nfl_player_stats')
      .select(`player_id, ${pointsCol}, pass_yd, pass_td, pass_int, rush_att, rush_yd, rush_td, rec_tgt, rec, rec_yd, rec_td, fum_lost, fgm, xpm, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed, idp_tkl_solo, idp_tkl_ast, idp_tkl_loss, idp_sack, idp_int, idp_pass_def, idp_ff, idp_fum_rec, idp_qb_hit`)
      .eq('season', statSeason)
  )
  // statsByPlayer[id] = { pts, pass_yd, pass_td, ... }
  const statsByPlayer = {}
  for (const r of statRows || []) {
    const acc = statsByPlayer[r.player_id] || {
      pts: 0, pass_yd: 0, pass_td: 0, pass_int: 0, rush_att: 0, rush_yd: 0, rush_td: 0,
      rec_tgt: 0, rec: 0, rec_yd: 0, rec_td: 0, fum_lost: 0, fgm: 0, xpm: 0,
      def_sack: 0, def_int: 0, def_fum_rec: 0, def_td: 0, def_safety: 0, def_pts_allowed: 0,
      idp_tkl_solo: 0, idp_tkl_ast: 0, idp_tkl_loss: 0, idp_sack: 0, idp_int: 0,
      idp_pass_def: 0, idp_ff: 0, idp_fum_rec: 0, idp_qb_hit: 0,
    }
    acc.pts += Number(r[pointsCol]) || 0
    acc.pass_yd += Number(r.pass_yd) || 0
    acc.pass_td += Number(r.pass_td) || 0
    acc.pass_int += Number(r.pass_int) || 0
    acc.rush_att += Number(r.rush_att) || 0
    acc.rush_yd += Number(r.rush_yd) || 0
    acc.rush_td += Number(r.rush_td) || 0
    acc.rec_tgt += Number(r.rec_tgt) || 0
    acc.rec += Number(r.rec) || 0
    acc.rec_yd += Number(r.rec_yd) || 0
    acc.rec_td += Number(r.rec_td) || 0
    acc.fum_lost += Number(r.fum_lost) || 0
    acc.fgm += Number(r.fgm) || 0
    acc.xpm += Number(r.xpm) || 0
    acc.def_sack += Number(r.def_sack) || 0
    acc.def_int += Number(r.def_int) || 0
    acc.def_fum_rec += Number(r.def_fum_rec) || 0
    acc.def_td += Number(r.def_td) || 0
    acc.def_safety += Number(r.def_safety) || 0
    acc.def_pts_allowed += Number(r.def_pts_allowed) || 0
    acc.idp_tkl_solo += Number(r.idp_tkl_solo) || 0
    acc.idp_tkl_ast += Number(r.idp_tkl_ast) || 0
    acc.idp_tkl_loss += Number(r.idp_tkl_loss) || 0
    acc.idp_sack += Number(r.idp_sack) || 0
    acc.idp_int += Number(r.idp_int) || 0
    acc.idp_pass_def += Number(r.idp_pass_def) || 0
    acc.idp_ff += Number(r.idp_ff) || 0
    acc.idp_fum_rec += Number(r.idp_fum_rec) || 0
    acc.idp_qb_hit += Number(r.idp_qb_hit) || 0
    statsByPlayer[r.player_id] = acc
  }
  function ytd(id) { return statsByPlayer[id] || {} }

  // Weekly Sleeper projection for the CURRENT (season, week) — surfaces
  // "what's this player going to do for me this week?" alongside ADP +
  // season totals. Empty map when we're out-of-season or Sleeper hasn't
  // published the week yet; client should render null as a dash.
  // Store the raw projection row keyed by player_id so the projection
  // compute (per-player below) can switch between pre-baked pts_* for
  // offense and applyScoringRules for IDP defenders.
  const weeklyProjRowMap = {}
  let weeklyProjCol = 'pts_half_ppr'
  const weeklyRules = settings?.scoring_rules || buildScoringRulesFromPreset(scoringFormat)
  try {
    const { getCurrentNflWeek } = await import('./tdPassService.js')
    const { season: curSeason, week: curWeek } = await getCurrentNflWeek()
    if (curWeek && curSeason) {
      weeklyProjCol = scoringFormat === 'ppr' ? 'pts_ppr'
        : scoringFormat === 'standard' ? 'pts_std'
        : 'pts_half_ppr'
      const { data: projRows } = await supabase
        .from('nfl_player_projections')
        .select(`player_id, ${weeklyProjCol}, idp_sack, idp_int, idp_tkl_solo, idp_tkl_ast, idp_tkl_loss, idp_pass_def, idp_qb_hit, idp_ff, idp_fum_rec`)
        .eq('season', curSeason)
        .eq('week', curWeek)
      for (const p of projRows || []) weeklyProjRowMap[p.player_id] = p
    }
  } catch (err) {
    logger.warn({ err, leagueId }, 'Failed to load weekly projections for available players')
  }

  // Players currently on waivers in this league
  const waiverLockedSet = await getWaiverLockedPlayerIds(leagueId)

  // Current-week opponent map, same as getRoster. Empty if pre-season or
  // out of season.
  let oppMap = new Map()
  try {
    const { getCurrentNflWeek } = await import('./tdPassService.js')
    const { season: curSeason, week: curWeek } = await getCurrentNflWeek()
    oppMap = await getCurrentWeekMatchupMap(curSeason, curWeek)
  } catch (err) {
    logger.warn({ err }, 'Failed to load current-week opponent map for available players')
  }

  // Effective ADP — pick the column matching league scoring + boost QBs
  // 30 spots in SuperFlex / 2QB leagues so they match real-draft expectations.
  function effectiveAdp(p) {
    let raw
    if (scoringFormat === 'ppr') raw = p.adp_ppr ?? p.adp_half_ppr ?? p.search_rank
    else if (scoringFormat === 'standard') raw = p.search_rank ?? p.adp_half_ppr ?? p.adp_ppr
    else raw = p.adp_half_ppr ?? p.adp_ppr ?? p.search_rank
    raw = raw ?? 9999
    if (p.position === 'QB' && isSuperflex) raw -= 30
    return raw
  }

  // Rank the FULL pool by ADP (preseason) so each player's overall_rank stays
  // fixed even as players above them get drafted.
  const excludeSet = new Set(excludeIds)
  let poolPlayers = allPlayers || []
  // Salary cap "This Week": collapse pool to teams playing this week
  // AND not yet kicked off. Bye-week teams and Thursday-locked teams
  // disappear so the user can't price a player who can't actually play.
  if (salaryCapWeekFilter) {
    poolPlayers = poolPlayers.filter((p) => p.team && salaryCapWeekFilter.has(p.team))
  }
  const rankedAll = poolPlayers
    .map((p) => ({ ...p, _adp: effectiveAdp(p), _stats: ytd(p.id) }))
    .sort((a, b) => a._adp - b._adp)
    .map((p, i) => ({ ...p, overall_rank: i + 1 }))

  // Sort key: explicit ?sort=column wins; otherwise default to ADP pre-draft,
  // season points post-draft once current season stats exist.
  const hasCurrentSeasonStats = draftDone && (statRows || []).length > 0
  const sortKey = (sort === 'rank' || !sort) ? null : (sort && STAT_COLUMNS.includes(sort) ? sort : (hasCurrentSeasonStats ? 'pts' : null))

  // Slice offense, K, and DEF separately so K and DEF are guaranteed in the
  // pool (their _adp typically defaults to 9999 and would sink past the
  // offense cutoff). Top 400 QB/RB/WR/TE by sort key + every available K + DEF —
  // 400 covers 20-team leagues with deep benches or superflex depth.
  const sortFn = (a, b) => {
    if (sortKey) {
      const av = a._stats[sortKey] || 0
      const bv = b._stats[sortKey] || 0
      if (bv !== av) return bv - av
    }
    return a._adp - b._adp
  }
  const availableAll = rankedAll.filter((p) => !excludeSet.has(p.id))
  const IDP_RAW = new Set(['DE', 'DT', 'NT', 'DL', 'LB', 'ILB', 'OLB', 'MLB', 'CB', 'DB', 'S', 'FS', 'SS'])
  // Split-aware helpers so admin overrides like "LB/DL" work everywhere.
  // A player with any IDP part counts as IDP; the family check hits if
  // ANY part normalizes to the family being asked about.
  const positionParts = (pos) => (pos || '').split('/').map((p) => p.trim()).filter(Boolean)
  const isIdpPlayer = (pos) => positionParts(pos).some((p) => IDP_RAW.has(p))
  const isOffensePlayer = (pos) => positionParts(pos).some((p) => !['K', 'DEF'].includes(p) && !IDP_RAW.has(p))
  const inFamily = (pos, family) => positionParts(pos).some((p) => normalizeSinglePosition(p) === family)

  // IDP leagues drop team DEF entirely; team-DEF leagues drop IDPs.
  const offenseSlice = availableAll
    .filter((p) => isOffensePlayer(p.position) && !isIdpPlayer(p.position))
    .sort(sortFn)
    .slice(0, 400)
  const kickerSlice = availableAll.filter((p) => p.position === 'K').sort(sortFn)
  const defSlice = hasIdp ? [] : availableAll.filter((p) => p.position === 'DEF').sort(sortFn)
  const idpSlice = hasIdp ? availableAll.filter((p) => isIdpPlayer(p.position)).sort(sortFn) : []
  const ranked = [...offenseSlice, ...kickerSlice, ...defSlice, ...idpSlice]

  // Per-position rank from the same sort. Dual-eligible players count
  // once per family they belong to (so a LB/DL player appears in both
  // LB and DL rank counts).
  const posRanks = {}
  const posCounters = {}
  for (const p of ranked) {
    const families = [...new Set(positionParts(p.position).map(normalizeSinglePosition))]
    // For single-family players, keep the same behavior as before.
    // For dual, take the FIRST family for the rank display value
    // (client shows one number; overall inclusion in each family
    // list is handled by inFamily above).
    const primary = families[0] || 'UNK'
    posCounters[primary] = (posCounters[primary] || 0) + 1
    posRanks[p.id] = posCounters[primary]
  }

  // Apply user filters AFTER ranks are assigned. For IDP families and
  // 'DEF' match any-part; for offense positions (QB/RB/WR/TE/K) also
  // any-part so an override like 'RB/WR' would appear in both filters.
  let filtered = ranked
  if (position) {
    if (IDP_FAMILIES.has(position)) {
      filtered = filtered.filter((p) => inFamily(p.position, position))
    } else {
      filtered = filtered.filter((p) => positionParts(p.position).includes(position))
    }
  }
  if (query) {
    const q = query.toLowerCase()
    filtered = filtered.filter((p) => p.full_name?.toLowerCase().includes(q))
  }

  return filtered.map((p) => {
    const s = p._stats || {}
    return {
      ...p,
      // Roll up granular NFL codes (DE/DT/NT → DL, ILB/OLB/MLB → LB,
      // CB → DB, FS/SS → S) so the UI shows the fantasy-slot family
      // name that matches roster slots, filter tabs, and stat lines.
      position: normalizePosition(p.position),
      adp_rank: p.overall_rank || null,
      pos_rank: posRanks[p.id] || null,
      season_points: Math.round((s.pts || 0) * 10) / 10,
      weekly_projection: (() => {
        const computed = computeIdpAwareProjection(weeklyProjRowMap[p.id], p.position, weeklyProjCol, weeklyRules)
        return computed != null ? Math.round(computed * 10) / 10 : null
      })(),
      stats: {
        pts: Math.round((s.pts || 0) * 10) / 10,
        pass_yd: Math.round(s.pass_yd || 0),
        pass_td: s.pass_td || 0,
        pass_int: s.pass_int || 0,
        rush_att: s.rush_att || 0,
        rush_yd: Math.round(s.rush_yd || 0),
        rush_td: s.rush_td || 0,
        rec_tgt: s.rec_tgt || 0,
        rec: s.rec || 0,
        rec_yd: Math.round(s.rec_yd || 0),
        rec_td: s.rec_td || 0,
        fum_lost: s.fum_lost || 0,
        fgm: s.fgm || 0,
        xpm: s.xpm || 0,
        def_sack: Math.round((s.def_sack || 0) * 10) / 10,
        def_int: s.def_int || 0,
        def_fum_rec: s.def_fum_rec || 0,
        def_td: s.def_td || 0,
        def_safety: s.def_safety || 0,
        def_pts_allowed: s.def_pts_allowed || 0,
        idp_tkl_solo: Math.round((s.idp_tkl_solo || 0) * 10) / 10,
        idp_tkl_ast: Math.round((s.idp_tkl_ast || 0) * 10) / 10,
        idp_tkl_loss: Math.round((s.idp_tkl_loss || 0) * 10) / 10,
        idp_sack: Math.round((s.idp_sack || 0) * 10) / 10,
        idp_int: s.idp_int || 0,
        idp_pass_def: s.idp_pass_def || 0,
        idp_ff: s.idp_ff || 0,
        idp_fum_rec: s.idp_fum_rec || 0,
      },
      on_waivers: waiverLockedSet.has(p.id),
      // Opponent / home-away for the current NFL week. Undefined when
      // the opponent map is empty (offseason) so the client doesn't
      // mark every player as BYE. Inside the map, missing team = bye.
      ...(oppMap.size > 0 ? {
        current_week_opponent: p.team ? (oppMap.get(p.team)?.opponent || null) : null,
        current_week_is_home: p.team ? (oppMap.get(p.team)?.is_home ?? null) : null,
      } : {}),
    }
  })
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
// Build per-league lineup-validation maps from the league's roster_slots
// config. Replaces the old hardcoded STARTER_SLOTS_TRAD / SLOT_POSITIONS
// constants so a wr=2 league can never accidentally accept a wr3
// assignment, and the slot list always matches what the FE renders.
function buildLineupValidationMaps(rosterSlots) {
  const slots = rosterSlots || { qb: 1, rb: 2, wr: 2, te: 1, flex: 1, k: 1, def: 1 }
  const starterKeys = []
  // Bench and IR accept anything a starter slot can hold, so include
  // every IDP family too — without this an IDP league can't bench or
  // IR an IDP because the allowlist rejects DE/LB/CB/S codes.
  const slotPositions = {
    bench: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'DE', 'DT', 'NT', 'LB', 'ILB', 'OLB', 'MLB', 'DB', 'CB', 'S', 'FS', 'SS'],
    ir: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'DE', 'DT', 'NT', 'LB', 'ILB', 'OLB', 'MLB', 'DB', 'CB', 'S', 'FS', 'SS'],
  }
  if ((slots.qb || 0) >= 1) { starterKeys.push('qb'); slotPositions.qb = ['QB'] }
  for (let i = 1; i <= (slots.rb || 0); i++) { starterKeys.push(`rb${i}`); slotPositions[`rb${i}`] = ['RB'] }
  for (let i = 1; i <= (slots.wr || 0); i++) { starterKeys.push(`wr${i}`); slotPositions[`wr${i}`] = ['WR'] }
  if ((slots.te || 0) >= 1) { starterKeys.push('te'); slotPositions.te = ['TE'] }
  if ((slots.flex || 0) >= 1) { starterKeys.push('flex'); slotPositions.flex = ['RB', 'WR', 'TE'] }
  if ((slots.superflex || 0) >= 1) { starterKeys.push('superflex'); slotPositions.superflex = ['QB', 'RB', 'WR', 'TE'] }
  if ((slots.k || 0) >= 1) { starterKeys.push('k'); slotPositions.k = ['K'] }
  if ((slots.def || 0) >= 1) { starterKeys.push('def'); slotPositions.def = ['DEF'] }
  // IDP starter slots — position codes mirror Sleeper's nfl_players.position
  // values. Client-side buildStarterSlots uses the same allowlists.
  for (let i = 1; i <= (slots.dl || 0); i++) { starterKeys.push(`dl${i}`); slotPositions[`dl${i}`] = ['DE', 'DT', 'NT', 'DL'] }
  for (let i = 1; i <= (slots.lb || 0); i++) { starterKeys.push(`lb${i}`); slotPositions[`lb${i}`] = ['LB', 'ILB', 'OLB', 'MLB'] }
  for (let i = 1; i <= (slots.db || 0); i++) { starterKeys.push(`db${i}`); slotPositions[`db${i}`] = ['CB', 'DB'] }
  for (let i = 1; i <= (slots.s || 0); i++) { starterKeys.push(`s${i}`); slotPositions[`s${i}`] = ['S', 'FS', 'SS'] }
  return { starterKeys, slotPositions }
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
    .select('id, player_id, slot, nfl_players(id, position, team, injury_status, full_name)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)

  if (!roster?.length) {
    const err = new Error('You do not have a roster in this league')
    err.status = 404
    throw err
  }

  const lineupSettings = await getFantasySettings(leagueId)
  const { starterKeys: STARTER_SLOTS_TRAD, slotPositions: SLOT_POSITIONS } = buildLineupValidationMaps(lineupSettings?.roster_slots)

  // Overlay admin position overrides so dual-eligible players ("LB/DL")
  // pass slot validation. Without this a Micah Parsons override would
  // pass client-side split-aware checks but get rejected here.
  const overrides = await loadNflPositionOverrides()

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
    const overridePos = overrides[(r.nfl_players?.full_name || '').toLowerCase()]
    const effectivePosition = overridePos || r.nfl_players?.position
    if (!isPositionEligibleForSlot(effectivePosition, allowed)) {
      const err = new Error(`Player ${effectivePosition} cannot fill slot ${a.slot}`)
      err.status = 400
      throw err
    }
    if (a.slot === 'ir') {
      const status = (r.nfl_players?.injury_status || '').toLowerCase()
      if (status !== 'out' && status !== 'ir' && status !== 'injured reserve') {
        const err = new Error(`${r.nfl_players?.full_name || 'Player'} isn't injured (Out or IR) and can't be placed on IR`)
        err.status = 400
        throw err
      }
    }
  }

  // 3. Per-player lock check. Source the locked-team set from the shared
  // helper (kickoff-time signal lifted from games.starts_at via Odds API,
  // scoped to current week, falling back to game_date<today ET) so this
  // path uses the same lock signal as addDropPlayer / trade execution
  // / waiver claims. The previous implementation queried nfl_schedule.status
  // directly, which lagged behind actual kickoff whenever Sleeper's
  // schedule sync ran late.
  const lockedTeams = await getLockedTeamsForLeague(leagueId)

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
 * Save a pre-set lineup for a future week.
 * The weekly lineup is stored separately from fantasy_rosters and will be
 * applied (promoted) when the week becomes current or used directly at scoring time.
 */
export async function setFantasyWeeklyLineup(leagueId, userId, week, season, slotAssignments) {
  if (!Array.isArray(slotAssignments) || !slotAssignments.length) {
    const err = new Error('slotAssignments required')
    err.status = 400
    throw err
  }

  // Validate week is in the future
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('current_week')
    .eq('league_id', leagueId)
    .single()
  const currentWeek = settings?.current_week || 1
  if (week <= currentWeek) {
    const err = new Error('Weekly lineups can only be set for future weeks')
    err.status = 400
    throw err
  }

  // Get the user's current roster for ownership + position validation.
  // full_name + injury_status pulled so we can apply position overrides
  // and gate the IR slot on actual injury status (parallels setFantasyLineup).
  const { data: roster } = await supabase
    .from('fantasy_rosters')
    .select('id, player_id, slot, nfl_players(id, position, team, full_name, injury_status)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)

  if (!roster?.length) {
    const err = new Error('You do not have a roster in this league')
    err.status = 404
    throw err
  }

  const weeklySettings = await getFantasySettings(leagueId)
  const { starterKeys: STARTER_SLOTS_TRAD, slotPositions: SLOT_POSITIONS } = buildLineupValidationMaps(weeklySettings?.roster_slots)

  const overrides = await loadNflPositionOverrides()

  const rosterByPlayerId = {}
  for (const r of roster) rosterByPlayerId[r.player_id] = r

  // Validate each assignment
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
    const overridePos = overrides[(r.nfl_players?.full_name || '').toLowerCase()]
    const effectivePosition = overridePos || r.nfl_players?.position
    if (!isPositionEligibleForSlot(effectivePosition, allowed)) {
      const err = new Error(`Player ${effectivePosition} cannot fill slot ${a.slot}`)
      err.status = 400
      throw err
    }
    if (a.slot === 'ir') {
      const status = (r.nfl_players?.injury_status || '').toLowerCase()
      if (status !== 'out' && status !== 'ir' && status !== 'injured reserve') {
        const err = new Error(`${r.nfl_players?.full_name || 'Player'} isn't injured (Out or IR) and can't be placed on IR`)
        err.status = 400
        throw err
      }
    }
  }

  // Validate no duplicate starter slots
  const starterCounts = {}
  for (const slot of STARTER_SLOTS_TRAD) starterCounts[slot] = 0
  for (const a of slotAssignments) {
    if (STARTER_SLOTS_TRAD.includes(a.slot)) starterCounts[a.slot]++
  }
  for (const [slot, count] of Object.entries(starterCounts)) {
    if (count > 1) {
      const err = new Error(`Multiple players assigned to ${slot}`)
      err.status = 400
      throw err
    }
  }

  // Delete existing weekly lineup for this week, then insert new set
  await supabase
    .from('fantasy_weekly_lineups')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('week', week)
    .eq('season', season)

  const rows = slotAssignments.map((a) => ({
    league_id: leagueId,
    user_id: userId,
    week,
    season,
    player_id: a.player_id,
    slot: a.slot,
  }))
  const { error } = await supabase.from('fantasy_weekly_lineups').insert(rows)
  if (error) {
    logger.error({ error }, 'Failed to save weekly lineup')
    const err = new Error('Failed to save weekly lineup')
    err.status = 500
    throw err
  }

  return { saved: rows.length }
}

/**
 * Fetch a pre-set weekly lineup for a future week.
 * Cross-checks against current roster to flag players no longer owned.
 */
export async function getFantasyWeeklyLineup(leagueId, userId, week, season) {
  const { data: rows } = await supabase
    .from('fantasy_weekly_lineups')
    .select('player_id, slot, nfl_players(id, full_name, position, team, headshot_url, injury_status)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('week', week)
    .eq('season', season)

  if (!rows?.length) return { roster: null, week, season }

  // Cross-check against current roster
  const { data: currentRoster } = await supabase
    .from('fantasy_rosters')
    .select('player_id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
  const ownedIds = new Set((currentRoster || []).map((r) => r.player_id))

  const roster = rows.map((r) => ({
    player_id: r.player_id,
    slot: r.slot,
    nfl_players: r.nfl_players,
    still_on_roster: ownedIds.has(r.player_id),
  }))

  return { roster, week, season }
}

/**
 * Promote a pre-set weekly lineup into fantasy_rosters when the week becomes current.
 * Called lazily on roster fetch. One-time per user per week.
 */
export async function promoteWeeklyLineup(leagueId, userId, currentWeek, season) {
  const { data: weeklyRows } = await supabase
    .from('fantasy_weekly_lineups')
    .select('player_id, slot')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('week', currentWeek)
    .eq('season', season)

  if (!weeklyRows?.length) return false

  // Get current roster to validate players are still owned
  const { data: roster } = await supabase
    .from('fantasy_rosters')
    .select('id, player_id, slot')
    .eq('league_id', leagueId)
    .eq('user_id', userId)

  if (!roster?.length) return false

  const rosterById = {}
  for (const r of roster) rosterById[r.player_id] = r

  // Apply weekly lineup slots to fantasy_rosters (only for players still on roster)
  let applied = 0
  for (const w of weeklyRows) {
    const r = rosterById[w.player_id]
    if (!r) continue // player no longer on roster
    if (r.slot === w.slot) continue // already correct
    await supabase
      .from('fantasy_rosters')
      .update({ slot: w.slot })
      .eq('id', r.id)
    applied++
  }

  // Clean up the weekly lineup rows
  await supabase
    .from('fantasy_weekly_lineups')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('week', currentWeek)
    .eq('season', season)

  logger.info({ leagueId, userId, currentWeek, applied }, 'Promoted weekly lineup to roster')
  return true
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
/**
 * Throws if any of the user's roster players currently sitting in the IR
 * slot is no longer injured (status not Out / IR / Injured Reserve).
 * Mirrors Yahoo behavior: ineligible IR blocks all transactions until the
 * player is moved off IR (lineup change resolves it).
 */
async function assertNoIneligibleIR(leagueId, userId) {
  const { data: irRows } = await supabase
    .from('fantasy_rosters')
    .select('player_id, nfl_players(full_name, injury_status)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('slot', 'ir')

  for (const row of irRows || []) {
    const status = (row.nfl_players?.injury_status || '').toLowerCase()
    if (status !== 'out' && status !== 'ir' && status !== 'injured reserve') {
      const name = row.nfl_players?.full_name || 'A player'
      const err = new Error(`${name} is on IR but no longer injured. Move them off IR before making any roster moves.`)
      err.status = 400
      err.ineligible_ir = true
      throw err
    }
  }
}

export async function addDropPlayer(leagueId, userId, addPlayerId, dropPlayerId) {
  if (!addPlayerId) {
    const err = new Error('add_player_id required')
    err.status = 400
    throw err
  }

  // Roster moves are gated on the draft actually being done. Before the
  // draft, everyone starts with an empty roster and pre-populating from
  // free agency would corrupt draft pool visibility + team fairness.
  // Salary-cap leagues have no draft so this guard doesn't apply to them.
  const gateSettings = await getFantasySettings(leagueId)
  if (gateSettings?.format !== 'salary_cap' && gateSettings?.draft_status !== 'completed') {
    const err = new Error("Can't add or drop players before the draft is completed")
    err.status = 400
    throw err
  }

  // Playoff elimination lock: a team can no longer add/drop once their
  // season is over — either they missed the playoffs entirely, or they
  // lost a playoff matchup with no consolation slot remaining. Only
  // applies to traditional fantasy (salary cap doesn't have this concept).
  if (gateSettings?.format !== 'salary_cap') {
    const { data: membership } = await supabase
      .from('league_members')
      .select('fantasy_eliminated_at')
      .eq('league_id', leagueId)
      .eq('user_id', userId)
      .maybeSingle()
    if (membership?.fantasy_eliminated_at) {
      const err = new Error('Your season is over — your roster is locked for the rest of the league.')
      err.status = 400
      throw err
    }
  }

  await assertNoIneligibleIR(leagueId, userId)

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
      .select('id, user_id, slot, acquired_at, nfl_players(team)')
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
    const lockedTeams = await getLockedTeamsForLeague(leagueId)
    if (lockedTeams.has(dropRow.nfl_players?.team)) {
      const err = new Error("Can't drop a player whose game has already started")
      err.status = 400
      throw err
    }
  }

  // Free-agent guard: the added player must NOT be on waivers. If they are,
  // the user must go through the waiver claim flow instead.
  const lockedSet = await getWaiverLockedPlayerIds(leagueId)
  if (lockedSet.has(addPlayerId)) {
    const err = new Error('This player is on waivers — submit a waiver claim instead')
    err.status = 400
    throw err
  }

  // Drop first (if applicable), then add to bench
  if (dropRow) {
    const { error: dropErr, count: droppedCount } = await supabase
      .from('fantasy_rosters')
      .delete({ count: 'exact' })
      .eq('id', dropRow.id)
    if (dropErr) {
      logger.error({ err: dropErr, leagueId, userId, dropPlayerId }, 'add-drop: delete failed')
      throw dropErr
    }
    if ((droppedCount ?? 0) !== 1) {
      logger.error({ leagueId, userId, dropPlayerId, droppedCount }, 'add-drop: expected to delete 1 row but did not')
      const err = new Error('Failed to drop the selected player — refresh and try again')
      err.status = 500
      throw err
    }
    // Dropped player goes onto waivers (or straight to FA per the pre-season /
    // just-added rules baked into addToWaiverPool).
    await addToWaiverPool(leagueId, [dropPlayerId], 'dropped', { [dropPlayerId]: dropRow.acquired_at })
  }
  const { error: insertErr } = await supabase
    .from('fantasy_rosters')
    .insert({
      league_id: leagueId,
      user_id: userId,
      player_id: addPlayerId,
      slot: 'bench',
      acquired_via: 'free_agent',
    })
  if (insertErr) {
    // Postgres unique violation = the (league_id, player_id) UNIQUE
    // constraint blocked us, meaning a second manager beat this user to
    // the add by milliseconds. Surface a friendly message instead of the
    // raw "duplicate key value violates unique constraint" text.
    if (insertErr.code === '23505') {
      const err = new Error(`${addPlayer.full_name} was just claimed by another manager`)
      err.status = 409
      throw err
    }
    logger.error({ insertErr, addPlayerId }, 'Failed to add player to roster')
    throw insertErr
  }

  // Log transactions
  const txns = [{ league_id: leagueId, user_id: userId, type: 'add', player_id: addPlayerId }]
  if (dropPlayerId) txns.push({ league_id: leagueId, user_id: userId, type: 'drop', player_id: dropPlayerId })
  await supabase.from('fantasy_transactions').insert(txns)

  return { added: addPlayer.full_name, dropped: dropPlayerId || null }
}

/**
 * Drop a player from a user's roster without adding anyone in return.
 * Verifies ownership and game-start lock, deletes the roster row, and pushes
 * the player onto waivers until the next clearing.
 */
export async function dropRosterPlayer(leagueId, userId, playerId) {
  if (!playerId) {
    const err = new Error('player_id required')
    err.status = 400
    throw err
  }
  await assertNoIneligibleIR(leagueId, userId)
  const { data: row } = await supabase
    .from('fantasy_rosters')
    .select('id, user_id, acquired_at, nfl_players(full_name, team)')
    .eq('league_id', leagueId)
    .eq('player_id', playerId)
    .maybeSingle()
  if (!row || row.user_id !== userId) {
    const err = new Error('You can only drop a player from your own roster')
    err.status = 403
    throw err
  }
  const lockedTeams = await getLockedTeamsForLeague(leagueId)
  if (lockedTeams.has(row.nfl_players?.team)) {
    const err = new Error("Can't drop a player whose game has already started")
    err.status = 400
    throw err
  }
  const { error: delErr, count: deletedCount } = await supabase
    .from('fantasy_rosters')
    .delete({ count: 'exact' })
    .eq('id', row.id)
  if (delErr) {
    logger.error({ err: delErr, leagueId, userId, playerId }, 'drop: delete failed')
    throw delErr
  }
  if ((deletedCount ?? 0) !== 1) {
    logger.error({ leagueId, userId, playerId, deletedCount }, 'drop: expected to delete 1 row but did not')
    const err = new Error('Failed to drop the selected player — refresh and try again')
    err.status = 500
    throw err
  }
  await addToWaiverPool(leagueId, [playerId], 'dropped', { [playerId]: row.acquired_at })
  await supabase.from('fantasy_transactions').insert({ league_id: leagueId, user_id: userId, type: 'drop', player_id: playerId })
  return { dropped: row.nfl_players?.full_name || playerId }
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
  const regularSeasonWeeks = (settings.playoff_start_week || 15) - 1
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
    .select('id, full_name, position, team, headshot_url, injury_status, injury_body_part, age, years_exp, college, height, weight, number, espn_id, projected_pts_half_ppr, bye_week')
    .eq('id', playerId)
    .single()

  if (!player) {
    const err = new Error('Player not found')
    err.status = 404
    throw err
  }

  const { data: weeks } = await supabase
    .from('nfl_player_stats')
    .select('week, season, pass_att, pass_cmp, pass_yd, pass_td, pass_int, rush_att, rush_yd, rush_td, rec_tgt, rec, rec_yd, rec_td, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, fgmiss_0_39, fgmiss_40_49, fgmiss_50_plus, xpm, xpa, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed, idp_tkl_solo, idp_tkl_ast, idp_tkl_loss, idp_sack, idp_int, idp_pass_def, idp_qb_hit, idp_ff, idp_fum_rec')
    .eq('player_id', playerId)
    .eq('season', season)
    .order('week', { ascending: true })

  // Full season's nfl_schedule for this player's team — drives the opponent
  // column on the modal's weekly table AND lets us emit upcoming weeks
  // (schedule rows with no matching stats row yet) so users see who their
  // player will face later in the year, not just what already happened.
  // Empty when the player has no team (free agent / retired) or when the
  // season's schedule hasn't been synced yet.
  const scheduleByWeek = {}
  if (player.team) {
    const { data: schedRows } = await supabase
      .from('nfl_schedule')
      .select('week, home_team, away_team')
      .eq('season', season)
      .or(`home_team.eq.${player.team},away_team.eq.${player.team}`)
    for (const s of schedRows || []) {
      const isHome = s.home_team === player.team
      scheduleByWeek[s.week] = {
        opponent: isHome ? s.away_team : s.home_team,
        is_home: isHome,
      }
    }
  }

  // Apply this league's scoring rules to each week, so the per-week pts the
  // user sees in the modal exactly match what their team would have scored.
  const playedWeeks = (weeks || []).map((w) => {
    const sched = scheduleByWeek[w.week] || {}
    return {
      week: w.week,
      played: true,
      opponent: sched.opponent || null,
      is_home: sched.is_home ?? null,
      pts: applyScoringRules(w, leagueRules),
      pass_att: w.pass_att || 0,
      pass_cmp: w.pass_cmp || 0,
      pass_yd: Number(w.pass_yd) || 0,
      pass_td: w.pass_td || 0,
      pass_int: w.pass_int || 0,
      rush_att: w.rush_att || 0,
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
    }
  })

  // Upcoming weeks: any schedule row beyond the latest played week, with
  // no stat fields populated. Drives the "future games" rows in the
  // modal's weekly table.
  const playedWeekSet = new Set(playedWeeks.map((w) => w.week))
  const upcomingWeeks = []
  for (const wkStr of Object.keys(scheduleByWeek)) {
    const wk = Number(wkStr)
    if (playedWeekSet.has(wk)) continue
    const sched = scheduleByWeek[wk]
    upcomingWeeks.push({
      week: wk,
      played: false,
      opponent: sched.opponent || null,
      is_home: sched.is_home ?? null,
      pts: null,
    })
  }

  // Forward-looking projections for upcoming weeks. The modal renders
  // these in italic gray under the pts column. For IDP defenders we
  // compute via applyScoringRules over raw idp_* stat projections so
  // the numbers aren't ~0 in IDP leagues. Custom kicker / bonus rules
  // for offense are NOT projection-aware yet.
  if (upcomingWeeks.length) {
    const projCol = settings?.scoring_format === 'ppr' ? 'pts_ppr'
      : settings?.scoring_format === 'standard' ? 'pts_std'
      : 'pts_half_ppr'
    const { data: projRows } = await supabase
      .from('nfl_player_projections')
      .select(`week, ${projCol}, idp_sack, idp_int, idp_tkl_solo, idp_tkl_ast, idp_tkl_loss, idp_pass_def, idp_qb_hit, idp_ff, idp_fum_rec`)
      .eq('player_id', playerId)
      .eq('season', season)
      .in('week', upcomingWeeks.map((w) => w.week))
    const projByWeek = {}
    for (const r of projRows || []) projByWeek[r.week] = r
    for (const w of upcomingWeeks) {
      const computed = computeIdpAwareProjection(projByWeek[w.week], player.position, projCol, leagueRules)
      if (computed != null) w.projected_pts = Math.round(computed * 10) / 10
    }
  }

  // Bye week — emit a dedicated row so the full season's calendar shows
  // continuously in the modal table. nfl_players.bye_week is the week
  // number for the team's bye. We only emit it if it's not already a
  // played or upcoming week (defensive).
  const allKnownWeeks = new Set([...playedWeekSet, ...upcomingWeeks.map((w) => w.week)])
  if (player.bye_week && !allKnownWeeks.has(player.bye_week)) {
    upcomingWeeks.push({
      week: player.bye_week,
      played: false,
      opponent: null,    // null + on_bye = BYE label client-side
      is_home: null,
      on_bye: true,
      pts: null,
    })
  }

  // Merged, week-sorted timeline of played + upcoming + bye. Client
  // distinguishes by the `played` flag — no separate "Previous" /
  // "Upcoming" headers since empty stat cells are self-explanatory.
  const weeklyStats = [...playedWeeks, ...upcomingWeeks].sort((a, b) => a.week - b.week)

  const totalPts = playedWeeks.reduce((sum, w) => sum + w.pts, 0)
  const gamesPlayed = playedWeeks.length
  const avgPts = gamesPlayed > 0 ? totalPts / gamesPlayed : 0

  // Determine "current" week — most recent stat row, else fall back to season-high week
  const currentWeek = playedWeeks.length ? playedWeeks[playedWeeks.length - 1] : null

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

  // Position rank — rank this player among all players at the same position
  // based on total fantasy points using this league's scoring rules
  let positionRank = null
  if (player.position && gamesPlayed > 0) {
    try {
      const { data: posPlayers } = await supabase
        .from('nfl_players')
        .select('id')
        .eq('position', player.position)
        .not('team', 'is', null)
      const posPlayerIds = (posPlayers || []).map((p) => p.id)
      if (posPlayerIds.length) {
        const { data: posStats } = await supabase
          .from('nfl_player_stats')
          .select('player_id, pass_att, pass_cmp, pass_yd, pass_td, pass_int, rush_att, rush_yd, rush_td, rec_tgt, rec, rec_yd, rec_td, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, fgmiss_0_39, fgmiss_40_49, fgmiss_50_plus, xpm, xpa, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed, idp_tkl_solo, idp_tkl_ast, idp_tkl_loss, idp_sack, idp_int, idp_pass_def, idp_qb_hit, idp_ff, idp_fum_rec')
          .eq('season', season)
          .in('player_id', posPlayerIds)
        const totals = {}
        for (const st of posStats || []) {
          totals[st.player_id] = (totals[st.player_id] || 0) + applyScoringRules(st, leagueRules)
        }
        const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1])
        const idx = sorted.findIndex(([pid]) => pid === playerId)
        if (idx >= 0) positionRank = idx + 1
      }
    } catch (err) {
      // non-critical, skip
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
      position_rank: positionRank,
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
 * Compute the next waiver clearing time: the upcoming Wednesday at 3:00 AM ET.
 * (Matches the scheduler.js cron, which runs in America/New_York.) Returns a Date.
 *
 * Must be DST-aware: 3:00 AM ET = 07:00 UTC during EST, 08:00 UTC during EDT.
 * Most of the NFL season runs in EDT, so a fixed 08:00 UTC was an hour late
 * during EDT — players stayed waiver-locked for an hour after the cron had
 * already cleared their claims.
 */
export function nextWaiverClearTime(from = new Date()) {
  // Build a "next Wednesday 03:00 in NY" by walking days in NY local time and
  // converting back to UTC via the timezone offset Intl reports for that day.
  const tzOffsetMinutesAt = (utcDate) => {
    // Returns the offset (minutes) to ADD to UTC to get NY local time.
    // e.g. EDT = -240, EST = -300.
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(utcDate)
    const get = (t) => Number(parts.find((p) => p.type === t).value)
    const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') === 24 ? 0 : get('hour'), get('minute'), get('second'))
    return (local - utcDate.getTime()) / 60000
  }

  // Find the next Wednesday (in NY time) at 03:00.
  for (let i = 0; i < 8; i++) {
    const probe = new Date(from.getTime() + i * 24 * 60 * 60 * 1000)
    const nyParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(probe)
    const weekday = nyParts.find((p) => p.type === 'weekday').value
    if (weekday !== 'Wed') continue
    const y = Number(nyParts.find((p) => p.type === 'year').value)
    const m = Number(nyParts.find((p) => p.type === 'month').value)
    const d = Number(nyParts.find((p) => p.type === 'day').value)
    // Construct that NY-local Wed 03:00 as UTC, then correct by NY offset.
    const guessUtc = new Date(Date.UTC(y, m - 1, d, 3, 0, 0))
    const offsetMin = tzOffsetMinutesAt(guessUtc)
    const target = new Date(guessUtc.getTime() - offsetMin * 60000)
    if (target.getTime() > from.getTime()) return target
  }
  // Fallback (shouldn't happen): one week out at 08:00 UTC
  const fallback = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000)
  fallback.setUTCHours(8, 0, 0, 0)
  return fallback
}

// True when `date` falls in the "weekly waiver" window — Sunday morning ET
// through Wednesday 3 AM ET. Drops landing in this window get held until the
// next Wednesday 3 AM ET clearing rather than the 24h rolling window, so the
// post-game scramble for Sunday/Monday-game players resolves on the standard
// fantasy weekly event.
function isInWeeklyWaiverWindow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date)
  const weekday = parts.find((p) => p.type === 'weekday').value
  const hourStr = parts.find((p) => p.type === 'hour').value
  const hour = hourStr === '24' ? 0 : Number(hourStr)
  if (weekday === 'Sun' || weekday === 'Mon' || weekday === 'Tue') return true
  if (weekday === 'Wed' && hour < 3) return true
  return false
}

// Decide when a freshly-dropped player should clear waivers. Sunday-through-
// Tuesday drops snap to Wednesday 3 AM ET (the weekly clearing event). Drops
// outside that window use a 24h rolling clearance so Thursday/Wednesday-game
// players can clear before kickoff.
function calculateDropClearsAt(dropTime = new Date()) {
  if (isInWeeklyWaiverWindow(dropTime)) {
    return nextWaiverClearTime(dropTime)
  }
  return new Date(dropTime.getTime() + 24 * 60 * 60 * 1000)
}

// Full-team-name → Sleeper team abbreviation. The games table (Odds API)
// uses full names while nfl_schedule + nfl_players (Sleeper) use these
// abbreviations — this map bridges them so kickoff-time lockdown can lift
// precise starts_at from games and report the team in the format the rest
// of fantasy already speaks.
const NFL_FULL_TO_ABBR = {
  'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF', 'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC', 'Las Vegas Raiders': 'LV', 'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LAR', 'Miami Dolphins': 'MIA', 'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
  'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF', 'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN', 'Washington Commanders': 'WAS',
}

/**
 * Set of NFL team abbreviations whose current-week game has already kicked off.
 * Replaces the older "lock by game_date <= today" pattern which (a) locked the
 * entire game day starting at midnight ET — ~20 hours pre-kickoff for Thursday
 * night, ~13 hours pre-kickoff for late Sunday games — and (b) would have
 * unioned every past week's games by mid-season, locking all 32 teams forever.
 *
 * New behavior: scoped to the league's current_week, lifts kickoff timestamps
 * from the `games` table (populated by The Odds API with precise starts_at),
 * locks only teams whose actual kickoff has passed. Falls back to the old
 * game_date-based lock if no games row is found (data sync gap) so we never
 * UNDER-lock — better to err on the side of locking too eagerly than letting
 * a user move a player whose game has actually started.
 */
export async function getLockedTeamsForLeague(leagueId) {
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('season, current_week')
    .eq('league_id', leagueId)
    .single()
  const season = settings?.season || new Date().getUTCFullYear()
  const week = settings?.current_week || 1

  // Current-week schedule rows (date + teams) from Sleeper-sourced nfl_schedule
  const { data: weekRows } = await supabase
    .from('nfl_schedule')
    .select('home_team, away_team, game_date')
    .eq('season', season)
    .eq('week', week)

  if (!weekRows?.length) return new Set()

  // Look up the precise kickoff timestamps from the `games` table for this
  // week's date range. Odds API gives us hour-level accuracy that Sleeper
  // doesn't expose at the schedule endpoint.
  const dates = [...new Set(weekRows.map((r) => r.game_date).filter(Boolean))].sort()
  if (!dates.length) return new Set()
  const minDate = dates[0]
  const maxDate = dates[dates.length - 1]
  const { data: nflSport } = await supabase
    .from('sports')
    .select('id')
    .eq('key', 'americanfootball_nfl')
    .single()

  const locked = new Set()
  const nowIso = new Date().toISOString()
  if (nflSport?.id) {
    const { data: kickedOff } = await supabase
      .from('games')
      .select('home_team, away_team, starts_at')
      .eq('sport_id', nflSport.id)
      .gte('starts_at', `${minDate}T00:00:00Z`)
      .lt('starts_at', `${maxDate}T23:59:59Z`)
      .lte('starts_at', nowIso)
    for (const g of kickedOff || []) {
      const homeAbbr = NFL_FULL_TO_ABBR[g.home_team]
      const awayAbbr = NFL_FULL_TO_ABBR[g.away_team]
      if (homeAbbr) locked.add(homeAbbr)
      if (awayAbbr) locked.add(awayAbbr)
    }
  }

  // Fallback: any week-row whose game_date is strictly BEFORE today ET is
  // unambiguously past kickoff (we'd never have a current-day game show as
  // past in this branch). This covers data gaps where the games table is
  // missing rows that nfl_schedule has. Doesn't apply to today's date, which
  // depends on the kickoff-time check above.
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  for (const g of weekRows) {
    if (g.game_date && g.game_date < todayET) {
      if (g.home_team) locked.add(g.home_team)
      if (g.away_team) locked.add(g.away_team)
    }
  }

  return locked
}

/**
 * Returns the set of player_ids currently waiver-locked for the league.
 * A player is waiver-locked if either (a) they sit in fantasy_waiver_pool with
 * clears_at in the future, or (b) their NFL team's current-week game has
 * already started.
 */
export async function getWaiverLockedPlayerIds(leagueId) {
  const nowIso = new Date().toISOString()
  const { data: pool } = await supabase
    .from('fantasy_waiver_pool')
    .select('player_id')
    .eq('league_id', leagueId)
    .gt('clears_at', nowIso)
  const locked = new Set((pool || []).map((r) => r.player_id))

  const lockedTeams = await getLockedTeamsForLeague(leagueId)
  if (lockedTeams.size > 0) {
    const { data: teamPlayers } = await supabase
      .from('nfl_players')
      .select('id, team')
      .in('team', Array.from(lockedTeams))
    for (const p of teamPlayers || []) locked.add(p.id)
  }
  return locked
}

/**
 * Place one or more players into the league's waiver pool. Called from drop
 * and trade flows. Idempotent — upserts so re-dropping refreshes clears_at.
 */
export async function addToWaiverPool(leagueId, playerIds, reason = 'dropped', acquiredAtByPlayer = {}) {
  if (!playerIds?.length) return

  // Pre-season drops go straight to free agents — no waivers run during the
  // off-/pre-season, so a stranded player would sit waiting on a clearing
  // that never comes.
  if (reason === 'dropped') {
    try {
      const { getCurrentNflWeek } = await import('./tdPassService.js')
      const { isPreSeason } = await getCurrentNflWeek()
      if (isPreSeason) return
    } catch (err) {
      logger.warn({ err: err.message, leagueId }, 'Pre-season check failed in addToWaiverPool, defaulting to in-season behavior')
    }
  }

  const now = new Date()
  const dropClearsAtIso = reason === 'dropped'
    ? calculateDropClearsAt(now).toISOString()
    : nextWaiverClearTime().toISOString()

  for (const pid of playerIds) {
    // Just-added rule (in-season only — pre-season already returned above):
    // a player who's been on this roster less than 48h skips waivers entirely
    // when dropped. Lets managers quickly correct accidental adds and
    // prevents the trolling pattern of claim-then-drop-to-block.
    if (reason === 'dropped' && acquiredAtByPlayer[pid]) {
      const tenureHours = (now.getTime() - new Date(acquiredAtByPlayer[pid]).getTime()) / (1000 * 60 * 60)
      if (tenureHours < 48) continue
    }

    const { error } = await supabase
      .from('fantasy_waiver_pool')
      .upsert({
        league_id: leagueId,
        player_id: pid,
        clears_at: dropClearsAtIso,
        reason,
      }, { onConflict: 'league_id,player_id' })
    if (error) logger.error({ error, leagueId, playerId: pid }, 'Failed to push player to waiver pool')
  }
}

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

  // Playoff elimination lock: eliminated managers can't submit new claims.
  const { data: claimMembership } = await supabase
    .from('league_members')
    .select('fantasy_eliminated_at')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()
  if (claimMembership?.fantasy_eliminated_at) {
    const err = new Error('Your season is over — your roster is locked for the rest of the league.')
    err.status = 400
    throw err
  }

  await assertNoIneligibleIR(leagueId, userId)

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

  // The player must currently be on waivers — free agents are added directly
  const lockedSet = await getWaiverLockedPlayerIds(leagueId)
  if (!lockedSet.has(addPlayerId)) {
    const err = new Error('This player is a free agent — add them directly')
    err.status = 400
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

  const settings = await getFantasySettings(leagueId)

  // Roster capacity guard. If the user has no drop player and their non-IR
  // roster is already at the league's capacity, the claim cannot succeed.
  if (!dropPlayerId) {
    const slots = settings?.roster_slots || {}
    let cap = 0
    for (const [k, v] of Object.entries(slots)) {
      if (k === 'ir') continue
      cap += Number(v) || 0
    }
    if (cap > 0) {
      const { data: rosterRows } = await supabase
        .from('fantasy_rosters')
        .select('id, slot')
        .eq('league_id', leagueId)
        .eq('user_id', userId)
      const active = (rosterRows || []).filter((r) => r.slot !== 'ir').length
      if (active >= cap) {
        const err = new Error('Your roster is full — pick a player to drop')
        err.status = 400
        throw err
      }
    }
  }

  // FAAB budget check
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
  const isPriority = settings.waiver_type === 'priority'

  const { data: claims } = await supabase
    .from('fantasy_waiver_claims')
    .select('*')
    .eq('league_id', leagueId)
    .eq('status', 'pending')
  if (!claims?.length) return { processed: 0 }

  // Fail out any pending claims from members who got eliminated between
  // claim submission and processing (e.g. claim on Sunday, lose playoff
  // Sunday afternoon, waivers process Tuesday). Reason recorded so the
  // client can render a clear failure message.
  const { data: eliminatedMembers } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
    .not('fantasy_eliminated_at', 'is', null)
  const eliminatedSet = new Set((eliminatedMembers || []).map(m => m.user_id))
  const stillActiveClaims = []
  for (const c of claims) {
    if (eliminatedSet.has(c.user_id)) {
      await supabase
        .from('fantasy_waiver_claims')
        .update({ status: 'failed', fail_reason: 'Your season is over', processed_at: new Date().toISOString() })
        .eq('id', c.id)
    } else {
      stillActiveClaims.push(c)
    }
  }
  if (!stillActiveClaims.length) return { processed: 0 }

  // Group by add_player_id
  const claimsByPlayer = {}
  for (const c of stillActiveClaims) {
    if (!claimsByPlayer[c.add_player_id]) claimsByPlayer[c.add_player_id] = []
    claimsByPlayer[c.add_player_id].push(c)
  }

  // Priority waivers: recompute every member's priority from current
  // standings before processing this batch. Worst rank gets priority 1
  // (first pick), best rank gets last priority. This is the inverse-of-
  // standings reset that ESPN/Yahoo/Sleeper all call "Standard" or
  // "Priority" waivers — distinct from rolling, where the winner of a
  // claim drops to the bottom for next time.
  //
  // Pre-season fallback: if no team has played a completed matchup yet,
  // keep the existing priority (which was set from reverse draft order
  // when the draft completed). This handles Week 1 waivers gracefully.
  if (isPriority) {
    try {
      const standings = await getFantasyStandings(leagueId)
      const hasGamesPlayed = standings.some((s) => (s.games_played || 0) > 0)
      if (hasGamesPlayed) {
        const totalTeams = standings.length
        for (const s of standings) {
          const newPriority = totalTeams - s.rank + 1
          await supabase
            .from('fantasy_waiver_state')
            .update({ priority: newPriority, updated_at: new Date().toISOString() })
            .eq('league_id', leagueId)
            .eq('user_id', s.user_id)
        }
      }
    } catch (err) {
      logger.error({ err, leagueId }, 'Priority waiver standings recompute failed — falling back to existing priorities')
    }
  }

  // Get current waiver state for tiebreak / priority sort
  const stateRows = await getWaiverStateForLeague(leagueId)
  const stateByUser = {}
  for (const s of stateRows) stateByUser[s.user_id] = s

  // Roster cap (non-IR slots) — checked per-winner before INSERT so a claim
  // submitted when the user had space but processed after they filled the
  // roster (via FA add, trade accept, etc.) fails cleanly instead of putting
  // them over cap.
  const slots = settings?.roster_slots || {}
  let rosterCap = 0
  for (const [k, v] of Object.entries(slots)) {
    if (k === 'ir') continue
    rosterCap += Number(v) || 0
  }

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
      // Roster cap guard: if no drop is specified, verify the user actually
      // has room. Their roster may have filled between claim submission and
      // processing (e.g., they accepted a trade or added a free agent).
      if (!winner.drop_player_id && rosterCap > 0) {
        const { data: rosterRows } = await supabase
          .from('fantasy_rosters')
          .select('id, slot')
          .eq('league_id', leagueId)
          .eq('user_id', winner.user_id)
        const active = (rosterRows || []).filter((r) => r.slot !== 'ir').length
        if (active >= rosterCap) {
          const err = new Error('Roster full at processing — no drop specified')
          err.status = 400
          throw err
        }
      }
      let dropAcquiredAt = null
      if (winner.drop_player_id) {
        // Read the row's acquired_at BEFORE deleting so the pre-/just-added
        // tenure rule in addToWaiverPool can be evaluated correctly.
        const { data: dropRow } = await supabase
          .from('fantasy_rosters')
          .select('acquired_at')
          .eq('league_id', leagueId)
          .eq('player_id', winner.drop_player_id)
          .eq('user_id', winner.user_id)
          .maybeSingle()
        dropAcquiredAt = dropRow?.acquired_at || null

        // Same hardening pattern as the trade-drop fix (ee46615d):
        // verify the delete actually removed the row before continuing.
        // Without count tracking, a silent no-op (drop player not on
        // roster at processing time — already dropped, traded, etc.)
        // would let the add proceed without a drop and put the user
        // over cap.
        const { error: dropErr, count: deletedCount } = await supabase
          .from('fantasy_rosters')
          .delete({ count: 'exact' })
          .eq('league_id', leagueId)
          .eq('player_id', winner.drop_player_id)
          .eq('user_id', winner.user_id)
        if (dropErr) throw dropErr
        if ((deletedCount ?? 0) !== 1) {
          const err = new Error('Drop player no longer on roster')
          err.status = 400
          throw err
        }
        // Dropped player goes on waivers (or straight to FA per pre-season
        // / just-added rules baked into addToWaiverPool).
        await addToWaiverPool(leagueId, [winner.drop_player_id], 'dropped', { [winner.drop_player_id]: dropAcquiredAt })
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
      // Log waiver transactions
      const wTxns = [{ league_id: leagueId, user_id: winner.user_id, type: 'waiver_add', player_id: winner.add_player_id, bid_amount: winner.bid_amount || 0 }]
      if (winner.drop_player_id) wTxns.push({ league_id: leagueId, user_id: winner.user_id, type: 'waiver_drop', player_id: winner.drop_player_id })
      await supabase.from('fantasy_transactions').insert(wTxns)
    } catch (err) {
      logger.error({ err, claimId: winner.id }, 'Failed to apply waiver claim')
      // Surface specific validation messages (roster cap, missing drop) to
      // the user. Generic DB errors stay opaque.
      const failReason = err.status === 400 ? err.message : 'Roster update failed'
      await supabase
        .from('fantasy_waiver_claims')
        .update({ status: 'failed', fail_reason: failReason, processed_at: new Date().toISOString() })
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
    } else if (isPriority) {
      // Priority (inverse-standings reset) waivers: do NOT shuffle. The
      // batch-start recompute already set priorities based on current
      // standings; winning a single claim doesn't change a team's spot.
      // Priorities will be recomputed again on the next waiver run.
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

    // Fail the losing claims silently — users don't need a bell ping for
    // every waiver they didn't win. They can see the outcome in the
    // waiver queue UI. Only successful awards notify.
    for (const loser of playerClaims) {
      if (loser.id === winner.id) continue
      await supabase
        .from('fantasy_waiver_claims')
        .update({ status: 'failed', fail_reason: 'Outbid by another claim', processed_at: new Date().toISOString() })
        .eq('id', loser.id)
    }
  }

  // Anything left in the waiver pool whose clears_at has passed becomes a
  // free agent. Also remove the players who were just awarded — those are
  // off waivers regardless of their original clears_at.
  const nowIso = new Date().toISOString()
  await supabase
    .from('fantasy_waiver_pool')
    .delete()
    .eq('league_id', leagueId)
    .lte('clears_at', nowIso)

  logger.info({ leagueId, processed }, 'Waivers processed for league')
  return { processed }
}

/**
 * Sync current_week for all active fantasy leagues from Sleeper's NFL state.
 * Runs nightly at 3 AM ET. Only updates leagues whose current_week is behind.
 */
export async function rolloverFantasyWeek(sleeperWeek, sleeperSeason) {
  // Find all fantasy leagues that are in-season (draft completed, not yet finished)
  const { data: leagues } = await supabase
    .from('fantasy_settings')
    .select('league_id, current_week, season')
    .eq('draft_status', 'completed')
    .eq('season', sleeperSeason)

  if (!leagues?.length) return { updated: 0 }

  let updated = 0
  for (const league of leagues) {
    if (league.current_week < sleeperWeek) {
      await supabase
        .from('fantasy_settings')
        .update({ current_week: sleeperWeek })
        .eq('league_id', league.league_id)
      updated++
    }
  }

  if (updated > 0) {
    logger.info({ sleeperWeek, sleeperSeason, updated }, 'Fantasy week rollover complete')
  }
  return { updated }
}

/**
 * Process every traditional fantasy league with pending claims.
 * Called by the weekly waiver cron.
 */
export async function processAllPendingWaivers() {
  const { data: leagues } = await supabase
    .from('fantasy_settings')
    .select('league_id, format, leagues!inner(status)')
    .eq('leagues.status', 'active')
    .neq('format', 'salary_cap')
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
export async function proposeTrade(leagueId, proposerUserId, receiverUserId, proposerPlayerIds, receiverPlayerIds, message, countersTradeId) {
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

  await assertNoIneligibleIR(leagueId, proposerUserId)

  // Playoff elimination lock: either party being eliminated kills the
  // trade. Check both proposer and receiver.
  const { data: memberships } = await supabase
    .from('league_members')
    .select('user_id, fantasy_eliminated_at')
    .eq('league_id', leagueId)
    .in('user_id', [proposerUserId, receiverUserId])
  const proposerMembership = memberships?.find(m => m.user_id === proposerUserId)
  const receiverMembership = memberships?.find(m => m.user_id === receiverUserId)
  if (proposerMembership?.fantasy_eliminated_at) {
    const err = new Error('Your season is over — you can no longer propose trades.')
    err.status = 400
    throw err
  }
  if (receiverMembership?.fantasy_eliminated_at) {
    const err = new Error("That manager's season is over — they can't accept trades.")
    err.status = 400
    throw err
  }

  // Check trade deadline
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('trade_deadline')
    .eq('league_id', leagueId)
    .maybeSingle()
  if (settings?.trade_deadline) {
    const deadline = new Date(settings.trade_deadline + 'T23:59:59Z')
    if (new Date() > deadline) {
      const err = new Error('The trade deadline has passed')
      err.status = 400
      throw err
    }
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
    let messageText
    if (countersTradeId) {
      const { data: proposer } = await supabase.from('users').select('display_name, username').eq('id', proposerUserId).single()
      const proposerName = proposer?.display_name || proposer?.username || 'a manager'
      messageText = `${proposerName} countered your trade in ${league?.name || 'your league'}`
    } else {
      messageText = `You have a new trade proposal in ${league?.name || 'your league'}`
    }
    await createNotification(
      receiverUserId,
      'fantasy_trade_proposed',
      messageText,
      { leagueId, tradeId: trade.id, actorId: proposerUserId, countersTradeId: countersTradeId || undefined },
    )
  } catch (err) {
    logger.error({ err, tradeId: trade.id }, 'Failed to send trade notification')
  }

  return trade
}

/**
 * Accept a pending trade. Atomically swaps player ownership.
 */
export async function acceptTrade(tradeId, userId, dropPlayerIds = []) {
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

  // Playoff elimination lock: if either party got eliminated between
  // trade proposal and acceptance, block the accept. Common edge case:
  // trade proposed Sunday morning, receiver's team loses that afternoon,
  // receiver tries to accept Monday.
  const { data: acceptMemberships } = await supabase
    .from('league_members')
    .select('user_id, fantasy_eliminated_at')
    .eq('league_id', trade.league_id)
    .in('user_id', [trade.proposer_user_id, trade.receiver_user_id])
  const proposerEliminated = acceptMemberships?.find(m => m.user_id === trade.proposer_user_id)?.fantasy_eliminated_at
  const receiverEliminated = acceptMemberships?.find(m => m.user_id === trade.receiver_user_id)?.fantasy_eliminated_at
  if (proposerEliminated || receiverEliminated) {
    const err = new Error("This trade can no longer be accepted — one of the parties' season is over.")
    err.status = 400
    throw err
  }

  await assertNoIneligibleIR(trade.league_id, userId)

  // Check trade deadline
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('trade_deadline, trade_review, roster_slots')
    .eq('league_id', trade.league_id)
    .maybeSingle()
  if (settings?.trade_deadline) {
    const deadline = new Date(settings.trade_deadline + 'T23:59:59Z')
    if (new Date() > deadline) {
      const err = new Error('The trade deadline has passed')
      err.status = 400
      throw err
    }
  }

  // Check if either side would exceed roster cap after the trade
  const items = trade.fantasy_trade_items || []
  const receiverGets = items.filter((i) => i.to_user_id === userId).length
  const receiverSends = items.filter((i) => i.from_user_id === userId).length
  const netGain = receiverGets - receiverSends - dropPlayerIds.length

  if (netGain > 0) {
    // Count receiver's current active roster (exclude IR)
    const { count: currentCount } = await supabase
      .from('fantasy_rosters')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', trade.league_id)
      .eq('user_id', userId)
      .neq('slot', 'ir')

    const slots = settings?.roster_slots
    let rosterCap = 16
    if (slots) {
      rosterCap = 0
      for (const [k, v] of Object.entries(slots)) {
        if (k === 'ir') continue
        rosterCap += Number(v) || 0
      }
    }

    const afterTrade = (currentCount || 0) + netGain
    if (afterTrade > rosterCap) {
      const dropsNeeded = afterTrade - rosterCap
      const err = new Error(`You need to drop ${dropsNeeded} player${dropsNeeded > 1 ? 's' : ''} to accept this trade`)
      err.status = 400
      err.requires_drop = true
      err.drops_needed = dropsNeeded
      throw err
    }
  }

  // Validate drop players belong to the user and aren't part of the trade
  if (dropPlayerIds.length > 0) {
    const tradePlayerIds = new Set(items.map((i) => i.player_id))
    for (const dpId of dropPlayerIds) {
      if (tradePlayerIds.has(dpId)) {
        const err = new Error('Cannot drop a player involved in this trade')
        err.status = 400
        throw err
      }
    }
    const { data: dropRows } = await supabase
      .from('fantasy_rosters')
      .select('player_id')
      .eq('league_id', trade.league_id)
      .eq('user_id', userId)
      .in('player_id', dropPlayerIds)
    if ((dropRows || []).length !== dropPlayerIds.length) {
      const err = new Error('One or more drop players are not on your roster')
      err.status = 400
      throw err
    }
  }

  // Commissioner review: set to pending_review instead of executing immediately
  if (settings?.trade_review === 'commissioner') {
    await supabase
      .from('fantasy_trades')
      .update({ status: 'pending_review', responded_at: new Date().toISOString() })
      .eq('id', tradeId)

    // Notify the commissioner
    try {
      const { createNotification } = await import('./notificationService.js')
      const { data: league } = await supabase.from('leagues').select('name, commissioner_id').eq('id', trade.league_id).single()
      if (league?.commissioner_id) {
        await createNotification(
          league.commissioner_id,
          'fantasy_trade_proposed',
          `A trade in ${league.name} needs your approval`,
          { leagueId: trade.league_id, tradeId, needsReview: true },
        )
      }
      // Also notify proposer that trade is pending review
      await createNotification(
        trade.proposer_user_id,
        'fantasy_trade_accepted',
        `Your trade in ${league?.name || 'your league'} was accepted — awaiting commissioner approval`,
        { leagueId: trade.league_id, tradeId, actorId: userId },
      )
    } catch (err) {
      logger.error({ err }, 'Failed to send trade review notifications')
    }

    return { pending_review: true }
  }

  // No review needed — execute immediately
  return _executeTrade(tradeId, trade, userId, dropPlayerIds)
}

/**
 * Execute a trade: swap player ownership and log transactions.
 * Called by acceptTrade (when no review) or approveTrade (commissioner approval).
 */
async function _executeTrade(tradeId, trade, actorId, dropPlayerIds = []) {
  // Defensive cap re-check at execution time. The client's drop-modal flow
  // is the user-facing safeguard, but if anything bypasses or misbehaves
  // (stale UI build, transient API error swallowed silently, commissioner
  // approving a trade whose receiver's roster changed during review, etc.),
  // we still refuse to put either side over the roster cap. Belt and
  // suspenders — the silent over-cap bug from 2026-06-20 should never be
  // possible to repeat even if the front-end ships a regression.
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('roster_slots')
    .eq('league_id', trade.league_id)
    .maybeSingle()
  const slots = settings?.roster_slots
  let rosterCap = 16
  if (slots) {
    rosterCap = 0
    for (const [k, v] of Object.entries(slots)) {
      if (k === 'ir') continue
      rosterCap += Number(v) || 0
    }
  }
  const items = trade.fantasy_trade_items || []
  // Both sides could be affected — the receiver typically grows, but a
  // swap could put either user over cap. We check both.
  for (const userId of [trade.proposer_user_id, trade.receiver_user_id]) {
    const gets = items.filter((i) => i.to_user_id === userId).length
    const sends = items.filter((i) => i.from_user_id === userId).length
    // Only this actor's selected drops apply — proposer's drops aren't
    // captured anywhere because they pre-committed at proposal time.
    const userDrops = userId === actorId ? dropPlayerIds.length : 0
    const netGain = gets - sends - userDrops
    if (netGain <= 0) continue
    const { count: currentCount } = await supabase
      .from('fantasy_rosters')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', trade.league_id)
      .eq('user_id', userId)
      .neq('slot', 'ir')
    const afterTrade = (currentCount || 0) + netGain
    if (afterTrade > rosterCap) {
      logger.error({ tradeId, userId, currentCount, netGain, rosterCap, afterTrade }, 'Trade execution: user would exceed roster cap — aborting')
      const err = new Error('Trade would put a roster over the cap — refresh and retry')
      err.status = 400
      throw err
    }
  }

  // Drop players if required to make room. Mossyou hit a real incident on
  // 2026-06-20: trade swap succeeded but the drop silently no-op'd, leaving
  // them with an extra player past the roster cap. The prior version:
  //   - missed a user_id filter (could nuke another user's row with the
  //     same player_id in this league, or no-op if RLS or another guard
  //     blocked the unscoped delete)
  //   - didn't await the error or count, so any silent failure was lost
  //   - inserted the drop transaction record regardless of whether the
  //     actual delete worked, masking the failure in the audit log
  if (dropPlayerIds.length > 0) {
    // Snapshot acquired_at for each drop before the delete so addToWaiverPool
    // can honor the just-added (<48h) rule the same way addDropPlayer does.
    const { data: dropRows } = await supabase
      .from('fantasy_rosters')
      .select('player_id, acquired_at')
      .eq('league_id', trade.league_id)
      .eq('user_id', actorId)
      .in('player_id', dropPlayerIds)
    const acquiredAtByPlayer = {}
    for (const r of dropRows || []) acquiredAtByPlayer[r.player_id] = r.acquired_at

    const { error: dropErr, count: deletedCount } = await supabase
      .from('fantasy_rosters')
      .delete({ count: 'exact' })
      .eq('league_id', trade.league_id)
      .eq('user_id', actorId)
      .in('player_id', dropPlayerIds)

    if (dropErr) {
      logger.error({ err: dropErr, tradeId, actorId, dropPlayerIds }, 'Trade drop: delete failed')
      throw dropErr
    }
    if ((deletedCount ?? 0) !== dropPlayerIds.length) {
      logger.error({ tradeId, actorId, dropPlayerIds, deletedCount }, 'Trade drop: deleted row count mismatch')
      const err = new Error('Failed to drop the selected player(s) — refresh and try again')
      err.status = 500
      throw err
    }

    // Push the dropped players onto waivers, matching addDropPlayer's normal
    // drop behavior. Trade-dropped players otherwise went straight to free
    // agent and were immediately claimable — unfair to the rest of the league.
    await addToWaiverPool(trade.league_id, dropPlayerIds, 'dropped', acquiredAtByPlayer)

    // Log drop transactions only AFTER successful delete so the audit log
    // doesn't accumulate phantom drops on failure.
    const dropTxns = dropPlayerIds.map((pid) => ({
      league_id: trade.league_id,
      user_id: actorId,
      type: 'drop',
      player_id: pid,
      trade_id: tradeId,
    }))
    await supabase.from('fantasy_transactions').insert(dropTxns)
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

  // Promote bench-eligible players into any starter slots vacated by the
  // trade. Without this, the rosters end up with empty starter slots while
  // the new players sit on the bench — which makes the cap check trip on
  // the next add even though the lineup looks like it has room.
  try {
    await fillEmptyStarterSlots(trade.league_id, trade.proposer_user_id)
    await fillEmptyStarterSlots(trade.league_id, trade.receiver_user_id)
  } catch (err) {
    logger.error({ err, tradeId }, 'Failed to refill starter slots after trade')
  }

  // Snapshot status before we flip it so we can decide whether to send the
  // "accepted by X" notification. Direct accepts (status === 'pending')
  // fire it; commissioner approvals (status === 'pending_review') skip it
  // since approveTrade sends its own clearer "approved by commissioner"
  // notification right after this returns.
  const wasDirectAccept = trade.status === 'pending'

  await supabase
    .from('fantasy_trades')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', tradeId)

  if (wasDirectAccept) {
    try {
      const { createNotification } = await import('./notificationService.js')
      const { data: league } = await supabase.from('leagues').select('name').eq('id', trade.league_id).single()
      const { data: accepter } = await supabase.from('users').select('display_name, username').eq('id', actorId).single()
      const accepterName = accepter?.display_name || accepter?.username || 'a manager'
      await createNotification(
        trade.proposer_user_id,
        'fantasy_trade_accepted',
        `Your trade proposal in ${league?.name || 'your league'} was accepted by ${accepterName}`,
        { leagueId: trade.league_id, tradeId, actorId },
      )
    } catch (err) {
      logger.error({ err }, 'Failed to send trade-accepted notification')
    }
  }

  // Log trade transactions
  const txns = (trade.fantasy_trade_items || []).map((item) => ({
    league_id: trade.league_id,
    user_id: item.from_user_id,
    type: 'trade_send',
    player_id: item.player_id,
    trade_id: tradeId,
  }))
  txns.push(...(trade.fantasy_trade_items || []).map((item) => ({
    league_id: trade.league_id,
    user_id: item.to_user_id,
    type: 'trade_receive',
    player_id: item.player_id,
    trade_id: tradeId,
  })))
  if (txns.length) await supabase.from('fantasy_transactions').insert(txns)

  return { accepted: true }
}

/**
 * Commissioner approves a pending_review trade. Executes the swap.
 */
export async function approveTrade(tradeId, commissionerId) {
  const { data: trade } = await supabase
    .from('fantasy_trades')
    .select('*, fantasy_trade_items(*)')
    .eq('id', tradeId)
    .single()
  if (!trade) { const err = new Error('Trade not found'); err.status = 404; throw err }
  if (trade.status !== 'pending_review') {
    const err = new Error(`Trade is ${trade.status}, not pending review`)
    err.status = 400
    throw err
  }

  // Verify commissioner
  const { data: league } = await supabase.from('leagues').select('commissioner_id, name').eq('id', trade.league_id).single()
  if (league?.commissioner_id !== commissionerId) {
    const err = new Error('Only the commissioner can approve trades')
    err.status = 403
    throw err
  }

  const result = await _executeTrade(tradeId, trade, commissionerId)

  // Notify both parties — both were participants, so personalize each one
  try {
    const { createNotification } = await import('./notificationService.js')
    const message = `Your trade in ${league.name} was approved by the commissioner`
    await createNotification(
      trade.proposer_user_id,
      'fantasy_trade_approved',
      message,
      { leagueId: trade.league_id, tradeId },
    )
    await createNotification(
      trade.receiver_user_id,
      'fantasy_trade_approved',
      message,
      { leagueId: trade.league_id, tradeId },
    )
  } catch (err) {
    logger.error({ err }, 'Failed to send trade-approved notifications')
  }

  return result
}

/**
 * Commissioner vetoes a trade (pending or pending_review).
 */
export async function vetoTrade(tradeId, commissionerId, reason) {
  const { data: trade } = await supabase
    .from('fantasy_trades')
    .select('*')
    .eq('id', tradeId)
    .single()
  if (!trade) { const err = new Error('Trade not found'); err.status = 404; throw err }
  if (trade.status !== 'pending' && trade.status !== 'pending_review') {
    const err = new Error(`Can only veto pending trades, this trade is ${trade.status}`)
    err.status = 400
    throw err
  }

  const { data: league } = await supabase.from('leagues').select('commissioner_id, name').eq('id', trade.league_id).single()
  if (league?.commissioner_id !== commissionerId) {
    const err = new Error('Only the commissioner can veto trades')
    err.status = 403
    throw err
  }

  const trimmedReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : null
  await supabase
    .from('fantasy_trades')
    .update({
      status: 'vetoed',
      responded_at: new Date().toISOString(),
      veto_reason: trimmedReason || null,
    })
    .eq('id', tradeId)

  // Both parties were participants — same wording for both.
  try {
    const { createNotification } = await import('./notificationService.js')
    const message = `Your trade in ${league.name} was vetoed by the commissioner`
    await createNotification(
      trade.proposer_user_id,
      'fantasy_trade_vetoed',
      message,
      { leagueId: trade.league_id, tradeId, hasReason: !!trimmedReason },
    )
    await createNotification(
      trade.receiver_user_id,
      'fantasy_trade_vetoed',
      message,
      { leagueId: trade.league_id, tradeId, hasReason: !!trimmedReason },
    )
  } catch (err) {
    logger.error({ err }, 'Failed to send trade-vetoed notifications')
  }

  return { vetoed: true, veto_reason: trimmedReason || null }
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
    const { data: decliner } = await supabase.from('users').select('display_name, username').eq('id', userId).single()
    const declinerName = decliner?.display_name || decliner?.username || 'a manager'
    await createNotification(
      trade.proposer_user_id,
      'fantasy_trade_declined',
      `Your trade proposal in ${league?.name || 'your league'} was declined by ${declinerName}`,
      { leagueId: trade.league_id, tradeId, actorId: userId },
    )
  } catch (err) {
    logger.error({ err }, 'Failed to send trade-declined notification')
  }

  return { declined: true }
}

export async function counterTrade(tradeId, userId) {
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
    const err = new Error('Only the receiver can counter this trade')
    err.status = 403
    throw err
  }

  await supabase
    .from('fantasy_trades')
    .update({ status: 'countered', responded_at: new Date().toISOString() })
    .eq('id', tradeId)

  // No notification fired here — the followup proposeTrade call (which
  // always immediately follows from the counter modal) sends a single
  // counter-aware notification instead.
  return { countered: true }
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
// =====================================================================
// Fantasy Playoff Bracket — Full lifecycle
// =====================================================================

// Static bracket definitions: which bracket_position feeds into which
// Format: { winners: { source_bp: [target_bp, 'home'|'away'] }, losers: { ... } }
const BRACKET_DEFS = {
  4: {
    rounds: 2,
    // Round 1: bp1 = 1v4, bp2 = 2v3
    // Round 2: bp3 = championship, bp4 = consolation (3rd place)
    firstRound: [
      { bp: 1, seedHome: 1, seedAway: 4 },
      { bp: 2, seedHome: 2, seedAway: 3 },
    ],
    future: [
      { bp: 3, round: 2, consolation: false }, // Championship
      { bp: 4, round: 2, consolation: true },  // 3rd place
    ],
    winners: { 1: [3, 'home'], 2: [3, 'away'] },
    losers:  { 1: [4, 'home'], 2: [4, 'away'] },
    championshipBp: 3,
  },
  6: {
    rounds: 3,
    // Round 1: bp1 = 3v6, bp2 = 4v5 (seeds 1,2 get byes)
    // Round 2: bp3 = 1 vs W(bp2), bp4 = 2 vs W(bp1)
    // Round 2 consolation: bp5 = L(bp1) vs L(bp2)
    // Round 3: bp6 = championship, bp7 = consolation (3rd place)
    firstRound: [
      { bp: 1, seedHome: 3, seedAway: 6 },
      { bp: 2, seedHome: 4, seedAway: 5 },
    ],
    byes: [
      { bp: 3, round: 2, seedHome: 1, consolation: false }, // seed 1 gets bye → home in round 2
      { bp: 4, round: 2, seedHome: 2, consolation: false }, // seed 2 gets bye → home in round 2
    ],
    future: [
      { bp: 5, round: 2, consolation: true },  // Consolation R1
      { bp: 6, round: 3, consolation: false },  // Championship
      { bp: 7, round: 3, consolation: true },   // 3rd place
    ],
    winners: { 1: [4, 'away'], 2: [3, 'away'], 3: [6, 'home'], 4: [6, 'away'] },
    losers:  { 1: [5, 'home'], 2: [5, 'away'], 3: [7, 'home'], 4: [7, 'away'] },
    championshipBp: 6,
  },
  8: {
    rounds: 3,
    // Round 1: bp1=1v8, bp2=4v5, bp3=3v6, bp4=2v7
    // Round 2: bp5=W1vW2, bp6=W3vW4, bp7=L1vL2(cons), bp8=L3vL4(cons)
    // Round 3: bp9=champ, bp10=3rd place(cons), bp11=5th place(cons)
    firstRound: [
      { bp: 1, seedHome: 1, seedAway: 8 },
      { bp: 2, seedHome: 4, seedAway: 5 },
      { bp: 3, seedHome: 3, seedAway: 6 },
      { bp: 4, seedHome: 2, seedAway: 7 },
    ],
    future: [
      { bp: 5, round: 2, consolation: false },
      { bp: 6, round: 2, consolation: false },
      { bp: 7, round: 2, consolation: true },
      { bp: 8, round: 2, consolation: true },
      { bp: 9, round: 3, consolation: false },  // Championship
      { bp: 10, round: 3, consolation: true },   // 3rd place
      { bp: 11, round: 3, consolation: true },   // 5th place
    ],
    winners: { 1: [5, 'home'], 2: [5, 'away'], 3: [6, 'home'], 4: [6, 'away'], 5: [9, 'home'], 6: [9, 'away'], 7: [11, 'home'], 8: [11, 'away'] },
    losers:  { 1: [7, 'home'], 2: [7, 'away'], 3: [8, 'home'], 4: [8, 'away'], 5: [10, 'home'], 6: [10, 'away'] },
    championshipBp: 9,
  },
}

/**
 * After a regular-season week settles, check whether any team has
 * mathematically clinched a playoff spot — meaning they'd make the
 * playoffs even if they lose every remaining regular-season game.
 *
 * Conservative check (no false positives): a team X is clinched iff
 * fewer than playoff_teams other teams could catch or pass X's current
 * win total by regular-season end. Ignores tiebreakers on the safe
 * side — a team tied to X on wins is treated as "could pass X".
 *
 * Sets fantasy_clinched_at on league_members (only once) and sends
 * a fantasy_playoff_clinched notification on the moment it flips.
 */
export async function checkAndMarkClinch(leagueId, weekJustCompleted) {
  const settings = await getFantasySettings(leagueId)
  if (!settings || settings.format === 'salary_cap') return
  const playoffTeams = settings.playoff_teams || 4
  const startWeek = settings.playoff_start_week || 15
  const weeksRemaining = startWeek - weekJustCompleted - 1
  if (weeksRemaining < 0) return // Playoffs already generated or in progress

  const standings = await getFantasyStandings(leagueId)
  if (!standings?.length) return

  // Pull current clinch stamps to skip already-clinched teams
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, fantasy_clinched_at')
    .eq('league_id', leagueId)
  const clinchedMap = new Map((members || []).map(m => [m.user_id, m.fantasy_clinched_at]))

  const newlyClinched = []
  for (const s of standings) {
    if (clinchedMap.get(s.user_id)) continue
    // Count teams (excluding s) that could finish with wins >= s.wins.
    // If fewer than playoff_teams such teams exist, s is guaranteed a
    // playoff spot — everyone else can't possibly pass them.
    let couldCatchCount = 0
    for (const other of standings) {
      if (other.user_id === s.user_id) continue
      const otherMax = (other.wins || 0) + weeksRemaining
      if (otherMax >= (s.wins || 0)) couldCatchCount++
    }
    if (couldCatchCount < playoffTeams) {
      newlyClinched.push(s.user_id)
    }
  }

  if (!newlyClinched.length) return

  const stampAt = new Date().toISOString()
  await supabase
    .from('league_members')
    .update({ fantasy_clinched_at: stampAt })
    .eq('league_id', leagueId)
    .in('user_id', newlyClinched)
    .is('fantasy_clinched_at', null)

  try {
    const { createNotification } = await import('./notificationService.js')
    for (const uid of newlyClinched) {
      await createNotification(uid, 'fantasy_playoff_clinched',
        "You've clinched a playoff spot! Congrats.",
        { leagueId, week: weekJustCompleted, earlyClinch: true })
    }
  } catch (err) {
    logger.error({ err, leagueId }, 'Failed to send early-clinch notifications')
  }

  logger.info({ leagueId, week: weekJustCompleted, count: newlyClinched.length }, 'Early playoff clinch fired')
}

export async function generatePlayoffBracket(leagueId) {
  const settings = await getFantasySettings(leagueId)
  if (!settings || settings.format === 'salary_cap') return null

  const playoffTeams = settings.playoff_teams || 4
  const startWeek = settings.playoff_start_week || 15
  const def = BRACKET_DEFS[playoffTeams]
  if (!def) {
    logger.warn({ leagueId, playoffTeams }, 'Unsupported playoff bracket size')
    return null
  }

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

  // Compute regular-season standings
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
    for (const uid of [m.home_user_id, m.away_user_id]) {
      if (!userStats[uid]) userStats[uid] = { user_id: uid, wins: 0, losses: 0, pf: 0, pa: 0 }
      if (!h2hWins[uid]) h2hWins[uid] = {}
    }
    userStats[m.home_user_id].pf += Number(m.home_points)
    userStats[m.away_user_id].pf += Number(m.away_points)
    userStats[m.home_user_id].pa += Number(m.away_points)
    userStats[m.away_user_id].pa += Number(m.home_points)
    if (m.home_points > m.away_points) {
      userStats[m.home_user_id].wins++; userStats[m.away_user_id].losses++
      h2hWins[m.home_user_id][m.away_user_id] = (h2hWins[m.home_user_id][m.away_user_id] || 0) + 1
    } else if (m.away_points > m.home_points) {
      userStats[m.away_user_id].wins++; userStats[m.home_user_id].losses++
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
  const seedMap = {} // seed number (1-indexed) → user_id
  seeds.forEach((s, i) => { seedMap[i + 1] = s.user_id })

  const inserts = []

  // Round 1 matchups (with actual users)
  for (const m of def.firstRound) {
    inserts.push({
      league_id: leagueId, week: startWeek, round: 1, bracket_position: m.bp,
      home_user_id: seedMap[m.seedHome] || null, away_user_id: seedMap[m.seedAway] || null,
      seed_home: m.seedHome, seed_away: m.seedAway, is_consolation: false,
    })
  }

  // Bye entries (6-team: seeds 1,2 pre-placed in round 2)
  if (def.byes) {
    for (const b of def.byes) {
      inserts.push({
        league_id: leagueId, week: startWeek + b.round - 1, round: b.round, bracket_position: b.bp,
        home_user_id: seedMap[b.seedHome] || null, away_user_id: null,
        seed_home: b.seedHome, seed_away: null, is_consolation: b.consolation || false,
      })
    }
  }

  // Future rounds (TBD matchups with NULL users)
  for (const f of def.future || []) {
    inserts.push({
      league_id: leagueId, week: startWeek + f.round - 1, round: f.round, bracket_position: f.bp,
      home_user_id: null, away_user_id: null,
      seed_home: null, seed_away: null, is_consolation: f.consolation || false,
    })
  }

  const { error } = await supabase.from('fantasy_matchups').insert(inserts)
  if (error) {
    logger.error({ error, leagueId }, 'Failed to insert playoff bracket')
    return null
  }

  // Send clinched/missed notifications
  const allUserIds = Object.values(userStats).map(s => s.user_id)
  const playoffUserIds = new Set(seeds.map(s => s.user_id))
  try {
    const { createNotification } = await import('./notificationService.js')

    for (const uid of allUserIds) {
      if (playoffUserIds.has(uid)) {
        const seed = seeds.findIndex(s => s.user_id === uid) + 1
        await createNotification(uid, 'fantasy_playoff_clinched',
          `You clinched the #${seed} seed in the playoffs!`,
          { leagueId, seed })
      } else {
        await createNotification(uid, 'fantasy_playoff_missed',
          'Your season is over — you missed the playoffs.',
          { leagueId })
      }
    }
  } catch (err) {
    logger.error({ err }, 'Failed to send playoff clinch/miss notifications')
  }

  // Mark non-playoff members as eliminated — they can't add/drop/trade
  // for the rest of the league. Playoff qualifiers get their elimination
  // stamp later, at the end of their last playoff week if they lose out
  // (see advancePlayoffRound).
  const nonPlayoffUserIds = allUserIds.filter(uid => !playoffUserIds.has(uid))
  if (nonPlayoffUserIds.length) {
    await supabase
      .from('league_members')
      .update({ fantasy_eliminated_at: new Date().toISOString() })
      .eq('league_id', leagueId)
      .in('user_id', nonPlayoffUserIds)
      .is('fantasy_eliminated_at', null)
  }

  logger.info({ leagueId, playoffTeams, startWeek, generated: inserts.length }, 'Full playoff bracket generated')
  return { generated: inserts.length, seeds: seeds.map((s, i) => ({ user_id: s.user_id, seed: i + 1, wins: s.wins, losses: s.losses })) }
}

/**
 * After a playoff week's matchups finalize, advance winners to the next round
 * and place losers in consolation matchups. If the championship game just
 * completed, trigger league completion.
 */
export async function advancePlayoffRound(leagueId, week) {
  const settings = await getFantasySettings(leagueId)
  if (!settings || settings.format === 'salary_cap') return

  const playoffTeams = settings.playoff_teams || 4
  const def = BRACKET_DEFS[playoffTeams]
  if (!def) return

  // Get all completed playoff matchups for this week (that have users assigned)
  const { data: completedMatchups } = await supabase
    .from('fantasy_matchups')
    .select('id, bracket_position, home_user_id, away_user_id, home_points, away_points, seed_home, seed_away, is_consolation, status')
    .eq('league_id', leagueId)
    .eq('week', week)
    .eq('status', 'completed')
    .not('round', 'is', null)

  if (!completedMatchups?.length) return

  // Get all bracket matchups for this league (to update future rounds)
  const { data: allBracketMatchups } = await supabase
    .from('fantasy_matchups')
    .select('id, bracket_position, home_user_id, away_user_id, round, is_consolation')
    .eq('league_id', leagueId)
    .not('round', 'is', null)

  const byBp = {}
  for (const m of allBracketMatchups) byBp[m.bracket_position] = m

  const { createNotification } = await import('./notificationService.js')
  let championUserId = null

  for (const m of completedMatchups) {
    if (!m.home_user_id || !m.away_user_id) continue

    // Tie-break by playoff seed (lower number = higher seed = advantage).
    // No tiebreaker on points-for in playoffs because the matchup IS the
    // points-for — the standard fantasy convention of bench points needs
    // separate plumbing we don't have yet. Higher seed advancing is the
    // most common rulebook fallback and matches what most third-party
    // platforms do when the commissioner hasn't picked a tiebreaker.
    const hp = Number(m.home_points)
    const ap = Number(m.away_points)
    const homeWon = hp > ap || (hp === ap && (m.seed_home ?? 99) <= (m.seed_away ?? 99))
    const winnerId = homeWon ? m.home_user_id : m.away_user_id
    const loserId = homeWon ? m.away_user_id : m.home_user_id
    const winnerSeed = homeWon ? m.seed_home : m.seed_away
    const loserSeed = homeWon ? m.seed_away : m.seed_home

    // Check if this is the championship game
    if (m.bracket_position === def.championshipBp && !m.is_consolation) {
      championUserId = winnerId
      continue // Championship completion handled below
    }

    // Advance winner to next main-bracket round
    const winTarget = def.winners[m.bracket_position]
    if (winTarget && !m.is_consolation) {
      const [targetBp, slot] = winTarget
      const target = byBp[targetBp]
      if (target) {
        const update = slot === 'home'
          ? { home_user_id: winnerId, seed_home: winnerSeed }
          : { away_user_id: winnerId, seed_away: winnerSeed }
        await supabase.from('fantasy_matchups').update(update).eq('id', target.id)

        // Notify winner
        await createNotification(winnerId, 'fantasy_playoff_advanced',
          'You won your playoff matchup — advancing to the next round!',
          { leagueId, week }).catch(() => {})
      }
    }

    // Place loser in consolation
    const loseTarget = def.losers[m.bracket_position]
    if (loseTarget && !m.is_consolation) {
      const [targetBp, slot] = loseTarget
      const target = byBp[targetBp]
      if (target) {
        const update = slot === 'home'
          ? { home_user_id: loserId, seed_home: loserSeed }
          : { away_user_id: loserId, seed_away: loserSeed }
        await supabase.from('fantasy_matchups').update(update).eq('id', target.id)
      }

      // Notify loser (only for main bracket losses)
      await createNotification(loserId, 'fantasy_playoff_eliminated',
        'Your playoff run is over. You\'ll play in the consolation bracket.',
        { leagueId, week }).catch(() => {})
    }

    // Elimination stamp: loser is done if they have no downstream
    // bracket slot. Two cases hit this:
    //   1. Main-bracket loser with no consolation entry in def.losers
    //      (rare in current brackets — mostly the 8-team missing 7/8 game)
    //   2. Consolation-bracket loser (def.losers doesn't map consolation
    //      matchup positions to further slots)
    // Championship losers are handled elsewhere — they hit the `continue`
    // above and the league finalizes right after.
    const hasDownstream = !!loseTarget && !m.is_consolation
    if (!hasDownstream) {
      await supabase
        .from('league_members')
        .update({ fantasy_eliminated_at: new Date().toISOString() })
        .eq('league_id', leagueId)
        .eq('user_id', loserId)
        .is('fantasy_eliminated_at', null)
    }
  }

  // Championship completed — finalize the league
  if (championUserId) {
    await finalizeFantasyChampion(leagueId, championUserId, settings)
  }
}

/**
 * Called when the championship game completes. Awards bonus points,
 * determines final standings by playoff placement, marks league completed,
 * and sends champion notification.
 */
async function finalizeFantasyChampion(leagueId, championUserId, settings) {
  const { createNotification } = await import('./notificationService.js')

  // Get all playoff matchups (all rounds) to determine placement
  const { data: playoffMatchups } = await supabase
    .from('fantasy_matchups')
    .select('bracket_position, home_user_id, away_user_id, home_points, away_points, seed_home, seed_away, is_consolation, status, round')
    .eq('league_id', leagueId)
    .not('round', 'is', null)
    .eq('status', 'completed')

  const playoffTeams = settings.playoff_teams || 4
  const def = BRACKET_DEFS[playoffTeams]
  const champBp = def.championshipBp
  const champMatch = playoffMatchups?.find(m => m.bracket_position === champBp && !m.is_consolation)

  // Build final standings: 1st = champ, 2nd = champ loser, 3rd/4th from consolation, etc.
  // Tie-break by higher seed (lower seed number) — same convention used in
  // advancePlayoffRound's main-bracket advancement above.
  function pickHomeWon(matchup) {
    const hp = Number(matchup.home_points)
    const ap = Number(matchup.away_points)
    return hp > ap || (hp === ap && (matchup.seed_home ?? 99) <= (matchup.seed_away ?? 99))
  }
  const standings = []
  if (champMatch) {
    const homeWon = pickHomeWon(champMatch)
    standings.push({ user_id: homeWon ? champMatch.home_user_id : champMatch.away_user_id }) // 1st
    standings.push({ user_id: homeWon ? champMatch.away_user_id : champMatch.home_user_id }) // 2nd
  }

  // 3rd place from consolation final (same round as championship, is_consolation=true)
  const champRound = champMatch?.round
  // 3rd/4th and 5th/6th (in 8-team) are BOTH consolation matches in the final round.
  // The 3/4 game is bracket_position 4 (4-team), 7 (6-team), or 10 (8-team) per BRACKET_DEFS.
  // The 5/6 game (8-team only) is bracket_position 11.
  const consolFinals = (playoffMatchups || []).filter(m => m.round === champRound && m.is_consolation)
  // The lower bracket_position among the consolations is 3rd/4th (higher-stakes placement)
  const consol34 = consolFinals.slice().sort((a, b) => (a.bracket_position || 0) - (b.bracket_position || 0))[0]
  const consol56 = consolFinals.slice().sort((a, b) => (a.bracket_position || 0) - (b.bracket_position || 0))[1]
  if (consol34) {
    const homeWon = pickHomeWon(consol34)
    standings.push({ user_id: homeWon ? consol34.home_user_id : consol34.away_user_id }) // 3rd
    standings.push({ user_id: homeWon ? consol34.away_user_id : consol34.home_user_id }) // 4th
  }
  if (consol56) {
    // 6-team: this is actually the 5/6 game (bp5) which is scheduled the same
    // round as the semis, not the championship. So this branch only fires for
    // 8-team leagues where bp11 (5th place game) shares the championship round.
    const homeWon = pickHomeWon(consol56)
    standings.push({ user_id: homeWon ? consol56.home_user_id : consol56.away_user_id }) // 5th
    standings.push({ user_id: homeWon ? consol56.away_user_id : consol56.home_user_id }) // 6th
  }

  // 6-team edge case: the 5th/6th game (bp5 in BRACKET_DEFS[6]) is played in
  // round 2 (semis round), NOT the championship round. Pull it separately.
  if (playoffTeams === 6) {
    const bp5 = (playoffMatchups || []).find(m => m.bracket_position === 5)
    if (bp5 && bp5.home_user_id && bp5.away_user_id) {
      const homeWon = pickHomeWon(bp5)
      standings.push({ user_id: homeWon ? bp5.home_user_id : bp5.away_user_id }) // 5th
      standings.push({ user_id: homeWon ? bp5.away_user_id : bp5.home_user_id }) // 6th
    }
  }

  // 8-team: 7th/8th are the losers of consolation R1 (bp7 and bp8). No 7/8
  // matchup exists (by design — Nick opted out). Rank them by total points
  // scored across the season (regular + playoffs) since they didn't play
  // each other. Higher points = 7th.
  if (playoffTeams === 8) {
    const bp7 = (playoffMatchups || []).find(m => m.bracket_position === 7)
    const bp8 = (playoffMatchups || []).find(m => m.bracket_position === 8)
    // Loser of bp7 and bp8 didn't advance to bp11; they finish 7th/8th
    const bp7Loser = bp7 ? (pickHomeWon(bp7) ? bp7.away_user_id : bp7.home_user_id) : null
    const bp8Loser = bp8 ? (pickHomeWon(bp8) ? bp8.away_user_id : bp8.home_user_id) : null
    const candidates = [bp7Loser, bp8Loser].filter(Boolean)
    if (candidates.length === 2) {
      // Fetch season total points for both
      const { data: allMatchupsForPoints } = await supabase
        .from('fantasy_matchups')
        .select('home_user_id, away_user_id, home_points, away_points, status')
        .eq('league_id', leagueId)
        .eq('status', 'completed')
      const totalPoints = {}
      for (const m of allMatchupsForPoints || []) {
        totalPoints[m.home_user_id] = (totalPoints[m.home_user_id] || 0) + Number(m.home_points || 0)
        totalPoints[m.away_user_id] = (totalPoints[m.away_user_id] || 0) + Number(m.away_points || 0)
      }
      const [aId, bId] = candidates
      const aPts = totalPoints[aId] || 0
      const bPts = totalPoints[bId] || 0
      if (aPts >= bPts) {
        standings.push({ user_id: aId }) // 7th
        standings.push({ user_id: bId }) // 8th
      } else {
        standings.push({ user_id: bId })
        standings.push({ user_id: aId })
      }
    }
  }

  // Fill remaining positions (non-playoff teams, plus 5th-6th for 4-team)
  // by regular-season wins DESC, PF DESC as tiebreaker. Pulls once and
  // filters out anyone already placed.
  const placedIds = new Set(standings.map(s => s.user_id))
  const regStandings = await getFantasyStandings(leagueId)
  for (const s of regStandings) {
    if (placedIds.has(s.user_id)) continue
    standings.push({ user_id: s.user_id })
    placedIds.add(s.user_id)
  }

  // Get league for bonus point calculation. `member_count` is NOT a column
  // on `leagues` — selecting it bombs the query with PostgREST 42703 and
  // leaves `league` as null, which silently collapsed the entire bonus
  // distribution. No champion notification, no league_win bonus_points
  // row, no `status='completed'` flip. Source member count from the
  // authoritative league_members table instead.
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, format, sport')
    .eq('id', leagueId)
    .single()
  const { count: memberCountExact } = await supabase
    .from('league_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('league_id', leagueId)

  if (league && standings.length) {
    // Import bonus logic
    const { getTraditionalFantasyBonus } = await import('../jobs/completeLeagues.js')

    // Scale position points by the real league size, not just the 1-4 finishers
    // we materialized here. Without this, a 12-team champion's position points
    // collapse from (12+1-2)=11 to (4+1-2)=3.
    const n = memberCountExact || standings.length
    for (let i = 0; i < standings.length; i++) {
      const rank = i + 1
      const positionPts = n + 1 - 2 * rank
      const bonus = getTraditionalFantasyBonus(rank, n)
      const totalPts = positionPts + bonus

      // Stamp final_rank on the member row regardless of whether their
      // point delta rounded to zero — the rank itself is meaningful for
      // completed-league standings display.
      await supabase
        .from('league_members')
        .update({ final_rank: rank })
        .eq('league_id', leagueId)
        .eq('user_id', standings[i].user_id)

      if (totalPts !== 0) {
        // Only the champion earns a 'league_win' row — that's what the
        // Trophy Case (`/my-wins`) surfaces. Every other finisher still
        // gets their points credited (via a 'league_finish' row), but
        // no trophy. Mirrors how DFS/pickem/bracket standings are awarded.
        //
        // awardUserPoints handles: increment_user_points (global),
        // bonus_points insert (Leagues sub-tab + Trophy Case), and
        // add_sport_points_only (NFL sport sub-tab) in one call.
        const { awardUserPoints } = await import('../jobs/completeLeagues.js')
        await awardUserPoints(
          standings[i].user_id,
          league,
          totalPts,
          `Fantasy #${rank}: ${positionPts} pos + ${bonus} bonus`,
          rank === 1 ? 'league_win' : 'league_finish',
        )
      }
    }

    // Mark league completed
    await supabase.from('leagues').update({ status: 'completed' }).eq('id', leagueId)

    // Notify champion
    await createNotification(championUserId, 'fantasy_champion',
      `You are the ${league.name} champion!`,
      { leagueId, leagueName: league.name }).catch(() => {})

    // Notify all members — non-champions get the winner's name mentioned
    // so they know who to congratulate/blame, not just their own placement.
    const { data: champUser } = await supabase
      .from('users')
      .select('display_name, username')
      .eq('id', championUserId)
      .maybeSingle()
    const champName = champUser?.display_name || champUser?.username || 'the champion'

    const { data: members } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId)

    for (const m of members || []) {
      if (m.user_id === championUserId) continue
      const rank = standings.findIndex(s => s.user_id === m.user_id)
      const rankLine = rank >= 0 ? ` You finished #${rank + 1}.` : ''
      await createNotification(m.user_id, 'league_win',
        `${league.name} is complete! Congrats to ${champName}.${rankLine}`,
        { leagueId, leagueName: league.name, isWinner: false, championName: champName }).catch(() => {})
    }

    logger.info({ leagueId, championUserId }, 'Fantasy champion finalized')
  }
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
// "Is this slot a starter?" — config-agnostic. Anything not bench/IR is a
// starter. Orphan slots get demoted to bench upstream by
// fillEmptyStarterSlots so they're naturally excluded here.
function isStarterSlot(slot) {
  const s = (slot || '').toLowerCase()
  if (!s) return false
  if (s === 'bench' || s.startsWith('bench')) return false
  if (s === 'ir' || s.startsWith('ir')) return false
  return true
}

export async function scoreFantasyMatchupsWeek(week, season) {
  // 1. Find every traditional fantasy league that has a matchup for this week.
  //    This is cross-league — 100+ leagues × multiple matchups can blow past
  //    the 1000-row cap and silently leave matchups unscored. Paginate.
  const matchups = await fetchAll(
    supabase
      .from('fantasy_matchups')
      .select('id, league_id, week, home_user_id, away_user_id')
      .eq('week', week)
  )

  if (!matchups.length) {
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

  // 3a. Check for pre-set weekly lineups and override slots where applicable
  const { data: weeklyRows } = await supabase
    .from('fantasy_weekly_lineups')
    .select('league_id, user_id, player_id, slot')
    .in('league_id', leagueIds)
    .in('user_id', userIds)
    .eq('week', week)
    .eq('season', season)

  if (weeklyRows?.length) {
    // Build lookup: league|user|player → weekly slot
    const weeklySlotMap = {}
    for (const w of weeklyRows) {
      weeklySlotMap[`${w.league_id}|${w.user_id}|${w.player_id}`] = w.slot
    }
    // Build set of users who have weekly lineups
    const usersWithWeekly = new Set(weeklyRows.map((w) => `${w.league_id}|${w.user_id}`))

    // For users with a weekly lineup, override their roster slots
    // Players not in the weekly lineup (e.g. traded away then re-acquired) keep their roster slot
    for (const r of rosterRows || []) {
      const userKey = `${r.league_id}|${r.user_id}`
      if (!usersWithWeekly.has(userKey)) continue
      const weeklySlot = weeklySlotMap[`${r.league_id}|${r.user_id}|${r.player_id}`]
      if (weeklySlot) {
        r.slot = weeklySlot
      } else {
        // Player is on roster but not in weekly lineup — bench them
        r.slot = 'bench'
      }
    }

    // Clean up used weekly lineup rows
    await supabase
      .from('fantasy_weekly_lineups')
      .delete()
      .in('league_id', leagueIds)
      .eq('week', week)
      .eq('season', season)

    logger.info({ week, season, weeklyUsers: usersWithWeekly.size }, 'Applied weekly lineup overrides for scoring')
  }

  // 3b. Snapshot rosters to lineup history (idempotent — ON CONFLICT DO NOTHING)
  if (rosterRows?.length) {
    const historyRows = rosterRows.map((r) => ({
      league_id: r.league_id,
      user_id: r.user_id,
      week,
      season,
      player_id: r.player_id,
      slot: r.slot,
    }))
    // Upsert in chunks to avoid statement size limits
    const CHUNK = 500
    for (let i = 0; i < historyRows.length; i += CHUNK) {
      await supabase
        .from('fantasy_lineup_history')
        .upsert(historyRows.slice(i, i + CHUNK), { onConflict: 'league_id,user_id,week,player_id', ignoreDuplicates: true })
    }
  }

  // 4. Fetch stats for all rostered starting players
  const allPlayerIds = [...new Set((rosterRows || [])
    .filter((r) => isStarterSlot(r.slot))
    .map((r) => r.player_id))]

  const statsMap = {}
  if (allPlayerIds.length) {
    const { data: stats } = await supabase
      .from('nfl_player_stats')
      .select('player_id, pass_att, pass_cmp, pass_yd, pass_td, pass_int, rush_att, rush_yd, rush_td, rec_tgt, rec, rec_yd, rec_td, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, fgmiss_0_39, fgmiss_40_49, fgmiss_50_plus, xpm, xpa, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed, idp_tkl_solo, idp_tkl_ast, idp_tkl_loss, idp_sack, idp_int, idp_pass_def, idp_qb_hit, idp_ff, idp_fum_rec')
      .eq('week', week)
      .eq('season', season)
      .in('player_id', allPlayerIds)
    for (const st of stats || []) statsMap[st.player_id] = st
  }

  // 5. Sum starter points per (league, user) using each league's own rules
  const userPointsMap = {} // `${leagueId}|${userId}` → sum
  for (const r of rosterRows || []) {
    if (!isStarterSlot(r.slot)) continue
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

  // Notify both users when a matchup is finalized for the first time
  if (weekIsFinal) {
    try {
      const { createNotification } = await import('./notificationService.js')
      // Find matchups we just completed (not ones that were already completed before)
      for (const m of matchups) {
        if (!isTraditional[m.league_id]) continue
        const homePts = Math.round((userPointsMap[`${m.league_id}|${m.home_user_id}`] || 0) * 100) / 100
        const awayPts = Math.round((userPointsMap[`${m.league_id}|${m.away_user_id}`] || 0) * 100) / 100
        // Only notify if we haven't already (check if notification exists for this matchup)
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('type', 'fantasy_matchup_result')
          .eq('user_id', m.home_user_id)
          .contains('metadata', { matchupId: m.id })
        if (count > 0) continue

        const homeWon = homePts > awayPts
        const awayWon = awayPts > homePts
        const tie = homePts === awayPts

        // Get usernames for the message
        const { data: homeUser } = await supabase.from('users').select('display_name, username').eq('id', m.home_user_id).single()
        const { data: awayUser } = await supabase.from('users').select('display_name, username').eq('id', m.away_user_id).single()
        const homeName = homeUser?.display_name || homeUser?.username || 'Opponent'
        const awayName = awayUser?.display_name || awayUser?.username || 'Opponent'

        const meta = { leagueId: m.league_id, matchupId: m.id, week, homePoints: homePts, awayPoints: awayPts }

        // Notify home user
        const homeResult = tie ? 'tied' : homeWon ? 'won' : 'lost'
        const homeMsg = homeWon
          ? `You beat ${awayName} ${homePts}-${awayPts} in Week ${week}!`
          : tie
            ? `You tied ${awayName} ${homePts}-${awayPts} in Week ${week}`
            : `You lost to ${awayName} ${awayPts}-${homePts} in Week ${week}`
        await createNotification(m.home_user_id, 'fantasy_matchup_result', homeMsg, { ...meta, result: homeResult, opponentId: m.away_user_id })

        // Notify away user
        const awayResult = tie ? 'tied' : awayWon ? 'won' : 'lost'
        const awayMsg = awayWon
          ? `You beat ${homeName} ${awayPts}-${homePts} in Week ${week}!`
          : tie
            ? `You tied ${homeName} ${awayPts}-${homePts} in Week ${week}`
            : `You lost to ${homeName} ${homePts}-${awayPts} in Week ${week}`
        await createNotification(m.away_user_id, 'fantasy_matchup_result', awayMsg, { ...meta, result: awayResult, opponentId: m.home_user_id })
      }
    } catch (err) {
      logger.error({ err }, 'Failed to send matchup result notifications')
    }
  }

  logger.info({ week, season, scored, leagues: leagueIds.length }, 'Fantasy H2H matchup scoring complete')

  // After scoring, handle playoff lifecycle for each league
  if (weekIsFinal) {
    for (const leagueId of leagueIds) {
      const settings = await getFantasySettings(leagueId)
      if (!settings || settings.format === 'salary_cap') continue
      const startWeek = settings.playoff_start_week || 15

      if (week === startWeek - 1) {
        // Last regular season week → generate playoff bracket
        try {
          await generatePlayoffBracket(leagueId)
        } catch (err) {
          logger.error({ err, leagueId }, 'Failed to generate playoff bracket')
        }
      } else if (week >= startWeek) {
        // Playoff week → advance winners to next round
        try {
          await advancePlayoffRound(leagueId, week)
        } catch (err) {
          logger.error({ err, leagueId }, 'Failed to advance playoff round')
        }
      } else {
        // Mid-regular-season week → check if anyone just clinched
        try {
          await checkAndMarkClinch(leagueId, week)
        } catch (err) {
          logger.error({ err, leagueId }, 'Failed to check playoff clinch')
        }
      }
    }
  }

  return { scored }
}
