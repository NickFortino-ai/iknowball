import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

// ============================================
// Template Management (Admin)
// ============================================

export async function createTemplate(userId, data) {
  const { data: template, error } = await supabase
    .from('bracket_templates')
    .insert({
      name: data.name,
      sport: data.sport,
      team_count: data.team_count,
      description: data.description || null,
      rounds: data.rounds || [],
      regions: data.regions || null,
      created_by: userId,
    })
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to create bracket template')
    throw error
  }

  return template
}

export async function getTemplates(filters = {}) {
  let query = supabase
    .from('bracket_templates')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (filters.sport) {
    query = query.eq('sport', filters.sport)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getTemplateDetails(templateId) {
  const { data: template, error } = await supabase
    .from('bracket_templates')
    .select('*')
    .eq('id', templateId)
    .single()

  if (error || !template) {
    const err = new Error('Template not found')
    err.status = 404
    throw err
  }

  const { data: matchups } = await supabase
    .from('bracket_template_matchups')
    .select('*')
    .eq('template_id', templateId)
    .order('round_number', { ascending: true })
    .order('position', { ascending: true })

  return { ...template, matchups: matchups || [] }
}

export async function updateTemplate(templateId, userId, data) {
  const { data: template } = await supabase
    .from('bracket_templates')
    .select('created_by')
    .eq('id', templateId)
    .single()

  if (!template) {
    const err = new Error('Template not found')
    err.status = 404
    throw err
  }

  const updates = { updated_at: new Date().toISOString() }
  if (data.name !== undefined) updates.name = data.name
  if (data.description !== undefined) updates.description = data.description
  if (data.sport !== undefined) updates.sport = data.sport
  if (data.team_count !== undefined) updates.team_count = data.team_count
  if (data.rounds !== undefined) updates.rounds = data.rounds
  if (data.regions !== undefined) updates.regions = data.regions

  const { data: updated, error } = await supabase
    .from('bracket_templates')
    .update(updates)
    .eq('id', templateId)
    .select()
    .single()

  if (error) throw error
  return updated
}

export async function saveTemplateMatchups(templateId, userId, matchups) {
  // Verify template exists
  const { data: template } = await supabase
    .from('bracket_templates')
    .select('id')
    .eq('id', templateId)
    .single()

  if (!template) {
    const err = new Error('Template not found')
    err.status = 404
    throw err
  }

  // Delete existing matchups
  await supabase
    .from('bracket_template_matchups')
    .delete()
    .eq('template_id', templateId)

  if (!matchups?.length) return []

  // Insert without feeds_into first (need IDs for self-referencing)
  const rows = matchups.map((m) => ({
    template_id: templateId,
    round_number: m.round_number,
    position: m.position,
    region: m.region || null,
    seed_top: m.seed_top ?? null,
    seed_bottom: m.seed_bottom ?? null,
    team_top: m.team_top || null,
    team_bottom: m.team_bottom || null,
    is_bye: m.is_bye || false,
  }))

  const { data: inserted, error } = await supabase
    .from('bracket_template_matchups')
    .insert(rows)
    .select()

  if (error) {
    logger.error({ error }, 'Failed to save template matchups')
    throw error
  }

  // Build a lookup: (round_number, position) -> id
  const lookup = {}
  for (const m of inserted) {
    lookup[`${m.round_number}-${m.position}`] = m.id
  }

  // Now update feeds_into references
  const updates = []
  for (let i = 0; i < matchups.length; i++) {
    const src = matchups[i]
    if (src.feeds_into_round != null && src.feeds_into_position != null) {
      const targetId = lookup[`${src.feeds_into_round}-${src.feeds_into_position}`]
      if (targetId) {
        updates.push(
          supabase
            .from('bracket_template_matchups')
            .update({
              feeds_into_matchup_id: targetId,
              feeds_into_slot: src.feeds_into_slot || null,
            })
            .eq('id', inserted[i].id)
        )
      }
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates)
  }

  // Return full matchups
  const { data: final } = await supabase
    .from('bracket_template_matchups')
    .select('*')
    .eq('template_id', templateId)
    .order('round_number', { ascending: true })
    .order('position', { ascending: true })

  return final || []
}

export async function deleteTemplate(templateId, userId) {
  const { data: template } = await supabase
    .from('bracket_templates')
    .select('id')
    .eq('id', templateId)
    .single()

  if (!template) {
    const err = new Error('Template not found')
    err.status = 404
    throw err
  }

  const { error } = await supabase
    .from('bracket_templates')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', templateId)

  if (error) throw error
}

// ============================================
// Tournament Instance (League Creation)
// ============================================

export async function createTournament(leagueId, templateId, locksAt) {
  // Get template and its matchups
  const { data: template } = await supabase
    .from('bracket_templates')
    .select('*')
    .eq('id', templateId)
    .single()

  if (!template) {
    const err = new Error('Bracket template not found')
    err.status = 404
    throw err
  }

  const { data: templateMatchups } = await supabase
    .from('bracket_template_matchups')
    .select('*')
    .eq('template_id', templateId)
    .order('round_number', { ascending: true })
    .order('position', { ascending: true })

  // Create tournament
  const { data: tournament, error: tError } = await supabase
    .from('bracket_tournaments')
    .insert({
      league_id: leagueId,
      template_id: templateId,
      locks_at: locksAt,
      status: 'open',
    })
    .select()
    .single()

  if (tError) {
    logger.error({ tError }, 'Failed to create bracket tournament')
    throw tError
  }

  // Copy template matchups into bracket_matchups
  if (templateMatchups?.length) {
    const matchupRows = templateMatchups.map((tm) => ({
      tournament_id: tournament.id,
      template_matchup_id: tm.id,
      round_number: tm.round_number,
      position: tm.position,
      region: tm.region,
      team_top: tm.team_top || null,
      team_bottom: tm.team_bottom || null,
      seed_top: tm.seed_top ?? null,
      seed_bottom: tm.seed_bottom ?? null,
      status: tm.is_bye ? 'completed' : 'pending',
    }))

    const { error: mError } = await supabase
      .from('bracket_matchups')
      .insert(matchupRows)

    if (mError) {
      logger.error({ mError }, 'Failed to copy template matchups')
      throw mError
    }

    // Auto-resolve bye matchups: the team present advances
    const byeMatchups = templateMatchups.filter((tm) => tm.is_bye)
    for (const bye of byeMatchups) {
      const winnerSlot = bye.team_top ? 'top' : 'bottom'
      const winnerTeam = bye.team_top || bye.team_bottom
      const winnerSeed = bye.team_top ? bye.seed_top : bye.seed_bottom

      // Update the bye matchup with winner
      await supabase
        .from('bracket_matchups')
        .update({
          winner: winnerSlot,
          winning_team_name: winnerTeam,
          status: 'completed',
        })
        .eq('tournament_id', tournament.id)
        .eq('template_matchup_id', bye.id)

      // Propagate winner to next round
      if (bye.feeds_into_matchup_id) {
        const update = bye.feeds_into_slot === 'top'
          ? { team_top: winnerTeam, seed_top: winnerSeed }
          : { team_bottom: winnerTeam, seed_bottom: winnerSeed }

        await supabase
          .from('bracket_matchups')
          .update(update)
          .eq('tournament_id', tournament.id)
          .eq('template_matchup_id', bye.feeds_into_matchup_id)
      }
    }

    // Copy any existing template results (if admin already entered results before this tournament was created)
    const resultsToApply = templateMatchups.filter((tm) => tm.winner && !tm.is_bye)
    for (const tm of resultsToApply) {
      const winningTeam = tm.winner === 'top' ? tm.team_top : tm.team_bottom
      const winningSeed = tm.winner === 'top' ? tm.seed_top : tm.seed_bottom

      await supabase
        .from('bracket_matchups')
        .update({
          winner: tm.winner,
          winning_team_name: winningTeam,
          status: 'completed',
        })
        .eq('tournament_id', tournament.id)
        .eq('template_matchup_id', tm.id)

      if (tm.feeds_into_matchup_id) {
        const update = tm.feeds_into_slot === 'top'
          ? { team_top: winningTeam, seed_top: winningSeed }
          : { team_bottom: winningTeam, seed_bottom: winningSeed }

        await supabase
          .from('bracket_matchups')
          .update(update)
          .eq('tournament_id', tournament.id)
          .eq('template_matchup_id', tm.feeds_into_matchup_id)
      }
    }
  }

  return tournament
}

// ============================================
// User Bracket Entry
// ============================================

export async function submitBracket(tournamentId, userId, picks, entryName) {
  // Get tournament
  const { data: tournament } = await supabase
    .from('bracket_tournaments')
    .select('*, bracket_templates(*)')
    .eq('id', tournamentId)
    .single()

  if (!tournament) {
    const err = new Error('Tournament not found')
    err.status = 404
    throw err
  }

  // Check if tournament is still open
  if (tournament.status !== 'open' || new Date(tournament.locks_at) <= new Date()) {
    const err = new Error('This bracket is locked and no longer accepting entries')
    err.status = 400
    throw err
  }

  // Verify membership
  const { data: member } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', tournament.league_id)
    .eq('user_id', userId)
    .single()

  if (!member) {
    const err = new Error('You are not a member of this league')
    err.status = 403
    throw err
  }

  // Get template matchups for validation
  const { data: templateMatchups } = await supabase
    .from('bracket_template_matchups')
    .select('*')
    .eq('template_id', tournament.template_id)
    .order('round_number', { ascending: true })
    .order('position', { ascending: true })

  // Validate pick chain: team picked in round N+1 must be picked as winner in round N
  const pickMap = {}
  for (const pick of picks) {
    pickMap[pick.template_matchup_id] = pick.picked_team
  }

  // Build matchup map
  const matchupMap = {}
  for (const m of templateMatchups) {
    matchupMap[m.id] = m
  }

  // For non-bye, non-round-1 matchups: verify the picked team was also picked in a feeder matchup
  for (const m of templateMatchups) {
    if (m.is_bye) continue
    if (m.round_number === 1) continue

    const pick = pickMap[m.id]
    if (!pick) continue

    // Find the feeder matchups for this matchup
    const feeders = templateMatchups.filter(
      (f) => f.feeds_into_matchup_id === m.id
    )

    // The picked team must appear as a pick in one of the feeder matchups
    const pickedInFeeder = feeders.some((f) => pickMap[f.id] === pick)
    if (!pickedInFeeder) {
      const err = new Error(`Invalid pick chain: "${pick}" in round ${m.round_number} was not picked as a winner in the previous round`)
      err.status = 400
      throw err
    }
  }

  // Validate all non-bye slots are filled
  const nonByeMatchups = templateMatchups.filter((m) => !m.is_bye)
  if (picks.length !== nonByeMatchups.length) {
    const err = new Error(`Must fill all ${nonByeMatchups.length} bracket slots (got ${picks.length})`)
    err.status = 400
    throw err
  }

  // Calculate possible points
  const rounds = tournament.bracket_templates?.rounds || []
  let possiblePoints = 0
  for (const pick of picks) {
    const matchup = matchupMap[pick.template_matchup_id]
    if (matchup) {
      const roundConfig = rounds.find((r) => r.round_number === matchup.round_number)
      possiblePoints += roundConfig?.points_per_correct || 0
    }
  }

  // Upsert entry
  const { data: entry, error: entryError } = await supabase
    .from('bracket_entries')
    .upsert(
      {
        tournament_id: tournamentId,
        user_id: userId,
        entry_name: entryName || null,
        total_points: 0,
        possible_points: possiblePoints,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'tournament_id,user_id' }
    )
    .select()
    .single()

  if (entryError) {
    logger.error({ entryError }, 'Failed to upsert bracket entry')
    throw entryError
  }

  // Delete existing picks and re-insert
  await supabase
    .from('bracket_picks')
    .delete()
    .eq('entry_id', entry.id)

  const pickRows = picks.map((p) => {
    const matchup = matchupMap[p.template_matchup_id]
    return {
      entry_id: entry.id,
      template_matchup_id: p.template_matchup_id,
      round_number: matchup?.round_number || 0,
      position: matchup?.position || 0,
      picked_team: p.picked_team,
    }
  })

  const { error: pickError } = await supabase
    .from('bracket_picks')
    .insert(pickRows)

  if (pickError) {
    logger.error({ pickError }, 'Failed to insert bracket picks')
    throw pickError
  }

  return { entry, picks: pickRows }
}

export async function getBracketEntry(tournamentId, userId) {
  const { data: entry } = await supabase
    .from('bracket_entries')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .single()

  if (!entry) return null

  const { data: picks } = await supabase
    .from('bracket_picks')
    .select('*')
    .eq('entry_id', entry.id)
    .order('round_number', { ascending: true })
    .order('position', { ascending: true })

  return { ...entry, picks: picks || [] }
}

export async function getEntryByUser(tournamentId, userId) {
  return getBracketEntry(tournamentId, userId)
}

export async function getAllEntries(tournamentId) {
  const { data: entries, error } = await supabase
    .from('bracket_entries')
    .select('*, users(id, username, display_name, avatar_emoji, tier, total_points)')
    .eq('tournament_id', tournamentId)
    .order('total_points', { ascending: false })

  if (error) throw error
  return entries || []
}

// ============================================
// Tournament Data
// ============================================

export async function getTournament(leagueId) {
  const { data: tournament, error } = await supabase
    .from('bracket_tournaments')
    .select('*, bracket_templates(*)')
    .eq('league_id', leagueId)
    .single()

  if (error || !tournament) {
    const err = new Error('Tournament not found')
    err.status = 404
    throw err
  }

  const { data: matchups } = await supabase
    .from('bracket_matchups')
    .select('*')
    .eq('tournament_id', tournament.id)
    .order('round_number', { ascending: true })
    .order('position', { ascending: true })

  return { ...tournament, matchups: matchups || [] }
}

// ============================================
// Template Result Entry & Scoring (Admin)
// ============================================

export async function getTemplateResults(templateId) {
  const { data: matchups, error } = await supabase
    .from('bracket_template_matchups')
    .select('*')
    .eq('template_id', templateId)
    .order('round_number', { ascending: true })
    .order('position', { ascending: true })

  if (error) throw error
  return matchups || []
}

export async function enterTemplateResult(templateId, templateMatchupId, winner) {
  // Get the template matchup
  const { data: templateMatchup } = await supabase
    .from('bracket_template_matchups')
    .select('*')
    .eq('id', templateMatchupId)
    .eq('template_id', templateId)
    .single()

  if (!templateMatchup) {
    const err = new Error('Template matchup not found')
    err.status = 404
    throw err
  }

  const winningTeam = winner === 'top' ? templateMatchup.team_top : templateMatchup.team_bottom
  const winningSeed = winner === 'top' ? templateMatchup.seed_top : templateMatchup.seed_bottom

  if (!winningTeam) {
    const err = new Error('Both teams must be set before entering a result')
    err.status = 400
    throw err
  }

  // Set winner on the template matchup
  await supabase
    .from('bracket_template_matchups')
    .update({ winner, winning_team_name: winningTeam })
    .eq('id', templateMatchupId)

  // Propagate winner to next template matchup (fill in team name for next round)
  if (templateMatchup.feeds_into_matchup_id) {
    const update = templateMatchup.feeds_into_slot === 'top'
      ? { team_top: winningTeam, seed_top: winningSeed }
      : { team_bottom: winningTeam, seed_bottom: winningSeed }

    await supabase
      .from('bracket_template_matchups')
      .update(update)
      .eq('id', templateMatchup.feeds_into_matchup_id)
  }

  // Find all tournaments using this template and cascade
  const { data: tournaments } = await supabase
    .from('bracket_tournaments')
    .select('*, bracket_templates(*)')
    .eq('template_id', templateId)

  for (const tournament of tournaments || []) {
    await cascadeResultToTournament(tournament, templateMatchup, winner, winningTeam, winningSeed)
  }

  return { templateMatchupId, winner, winningTeam }
}

async function cascadeResultToTournament(tournament, templateMatchup, winner, winningTeam, winningSeed) {
  const tournamentId = tournament.id

  // Update the tournament matchup
  await supabase
    .from('bracket_matchups')
    .update({
      winner,
      winning_team_name: winningTeam,
      status: 'completed',
    })
    .eq('tournament_id', tournamentId)
    .eq('template_matchup_id', templateMatchup.id)

  // Propagate winner to next round matchup
  if (templateMatchup.feeds_into_matchup_id) {
    const update = templateMatchup.feeds_into_slot === 'top'
      ? { team_top: winningTeam, seed_top: winningSeed }
      : { team_bottom: winningTeam, seed_bottom: winningSeed }

    await supabase
      .from('bracket_matchups')
      .update(update)
      .eq('tournament_id', tournamentId)
      .eq('template_matchup_id', templateMatchup.feeds_into_matchup_id)
  }

  // Score picks
  const rounds = tournament.bracket_templates?.rounds || []
  const roundConfig = rounds.find((r) => r.round_number === templateMatchup.round_number)
  const pointsPerCorrect = roundConfig?.points_per_correct || 0

  const { data: allPicks } = await supabase
    .from('bracket_picks')
    .select('*, bracket_entries!inner(tournament_id)')
    .eq('template_matchup_id', templateMatchup.id)
    .eq('bracket_entries.tournament_id', tournamentId)

  const losingTeam = winner === 'top' ? templateMatchup.team_bottom : templateMatchup.team_top

  for (const pick of allPicks || []) {
    const isCorrect = pick.picked_team === winningTeam
    await supabase
      .from('bracket_picks')
      .update({
        is_correct: isCorrect,
        points_earned: isCorrect ? pointsPerCorrect : 0,
      })
      .eq('id', pick.id)

    if (!isCorrect && pick.picked_team === losingTeam) {
      await eliminateDownstreamPicks(pick.entry_id, losingTeam, templateMatchup.round_number, tournamentId)
    }
  }

  await recalculateEntryPoints(tournamentId, rounds)
  await updateTournamentStatus(tournamentId)
}

async function eliminateDownstreamPicks(entryId, teamName, fromRound, tournamentId) {
  // Get all picks for this entry in later rounds that picked this team
  const { data: picks } = await supabase
    .from('bracket_picks')
    .select('*')
    .eq('entry_id', entryId)
    .eq('picked_team', teamName)
    .gt('round_number', fromRound)

  for (const pick of picks || []) {
    // Only eliminate if not already scored
    if (pick.is_correct === null) {
      await supabase
        .from('bracket_picks')
        .update({ is_eliminated: true })
        .eq('id', pick.id)
    }
  }
}

async function recalculateEntryPoints(tournamentId, rounds) {
  const { data: entries } = await supabase
    .from('bracket_entries')
    .select('id')
    .eq('tournament_id', tournamentId)

  for (const entry of entries || []) {
    const { data: picks } = await supabase
      .from('bracket_picks')
      .select('*')
      .eq('entry_id', entry.id)

    let totalPoints = 0
    let possiblePoints = 0

    for (const pick of picks || []) {
      totalPoints += pick.points_earned || 0

      // Possible points: earned + potential from unscored, non-eliminated picks
      if (pick.is_correct === true) {
        possiblePoints += pick.points_earned || 0
      } else if (pick.is_correct === null && !pick.is_eliminated) {
        const roundConfig = rounds.find((r) => r.round_number === pick.round_number)
        possiblePoints += roundConfig?.points_per_correct || 0
      }
    }

    await supabase
      .from('bracket_entries')
      .update({ total_points: totalPoints, possible_points: possiblePoints })
      .eq('id', entry.id)
  }
}

async function updateTournamentStatus(tournamentId) {
  const { data: matchups } = await supabase
    .from('bracket_matchups')
    .select('status')
    .eq('tournament_id', tournamentId)

  const allCompleted = matchups?.every((m) => m.status === 'completed')
  const anyCompleted = matchups?.some((m) => m.status === 'completed')

  let status = 'open'
  if (allCompleted) {
    status = 'completed'
  } else if (anyCompleted) {
    status = 'in_progress'
  }

  // Don't downgrade from locked to open
  const { data: tournament } = await supabase
    .from('bracket_tournaments')
    .select('status')
    .eq('id', tournamentId)
    .single()

  if (tournament?.status === 'open' && status === 'open') return

  await supabase
    .from('bracket_tournaments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', tournamentId)
}

export async function undoTemplateResult(templateId, templateMatchupId) {
  // Get the template matchup
  const { data: templateMatchup } = await supabase
    .from('bracket_template_matchups')
    .select('*')
    .eq('id', templateMatchupId)
    .eq('template_id', templateId)
    .single()

  if (!templateMatchup || !templateMatchup.winner) {
    const err = new Error('Template matchup not found or has no result')
    err.status = 400
    throw err
  }

  // Check if the next-round template matchup already has a result
  if (templateMatchup.feeds_into_matchup_id) {
    const { data: nextTm } = await supabase
      .from('bracket_template_matchups')
      .select('winner')
      .eq('id', templateMatchup.feeds_into_matchup_id)
      .single()

    if (nextTm?.winner) {
      const err = new Error('Cannot undo: the next round matchup has already been completed. Undo that result first.')
      err.status = 400
      throw err
    }

    // Clear the team from the next template matchup
    const clearUpdate = templateMatchup.feeds_into_slot === 'top'
      ? { team_top: null, seed_top: null }
      : { team_bottom: null, seed_bottom: null }

    await supabase
      .from('bracket_template_matchups')
      .update(clearUpdate)
      .eq('id', templateMatchup.feeds_into_matchup_id)
  }

  // Clear winner on template matchup
  await supabase
    .from('bracket_template_matchups')
    .update({ winner: null, winning_team_name: null })
    .eq('id', templateMatchupId)

  // Cascade reset to all tournaments using this template
  const { data: tournaments } = await supabase
    .from('bracket_tournaments')
    .select('*, bracket_templates(*)')
    .eq('template_id', templateId)

  for (const tournament of tournaments || []) {
    await cascadeUndoToTournament(tournament, templateMatchup)
  }
}

async function cascadeUndoToTournament(tournament, templateMatchup) {
  const tournamentId = tournament.id

  // Clear the team from the next round matchup
  if (templateMatchup.feeds_into_matchup_id) {
    const clearUpdate = templateMatchup.feeds_into_slot === 'top'
      ? { team_top: null, seed_top: null }
      : { team_bottom: null, seed_bottom: null }

    await supabase
      .from('bracket_matchups')
      .update(clearUpdate)
      .eq('tournament_id', tournamentId)
      .eq('template_matchup_id', templateMatchup.feeds_into_matchup_id)
  }

  // Reset the matchup
  await supabase
    .from('bracket_matchups')
    .update({ winner: null, winning_team_name: null, status: 'pending' })
    .eq('tournament_id', tournamentId)
    .eq('template_matchup_id', templateMatchup.id)

  // Reset picks for this matchup
  const { data: picks } = await supabase
    .from('bracket_picks')
    .select('id, entry_id, picked_team, round_number')
    .eq('template_matchup_id', templateMatchup.id)

  for (const pick of picks || []) {
    await supabase
      .from('bracket_picks')
      .update({ is_correct: null, points_earned: 0 })
      .eq('id', pick.id)

    // Un-eliminate downstream picks for both teams
    await supabase
      .from('bracket_picks')
      .update({ is_eliminated: false })
      .eq('entry_id', pick.entry_id)
      .gt('round_number', templateMatchup.round_number)
      .in('picked_team', [templateMatchup.team_top, templateMatchup.team_bottom].filter(Boolean))
  }

  // Recalculate points
  const rounds = tournament.bracket_templates?.rounds || []
  await recalculateEntryPoints(tournamentId, rounds)
  await updateTournamentStatus(tournamentId)
}

// ============================================
// Standings
// ============================================

export async function scoreBracketMatchups(homeTeam, awayTeam, winner) {
  // Find unsettled template matchups where both teams match this game
  const { data: matchups, error } = await supabase
    .from('bracket_template_matchups')
    .select('*, bracket_templates!inner(id, is_active)')
    .is('winner', null)
    .not('team_top', 'is', null)
    .not('team_bottom', 'is', null)
    .eq('bracket_templates.is_active', true)

  if (error || !matchups?.length) return

  const winningTeam = winner === 'home' ? homeTeam : awayTeam

  for (const matchup of matchups) {
    const teams = [matchup.team_top, matchup.team_bottom]
    if (!teams.includes(homeTeam) || !teams.includes(awayTeam)) continue

    const winnerSlot = matchup.team_top === winningTeam ? 'top' : 'bottom'

    try {
      await enterTemplateResult(matchup.bracket_templates.id, matchup.id, winnerSlot)
      logger.info({ matchupId: matchup.id, winningTeam, winnerSlot }, 'Auto-settled bracket matchup')
    } catch (err) {
      logger.error({ err, matchupId: matchup.id }, 'Failed to auto-settle bracket matchup')
    }
  }
}

export async function getBracketStandings(leagueId) {
  const { data: tournament } = await supabase
    .from('bracket_tournaments')
    .select('id')
    .eq('league_id', leagueId)
    .single()

  if (!tournament) return []

  const { data: entries } = await supabase
    .from('bracket_entries')
    .select('*, users(id, username, display_name, avatar_emoji, tier, total_points)')
    .eq('tournament_id', tournament.id)
    .order('total_points', { ascending: false })

  if (!entries?.length) return []

  return entries.map((e, i) => ({
    rank: i + 1,
    user_id: e.user_id,
    user: e.users,
    total_points: e.total_points,
    possible_points: e.possible_points,
    entry_name: e.entry_name,
    submitted_at: e.submitted_at,
  }))
}
