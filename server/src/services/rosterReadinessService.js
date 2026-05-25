import { supabase } from '../config/supabase.js'

// Per-format readiness checks for the roster_reminder cron. Each helper
// returns { ready, reason, periodKey, firstGameAt } where:
//   - ready: true if nothing to nudge about
//   - reason: short message used in the notification body
//   - periodKey: stable string used to dedupe a reminder within a period
//   - firstGameAt: Date — the moment we want to be ~1 hour ahead of
//
// Returning ready=true short-circuits the cron loop.

const NOT_READY = (reason, periodKey, firstGameAt) => ({ ready: false, reason, periodKey, firstGameAt })
const READY = () => ({ ready: true })

function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

async function earliestDfsGameStart(table, gameDate) {
  const { data } = await supabase
    .from(table)
    .select('game_starts_at')
    .eq('game_date', gameDate)
    .not('game_starts_at', 'is', null)
    .order('game_starts_at', { ascending: true })
    .limit(1)
  return data?.[0]?.game_starts_at ? new Date(data[0].game_starts_at) : null
}

async function earliestNflGameForWeek(season, week) {
  const { data } = await supabase
    .from('nfl_schedule')
    .select('game_date')
    .eq('season', season)
    .eq('week', week)
    .not('game_date', 'is', null)
    .order('game_date', { ascending: true })
    .limit(1)
  return data?.[0]?.game_date ? new Date(data[0].game_date) : null
}

async function checkSalaryCap(league, userId, fantasySettings) {
  const week = fantasySettings?.current_week || fantasySettings?.single_week || 1
  const season = fantasySettings?.season || new Date().getFullYear()
  const firstGameAt = await earliestNflGameForWeek(season, week)
  if (!firstGameAt) return READY()
  const periodKey = `${league.id}:nfl:${season}-W${week}`

  const { data: roster } = await supabase
    .from('dfs_rosters')
    .select('id')
    .eq('league_id', league.id)
    .eq('user_id', userId)
    .eq('nfl_week', week)
    .eq('season', season)
    .maybeSingle()
  if (!roster) return NOT_READY('Your salary cap roster is empty', periodKey, firstGameAt)

  const { data: slots } = await supabase
    .from('dfs_roster_slots')
    .select('roster_slot, player_id, nfl_players(injury_status)')
    .eq('roster_id', roster.id)
  const filledCount = slots?.length || 0
  if (filledCount < 9) return NOT_READY('Some salary cap slots are empty', periodKey, firstGameAt)
  const hasOut = (slots || []).some((s) => s.nfl_players?.injury_status === 'Out' || s.nfl_players?.injury_status === 'IR')
  if (hasOut) return NOT_READY('A starter on your salary cap roster is Out', periodKey, firstGameAt)
  return READY()
}

async function checkTraditionalFantasy(league, userId, fantasySettings) {
  const week = fantasySettings?.current_week || 1
  const season = fantasySettings?.season || new Date().getFullYear()
  const firstGameAt = await earliestNflGameForWeek(season, week)
  if (!firstGameAt) return READY()
  const periodKey = `${league.id}:fantasy:${season}-W${week}`

  // Pull starter slots from weekly lineup. Bench/IR aren't checked.
  const { data: lineup } = await supabase
    .from('fantasy_weekly_lineups')
    .select('player_id, slot, nfl_players(injury_status)')
    .eq('league_id', league.id)
    .eq('user_id', userId)
    .eq('week', week)
    .eq('season', season)
  const starters = (lineup || []).filter((l) => l.slot && l.slot !== 'BN' && l.slot !== 'IR')
  if (!starters.length) return NOT_READY(`Set your Week ${week} lineup`, periodKey, firstGameAt)
  const hasOut = starters.some((l) => l.nfl_players?.injury_status === 'Out' || l.nfl_players?.injury_status === 'IR')
  if (hasOut) return NOT_READY(`A starter is Out — set your Week ${week} lineup`, periodKey, firstGameAt)
  return READY()
}

async function checkDailyDfs(league, userId, sport) {
  const gameDate = todayET()
  const salariesTable = sport === 'nba' ? 'nba_dfs_salaries' : sport === 'wnba' ? 'wnba_dfs_salaries' : 'mlb_dfs_salaries'
  const rostersTable = sport === 'nba' ? 'nba_dfs_rosters' : sport === 'wnba' ? 'wnba_dfs_rosters' : 'mlb_dfs_rosters'
  const slotsTable = sport === 'nba' ? 'nba_dfs_roster_slots' : sport === 'wnba' ? 'wnba_dfs_roster_slots' : 'mlb_dfs_roster_slots'
  const expected = sport === 'mlb' ? 10 : 9  // NBA and WNBA both use 9-slot rosters

  const firstGameAt = await earliestDfsGameStart(salariesTable, gameDate)
  if (!firstGameAt) return READY()
  const periodKey = `${league.id}:${sport}:${gameDate}`

  const { data: roster } = await supabase
    .from(rostersTable)
    .select('id')
    .eq('league_id', league.id)
    .eq('user_id', userId)
    .eq('game_date', gameDate)
    .maybeSingle()
  if (!roster) return NOT_READY(`Your ${sport.toUpperCase()} DFS roster is empty for tonight`, periodKey, firstGameAt)

  const { data: slots } = await supabase
    .from(slotsTable)
    .select('roster_slot')
    .eq('roster_id', roster.id)
  if ((slots?.length || 0) < expected) return NOT_READY('Some DFS roster slots are empty', periodKey, firstGameAt)
  return READY()
}

