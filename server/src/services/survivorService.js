import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from './notificationService.js'
import { checkRecordAfterSettle } from './recordService.js'

export async function submitSurvivorPick(leagueId, userId, weekId, gameId, pickedTeam) {
  // Check if league is completed
  const { data: league } = await supabase
    .from('leagues')
    .select('status, sport')
    .eq('id', leagueId)
    .single()

  if (league?.status === 'completed') {
    const err = new Error('This league has been completed')
    err.status = 400
    throw err
  }

  // Verify user is alive
  const { data: member } = await supabase
    .from('league_members')
    .select('is_alive, lives_remaining')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .single()

  if (!member) {
    const err = new Error('You are not a member of this league')
    err.status = 403
    throw err
  }

  if (!member.is_alive) {
    const err = new Error('You have been eliminated from this league')
    err.status = 400
    throw err
  }

  // Get game to determine team name
  const { data: game } = await supabase
    .from('games')
    .select('id, status, starts_at, home_team, away_team')
    .eq('id', gameId)
    .single()

  if (!game) {
    const err = new Error('Game not found')
    err.status = 404
    throw err
  }

  if (game.status !== 'upcoming') {
    const err = new Error('This game has already started')
    err.status = 400
    throw err
  }

  if (new Date(game.starts_at) <= new Date()) {
    const err = new Error('This game has already started')
    err.status = 400
    throw err
  }

  // Determine the correct league week for this game based on its start time
  const { data: gameWeek } = await supabase
    .from('league_weeks')
    .select('id')
    .eq('league_id', leagueId)
    .lte('starts_at', game.starts_at)
    .gte('ends_at', game.starts_at)
    .maybeSingle()

  const resolvedWeekId = gameWeek?.id || weekId

  const teamName = pickedTeam === 'home' ? game.home_team : game.away_team

  // Check if team has been used before in this league
  const { data: usedPicks } = await supabase
    .from('survivor_picks')
    .select('team_name')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .in('status', ['locked', 'survived', 'eliminated'])

  const usedTeams = (usedPicks || []).map((p) => p.team_name)
  if (usedTeams.includes(teamName)) {
    // Check if ALL available teams for this period are used (pool expansion)
    let poolExpanded = false
    const { data: weekBounds } = await supabase
      .from('league_weeks')
      .select('starts_at, ends_at')
      .eq('id', resolvedWeekId)
      .single()

    if (weekBounds) {
      let periodGamesQuery = supabase
        .from('games')
        .select('home_team, away_team')
        .gte('starts_at', weekBounds.starts_at)
        .lt('starts_at', weekBounds.ends_at)

      if (league.sport !== 'all') {
        const { data: sport } = await supabase
          .from('sports')
          .select('id')
          .eq('key', league.sport)
          .single()
        if (sport) periodGamesQuery = periodGamesQuery.eq('sport_id', sport.id)
      }

      const { data: periodGames } = await periodGamesQuery
      const availableTeams = new Set()
      for (const g of periodGames || []) {
        availableTeams.add(g.home_team)
        availableTeams.add(g.away_team)
      }
      poolExpanded = availableTeams.size > 0 && [...availableTeams].every((t) => usedTeams.includes(t))
    }

    if (!poolExpanded) {
      const err = new Error(`You have already used ${teamName} in this league`)
      err.status = 400
      throw err
    }
    logger.info({ leagueId, userId, teamName }, 'Pool expanded — allowing re-pick of used team')
  }

  // Upsert pick for the resolved week (based on game date, not client-supplied week)
  const { data, error } = await supabase
    .from('survivor_picks')
    .upsert(
      {
        league_id: leagueId,
        user_id: userId,
        league_week_id: resolvedWeekId,
        game_id: gameId,
        picked_team: pickedTeam,
        team_name: teamName,
        status: 'pending',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'league_id,user_id,league_week_id' }
    )
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to submit survivor pick')
    throw error
  }

  return data
}

/**
 * Submit a touchdown survivor pick — pick a player to score a non-passing TD.
 */
