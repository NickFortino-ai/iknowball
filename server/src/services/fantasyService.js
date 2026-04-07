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
  }

  return { pick, remaining }
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
  return { scored }
}