async function checkDailyPicks(league, userId, picksTable, sport, label) {
  const gameDate = todayET()
  const salariesTable = sport === 'nba' ? 'nba_dfs_salaries' : sport === 'mlb' ? 'mlb_dfs_salaries' : null
  const firstGameAt = salariesTable ? await earliestDfsGameStart(salariesTable, gameDate) : null
  if (!firstGameAt) return READY()
  const periodKey = `${league.id}:${picksTable}:${gameDate}`

  const { data: picks } = await supabase
    .from(picksTable)
    .select('id')
    .eq('league_id', league.id)
    .eq('user_id', userId)
    .eq('game_date', gameDate)
    .limit(1)
  if (!picks?.length) return NOT_READY(`Make your ${label} picks for tonight`, periodKey, firstGameAt)
  return READY()
}

async function checkWeeklyNflPicks(league, userId, picksTable, label, fantasySettings) {
  const week = fantasySettings?.current_week || fantasySettings?.single_week || 1
  const season = fantasySettings?.season || new Date().getFullYear()
  const firstGameAt = await earliestNflGameForWeek(season, week)
  if (!firstGameAt) return READY()
  const periodKey = `${league.id}:${picksTable}:${season}-W${week}`

  const { data: picks } = await supabase
    .from(picksTable)
    .select('id')
    .eq('league_id', league.id)
    .eq('user_id', userId)
    .eq('week', week)
    .eq('season', season)
    .limit(1)
  if (!picks?.length) return NOT_READY(`Make your ${label} picks for Week ${week}`, periodKey, firstGameAt)
  return READY()
}

async function checkPickem(league, userId) {
  // Find the currently open league_week for this league.
  const nowIso = new Date().toISOString()
  const { data: weeks } = await supabase
    .from('league_weeks')
    .select('id, week_number, starts_at, ends_at')
    .eq('league_id', league.id)
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso)
    .limit(1)
  if (!weeks?.length) return READY()
  const week = weeks[0]

  // Earliest game in the week range (any sport this league covers).
  const { data: games } = await supabase
    .from('games')
    .select('starts_at')
    .gte('starts_at', week.starts_at)
    .lte('starts_at', week.ends_at)
    .order('starts_at', { ascending: true })
    .limit(1)
  const firstGameAt = games?.[0]?.starts_at ? new Date(games[0].starts_at) : null
  if (!firstGameAt) return READY()
  const periodKey = `${league.id}:pickem:${week.id}`

  const gamesPerWeek = league.settings?.games_per_week
  const { data: picks } = await supabase
    .from('picks')
    .select('id, games!inner(starts_at)', { count: 'exact' })
    .eq('user_id', userId)
    .gte('games.starts_at', week.starts_at)
    .lte('games.starts_at', week.ends_at)
  const made = (picks || []).length
  if (gamesPerWeek && made < gamesPerWeek) {
    return NOT_READY(`Make your picks for Week ${week.week_number}`, periodKey, firstGameAt)
  }
  if (!gamesPerWeek && made === 0) {
    return NOT_READY(`Make your picks for Week ${week.week_number}`, periodKey, firstGameAt)
  }
  return READY()
}

export async function checkUserReadiness(league, fantasySettings, userId) {
  const format = league.format
  if (format === 'fantasy') {
    const isSalaryCap = fantasySettings?.format === 'salary_cap'
    return isSalaryCap
      ? checkSalaryCap(league, userId, fantasySettings)
      : checkTraditionalFantasy(league, userId, fantasySettings)
  }
  if (format === 'nba_dfs') return checkDailyDfs(league, userId, 'nba')
  if (format === 'wnba_dfs') return checkDailyDfs(league, userId, 'wnba')
  if (format === 'mlb_dfs') return checkDailyDfs(league, userId, 'mlb')
  if (format === 'three_point') return checkDailyPicks(league, userId, 'three_point_picks', 'nba', 'NBA 3-Point')
  if (format === 'wnba_three_point') return checkDailyPicks(league, userId, 'wnba_three_point_picks', 'nba', 'WNBA 3-Point')
  if (format === 'strikeouts') return checkDailyPicks(league, userId, 'strikeouts_picks', 'mlb', 'Strikeouts')
  if (format === 'hr_derby') return checkDailyPicks(league, userId, 'hr_derby_picks', 'mlb', 'HR Derby')
  if (format === 'sacks') return checkWeeklyNflPicks(league, userId, 'sacks_picks', 'Sacks', fantasySettings)
  if (format === 'ints') return checkWeeklyNflPicks(league, userId, 'ints_picks', 'Interceptions', fantasySettings)
  if (format === 'tackles') return checkWeeklyNflPicks(league, userId, 'tackles_picks', 'Tackles', fantasySettings)
  if (format === 'receptions') return checkWeeklyNflPicks(league, userId, 'receptions_picks', 'Receptions', fantasySettings)
  if (format === 'td_pass') return checkWeeklyNflPicks(league, userId, 'td_pass_picks', 'TD Pass', fantasySettings)
  if (format === 'pickem') return checkPickem(league, userId)
  // Survivor has its own dedicated reminder cron; bracket/squares have
  // different deadline mechanics that don't fit this pattern.
  return READY()
}