export async function submitTouchdownPick(leagueId, userId, weekId, playerId) {
  const { data: league } = await supabase
    .from('leagues')
    .select('status, settings')
    .eq('id', leagueId)
    .single()

  if (league?.status === 'completed') {
    const err = new Error('This league has been completed')
    err.status = 400
    throw err
  }

  // Look up the player
  const { data: player } = await supabase
    .from('nfl_players')
    .select('id, full_name, team, position, headshot_url')
    .eq('id', playerId)
    .single()

  if (!player) {
    const err = new Error('Player not found')
    err.status = 404
    throw err
  }

  // Find the player's next game to determine the week and lock time
  const now = new Date()
  const { data: upcomingGames } = await supabase
    .from('games')
    .select('id, starts_at, home_team, away_team')
    .eq('status', 'upcoming')
    .gte('starts_at', now.toISOString())
    .order('starts_at', { ascending: true })

  // Match player's team to a game
  const playerGame = (upcomingGames || []).find((g) =>
    g.home_team?.includes(player.team) || g.away_team?.includes(player.team) ||
    player.team === getTeamAbbrev(g.home_team) || player.team === getTeamAbbrev(g.away_team)
  )

  // Determine the league week
  const { data: weeks } = await supabase
    .from('league_weeks')
    .select('id, starts_at, ends_at')
    .eq('league_id', leagueId)
    .order('week_number', { ascending: true })

  let resolvedWeekId = weekId
  if (playerGame && weeks?.length) {
    const gameWeek = weeks.find((w) => playerGame.starts_at >= w.starts_at && playerGame.starts_at <= w.ends_at)
    if (gameWeek) resolvedWeekId = gameWeek.id
  }

  // Check if player has been used before
  const { data: usedPicks } = await supabase
    .from('survivor_picks')
    .select('player_id')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .in('status', ['locked', 'survived', 'eliminated'])

  const usedPlayerIds = new Set((usedPicks || []).map((p) => p.player_id).filter(Boolean))
  if (usedPlayerIds.has(playerId)) {
    const err = new Error(`You have already used ${player.full_name} in this league`)
    err.status = 400
    throw err
  }

  const { data, error } = await supabase
    .from('survivor_picks')
    .upsert(
      {
        league_id: leagueId,
        user_id: userId,
        league_week_id: resolvedWeekId,
        game_id: playerGame?.id || null,
        picked_team: null,
        team_name: player.full_name,
        player_id: playerId,
        player_name: player.full_name,
        status: 'pending',
        updated_at: now.toISOString(),
      },
      { onConflict: 'league_id,user_id,league_week_id' }
    )
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to submit touchdown survivor pick')
    throw error
  }

  return data
}

function getTeamAbbrev(fullName) {
  if (!fullName) return ''
  // Common NFL team abbreviations from full names
  const map = {
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
  return map[fullName] || ''
}

export async function deleteSurvivorPick(leagueId, userId, weekId) {
  const { data: pick } = await supabase
    .from('survivor_picks')
    .select('id, status')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('league_week_id', weekId)
    .single()

  if (!pick) {
    const err = new Error('Pick not found')
    err.status = 404
    throw err
  }

  if (pick.status !== 'pending') {
    const err = new Error('Cannot undo a locked or settled pick')
    err.status = 400
    throw err
  }

  const { error } = await supabase
    .from('survivor_picks')
    .delete()
    .eq('id', pick.id)

  if (error) throw error
}

async function getDisplayPeriodNumber(leagueId, rawWeekNumber) {
  const { data: weeks } = await supabase
    .from('league_weeks')
    .select('id, week_number')
    .eq('league_id', leagueId)
    .order('week_number', { ascending: true })

  if (!weeks?.length) return rawWeekNumber

  const { data: picks } = await supabase
    .from('survivor_picks')
    .select('league_week_id')
    .eq('league_id', leagueId)

  const weekIdsWithPicks = new Set((picks || []).map((p) => p.league_week_id))

  const now = new Date().toISOString()
  const { data: currentWeekRows } = await supabase
    .from('league_weeks')
    .select('id')
    .eq('league_id', leagueId)
    .lte('starts_at', now)
    .gte('ends_at', now)
    .limit(1)

  const currentWeekId = currentWeekRows?.[0]?.id

  const firstActiveIndex = weeks.findIndex(
    (w) => weekIdsWithPicks.has(w.id) || w.id === currentWeekId
  )

  const targetIndex = weeks.findIndex((w) => w.week_number === rawWeekNumber)

  if (firstActiveIndex >= 0 && targetIndex >= 0) {
    return targetIndex - firstActiveIndex + 1
  }
  return rawWeekNumber
}

export async function getSurvivorBoard(leagueId, requestingUserId) {
  const { data: members } = await supabase
    .from('league_members')
    .select('*, users(id, username, display_name, avatar_url, avatar_emoji)')
    .eq('league_id', leagueId)
    .order('is_alive', { ascending: false })

  const { data: picks } = await supabase
    .from('survivor_picks')
    .select('*, league_weeks(week_number), games(starts_at)')
    .eq('league_id', leagueId)
    .order('league_weeks(week_number)', { ascending: true })

  const { data: weeks } = await supabase
    .from('league_weeks')
    .select('*')
    .eq('league_id', leagueId)
    .order('week_number', { ascending: true })

  // Find current week
  const now = new Date().toISOString()
  const currentWeek = (weeks || []).find((w) => w.starts_at <= now && w.ends_at >= now)
  const currentWeekId = currentWeek?.id

  // Check if requesting user has made their pick for the current week
  const userCurrentPick = currentWeekId && (picks || []).find(
    (p) => p.user_id === requestingUserId && p.league_week_id === currentWeekId
  )
  const userHasPicked = !!userCurrentPick

  // Determine pick week: if user's current pick is locked/settled, advance to next week
  let pickWeek = currentWeek
  let pickWeekUserHasPicked = userHasPicked
  if (userCurrentPick && userCurrentPick.status !== 'pending') {
    const currentIdx = (weeks || []).findIndex((w) => w.id === currentWeekId)
    const nextWeek = currentIdx >= 0 ? weeks[currentIdx + 1] : null
    if (nextWeek) {
      pickWeek = nextWeek
      pickWeekUserHasPicked = (picks || []).some(
        (p) => p.user_id === requestingUserId && p.league_week_id === nextWeek.id
      )
    } else {
      pickWeek = null
      pickWeekUserHasPicked = false
    }
  }

  // Group picks by user, hiding other users' picks until their picked game has started
  const picksByUser = {}
  for (const pick of picks || []) {
    if (!picksByUser[pick.user_id]) picksByUser[pick.user_id] = []
    const isOtherUser = pick.user_id !== requestingUserId
    const gameStarted = pick.games?.starts_at && new Date(pick.games.starts_at) <= new Date()
    const isSettled = pick.status === 'won' || pick.status === 'lost'
    if (isOtherUser && !gameStarted && !isSettled) {
      picksByUser[pick.user_id].push({ ...pick, team_name: 'Locked', game_id: null })
    } else {
      picksByUser[pick.user_id].push(pick)
    }
  }

  // Compute display period number for the pick week
  const weekIdsWithPicks = new Set((picks || []).map((p) => p.league_week_id))
  const firstActiveIndex = (weeks || []).findIndex(
    (w) => weekIdsWithPicks.has(w.id) || w.id === currentWeekId
  )
  const pickWeekIndex = pickWeek
    ? (weeks || []).findIndex((w) => w.id === pickWeek.id)
    : -1
  const displayPeriodNumber = firstActiveIndex >= 0 && pickWeekIndex >= 0
    ? pickWeekIndex - firstActiveIndex + 1
    : pickWeek?.week_number || null

  // Find user's current pick for the pick week (for highlighting in form)
  const userPickWeekPick = pickWeek && (picks || []).find(
    (p) => p.user_id === requestingUserId && p.league_week_id === pickWeek.id
  )

  // Check for survivor winner (bonus_points entry with type 'survivor_win')
  const { data: winnerBonus } = await supabase
    .from('bonus_points')
    .select('user_id, points')
    .eq('league_id', leagueId)
    .eq('type', 'survivor_win')
    .maybeSingle()

  let survivorWinner = null
  if (winnerBonus) {
    const { count: memberCount } = await supabase
      .from('league_members')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)

    survivorWinner = {
      user_id: winnerBonus.user_id,
      points: winnerBonus.points,
      outlasted: (memberCount || 1) - 1,
    }
  }

  return {
    members: (members || []).map((m) => ({
      ...m,
      picks: picksByUser[m.user_id] || [],
    })),
    weeks: weeks || [],
    user_has_picked: !!pickWeekUserHasPicked,
    display_period_number: displayPeriodNumber,
    pick_week: pickWeek,
    current_pick: userPickWeekPick ? { team_name: userPickWeekPick.team_name, game_id: userPickWeekPick.game_id } : null,
    survivor_winner: survivorWinner,
  }
}

