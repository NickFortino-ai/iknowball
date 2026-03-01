import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from './notificationService.js'

export async function submitSurvivorPick(leagueId, userId, weekId, gameId, pickedTeam) {
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
    const err = new Error(`You have already used ${teamName} in this league`)
    err.status = 400
    throw err
  }

  // Upsert pick for this week
  const { data, error } = await supabase
    .from('survivor_picks')
    .upsert(
      {
        league_id: leagueId,
        user_id: userId,
        league_week_id: weekId,
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
    .select('*, users(id, username, display_name, avatar_emoji)')
    .eq('league_id', leagueId)
    .order('is_alive', { ascending: false })

  const { data: picks } = await supabase
    .from('survivor_picks')
    .select('*, league_weeks(week_number)')
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
  const userHasPicked = currentWeekId && (picks || []).some(
    (p) => p.user_id === requestingUserId && p.league_week_id === currentWeekId
  )

  // Group picks by user, hiding current-week picks from others if user hasn't picked
  const picksByUser = {}
  for (const pick of picks || []) {
    if (!picksByUser[pick.user_id]) picksByUser[pick.user_id] = []
    // Redact other users' current-week picks until requesting user has picked
    if (!userHasPicked && currentWeekId && pick.league_week_id === currentWeekId && pick.user_id !== requestingUserId) {
      picksByUser[pick.user_id].push({ ...pick, team_name: 'Locked', game_id: null })
    } else {
      picksByUser[pick.user_id].push(pick)
    }
  }

  // Compute display period number: skip leading empty periods with no picks
  const weekIdsWithPicks = new Set((picks || []).map((p) => p.league_week_id))
  const firstActiveIndex = (weeks || []).findIndex(
    (w) => weekIdsWithPicks.has(w.id) || w.id === currentWeekId
  )
  const currentIndex = currentWeek
    ? (weeks || []).findIndex((w) => w.id === currentWeek.id)
    : -1
  const displayPeriodNumber = firstActiveIndex >= 0 && currentIndex >= 0
    ? currentIndex - firstActiveIndex + 1
    : currentWeek?.week_number || null

  return {
    members: (members || []).map((m) => ({
      ...m,
      picks: picksByUser[m.user_id] || [],
    })),
    weeks: weeks || [],
    user_has_picked: !!userHasPicked,
    display_period_number: displayPeriodNumber,
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

      await createNotification(pick.user_id, 'survivor_result',
        `You survived ${periodLabel} ${periodNum} in ${leagueName}!`,
        { leagueId: pick.league_id })
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
      await createNotification(pick.user_id, 'survivor_result',
        `You survived ${periodLabel} ${periodNum} in ${leagueName}!`,
        { leagueId: pick.league_id })
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

        await createNotification(pick.user_id, 'survivor_result',
          `You were eliminated in ${periodLabel} ${periodNum} of ${leagueName}`,
          { leagueId: pick.league_id })

        // Delete any pending future picks
        await supabase
          .from('survivor_picks')
          .delete()
          .eq('league_id', pick.league_id)
          .eq('user_id', pick.user_id)
          .eq('status', 'pending')
      } else {
        await supabase
          .from('league_members')
          .update({ lives_remaining: newLives })
          .eq('league_id', pick.league_id)
          .eq('user_id', pick.user_id)

        await createNotification(pick.user_id, 'survivor_result',
          `You lost a life in ${periodLabel} ${periodNum} of ${leagueName} (${newLives} remaining)`,
          { leagueId: pick.league_id })
      }
    }
  }

  // Check for winner after processing all picks for each league
  const leagueIds = [...new Set(picks.map((p) => p.league_id))]
  for (const leagueId of leagueIds) {
    await checkSurvivorWinner(leagueId)
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

    // Get weeks that have ended and haven't been processed yet
    const { data: weeks } = await supabase
      .from('league_weeks')
      .select('*')
      .eq('league_id', league.id)
      .lte('ends_at', now)
      .eq('missed_picks_processed', false)
      .order('week_number', { ascending: true })

    if (!weeks?.length) continue

    for (const week of weeks) {
      const displayPeriodNum = await getDisplayPeriodNumber(league.id, week.week_number)

      // Count games in this period, filtered by sport if not 'all'
      let gamesQuery = supabase
        .from('games')
        .select('id, status')
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

      for (const member of missedMembers) {
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

    // Send survivor_win notification — league stays active so winner can keep picking
    const leagueName = league?.name || 'Survivor'
    await createNotification(winnerId, 'survivor_win',
      `You won the ${leagueName} survivor pool! +${winnerBonus} pts`,
      { leagueId, points: winnerBonus, outlasted, leagueName })

  } else if (aliveMembers.length === 1 && bonusExists) {
    // Winner still playing solo — no-op
  } else if (aliveMembers.length === 0 && bonusExists) {
    // Winner was finally eliminated — streak ended, mark league completed
    const leagueName = league?.name || 'Survivor'

    // Find the winner from the bonus_points entry
    const { data: bonusEntry } = await supabase
      .from('bonus_points')
      .select('user_id, points')
      .eq('league_id', leagueId)
      .eq('type', 'survivor_win')
      .single()

    if (bonusEntry) {
      const { count: memberCount } = await supabase
        .from('league_members')
        .select('id', { count: 'exact', head: true })
        .eq('league_id', leagueId)

      await createNotification(bonusEntry.user_id, 'survivor_result',
        `Your survivor streak in ${leagueName} has ended. What a run!`,
        { leagueId, streakEnded: true, leagueName, points: bonusEntry.points, outlasted: (memberCount || 1) - 1 })
    }

    await supabase
      .from('leagues')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', leagueId)

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
  }
}
