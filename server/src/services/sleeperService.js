import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

const SLEEPER_BASE = 'https://api.sleeper.app/v1'
const SLEEPER_CDN = 'https://sleepercdn.com/content/nfl/players'
const SLEEPER_STATS = 'https://api.sleeper.com'

// Positions we sync from Sleeper. Offensive + K + team DEF feed traditional
// fantasy / TD Pass / Survivor / DFS. The IDP positions (defenders) feed the
// Sacks + Interceptions contests — Sleeper exposes per-player defensive
// stats in idp_* fields for these positions.
const SYNCED_POSITIONS = new Set([
  'QB', 'RB', 'WR', 'TE', 'K', 'DEF',
  'DE', 'DT', 'NT', 'DL', 'LB', 'ILB', 'OLB', 'MLB', 'CB', 'S', 'FS', 'SS', 'DB',
])

/**
 * Sync all NFL players from Sleeper's player database.
 * This is a large payload (~5MB) — should be cached and run at most once daily.
 */
export async function syncPlayers() {
  logger.info('Starting NFL player sync from Sleeper')

  let data
  try {
    const res = await fetch(`${SLEEPER_BASE}/players/nfl`)
    if (!res.ok) throw new Error(`Sleeper API returned ${res.status}`)
    data = await res.json()
  } catch (err) {
    logger.error({ err }, 'Failed to fetch Sleeper players')
    throw err
  }

  // ESPN team-logo URLs use lowercase abbreviations and a few special-cases
  // (Washington = wsh, Jacksonville = jax). Sleeper uses NFL standard abbrevs.
  const ESPN_NFL_ABBR = {
    ARI: 'ari', ATL: 'atl', BAL: 'bal', BUF: 'buf', CAR: 'car', CHI: 'chi',
    CIN: 'cin', CLE: 'cle', DAL: 'dal', DEN: 'den', DET: 'det', GB: 'gb',
    HOU: 'hou', IND: 'ind', JAX: 'jax', KC: 'kc', LAC: 'lac', LAR: 'lar',
    LV: 'lv', MIA: 'mia', MIN: 'min', NE: 'ne', NO: 'no', NYG: 'nyg',
    NYJ: 'nyj', PHI: 'phi', PIT: 'pit', SEA: 'sea', SF: 'sf', TB: 'tb',
    TEN: 'ten', WAS: 'wsh',
  }
  function teamLogoUrl(teamAbbr) {
    const slug = ESPN_NFL_ABBR[teamAbbr]
    return slug ? `https://a.espncdn.com/i/teamlogos/nfl/500/${slug}.png` : null
  }

  // Sleeper marks team defenses as active=false because they aren't real
  // player records. We need them anyway — without DEF rows, weekly defense
  // stats fail the foreign key check on nfl_player_stats.player_id and get
  // silently dropped. Allow DEF through regardless of the active flag.
  const players = Object.entries(data)
    .filter(([_, p]) => SYNCED_POSITIONS.has(p.position) && (p.position === 'DEF' || p.active))
    .map(([id, p]) => {
      // For team defenses, use the team logo as the headshot — Sleeper doesn't
      // host real images for DEF "players", and the team abbrev IS the player_id.
      const isDef = p.position === 'DEF'
      const fullName = isDef
        ? `${p.team || id} D/ST`
        : (p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim())
      const headshotUrl = isDef
        ? teamLogoUrl(p.team || id)
        : `${SLEEPER_CDN}/${id}.jpg`
      return {
        id,
        full_name: fullName,
        first_name: p.first_name || null,
        last_name: p.last_name || null,
        position: p.position,
        team: p.team || null,
        number: p.number || null,
        status: p.status || null,
        age: p.age || null,
        years_exp: p.years_exp ?? null,
        college: p.college || null,
        height: p.height || null,
        weight: p.weight || null,
        injury_status: p.injury_status || null,
        injury_body_part: p.injury_body_part || null,
        depth_chart_position: p.depth_chart_position || null,
        depth_chart_order: p.depth_chart_order || null,
        espn_id: p.espn_id ? String(p.espn_id) : null,
        search_rank: p.search_rank || 9999,
        headshot_url: headshotUrl,
        last_synced_at: new Date().toISOString(),
      }
    })

  logger.info({ count: players.length }, 'Parsed players from Sleeper')

  // Batch upsert in chunks of 500
  const CHUNK = 500
  let upserted = 0
  for (let i = 0; i < players.length; i += CHUNK) {
    const chunk = players.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('nfl_players')
      .upsert(chunk, { onConflict: 'id' })

    if (error) {
      logger.error({ error, offset: i }, 'Failed to upsert player chunk')
    } else {
      upserted += chunk.length
    }
  }

  // Retire-cleanup pass: any row in nfl_players not present in this active
  // set should have its team nulled out so it stops showing up in draft
  // pools. Sleeper marks retired players inactive, but we still have stale
  // rows for them with their old team — which is why someone like Ben
  // Roethlisberger was leaking into the player list years after retiring.
  const activeIds = new Set(players.map((p) => p.id))
  // Fetch ALL nfl_players with a team — table has >1000 rows, so we must
  // paginate to avoid Supabase's silent 1000-row cap.
  let existingActive = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data: page } = await supabase
      .from('nfl_players')
      .select('id')
      .not('team', 'is', null)
      .range(offset, offset + PAGE - 1)
    if (!page?.length) break
    existingActive = existingActive.concat(page)
    if (page.length < PAGE) break
  }
  const stale = existingActive.filter((r) => !activeIds.has(r.id)).map((r) => r.id)
  if (stale.length) {
    // Process in chunks to avoid IN-list payload limits
    const RETIRE_CHUNK = 200
    let retired = 0
    for (let i = 0; i < stale.length; i += RETIRE_CHUNK) {
      const ids = stale.slice(i, i + RETIRE_CHUNK)
      const { error } = await supabase
        .from('nfl_players')
        .update({ team: null, status: 'retired' })
        .in('id', ids)
      if (!error) retired += ids.length
    }
    logger.info({ retired }, 'Retired stale NFL players')
  }

  logger.info({ upserted, total: players.length }, 'NFL player sync complete')
  return { upserted, total: players.length, retired_cleanup: stale.length }
}