export async function getUsedTeams(leagueId, userId) {
  const { data, error } = await supabase
    .from('survivor_picks')
    .select('team_name, status')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .in('status', ['locked', 'survived', 'eliminated'])

  if (error) throw error
  return (data || []).map((p) => p.team_name)
}

/**
 * Score touchdown survivor picks for a completed NFL game.
 * Checks ESPN box score for non-passing TDs by each picked player.
 */
export async function scoreTouchdownSurvivorPicks(gameId) {
  // Find locked touchdown survivor picks for this game
  const { data: picks, error } = await supabase
    .from('survivor_picks')
    .select('*, leagues(name, settings), league_weeks(week_number)')
    .eq('game_id', gameId)
    .eq('status', 'locked')
    .not('player_id', 'is', null)

  if (error || !picks?.length) return

  // Get the game's external_id for ESPN lookup
  const { data: game } = await supabase
    .from('games')
    .select('external_id, sports(key)')
    .eq('id', gameId)
    .single()

  if (!game?.external_id) return

  // Fetch ESPN box score to find TD scorers
  const espnPath = game.sports?.key === 'americanfootball_nfl' ? 'football/nfl' : null
  if (!espnPath) return

  // Fetch the ESPN scoreboard to find the event by team matching
  const gameRow = await supabase.from('games').select('starts_at, home_team, away_team').eq('id', gameId).single()
  const gd = gameRow.data
  if (!gd) return

  const etDate = new Date(new Date(gd.starts_at).toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const dateStr = `${etDate.getFullYear()}${String(etDate.getMonth() + 1).padStart(2, '0')}${String(etDate.getDate()).padStart(2, '0')}`

  let tdPlayerIds = new Set()
  try {
    const sbRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${espnPath}/scoreboard?dates=${dateStr}`)
    if (!sbRes.ok) return
    const sbData = await sbRes.json()

    // Find the matching event
    const matchTeam = (a, b) => {
      const an = a.toLowerCase(), bn = b.toLowerCase()
      if (an.includes(bn) || bn.includes(an)) return true
      return an.split(/\s+/).pop() === bn.split(/\s+/).pop()
    }
    const espnEvent = (sbData.events || []).find((ev) => {
      const comp = ev.competitions?.[0]
      if (!comp) return false
      const h = comp.competitors?.find((c) => c.homeAway === 'home')
      const a = comp.competitors?.find((c) => c.homeAway === 'away')
      return h && a && matchTeam(h.team?.displayName || '', gd.home_team) && matchTeam(a.team?.displayName || '', gd.away_team)
    })

    if (!espnEvent) return

    // Fetch the summary for scoring plays
    const sumRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${espnPath}/summary?event=${espnEvent.id}`)
    if (!sumRes.ok) return
    const summary = await sumRes.json()

    // Extract TD scorers from scoring plays
    const scoringPlays = summary.scoringPlays || []
    for (const play of scoringPlays) {
      const text = (play.text || '').toLowerCase()
      // Non-passing TDs: rush, reception, fumble recovery, kick/punt return
      const isNonPassTD = text.includes('rush') || text.includes('reception') || text.includes('return') ||
        text.includes('fumble') || text.includes('run ')
      const isPassTD = text.includes('pass') && !text.includes('return')

      if (isNonPassTD || !isPassTD) {
        // The scorer is typically the first athlete mentioned
        if (play.athleteId) tdPlayerIds.add(String(play.athleteId))
        // Also check scoringAthletes array
        for (const sa of play.scoringAthletes || []) {
          if (sa.id) tdPlayerIds.add(String(sa.id))
        }
      }
    }
  } catch (err) {
    logger.error({ err, gameId }, 'Failed to fetch TD scoring data from ESPN')
    return
  }

  // Score each pick
  for (const pick of picks) {
    const { data: memberCheck } = await supabase
      .from('league_members')
      .select('is_alive')
      .eq('league_id', pick.league_id)
      .eq('user_id', pick.user_id)
      .single()

    if (memberCheck && !memberCheck.is_alive) continue

    // Look up the player's ESPN ID from nfl_players
    const { data: nflPlayer } = await supabase
      .from('nfl_players')
      .select('espn_id')
      .eq('id', pick.player_id)
      .single()

    const espnId = nflPlayer?.espn_id
    const survived = espnId ? tdPlayerIds.has(espnId) : false

    const isDaily = pick.leagues?.settings?.pick_frequency === 'daily'
    const periodLabel = isDaily ? 'Day' : 'Week'
    const rawWeekNum = pick.league_weeks?.week_number || '?'
    const periodNum = rawWeekNum !== '?' ? await getDisplayPeriodNumber(pick.league_id, rawWeekNum) : '?'
    const leagueName = pick.leagues?.name || 'Touchdown Survivor'

    await supabase
      .from('survivor_picks')
      .update({ status: survived ? 'survived' : 'eliminated', updated_at: new Date().toISOString() })
      .eq('id', pick.id)

    if (survived) {
      await createNotification(pick.user_id, 'survivor_result',
        `${pick.player_name} scored a TD! You survived ${periodLabel} ${periodNum} in ${leagueName}!`,
        { leagueId: pick.league_id })
    } else {
      const { data: member } = await supabase
        .from('league_members')
        .select('lives_remaining')
        .eq('league_id', pick.league_id)
        .eq('user_id', pick.user_id)
        .single()

      const newLives = Math.max(0, (member?.lives_remaining || 1) - 1)
      await supabase
        .from('league_members')
        .update({ lives_remaining: newLives, is_alive: newLives > 0, eliminated_week: newLives === 0 ? rawWeekNum : null, updated_at: new Date().toISOString() })
        .eq('league_id', pick.league_id)
        .eq('user_id', pick.user_id)

      if (newLives > 0) {
        await createNotification(pick.user_id, 'survivor_result',
          `${pick.player_name} didn't score a TD in ${periodLabel} ${periodNum} of ${leagueName} (${newLives} lives remaining)`,
          { leagueId: pick.league_id })
      } else {
        await createNotification(pick.user_id, 'survivor_result',
          `${pick.player_name} didn't score a TD — you've been eliminated from ${leagueName}`,
          { leagueId: pick.league_id, streakEnded: true })
      }
    }
  }

  // Check for winner
  const leagueIds = [...new Set(picks.map((p) => p.league_id))]
  for (const leagueId of leagueIds) {
    await checkSurvivorWinner(leagueId)
  }

  logger.info({ gameId, picks: picks.length, tdPlayers: tdPlayerIds.size }, 'Touchdown survivor picks scored')
}

