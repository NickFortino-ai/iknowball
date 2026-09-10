import { supabase } from '../config/supabase.js'
import { NFL_FULL_TO_ABBR, isWeekFinalNow } from './fantasyService.js'
import { logger } from '../utils/logger.js'
import { calculateFantasyPoints } from './sleeperService.js'
import { fetchAll } from '../utils/fetchAll.js'

const DFS_SLOTS = ['QB', 'RB1', 'RB2', 'WR1', 'WR2', 'WR3', 'TE', 'FLEX', 'DEF']
const FLEX_ELIGIBLE = ['RB', 'WR', 'TE']

/**
 * Get player pool with salaries for a given week.
 */
/**
 * Earliest kickoff per team for an NFL week, keyed by ABBREVIATION.
 *
 * Shared so the lineup validator and the player pool cannot disagree about
 * who is locked. Two traps live in here, both of which shipped as bugs:
 *
 *   - games.home_team is a display name ("Seattle Seahawks") while
 *     nfl_players.team is an abbreviation ("SEA"). Keying by the raw game
 *     value made every lookup miss, so nothing ever locked.
 *   - game_date is the ET calendar date but starts_at is UTC, so a Monday
 *     night kickoff (00:15Z) falls on the NEXT UTC day. A window ending at
 *     the last ET date found 15 of 16 Week 1 games and left both teams in
 *     the missing one permanently unlockable.
 */
export async function getNflKickoffByTeam(week, season) {
  const { data: weekSchedule } = await supabase
    .from('nfl_schedule')
    .select('game_date')
    .eq('season', season)
    .eq('week', week)
    .not('game_date', 'is', null)
    .order('game_date', { ascending: true })
  if (!weekSchedule?.length) return {}

  const rangeStart = weekSchedule[0].game_date
  const rangeEnd = weekSchedule[weekSchedule.length - 1].game_date
  const rangeEndUtc = new Date(new Date(`${rangeEnd}T00:00:00Z`).getTime() + 2 * 86400000).toISOString()

  const { data: nflGames } = await supabase
    .from('games')
    .select('starts_at, home_team, away_team, sports!inner(key)')
    .eq('sports.key', 'americanfootball_nfl')
    .gte('starts_at', `${rangeStart}T00:00:00Z`)
    .lt('starts_at', rangeEndUtc)

  const kickoffByTeam = {}
  for (const g of nflGames || []) {
    const kt = new Date(g.starts_at).getTime()
    for (const team of [g.home_team, g.away_team]) {
      const abbr = NFL_FULL_TO_ABBR[team]
      if (!abbr) continue
      const cur = kickoffByTeam[abbr]
      if (!cur || kt < cur) kickoffByTeam[abbr] = kt
    }
  }
  return kickoffByTeam
}

