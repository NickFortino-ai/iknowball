import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

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
 * Auto-pick for a user who missed their timer.
 */
export async function autoDraftPick(leagueId, userId) {
  // Get best available player by search_rank
  const { data: draftedIds } = await supabase
    .from('fantasy_draft_picks')
    .select('player_id')
    .eq('league_id', leagueId)
    .not('player_id', 'is', null)

  const drafted = new Set((draftedIds || []).map((d) => d.player_id))

  const { data: bestAvailable } = await supabase
    .from('nfl_players')
    .select('id')
    .eq('status', 'Active')
    .in('position', ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
    .not('team', 'is', null)
    .order('search_rank', { ascending: true })
    .limit(50)

  const pick = (bestAvailable || []).find((p) => !drafted.has(p.id))
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
    .update({ draft_status: 'in_progress' })
    .eq('league_id', leagueId)

  logger.info({ leagueId }, 'Draft started')
  return { status: 'in_progress' }
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

  let dbQuery = supabase
    .from('nfl_players')
    .select('id, full_name, position, team, headshot_url, search_rank, injury_status, projected_pts_half_ppr')
    .eq('status', 'Active')
    .not('team', 'is', null)
    .order('search_rank', { ascending: true })
    .limit(50)

  if (query) {
    dbQuery = dbQuery.ilike('full_name', `%${query}%`)
  }

  if (position) {
    dbQuery = dbQuery.eq('position', position)
  }

  const { data, error } = await dbQuery
  if (error) throw error

  // Filter out taken players client-side (Supabase doesn't support NOT IN for large arrays easily)
  const excludeSet = new Set(excludeIds)
  return (data || []).filter((p) => !excludeSet.has(p.id))
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
// PLAYER DETAIL
// =====================================================================

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
  const scoringKey = settings?.scoring_format === 'ppr' ? 'pts_ppr'
    : settings?.scoring_format === 'standard' ? 'pts_std' : 'pts_half_ppr'
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
    .select('week, season, pts_ppr, pts_half_ppr, pts_std, pass_yd, pass_td, pass_int, rush_yd, rush_td, rec, rec_yd, rec_td, fum_lost, fgm, fgm_50_plus, xpm, def_td, def_int, def_sack, def_fum_rec, def_safety, def_pts_allowed')
    .eq('player_id', playerId)
    .eq('season', season)
    .order('week', { ascending: true })

  const weeklyStats = (weeks || []).map((w) => ({
    week: w.week,
    pts: Number(w[scoringKey]) || 0,
    pass_yd: Number(w.pass_yd) || 0,
    pass_td: w.pass_td || 0,
    pass_int: w.pass_int || 0,
    rush_yd: Number(w.rush_yd) || 0,
    rush_td: w.rush_td || 0,
    rec: w.rec || 0,
    rec_yd: Number(w.rec_yd) || 0,
    rec_td: w.rec_td || 0,
    fum_lost: w.fum_lost || 0,
    fgm: w.fgm || 0,
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

  // 2. Per-league scoring format
  const { data: settingsRows } = await supabase
    .from('fantasy_settings')
    .select('league_id, scoring_format, format')
    .in('league_id', leagueIds)
  const scoringByLeague = {}
  const isTraditional = {}
  for (const s of settingsRows || []) {
    scoringByLeague[s.league_id] = s.scoring_format === 'ppr' ? 'pts_ppr'
      : s.scoring_format === 'standard' ? 'pts_std' : 'pts_half_ppr'
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
      .select('player_id, pts_ppr, pts_half_ppr, pts_std')
      .eq('week', week)
      .eq('season', season)
      .in('player_id', allPlayerIds)
    for (const st of stats || []) statsMap[st.player_id] = st
  }

  // 5. Sum starter points per (league, user)
  const userPointsMap = {} // `${leagueId}|${userId}` → sum
  for (const r of rosterRows || []) {
    if (!STARTER_SLOT_KEYS.has((r.slot || '').toLowerCase())) continue
    if (!isTraditional[r.league_id]) continue
    const scoringKey = scoringByLeague[r.league_id] || 'pts_half_ppr'
    const st = statsMap[r.player_id]
    const pts = st ? Number(st[scoringKey]) || 0 : 0
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