export async function scoreSurvivorPicks(gameId, winner) {
  // Find all locked survivor picks for this game
  const { data: picks, error } = await supabase
    .from('survivor_picks')
    .select('*, leagues(name, settings), league_weeks(week_number)')
    .eq('game_id', gameId)
    .eq('status', 'locked')

  if (error) {
    logger.error({ error, gameId }, 'Failed to fetch survivor picks for scoring')
    return
  }

  if (!picks?.length) return

  // Collect deferred notifications — we send them AFTER checkSurvivorWinner
  // so that if all users are eliminated and revived, we don't send false
  // elimination notifications.
  const deferredNotifications = []
  const deferredPickDeletions = []

  for (const pick of picks) {
    // Skip picks for members already eliminated (e.g. by missed pick or earlier game)
    const { data: memberCheck } = await supabase
      .from('league_members')
      .select('is_alive')
      .eq('league_id', pick.league_id)
      .eq('user_id', pick.user_id)
      .single()

    if (memberCheck && !memberCheck.is_alive) continue

    const isDaily = pick.leagues?.settings?.pick_frequency === 'daily'
    const periodLabel = isDaily ? 'Day' : 'Week'
    const rawWeekNum = pick.league_weeks?.week_number || '?'
    const periodNum = rawWeekNum !== '?' ? await getDisplayPeriodNumber(pick.league_id, rawWeekNum) : '?'
    const leagueName = pick.leagues?.name || 'Survivor'

    if (winner === null) {
      // Push - treat as survived
      await supabase
        .from('survivor_picks')
        .update({ status: 'survived', updated_at: new Date().toISOString() })
        .eq('id', pick.id)

      deferredNotifications.push({ userId: pick.user_id, leagueId: pick.league_id,
        message: `You survived ${periodLabel} ${periodNum} in ${leagueName}!`, onlyIfAlive: false })
      continue
    }

    const survived = pick.picked_team === winner

    await supabase
      .from('survivor_picks')
      .update({
        status: survived ? 'survived' : 'eliminated',
        updated_at: new Date().toISOString(),
      })
      .eq('id', pick.id)

    if (survived) {
      deferredNotifications.push({ userId: pick.user_id, leagueId: pick.league_id,
        message: `You survived ${periodLabel} ${periodNum} in ${leagueName}!`, onlyIfAlive: false })
    }

    if (!survived) {
      // Decrement lives
      const { data: member } = await supabase
        .from('league_members')
        .select('lives_remaining')
        .eq('league_id', pick.league_id)
        .eq('user_id', pick.user_id)
        .single()

      const newLives = (member?.lives_remaining || 1) - 1

      if (newLives <= 0) {
        // Get week number for eliminated_week
        const { data: week } = await supabase
          .from('league_weeks')
          .select('week_number')
          .eq('id', pick.league_week_id)
          .single()

        await supabase
          .from('league_members')
          .update({
            is_alive: false,
            lives_remaining: 0,
            eliminated_week: week?.week_number || null,
          })
          .eq('league_id', pick.league_id)
          .eq('user_id', pick.user_id)

        // Defer elimination notification — only send if user is still eliminated
        // after checkSurvivorWinner (which may revive everyone)
        deferredNotifications.push({ userId: pick.user_id, leagueId: pick.league_id,
          message: `You were eliminated in ${periodLabel} ${periodNum} of ${leagueName}`,
          onlyIfEliminated: true })

        // Defer pending pick deletion — only delete if user stays eliminated
        // (if all users are eliminated and revived, their future picks should remain)
        deferredPickDeletions.push({ userId: pick.user_id, leagueId: pick.league_id })
      } else {
        await supabase
          .from('league_members')
          .update({ lives_remaining: newLives })
          .eq('league_id', pick.league_id)
          .eq('user_id', pick.user_id)

        deferredNotifications.push({ userId: pick.user_id, leagueId: pick.league_id,
          message: `You lost a life in ${periodLabel} ${periodNum} of ${leagueName} (${newLives} remaining)`,
          onlyIfAlive: false })
      }
    }
  }

  // Check for winner after processing all picks — this may revive all-eliminated users
  const leagueIds = [...new Set(picks.map((p) => p.league_id))]
  for (const leagueId of leagueIds) {
    await checkSurvivorWinner(leagueId)
  }

  // Delete pending future picks only for users who are still eliminated
  for (const d of deferredPickDeletions) {
    const { data: check } = await supabase
      .from('league_members')
      .select('is_alive')
      .eq('league_id', d.leagueId)
      .eq('user_id', d.userId)
      .single()
    if (!check?.is_alive) {
      await supabase
        .from('survivor_picks')
        .delete()
        .eq('league_id', d.leagueId)
        .eq('user_id', d.userId)
        .eq('status', 'pending')
    }
  }

  // Now send deferred notifications, checking current alive status for elimination ones
  for (const n of deferredNotifications) {
    if (n.onlyIfEliminated) {
      // Re-check if user is actually still eliminated (may have been revived)
      const { data: check } = await supabase
        .from('league_members')
        .select('is_alive')
        .eq('league_id', n.leagueId)
        .eq('user_id', n.userId)
        .single()
      if (check?.is_alive) {
        // User was revived — send survival notification instead
        await createNotification(n.userId, 'survivor_result',
          'Everyone was eliminated — you all survive! Pick again next round.',
          { leagueId: n.leagueId })
        continue
      }
    }
    await createNotification(n.userId, 'survivor_result', n.message, { leagueId: n.leagueId })
  }

  logger.info({ gameId, picksScored: picks.length }, 'Survivor picks scored')
}