export async function getPlayerPool(week, season, position = null) {
  let query = supabase
    .from('dfs_weekly_salaries')
    .select('salary, nfl_players(id, full_name, position, team, headshot_url, injury_status)')
    .eq('nfl_week', week)
    .eq('season', season)
    // Draft rows (algorithm run but admin hasn't published yet) are
    // hidden from users so admins can preview + tweak prices before
    // the pool goes live. Auto cron path publishes immediately after
    // generation, so this only gates the manual "generate early" flow.
    .eq('published', true)
    // hidden: admin toggle for players they don't want in the user
    // pool (deep-bench third-stringers, bye-week players auto-hidden
    // during generation, etc.).
    .eq('hidden', false)
    .order('salary', { ascending: false })

  if (position) {
    if (position === 'FLEX') {
      query = query.in('nfl_players.position', FLEX_ELIGIBLE)
    } else {
      query = query.eq('nfl_players.position', position)
    }
  }

  // No cap. The old .limit(800) was sized for a "~500-player offensive pool"
  // that has since grown past 1,100, and because rows come back salary DESC
  // it truncated the CHEAPEST players — exactly the value plays needed to fit
  // a roster under the cap. A plain unbounded select would also stop at
  // Supabase's silent 1000-row limit, so page it.
  // salary is not unique (dozens of players share a price), so `id` is the
  // tiebreaker — without it the paginated scan can skip and duplicate rows
  // across page boundaries.
  const data = await fetchAll(query.order('id', { ascending: true }))

  // Only positions the salary-cap lineup can actually hold. The lineup is
  // a fixed 9 slots — QB / RB1 / RB2 / WR1 / WR2 / WR3 / TE / FLEX / DEF
  // (SLOTS in NflSalaryCapView.jsx) — with no kicker. 49 kickers were
  // being listed that no slot would accept, so tapping one did nothing.
  //
  // Deliberately NOT read from the league's roster_slots: that blob still
  // carries k/ir/bench values from the traditional-fantasy defaults and
  // the salary-cap builder ignores it entirely. If SLOTS ever becomes
  // configurable, this has to follow it.
  //
  // Filtered here rather than as a nested .in() — PostgREST filters on an
  // embedded table without !inner return the parent row with a null child
  // instead of dropping it.
  const ROSTERABLE = new Set(['QB', 'RB', 'WR', 'TE', 'DEF'])

  // Injured players are deliberately NOT filtered here. generateSalaries
  // keeps them on purpose and the pool has an "OUT" filter tab built to show
  // them — stripping them server-side emptied that tab. The client decides
  // which statuses are unavailable and routes them to that tab; the badge
  // added alongside this makes the rest visible in the main list.
  //
  // No NFL team means no game to play in. generateSalaries already skips
  // these at pricing time (`.not('team','is',null)`), but a player signed in
  // August and released in September keeps the row that was priced while he
  // still had a team — Sleeper nulls the team on the next sync and nothing
  // revisits the salary. As of 2026-09-07 that was 234 of 988 players in the
  // week 1 slate, 24% of it, priced as high as $5,500 and including Ben
  // Roethlisberger. Team defenses always carry a team, so this cannot drop
  // the DEF slot's only options.
  // is_locked: has this player's game already kicked off? The server already
  // REJECTS adding a locked player, but the pool gave the client no way to
  // show it — Jaxon Smith-Njigba sat in the list mid-game looking addable,
  // and tapping him just failed. Sent as a flag rather than filtering him
  // out, so the UI can grey him instead of having him silently vanish.
  const kickoffByTeam = await getNflKickoffByTeam(week, season)
  const now = Date.now()

  return (data || [])
    .filter((d) => ROSTERABLE.has(d.nfl_players?.position))
    .filter((d) => d.nfl_players?.team)
    .map((d) => {
      const ko = kickoffByTeam[d.nfl_players?.team]
      return {
        ...d.nfl_players,
        salary: d.salary,
        is_locked: ko != null && ko <= now,
        kickoff_at: ko != null ? new Date(ko).toISOString() : null,
      }
    })
}

/**
 * Get user's DFS roster for a specific week.
 */
export async function getDFSRoster(leagueId, userId, week, season) {
  const { data: roster } = await supabase
    .from('dfs_rosters')
    // injury_status: the pool carries it while you're picking, but the saved
    // roster did not, so a player downgraded to Questionable after you set
    // your lineup showed nothing on the surface you actually check.
    .select('*, dfs_roster_slots(*, nfl_players(id, full_name, position, team, headshot_url, injury_status))')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('nfl_week', week)
    .eq('season', season)
    .maybeSingle()

  return roster
}

/**
 * Save/update a DFS roster.
 */