/**
 * Fill in nfl_players.espn_id for any active player missing it by matching
 * name+team against ESPN's per-team roster endpoint. Sleeper's espn_id field
 * is sparsely populated, so we use ESPN's own rosters as the source of truth.
 */
const ESPN_NFL_ABBR = {
  ARI: 'ari', ATL: 'atl', BAL: 'bal', BUF: 'buf', CAR: 'car', CHI: 'chi',
  CIN: 'cin', CLE: 'cle', DAL: 'dal', DEN: 'den', DET: 'det', GB: 'gb',
  HOU: 'hou', IND: 'ind', JAX: 'jax', KC: 'kc', LAC: 'lac', LAR: 'lar',
  LV: 'lv', MIA: 'mia', MIN: 'min', NE: 'ne', NO: 'no', NYG: 'nyg',
  NYJ: 'nyj', PHI: 'phi', PIT: 'pit', SEA: 'sea', SF: 'sf', TB: 'tb',
  TEN: 'ten', WAS: 'wsh',
}

function normalizeNameForEspnMatch(name) {
  if (!name) return ''
  return name
    // Strip accents
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Strip periods, hyphens, and every common apostrophe variant
    // (straight ', curly ', backtick `, left single quote ')
    .replace(/[.’‘'`\-]/g, '')
    // Strip generational suffix (jr, sr, ii-v) with optional period
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

function lastFirstInitialKey(team, normalizedName) {
  const parts = normalizedName.split(' ').filter(Boolean)
  if (parts.length < 2) return null
  const last = parts[parts.length - 1]
  const firstInitial = parts[0][0]
  if (!last || !firstInitial) return null
  return `${team}|${last}|${firstInitial}`
}

export async function enrichEspnIds() {
  logger.info('Starting ESPN ID enrichment')

  // Build two lookup maps from ESPN's per-team rosters:
  //   exactMap:   team|normalizedFullName  → espn_id   (primary match)
  //   initialMap: team|lastName|firstInit  → espn_id | 'AMBIGUOUS'
  // Falling back to last+first-initial picks up rookies / suffix mismatches
  // (Marvin Mims Jr. vs Marvin Mims, T.J. Watt vs TJ Watt) while still
  // refusing ambiguous collisions like two J. Smith on the same team.
  const exactMap = new Map()
  const initialMap = new Map()
  let rosterErrors = 0
  for (const [sleeperAbbr, espnSlug] of Object.entries(ESPN_NFL_ABBR)) {
    try {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${espnSlug}/roster`)
      if (!res.ok) { rosterErrors++; continue }
      const data = await res.json()
      const groups = Array.isArray(data.athletes) ? data.athletes : []
      for (const grp of groups) {
        const items = Array.isArray(grp?.items) ? grp.items : (grp?.id ? [grp] : [])
        for (const a of items) {
          const name = a?.displayName || a?.fullName
          if (!name || !a?.id) continue
          const norm = normalizeNameForEspnMatch(name)
          exactMap.set(`${sleeperAbbr}|${norm}`, String(a.id))
          const initialKey = lastFirstInitialKey(sleeperAbbr, norm)
          if (initialKey) {
            if (initialMap.has(initialKey)) initialMap.set(initialKey, 'AMBIGUOUS')
            else initialMap.set(initialKey, String(a.id))
          }
        }
      }
    } catch (err) {
      logger.error({ err, sleeperAbbr }, 'Failed to fetch ESPN roster')
      rosterErrors++
    }
  }

  // Pull every active, team-rostered NFL player missing espn_id
  const { data: missing, error } = await supabase
    .from('nfl_players')
    .select('id, full_name, team, position')
    .is('espn_id', null)
    .not('team', 'is', null)
    .in('position', ['QB','RB','WR','TE','K','DE','DT','NT','DL','LB','ILB','OLB','MLB','CB','S','FS','SS','DB'])

  if (error) {
    logger.error({ error }, 'Failed to fetch players missing espn_id')
    return { updated: 0, unmatched: 0, total: 0, roster_errors: rosterErrors }
  }

  let updatedExact = 0
  let updatedFuzzy = 0
  let unmatched = 0
  for (const p of (missing || [])) {
    const norm = normalizeNameForEspnMatch(p.full_name)
    let espnId = exactMap.get(`${p.team}|${norm}`)
    let matchedBy = 'exact'
    if (!espnId) {
      const initialKey = lastFirstInitialKey(p.team, norm)
      if (initialKey) {
        const fuzzy = initialMap.get(initialKey)
        if (fuzzy && fuzzy !== 'AMBIGUOUS') {
          espnId = fuzzy
          matchedBy = 'fuzzy'
        }
      }
    }
    if (!espnId) { unmatched++; continue }
    const { error: updateError } = await supabase
      .from('nfl_players')
      .update({ espn_id: espnId })
      .eq('id', p.id)
    if (!updateError) {
      if (matchedBy === 'exact') updatedExact++
      else updatedFuzzy++
    }
  }

  const result = {
    updated: updatedExact + updatedFuzzy,
    updated_exact: updatedExact,
    updated_fuzzy: updatedFuzzy,
    unmatched,
    total: missing?.length || 0,
    roster_entries: exactMap.size,
    roster_errors: rosterErrors,
  }
  logger.info(result, 'ESPN ID enrichment complete')
  return result
}

/**
 * Sync NFL schedule for a given season.
 */
export async function syncSchedule(season = 2026) {
  logger.info({ season }, 'Syncing NFL schedule from Sleeper')

  let data
  try {
    const res = await fetch(`${SLEEPER_STATS}/schedule/nfl/regular/${season}`)
    if (!res.ok) throw new Error(`Sleeper schedule API returned ${res.status}`)
    data = await res.json()
  } catch (err) {
    logger.error({ err }, 'Failed to fetch Sleeper schedule')
    throw err
  }

  if (!Array.isArray(data) || !data.length) {
    logger.warn({ season }, 'No schedule data returned')
    return { synced: 0 }
  }

  const rows = data.map((game) => ({
    season,
    week: game.week,
    home_team: game.home,
    away_team: game.away,
    game_date: game.date || null,
    status: game.status === 'complete' ? 'complete' : 'scheduled',
  }))

  const { error } = await supabase
    .from('nfl_schedule')
    .upsert(rows, { onConflict: 'season,week,home_team' })

  if (error) {
    logger.error({ error }, 'Failed to upsert schedule')
    throw error
  }

  logger.info({ synced: rows.length, season }, 'NFL schedule sync complete')
  return { synced: rows.length }
}

/**
 * Derive each NFL team's bye week from the synced nfl_schedule and stamp
 * it onto every nfl_players row for that team. NFL teams play 17 of 18
 * regular-season weeks; the one week they don't appear in the schedule is
 * their bye. Skipping teams whose schedule isn't fully loaded yet (fewer
 * than 17 game-weeks present) so we don't falsely flag a missing week as
 * a bye before Sleeper has published the full season.
 *
 * Run daily after syncPlayers + syncSchedule so newly-traded players
 * pick up their new team's bye week within 24 hours.
 */
export async function syncByeWeeks(season = 2026) {
  const { data: schedule, error } = await supabase
    .from('nfl_schedule')
    .select('week, home_team, away_team')
    .eq('season', season)

  if (error) {
    logger.error({ err: error, season }, 'syncByeWeeks: failed to fetch schedule')
    return { updated: 0 }
  }
  if (!schedule?.length) {
    logger.warn({ season }, 'syncByeWeeks: no schedule rows yet')
    return { updated: 0 }
  }

  // team → Set<week> that team plays
  const teamWeeks = {}
  for (const g of schedule) {
    for (const team of [g.home_team, g.away_team]) {
      if (!team) continue
      if (!teamWeeks[team]) teamWeeks[team] = new Set()
      teamWeeks[team].add(g.week)
    }
  }

  // For each team with a fully loaded schedule, find the missing week
  const teamByeWeek = {}
  for (const [team, weeks] of Object.entries(teamWeeks)) {
    if (weeks.size !== 17) continue // incomplete schedule, skip
    for (let w = 1; w <= 18; w++) {
      if (!weeks.has(w)) {
        teamByeWeek[team] = w
        break
      }
    }
  }

  if (!Object.keys(teamByeWeek).length) {
    logger.warn({ season }, 'syncByeWeeks: no teams have a complete 17-week schedule')
    return { updated: 0 }
  }

  // Apply per team. Cheap — ~32 updates, each hitting an indexed `team` col.
  let totalUpdated = 0
  for (const [team, byeWeek] of Object.entries(teamByeWeek)) {
    const { error: upErr, count } = await supabase
      .from('nfl_players')
      .update({ bye_week: byeWeek })
      .eq('team', team)
      .select('id', { count: 'exact', head: true })
    if (upErr) {
      logger.error({ err: upErr, team, byeWeek }, 'syncByeWeeks: update failed for team')
      continue
    }
    totalUpdated += count || 0
  }

  logger.info({ season, teamsByeAssigned: Object.keys(teamByeWeek).length, playersUpdated: totalUpdated }, 'Bye weeks synced')
  return { updated: totalUpdated, teamsByeAssigned: Object.keys(teamByeWeek).length }
}

/**
 * Sync weekly player stats from Sleeper.
 */
/**
 * Backfill an entire NFL regular season's weekly stats. Loops weeks 1..18
 * and calls syncWeeklyStats for each, with a small delay between calls
 * to be polite to Sleeper. Used to seed the DraftPlayerPreview's "last
 * season" data when we're in the offseason and don't have prior-year stats.
 */
export async function backfillSeasonStats(season) {
  const results = []
  for (let week = 1; week <= 18; week++) {
    try {
      const r = await syncWeeklyStats(season, week)
      results.push({ week, ...r })
    } catch (err) {
      logger.error({ err, season, week }, 'Backfill week failed')
      results.push({ week, error: err.message })
    }
    // 500ms between weeks
    await new Promise((res) => setTimeout(res, 500))
  }
  const totalSynced = results.reduce((sum, r) => sum + (r.synced || 0), 0)
  logger.info({ season, totalSynced, weeks: results.length }, 'Season backfill complete')
  return { season, totalSynced, weeks: results }
}

export async function syncWeeklyStats(season = 2026, week = 1) {
  logger.info({ season, week }, 'Syncing weekly player stats from Sleeper')

  // Offense + K + DEF for traditional fantasy / TD Pass / Survivor / DFS;
  // IDP positions feed Sacks + Interceptions contests (idp_* stat fields).
  const positions = [
    'QB', 'RB', 'WR', 'TE', 'K', 'DEF',
    'DE', 'DT', 'NT', 'DL', 'LB', 'ILB', 'OLB', 'MLB', 'CB', 'S', 'FS', 'SS', 'DB',
  ]
  const posParams = positions.map((p) => `position[]=${p}`).join('&')

  let data
  try {
    const res = await fetch(`${SLEEPER_STATS}/stats/nfl/${season}/${week}?season_type=regular&${posParams}`)
    if (!res.ok) throw new Error(`Sleeper stats API returned ${res.status}`)
    data = await res.json()
  } catch (err) {
    logger.error({ err }, 'Failed to fetch Sleeper stats')
    throw err
  }

  if (!Array.isArray(data) || !data.length) {
    logger.warn({ season, week }, 'No stats data returned')
    return { synced: 0 }
  }

  // Sleeper response shape: { player_id, stats: { pass_yd, gms_active, ... } }
  // Stats are nested under `stats`, NOT at the top level.
  const rows = data
    .filter((row) => row.player_id && (row.stats?.gms_active > 0 || row.stats?.gp > 0))
    .map((row) => {
      const s = row.stats || {}
      return {
        player_id: String(row.player_id),
        season,
        week,
        pass_att: s.pass_att || 0,
        pass_cmp: s.pass_cmp || 0,
        pass_yd: s.pass_yd || 0,
        pass_td: s.pass_td || 0,
        pass_int: s.pass_int || 0,
        rush_att: s.rush_att || 0,
        rush_yd: s.rush_yd || 0,
        rush_td: s.rush_td || 0,
        rec_tgt: s.rec_tgt || 0,
        rec: s.rec || 0,
        rec_yd: s.rec_yd || 0,
        rec_td: s.rec_td || 0,
        fum_lost: s.fum_lost || 0,
        two_pt: (s.pass_2pt || 0) + (s.rush_2pt || 0) + (s.rec_2pt || 0),
        fgm: s.fgm || 0,
        fga: s.fga || 0,
        fgm_0_39: (s.fgm_0_19 || 0) + (s.fgm_20_29 || 0) + (s.fgm_30_39 || 0),
        fgm_40_49: s.fgm_40_49 || 0,
        fgm_50_plus: s.fgm_50_plus || 0,
        xpm: s.xpm || 0,
        xpa: s.xpa || 0,
        def_td: s.def_td || 0,
        def_int: s.int || 0,
        def_sack: s.sack || 0,
        def_fum_rec: s.fum_rec || 0,
        def_safety: s.safe || 0,
        def_pts_allowed: s.pts_allow != null ? s.pts_allow : null,
        // Individual defensive player stats (populated on IDP rows; 0 on
        // offense/K/DEF rows where Sleeper doesn't return these keys).
        idp_sack: s.idp_sack || 0,
        idp_int: s.idp_int || 0,
        idp_tkl_solo: s.idp_tkl_solo || 0,
        idp_tkl_ast: s.idp_tkl_ast || 0,
        idp_tkl_loss: s.idp_tkl_loss || 0,
        idp_qb_hit: s.idp_qb_hit || 0,
        idp_pass_def: s.idp_pass_def || 0,
        idp_ff: s.idp_ff || 0,
        idp_fum_rec: s.idp_fum_rec || 0,
        pts_ppr: s.pts_ppr || null,
        pts_half_ppr: s.pts_half_ppr || null,
        pts_std: s.pts_std || null,
        updated_at: new Date().toISOString(),
      }
    })

  // Snapshot pre-existing stats so we can detect corrections after the upsert
  // (only meaningful outside live game windows — during games, point changes
  // are normal, not corrections)
  let oldStatsByPlayer = null
  try {
    const { isInNflGameWindow } = await import('../jobs/syncNflStats.js')
    if (!isInNflGameWindow()) {
      const { data: existing } = await supabase
        .from('nfl_player_stats')
        .select('player_id, pts_ppr, pts_half_ppr, pts_std')
        .eq('season', season)
        .eq('week', week)
        .in('player_id', rows.map((r) => r.player_id))
      oldStatsByPlayer = {}
      for (const r of existing || []) oldStatsByPlayer[r.player_id] = r
    }
  } catch { /* non-fatal */ }

  // Batch upsert with per-row fallback. If a chunk fails (likely an FK
  // violation from a player_id we don't have in nfl_players), retry each
  // row individually so one bad apple doesn't kill the whole chunk.
  const CHUNK = 500
  let upserted = 0
  let skipped = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('nfl_player_stats')
      .upsert(chunk, { onConflict: 'player_id,season,week' })

    if (!error) {
      upserted += chunk.length
      continue
    }

    // Fallback: try each row one at a time so we don't lose good rows
    logger.warn({ error: error.message, offset: i }, 'Stats chunk failed, falling back to per-row')
    for (const row of chunk) {
      const { error: rowErr } = await supabase
        .from('nfl_player_stats')
        .upsert(row, { onConflict: 'player_id,season,week' })
      if (rowErr) skipped++
      else upserted++
    }
  }
  if (skipped > 0) logger.warn({ skipped, season, week }, 'Skipped stat rows')

  // Stat correction detection — fire notifications for corrected players
  if (oldStatsByPlayer) {
    try {
      const { detectAndNotifyStatCorrections } = await import('./fantasyService.js')
      await detectAndNotifyStatCorrections(week, season, rows, oldStatsByPlayer)
    } catch (err) {
      logger.error({ err, season, week }, 'Stat correction detection failed')
    }
  }

  logger.info({ upserted, total: rows.length, season, week }, 'Weekly stats sync complete')

  // After stats are upserted, score every NFL salary cap (DFS) league for this week
  // so dfs_weekly_results / wins / standings stay current.
  try {
    const { scoreNflDfsWeek } = await import('./dfsService.js')
    await scoreNflDfsWeek(week, season)
  } catch (err) {
    logger.error({ err, season, week }, 'NFL DFS weekly scoring failed after stats sync')
  }

  // Also score traditional H2H matchups so fantasy_matchups.home_points/away_points
  // stay current. Without this, traditional standings would be all zeros.
  try {
    const { scoreFantasyMatchupsWeek } = await import('./fantasyService.js')
    await scoreFantasyMatchupsWeek(week, season)
  } catch (err) {
    logger.error({ err, season, week }, 'Fantasy H2H matchup scoring failed after stats sync')
  }

  return { upserted, total: rows.length }
}

/**
 * Sync player projections from Sleeper (for draft rankings + ADP).
 */
export async function syncProjections(season = 2026) {
  logger.info({ season }, 'Syncing player projections from Sleeper')

  // IDP positions included so defensive individuals get projected points
  // populated for draft prep in IDP-enabled leagues. Players whose roster
  // never sees them just sit with the projection unread — harmless.
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB']
  const posParams = positions.map((p) => `position[]=${p}`).join('&')

  let data
  try {
    const res = await fetch(`${SLEEPER_STATS}/projections/nfl/${season}/0?season_type=regular&${posParams}&order_by=adp_half_ppr`)
    if (!res.ok) throw new Error(`Sleeper projections API returned ${res.status}`)
    data = await res.json()
  } catch (err) {
    logger.error({ err }, 'Failed to fetch Sleeper projections')
    throw err
  }

  if (!Array.isArray(data) || !data.length) {
    logger.warn({ season }, 'No projections data returned')
    return { updated: 0 }
  }

  let updated = 0
  for (const proj of data) {
    if (!proj.player_id) continue
    const { error } = await supabase
      .from('nfl_players')
      .update({
        projected_pts_ppr: proj.stats?.pts_ppr || null,
        projected_pts_half_ppr: proj.stats?.pts_half_ppr || null,
        projected_pts_std: proj.stats?.pts_std || null,
        adp_ppr: proj.stats?.adp_ppr || null,
        adp_half_ppr: proj.stats?.adp_half_ppr || null,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', String(proj.player_id))

    if (!error) updated++
  }

  logger.info({ updated, total: data.length, season }, 'Projections sync complete')
  return { updated, total: data.length }
}

/**
 * Sync weekly player projections from Sleeper for a specific week.
 * These are per-player, per-week point projections used for matchup previews.
 * Accounts for bye weeks, matchup difficulty, and recent usage.
 */
export async function syncWeeklyProjections(season, week) {
  logger.info({ season, week }, 'Syncing weekly player projections from Sleeper')

  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB']
  const posParams = positions.map((p) => `position[]=${p}`).join('&')

  let data
  try {
    const res = await fetch(`${SLEEPER_STATS}/projections/nfl/${season}/${week}?season_type=regular&${posParams}`)
    if (!res.ok) throw new Error(`Sleeper weekly projections API returned ${res.status}`)
    data = await res.json()
  } catch (err) {
    logger.error({ err, season, week }, 'Failed to fetch Sleeper weekly projections')
    throw err
  }

  if (!Array.isArray(data) || !data.length) {
    logger.warn({ season, week }, 'No weekly projections data returned')
    return { updated: 0 }
  }

  // Sleeper returns ~3000+ projection rows per week, including many for
  // players our nfl_players table doesn't track (inactive / practice-squad
  // / D-list). Inserting those triggers FK violations on player_id and
  // silently fails the whole batch. Pre-fetch valid player IDs and also
  // drop rows that have no actual point projection.
  const validIds = new Set()
  let pageStart = 0
  const PAGE = 1000
  // Pull all nfl_players IDs (table can have >1000 rows so paginate)
  while (true) {
    const { data: chunk, error: idErr } = await supabase
      .from('nfl_players')
      .select('id')
      .range(pageStart, pageStart + PAGE - 1)
    if (idErr) {
      logger.error({ idErr }, 'Failed to fetch nfl_players ids for projection filtering')
      break
    }
    if (!chunk?.length) break
    for (const r of chunk) validIds.add(r.id)
    if (chunk.length < PAGE) break
    pageStart += PAGE
  }

  // Build upsert rows
  const rows = data
    .filter((proj) => {
      if (!proj.player_id || !proj.stats) return false
      if (!validIds.has(String(proj.player_id))) return false
      // Must have at least one populated projection field worth pricing on
      return proj.stats.pts_half_ppr != null
        || proj.stats.pts_ppr != null
        || proj.stats.pts_std != null
    })
    .map((proj) => ({
      player_id: String(proj.player_id),
      season,
      week,
      pts_ppr: proj.stats.pts_ppr ?? null,
      pts_half_ppr: proj.stats.pts_half_ppr ?? null,
      pts_std: proj.stats.pts_std ?? null,
      updated_at: new Date().toISOString(),
    }))

  logger.info({
    raw: data.length,
    valid_players: validIds.size,
    after_filter: rows.length,
    season, week,
  }, 'Filtered weekly projections')

  // Batch upsert in chunks of 500
  let updated = 0
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('nfl_player_projections')
      .upsert(chunk, { onConflict: 'player_id,season,week' })
    if (error) {
      logger.error({ error, offset: i }, 'Failed to upsert weekly projection chunk')
    } else {
      updated += chunk.length
    }
  }

  logger.info({ updated, total: rows.length, season, week }, 'Weekly projections sync complete')
  return { updated, total: rows.length }
}

/**
 * Get current NFL state (season, week, phase).
 */
export async function getNFLState() {
  try {
    const res = await fetch(`${SLEEPER_BASE}/state/nfl`)
    if (!res.ok) throw new Error(`Sleeper state API returned ${res.status}`)
    return await res.json()
  } catch (err) {
    logger.error({ err }, 'Failed to fetch NFL state')
    return null
  }
}

/**
 * Calculate fantasy points for a stat line based on scoring format.
 */
export function calculateFantasyPoints(stats, format = 'half_ppr') {
  let pts = 0

  // Passing
  pts += (stats.pass_yd || 0) * 0.04  // 1 pt per 25 yards
  pts += (stats.pass_td || 0) * 4
  pts += (stats.pass_int || 0) * -2

  // Rushing
  pts += (stats.rush_yd || 0) * 0.1   // 1 pt per 10 yards
  pts += (stats.rush_td || 0) * 6

  // Receiving
  pts += (stats.rec_yd || 0) * 0.1    // 1 pt per 10 yards
  pts += (stats.rec_td || 0) * 6
  if (format === 'ppr') pts += (stats.rec || 0) * 1
  else if (format === 'half_ppr') pts += (stats.rec || 0) * 0.5

  // Misc
  pts += (stats.fum_lost || 0) * -2
  pts += (stats.two_pt || 0) * 2

  // Kicking
  pts += (stats.fgm_0_39 || 0) * 3
  pts += (stats.fgm_40_49 || 0) * 4
  pts += (stats.fgm_50_plus || 0) * 5
  pts += (stats.xpm || 0) * 1

  // Defense
  pts += (stats.def_td || 0) * 6
  pts += (stats.def_int || 0) * 2
  pts += (stats.def_sack || 0) * 1
  pts += (stats.def_fum_rec || 0) * 2
  pts += (stats.def_safety || 0) * 2
  if (stats.def_pts_allowed != null) {
    if (stats.def_pts_allowed === 0) pts += 10
    else if (stats.def_pts_allowed <= 6) pts += 7
    else if (stats.def_pts_allowed <= 13) pts += 4
    else if (stats.def_pts_allowed <= 20) pts += 1
    else if (stats.def_pts_allowed <= 27) pts += 0
    else if (stats.def_pts_allowed <= 34) pts += -1
    else pts += -4
  }

  return Math.round(pts * 100) / 100
}