export async function autoEliminateMissedPicks() {
  // Find active survivor leagues
  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, sport, name, settings')
    .eq('format', 'survivor')
    .neq('status', 'completed')

  if (!leagues?.length) return

  const now = new Date().toISOString()

  for (const league of leagues) {
    const isDaily = league.settings?.pick_frequency === 'daily'
    const periodLabel = isDaily ? 'Day' : 'Week'

    // Get weeks that have started and haven't been processed yet
    // (includes in-progress weeks so we can settle as soon as all games are final)
    const { data: weeks } = await supabase
      .from('league_weeks')
      .select('*')
      .eq('league_id', league.id)
      .lte('starts_at', now)
      .eq('missed_picks_processed', false)
      .order('week_number', { ascending: true })

    if (!weeks?.length) continue

    for (const week of weeks) {
      // Don't retroactively eliminate users for periods that ended more than
      // 24 hours ago — this guards against backfills, cron downtime, and any
      // case where a period was added or activated after it had already ended.
      const weekEndedMs = new Date(week.ends_at).getTime()
      const ageHours = (Date.now() - weekEndedMs) / (1000 * 60 * 60)
      if (ageHours > 24) {
        await supabase
          .from('league_weeks')
          .update({ missed_picks_processed: true })
          .eq('id', week.id)
        logger.info({ leagueId: league.id, weekId: week.id, ageHours }, 'Skipping retroactive missed-pick processing for old period')
        continue
      }

      const displayPeriodNum = await getDisplayPeriodNumber(league.id, week.week_number)

      // Count games in this period, filtered by sport if not 'all'
      let gamesQuery = supabase
        .from('games')
        .select('id, status, home_team, away_team')
        .gte('starts_at', week.starts_at)
        .lt('starts_at', week.ends_at)

      if (league.sport !== 'all') {
        const { data: sport } = await supabase
          .from('sports')
          .select('id')
          .eq('key', league.sport)
          .single()

        if (sport) {
          gamesQuery = gamesQuery.eq('sport_id', sport.id)
        }
      }

      const { data: games } = await gamesQuery

      // No games in this period — nothing to pick, skip
      if (!games?.length) {
        await supabase
          .from('league_weeks')
          .update({ missed_picks_processed: true })
          .eq('id', week.id)
        continue
      }

      // If any game is NOT final, period is still in progress — skip
      const allFinal = games.every((g) => g.status === 'final')
      if (!allFinal) continue

      // Get alive members
      const { data: aliveMembers } = await supabase
        .from('league_members')
        .select('user_id, lives_remaining')
        .eq('league_id', league.id)
        .eq('is_alive', true)

      if (!aliveMembers?.length) {
        await supabase
          .from('league_weeks')
          .update({ missed_picks_processed: true })
          .eq('id', week.id)
        continue
      }

      // Get existing picks for this week
      const { data: existingPicks } = await supabase
        .from('survivor_picks')
        .select('user_id')
        .eq('league_id', league.id)
        .eq('league_week_id', week.id)

      const pickedUserIds = new Set((existingPicks || []).map((p) => p.user_id))

      // Find alive members with no pick for this week
      const missedMembers = aliveMembers.filter((m) => !pickedUserIds.has(m.user_id))

      // Collect all team names available in this period
      const periodTeamNames = new Set()
      for (const g of games) {
        periodTeamNames.add(g.home_team)
        periodTeamNames.add(g.away_team)
      }

      // Filter out members who had no available teams (pool exhaustion — not their fault)
      const membersToEliminate = []
      for (const member of missedMembers) {
        const { data: memberUsedPicks } = await supabase
          .from('survivor_picks')
          .select('team_name')
          .eq('league_id', league.id)
          .eq('user_id', member.user_id)
          .in('status', ['locked', 'survived', 'eliminated'])

        const memberUsedTeams = new Set((memberUsedPicks || []).map((p) => p.team_name))
        const hadAvailableTeam = [...periodTeamNames].some((t) => !memberUsedTeams.has(t))

        if (hadAvailableTeam) {
          membersToEliminate.push(member)
        } else {
          logger.info({ leagueId: league.id, userId: member.user_id, week: week.week_number },
            'Skipping missed-pick elimination — all available teams were used (pool expanded)')
        }
      }

      for (const member of membersToEliminate) {
        const newLives = (member.lives_remaining || 1) - 1

        if (newLives <= 0) {
          await supabase
            .from('league_members')
            .update({
              is_alive: false,
              lives_remaining: 0,
              eliminated_week: week.week_number,
            })
            .eq('league_id', league.id)
            .eq('user_id', member.user_id)

          await createNotification(member.user_id, 'survivor_result',
            `You were eliminated in ${periodLabel} ${displayPeriodNum} of ${league.name} (missed pick)`,
            { leagueId: league.id })

          // Delete any pending future picks
          await supabase
            .from('survivor_picks')
            .delete()
            .eq('league_id', league.id)
            .eq('user_id', member.user_id)
            .eq('status', 'pending')
        } else {
          await supabase
            .from('league_members')
            .update({ lives_remaining: newLives })
            .eq('league_id', league.id)
            .eq('user_id', member.user_id)

          await createNotification(member.user_id, 'survivor_result',
            `You lost a life in ${periodLabel} ${displayPeriodNum} of ${league.name} (missed pick, ${newLives} remaining)`,
            { leagueId: league.id })
        }
      }

      // Mark week as processed
      await supabase
        .from('league_weeks')
        .update({ missed_picks_processed: true })
        .eq('id', week.id)

      // Check for winner (handles single survivor + all-eliminated-survive)
      await checkSurvivorWinner(league.id)
    }
  }

  logger.info('Auto-eliminate missed survivor picks completed')
}