export async function saveDFSRoster(leagueId, userId, week, season, slots, salaryCap) {
  // Validate slot count and types
  if (!slots || slots.length === 0) {
    const err = new Error('Roster cannot be empty')
    err.status = 400
    throw err
  }

  for (const slot of slots) {
    if (!DFS_SLOTS.includes(slot.roster_slot)) {
      const err = new Error(`Invalid roster slot: ${slot.roster_slot}`)
      err.status = 400
      throw err
    }
  }

  // Check for duplicate slots
  const slotNames = slots.map((s) => s.roster_slot)
  if (new Set(slotNames).size !== slotNames.length) {
    const err = new Error('Duplicate roster slots')
    err.status = 400
    throw err
  }

  // Validate FLEX position eligibility
  const flexSlot = slots.find((s) => s.roster_slot === 'FLEX')
  if (flexSlot) {
    const { data: flexPlayer } = await supabase
      .from('nfl_players')
      .select('position')
      .eq('id', flexSlot.player_id)
      .single()

    if (flexPlayer && !FLEX_ELIGIBLE.includes(flexPlayer.position)) {
      const err = new Error('FLEX slot must be RB, WR, or TE')
      err.status = 400
      throw err
    }
  }

  // Calculate total salary
  const totalSalary = slots.reduce((sum, s) => sum + s.salary, 0)
  if (totalSalary > salaryCap) {
    const err = new Error(`Roster exceeds salary cap ($${totalSalary.toLocaleString()} > $${salaryCap.toLocaleString()})`)
    err.status = 400
    throw err
  }

  // Upsert roster. submitted_at is intentionally cleared on every save so
  // any edit after Submit puts the lineup back into "needs resubmit" state.
  const { data: roster, error: rosterError } = await supabase
    .from('dfs_rosters')
    .upsert({
      league_id: leagueId,
      user_id: userId,
      nfl_week: week,
      season,
      total_salary: totalSalary,
      submitted_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'league_id,user_id,nfl_week,season' })
    .select()
    .single()

  if (rosterError) throw rosterError

  // Delete existing unlocked slots and re-insert
  await supabase
    .from('dfs_roster_slots')
    .delete()
    .eq('roster_id', roster.id)
    .eq('is_locked', false)

  // Insert new slots (only unlocked ones)
  const slotRows = slots
    .filter((s) => !s.is_locked)
    .map((s) => ({
      roster_id: roster.id,
      player_id: s.player_id,
      roster_slot: s.roster_slot,
      salary: s.salary,
    }))

  if (slotRows.length > 0) {
    const { error: slotsError } = await supabase
      .from('dfs_roster_slots')
      .upsert(slotRows, { onConflict: 'roster_id,roster_slot' })

    if (slotsError) throw slotsError
  }

  return getDFSRoster(leagueId, userId, week, season)
}

/**
 * Mark the current week's NFL salary cap roster as explicitly submitted.
 * Requires a full 9/9 lineup. The next save() call will clear submitted_at.
 */
export async function submitDFSRoster(leagueId, userId, week, season) {
  const { data: roster } = await supabase
    .from('dfs_rosters')
    .select('id, dfs_roster_slots(roster_slot)')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('nfl_week', week)
    .eq('season', season)
    .maybeSingle()

  if (!roster) {
    const err = new Error('No roster to submit — add players first')
    err.status = 400
    throw err
  }
  if ((roster.dfs_roster_slots || []).length < DFS_SLOTS.length) {
    const err = new Error(`Lineup incomplete — ${(roster.dfs_roster_slots || []).length}/${DFS_SLOTS.length} slots filled`)
    err.status = 400
    throw err
  }

  const submittedAt = new Date().toISOString()
  const { error } = await supabase
    .from('dfs_rosters')
    .update({ submitted_at: submittedAt, updated_at: submittedAt })
    .eq('id', roster.id)
  if (error) throw error
  return { submitted_at: submittedAt }
}

/**
 * Get DFS standings for a league.
 */
export async function getDFSStandings(leagueId) {
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('champion_metric, season')
    .eq('league_id', leagueId)
    .single()

  // fetchAll pages past the 1000-row cap. NFL DFS is weekly (18 weeks),
  // so a league would need ~55 members to bite — future-proofed here so
  // it doesn't silently truncate if the league grows.
  const results = await fetchAll(
    supabase
      .from('dfs_weekly_results')
      .select('user_id, nfl_week, total_points, week_rank, is_week_winner, users(id, username, display_name, avatar_url, avatar_emoji)')
      .eq('league_id', leagueId)
      .order('nfl_week', { ascending: true })
  )

  // Aggregate by user
  const userMap = {}
  for (const r of (results || [])) {
    if (!userMap[r.user_id]) {
      userMap[r.user_id] = {
        user: r.users,
        totalPoints: 0,
        weeklyWins: 0,
        weeks: [],
      }
    }
    userMap[r.user_id].totalPoints += Number(r.total_points)
    if (r.is_week_winner) userMap[r.user_id].weeklyWins++
    userMap[r.user_id].weeks.push({
      week: r.nfl_week,
      points: r.total_points,
      rank: r.week_rank,
      isWinner: r.is_week_winner,
    })
  }

  const standings = Object.values(userMap)

  // Sort by champion metric
  if (settings?.champion_metric === 'most_wins') {
    standings.sort((a, b) => b.weeklyWins - a.weeklyWins || b.totalPoints - a.totalPoints)
  } else {
    standings.sort((a, b) => b.totalPoints - a.totalPoints)
  }

  return {
    standings: standings.map((s, i) => ({ ...s, rank: i + 1 })),
    championMetric: settings?.champion_metric || 'total_points',
  }
}