export async function settleSurvivorLeague(leagueId, userId) {
  // Verify the requesting user IS the winner
  const { data: bonusEntry } = await supabase
    .from('bonus_points')
    .select('user_id, points')
    .eq('league_id', leagueId)
    .eq('type', 'survivor_win')
    .eq('user_id', userId)
    .maybeSingle()

  if (!bonusEntry) {
    const err = new Error('You are not the winner of this league')
    err.status = 403
    throw err
  }

  // Check league is not already completed
  const { data: league } = await supabase
    .from('leagues')
    .select('status, name, settings')
    .eq('id', leagueId)
    .single()

  if (!league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }

  if (league.status === 'completed') {
    const err = new Error('League is already settled')
    err.status = 400
    throw err
  }

  const { count: memberCount } = await supabase
    .from('league_members')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId)

  const outlasted = (memberCount || 1) - 1
  const leagueName = league.name || 'Survivor'

  // Mark league as completed
  await supabase
    .from('leagues')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', leagueId)

  // Send settle notification
  await createNotification(userId, 'survivor_result',
    `You settled ${leagueName}. Great run!`,
    { leagueId, settled: true, leagueName, points: bonusEntry.points, outlasted })

  // Check survivor streak record
  try {
    await checkRecordAfterSettle(userId, 'survivor', {})
  } catch (err) {
    logger.error({ err, leagueId, userId }, 'Failed to check survivor streak record on settle')
  }

  return { points: bonusEntry.points, outlasted }
}