/**
 * Get weekly scores for all members in a league.
 */
export async function getWeeklyResults(leagueId, week) {
  const { data, error } = await supabase
    .from('dfs_weekly_results')
    .select('*, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)
    .eq('nfl_week', week)
    .order('week_rank', { ascending: true })

  if (error) throw error
  return data || []
}

/**
 * Score every NFL salary cap (DFS) league for a given week+season.
 * Builds dfs_weekly_results rows with total_points, week_rank, is_week_winner.
 *
 * Should be called after nfl_player_stats is up to date for the week
 * (e.g. immediately after syncWeeklyStats). Uses the league's
 * fantasy_settings.scoring_format for the points field.
 */
export async function scoreNflDfsWeek(week, season) {
  // 1. All rosters for this week+season across every league
  const { data: rosters } = await supabase
    .from('dfs_rosters')
    .select('id, league_id, user_id, dfs_roster_slots(player_id)')
    .eq('nfl_week', week)
    .eq('season', season)

  if (!rosters?.length) {
    logger.info({ week, season }, 'NFL DFS scoring: no rosters for week')
    return { scored: 0 }
  }

  // 2. Per-league scoring rules (custom JSONB takes priority over preset)
  const leagueIds = [...new Set(rosters.map((r) => r.league_id))]
  const { data: settingsRows } = await supabase
    .from('fantasy_settings')
    .select('league_id, scoring_format, scoring_rules')
    .in('league_id', leagueIds)

  const { applyScoringRules, buildScoringRulesFromPreset } = await import('./fantasyService.js')
  const rulesByLeague = {}
  for (const s of settingsRows || []) {
    rulesByLeague[s.league_id] = s.scoring_rules || buildScoringRulesFromPreset(s.scoring_format)
  }

  // 3. All player stats for the rostered player ids this week — pull every
  // raw stat column so we can apply custom rules per league
  const allPlayerIds = [...new Set(
    rosters.flatMap((r) => (r.dfs_roster_slots || []).map((s) => s.player_id)).filter(Boolean)
  )]

  let statsMap = {}
  if (allPlayerIds.length) {
    // fetchAll: bounded by rostered players rather than the ~1,800 stat rows
    // a week holds, so at 33 distinct rostered players there is plenty of
    // headroom today. Paginated anyway because this is the SCORING read —
    // a truncated page here does not error, it just scores someone zero.
    const stats = await fetchAll(
      supabase
        .from('nfl_player_stats')
        .select('player_id, pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td, fum_lost, two_pt, fgm_0_39, fgm_40_49, fgm_50_plus, xpm, def_sack, def_int, def_fum_rec, def_td, def_safety, def_pts_allowed')
        .eq('week', week)
        .eq('season', season)
        .in('player_id', allPlayerIds)
        .order('player_id')
    )

    for (const st of stats || []) statsMap[st.player_id] = st
  }

  // GUARD: Sleeper is the sole upstream for nfl_player_stats. If it returns
  // nothing for a week, statsMap is empty, applyScoringRules(undefined, ...)
  // yields 0 for every player, and we would upsert a full slate of zeros as
  // AUTHORITATIVE results. Users wouldn't see an outage — they'd see a
  // completed week where everyone scored 0, which is corrupted standings and
  // far harder to undo than downtime. Refuse to write and shout instead.
  //
  // Guarded on allPlayerIds.length so a genuinely empty slate (no rosters
  // with players) still no-ops quietly rather than paging anyone.
  if (allPlayerIds.length && !Object.keys(statsMap).length) {
    // Before the week's first game there are legitimately no stats, so only
    // treat this as a failure once something has actually finished.
    const { nflWeekHasFinalGames } = await import('../utils/nflWeekHasFinalGames.js')
    if (!(await nflWeekHasFinalGames(week, season))) {
      logger.info({ week, season }, 'No player stats yet and no final games — nothing to score.')
      return { scored: 0 }
    }
    logger.error(
      { week, season, rosteredPlayers: allPlayerIds.length },
      'ABORT NFL DFS (salary cap): nfl_player_stats is empty for this week. Refusing to persist zeros. Check the Sleeper sync.'
    )
    try {
      const { sendAdminEmail } = await import('./emailService.js')
      await sendAdminEmail(
        `IKB: NFL DFS (salary cap) scoring aborted (week ${week})`,
        `nfl_player_stats returned NO rows for season ${season}, week ${week}, `
        + `despite ${allPlayerIds.length} rostered players.\n\n`
        + `Scoring was skipped rather than writing zeros as real results. `
        + `Standings are untouched.\n\n`
        + `Check the Sleeper sync (syncWeeklyStats), then re-run scoring for this week.`
      )
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to send scoring-abort admin alert')
    }
    return { scored: 0, aborted: 'no_player_stats' }
  }

  // 4. Aggregate per league using each league's own rules
  const leagueRosters = {}
  for (const r of rosters) {
    if (!leagueRosters[r.league_id]) leagueRosters[r.league_id] = []
    const rules = rulesByLeague[r.league_id]
    const total = (r.dfs_roster_slots || []).reduce((sum, slot) => {
      const st = statsMap[slot.player_id]
      return sum + applyScoringRules(st, rules)
    }, 0)
    leagueRosters[r.league_id].push({ userId: r.user_id, totalPoints: total })
  }

  // 5. Upsert dfs_weekly_results rows per league
  let scored = 0
  // Nobody has "won the week" until the week is over. This crowned a winner
  // on every scoring pass, so after a single Wednesday-night game the leader
  // of one played game already showed a W in the standings.
  //
  // Points and rank still update live — that is the whole point of the Live
  // tab — but is_week_winner stays false until every game in the week is
  // final, because getDFSStandings counts it as weeklyWins.
  const weekIsFinal = await isWeekFinalNow(week, season)

  for (const [leagueId, entries] of Object.entries(leagueRosters)) {
    entries.sort((a, b) => b.totalPoints - a.totalPoints)
    const results = entries.map((e, i) => ({
      league_id: leagueId,
      user_id: e.userId,
      nfl_week: week,
      season,
      total_points: e.totalPoints,
      week_rank: i + 1,
      is_week_winner: weekIsFinal && i === 0,
    }))

    const { error } = await supabase
      .from('dfs_weekly_results')
      .upsert(results, { onConflict: 'league_id,user_id,nfl_week,season' })

    if (error) {
      logger.error({ error, leagueId, week, season }, 'Failed to upsert NFL DFS weekly results')
    } else {
      scored += results.length
    }
  }

  logger.info({ week, season, scored, leagues: leagueIds.length }, 'NFL DFS week scoring complete')
  return { scored }
}

/**
 * Auto-generate salaries from player projections/rankings.
 */
// NFL DFS pricing: Value-Based Drafting (VBD) on Sleeper weekly projections.
//
// For each position, we rank players who Sleeper projects to play this week,
// pick the player at REPLACEMENT_RANK[pos] as the "replacement-level" baseline,
// and price everyone else by points-above-replacement. The position-specific
// floors/caps come from FanDuel calibration. Bye-week / inactive / unprojected
// players price at floor — they're not part of this week's slate.
//
// Why this replaces the old per-position FPPG curves: scarcity is what makes
// elite TEs valuable, and scarcity changes weekly (bye distribution, injuries).
// Sleeper's projection bakes in matchup, usage, opponent strength, and snap
// share — there's no upside left to model on top of it. This is intentionally
// simpler than the prior weighted-gamelog + staleness + starter-signal pipeline.
const REPLACEMENT_RANK = { QB: 30, RB: 30, WR: 60, TE: 25, K: 20, DEF: 20 }
const POS_FLOOR = { QB: 5500, RB: 4000, WR: 4000, TE: 3500, K: 4000, DEF: 3500 }
const POS_CAP = { QB: 10000, RB: 9600, WR: 9900, TE: 8500, K: 5800, DEF: 5500 }
// Per-position $ added per fantasy point above replacement. QB lower because
// QB projection spread is tight (8-10 pt VBD for elites) and a flat slope
// would send every starter to the cap. TEs steepest because the elite tier
// is thinnest — TE12 vs TE25 is a real chasm.
const SALARY_PER_VBD = { QB: 400, RB: 650, WR: 650, TE: 700, K: 650, DEF: 650 }

export async function generateSalaries(week, season) {
  logger.info({ week, season }, 'Generating DFS salaries')

  // Pre-fetch existing rows so we can distinguish INSERTs from UPDATEs.
  // Auto-hide rules (bye week, deep-bench QB) should only apply on the
  // FIRST insert for a (player, week, season) — otherwise regenerating
  // a week (Wed 3 AM cron running for a week the admin pre-generated
  // Tuesday and un-hid players in) would re-hide the admin's un-hides.
  // fetchAll: this is every priced row for the week — 1,112 for 2026 week 1,
  // so the silent 1000-row cap was dropping 112 of them. Those players then
  // looked like first inserts on the next regeneration and the auto-hide
  // rules re-applied, which is precisely the admin intent the comment above
  // says this query exists to preserve. player_id ordered for stable paging.
  const existingRows = await fetchAll(
    supabase
      .from('dfs_weekly_salaries')
      .select('player_id')
      .eq('season', season)
      .eq('nfl_week', week)
      .order('player_id')
  )
  const existingPlayerIds = new Set((existingRows || []).map((r) => r.player_id))

  // Pull every player we might price. Filter on team IS NOT NULL so retired
  // players (their team is nulled by the Sleeper sync) drop out; keep IR/PUP
  // so the slate surfaces them with their injury_status flagged.
  //
  // fetchAll: without pagination Supabase silently caps at 1000 rows —
  // the NFL player pool (with IDPs) exceeds 1000, and losing the tail
  // means some rostered players never get priced and their DFS slots
  // read as invalid.
  const players = await fetchAll(
    supabase
      .from('nfl_players')
      .select('id, position, team, injury_status, depth_chart_order, bye_week')
      .not('team', 'is', null)
      .in('position', ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
      .order('id')
  )

  // Sleeper weekly projections for THIS (season, week). This is the entire
  // pricing signal — no gamelog blend, no staleness discount, no defensive
  // multiplier. Sleeper already bakes in matchup, opponent, usage, snap share.
  //
  // fetchAll: nfl_player_projections has one row per player per week
  // (~2000+ rows). Without pagination, the 1000-row cap silently drops
  // ~half the projection map, which makes the VBD replacement rank
  // land on a much lower value than intended (30th-ranked QB reads as
  // ~7pts instead of ~13pts, blowing every starter's VBD past the cap).
  const projectionRows = await fetchAll(
    supabase
      .from('nfl_player_projections')
      .select('player_id, pts_half_ppr')
      .eq('season', season)
      .eq('week', week)
      .order('player_id')
  )
  const projectionMap = new Map(
    projectionRows.map((r) => [r.player_id, Number(r.pts_half_ppr) || 0])
  )
  logger.info(
    { projections_loaded: projectionMap.size, week, season },
    'Loaded Sleeper weekly projections for pricing'
  )

  // Compute replacement-level projection per position. Only players Sleeper
  // projects to actually play this week (projection > 0) enter the ranking
  // — bye-week and inactive players would otherwise drag the baseline down.
  const projByPos = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] }
  for (const p of players || []) {
    const proj = projectionMap.get(p.id)
    if (proj != null && proj > 0 && projByPos[p.position]) {
      projByPos[p.position].push(proj)
    }
  }
  const replacementByPos = {}
  for (const pos of Object.keys(REPLACEMENT_RANK)) {
    const sorted = (projByPos[pos] || []).slice().sort((a, b) => b - a)
    const rank = REPLACEMENT_RANK[pos]
    replacementByPos[pos] = sorted.length >= rank ? sorted[rank - 1] : (sorted[sorted.length - 1] || 0)
  }
  logger.info({ replacementByPos, week, season }, 'NFL VBD replacement levels')

  const salaries = []
  for (const player of players || []) {
    const pos = player.position
    if (!REPLACEMENT_RANK[pos]) continue // unknown position, skip

    const proj = projectionMap.get(player.id) || 0
    const replacement = replacementByPos[pos] || 0
    const vbd = Math.max(0, proj - replacement)

    let salary = POS_FLOOR[pos] + vbd * (SALARY_PER_VBD[pos] || 500)
    salary = Math.round(salary / 100) * 100
    salary = Math.max(POS_FLOOR[pos], Math.min(POS_CAP[pos], salary))

    // QB depth-chart override. Sleeper occasionally projects backup QBs
    // generously (4-5 pts) which would put a third-stringer near the QB
    // floor of $5,500. depth_chart_order >= 2 means Sleeper has flagged
    // them as behind another QB; force a clearly-lower price.
    if (pos === 'QB' && player.depth_chart_order && player.depth_chart_order >= 2) {
      salary = player.depth_chart_order === 2 ? 5000 : 4000
    }

    // Auto-hide criteria — only applied on INSERT (see existingPlayerIds
    // above). Includes:
    //   - Bye-week players (team on bye this week)
    //   - Deep-bench QBs (salary at or below $5,500 — third-stringers
    //     Sleeper occasionally projects generously; users shouldn't
    //     see them unless admin explicitly un-hides for a spot start)
    // Rows already in the table keep their existing `hidden` state so
    // admin un-hides survive regens.
    const isNew = !existingPlayerIds.has(player.id)
    const onBye = player.bye_week != null && player.bye_week === week
    const isDeepBenchQB = pos === 'QB' && salary <= 5500
    const row = {
      player_id: player.id,
      nfl_week: week,
      season,
      salary,
      algorithm_salary: salary,
    }
    if (isNew && (onBye || isDeepBenchQB)) row.hidden = true
    salaries.push(row)
  }

  // Honor manual overrides — fetch existing rows that admins have edited
  // and preserve their salary value while still refreshing algorithm_salary.
  // fetchAll: 107 manually-set rows today so this is not truncating yet, but
  // it reads the same 1,100-row-per-week table and every one it loses is an
  // admin's hand-set price silently reverting to the algorithm's.
  const manualRows = await fetchAll(
    supabase
      .from('dfs_weekly_salaries')
      .select('player_id, salary')
      .eq('season', season)
      .eq('nfl_week', week)
      .eq('manually_set', true)
      .order('player_id')
  )

  if (manualRows?.length) {
    const manualMap = new Map(manualRows.map((r) => [r.player_id, r.salary]))
    let preserved = 0
    for (const s of salaries) {
      if (manualMap.has(s.player_id)) {
        s.salary = manualMap.get(s.player_id)
        preserved++
      }
    }
    logger.info({ preserved, manually_set: manualRows.length }, 'Preserved admin manual salary overrides')
  }

  // Batch upsert. updated_at is set by DB trigger / column default on update.
  const CHUNK = 500
  let upserted = 0
  for (let i = 0; i < salaries.length; i += CHUNK) {
    const chunk = salaries.slice(i, i + CHUNK).map((s) => ({ ...s, updated_at: new Date().toISOString() }))
    const { error: upsertError } = await supabase
      .from('dfs_weekly_salaries')
      .upsert(chunk, { onConflict: 'player_id,nfl_week,season' })

    if (upsertError) {
      logger.error({ upsertError, offset: i }, 'Failed to upsert salary chunk')
    } else {
      upserted += chunk.length
    }
  }

  logger.info({ upserted, total: salaries.length, week, season }, 'DFS salary generation complete')
  return { upserted, total: salaries.length, manual_preserved: manualRows?.length || 0 }
}

// Flip published=true for every row in a given (week, season). Called
// automatically by the nightly cron after generateSalaries so the auto
// path is unchanged from a user's POV. Admin manual flow: call
// generateSalaries alone, tweak prices in the editor, then invoke this
// when ready for users to see the pool.
export async function publishSalaries(week, season) {
  const { data, error } = await supabase
    .from('dfs_weekly_salaries')
    .update({ published: true, updated_at: new Date().toISOString() })
    .eq('nfl_week', week)
    .eq('season', season)
    .eq('published', false)
    .select('id')
  if (error) throw error
  const count = data?.length || 0
  logger.info({ week, season, count }, 'Published DFS salaries')
  return { published: count }
}

// Draft count for a given (week, season) — powers the "N unpublished"
// status label in the admin editor.
export async function getUnpublishedSalaryCount(week, season) {
  const { count } = await supabase
    .from('dfs_weekly_salaries')
    .select('id', { count: 'exact', head: true })
    .eq('nfl_week', week)
    .eq('season', season)
    .eq('published', false)
  return count || 0
}

/**
 * Admin: set/update individual player salaries.
 */
export async function setSalaries(salaries) {
  const { error } = await supabase
    .from('dfs_weekly_salaries')
    .upsert(salaries, { onConflict: 'player_id,nfl_week,season' })

  if (error) throw error
  return { updated: salaries.length }
}