async function checkSurvivorWinner(leagueId) {
  const { data: aliveMembers } = await supabase
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId)
    .eq('is_alive', true)

  if (!aliveMembers) return

  // Check for existing survivor_win bonus (prevents double-award)
  const { data: existingBonus } = await supabase
    .from('bonus_points')
    .select('id')
    .eq('league_id', leagueId)
    .eq('type', 'survivor_win')
    .limit(1)

  const bonusExists = existingBonus?.length > 0

  // Get league info
  const { data: league } = await supabase
    .from('leagues')
    .select('name, sport, settings')
    .eq('id', leagueId)
    .single()

  if (aliveMembers.length === 1 && !bonusExists) {
    // First time single survivor — award bonus, send win notification, but do NOT mark league completed
    const winnerId = aliveMembers[0].user_id

    const { count: memberCount } = await supabase
      .from('league_members')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)

    let winnerBonus
    if (memberCount >= 41) winnerBonus = 100
    else if (memberCount >= 31) winnerBonus = 75
    else if (memberCount >= 16) winnerBonus = 50
    else if (memberCount >= 11) winnerBonus = 30
    else if (memberCount >= 6) winnerBonus = 20
    else winnerBonus = 10

    const outlasted = (memberCount || 1) - 1

    // Award bonus to global points
    const { error } = await supabase.rpc('increment_user_points', {
      user_row_id: winnerId,
      points_delta: winnerBonus,
    })

    if (error) {
      logger.error({ error, winnerId, leagueId }, 'Failed to award survivor winner bonus')
    } else {
      logger.info({ winnerId, leagueId, winnerBonus, memberCount }, 'Survivor winner awarded')
    }

    // Record bonus_points entry for pick history
    await supabase.from('bonus_points').insert({
      user_id: winnerId,
      league_id: leagueId,
      type: 'survivor_win',
      label: `Survivor Pool win +${winnerBonus}`,
      points: winnerBonus,
    })

    // Award bonus to sport stats
    if (league?.sport && league.sport !== 'all') {
      const { data: sport } = await supabase
        .from('sports')
        .select('id')
        .eq('key', league.sport)
        .single()

      if (sport) {
        const { error: statsError } = await supabase
          .rpc('update_sport_stats', {
            p_user_id: winnerId,
            p_sport_id: sport.id,
            p_is_correct: true,
            p_points: winnerBonus,
          })

        if (statsError) {
          logger.error({ statsError, winnerId, leagueId }, 'Failed to update sport stats for survivor bonus')
        }
      }
    }

    // Send survivor_win notification and mark league completed
    const leagueName = league?.name || 'Survivor'
    await createNotification(winnerId, 'survivor_win',
      `You won the ${leagueName} survivor pool! +${winnerBonus} pts`,
      { leagueId, points: winnerBonus, outlasted, leagueName })

    // Mark league as completed
    await supabase
      .from('leagues')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', leagueId)

    // Clean up any pending advance picks (league is over, these would never be scored)
    const { error: cleanupErr } = await supabase
      .from('survivor_picks')
      .delete()
      .eq('league_id', leagueId)
      .eq('status', 'pending')

    if (cleanupErr) {
      logger.error({ cleanupErr, leagueId }, 'Failed to clean up pending survivor picks')
    } else {
      logger.info({ leagueId }, 'Cleaned up pending advance picks after survivor completion')
    }

    // Check survivor streak record
    try {
      await checkRecordAfterSettle(winnerId, 'survivor', {})
    } catch (err) {
      logger.error({ err, leagueId, winnerId }, 'Failed to check survivor streak record on win')
    }

    // Notify all other league members
    const { data: winnerUser } = await supabase
      .from('users')
      .select('username, display_name')
      .eq('id', winnerId)
      .single()
    const winnerName = winnerUser?.display_name || winnerUser?.username || 'Someone'

    const { data: allMembers } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId)
    if (allMembers) {
      for (const member of allMembers) {
        if (member.user_id === winnerId) continue
        await createNotification(member.user_id, 'league_win',
          `${winnerName} won the ${leagueName} survivor pool!`,
          { leagueId, leagueName, format: 'survivor', isWinner: false })
      }
    }

  } else if (aliveMembers.length === 0 && !bonusExists) {
    // All eliminated — check league settings
    if (league?.settings?.all_eliminated_survive) {
      // Revive all members who were just eliminated this round
      const { data: eliminated } = await supabase
        .from('league_members')
        .select('user_id, eliminated_week')
        .eq('league_id', leagueId)
        .eq('is_alive', false)
        .order('eliminated_week', { ascending: false })

      if (eliminated?.length) {
        const latestWeek = eliminated[0].eliminated_week
        const toRevive = eliminated.filter((m) => m.eliminated_week === latestWeek)

        for (const m of toRevive) {
          await supabase
            .from('league_members')
            .update({
              is_alive: true,
              lives_remaining: 1,
              eliminated_week: null,
            })
            .eq('league_id', leagueId)
            .eq('user_id', m.user_id)

          // Also revert the pick status
          await supabase
            .from('survivor_picks')
            .update({ status: 'survived', updated_at: new Date().toISOString() })
            .eq('league_id', leagueId)
            .eq('user_id', m.user_id)
            .eq('status', 'eliminated')
        }

        logger.info({ leagueId, revived: toRevive.length }, 'All eliminated — all survive rule applied')
      }
    } else {
      // No all_eliminated_survive setting — just mark completed
      await supabase
        .from('leagues')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', leagueId)
    }
  } else if (aliveMembers.length > 1 && !bonusExists) {
    // Multiple survivors — check if league has ended (no more future weeks)
    const { count: futureWeeks } = await supabase
      .from('league_weeks')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .gt('ends_at', new Date().toISOString())

    if (futureWeeks === 0) {
      // League has ended with multiple survivors — split the bonus
      const { count: memberCount } = await supabase
        .from('league_members')
        .select('id', { count: 'exact', head: true })
        .eq('league_id', leagueId)

      let totalBonus
      if (memberCount >= 41) totalBonus = 100
      else if (memberCount >= 31) totalBonus = 75
      else if (memberCount >= 16) totalBonus = 50
      else if (memberCount >= 11) totalBonus = 30
      else if (memberCount >= 6) totalBonus = 20
      else totalBonus = 10

      const splitBonus = Math.round(totalBonus / aliveMembers.length)
      const outlasted = (memberCount || 1) - aliveMembers.length
      const leagueName = league?.name || 'Survivor'

      for (const member of aliveMembers) {
        // Award split bonus to global points
        await supabase.rpc('increment_user_points', {
          user_row_id: member.user_id,
          points_delta: splitBonus,
        })

        // Record bonus_points entry
        await supabase.from('bonus_points').insert({
          user_id: member.user_id,
          league_id: leagueId,
          type: 'survivor_win',
          label: `Survivor Pool co-winner (${aliveMembers.length}-way split) +${splitBonus}`,
          points: splitBonus,
        })

        // Award to sport stats
        if (league?.sport && league.sport !== 'all') {
          const { data: sport } = await supabase
            .from('sports')
            .select('id')
            .eq('key', league.sport)
            .single()

          if (sport) {
            await supabase.rpc('update_sport_stats', {
              p_user_id: member.user_id,
              p_sport_id: sport.id,
              p_is_correct: true,
              p_points: splitBonus,
            })
          }
        }

        await createNotification(member.user_id, 'survivor_win',
          `You co-won the ${leagueName} survivor pool! (${aliveMembers.length}-way split) +${splitBonus} pts`,
          { leagueId, points: splitBonus, outlasted, leagueName })
      }

      // Mark league as completed
      await supabase
        .from('leagues')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', leagueId)

      logger.info({ leagueId, survivors: aliveMembers.length, splitBonus, totalBonus }, 'Survivor pool ended with split bonus')
    }
  }
}
