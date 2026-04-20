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
      picks_available_at: data.picks_available_at || null,
      series_format: data.series_format || 'single_elimination',
      bracket_image: data.bracket_image || null,
      bracket_image_x: data.bracket_image_x ?? 50,
      bracket_image_y: data.bracket_image_y ?? 50,
      bracket_image_scale: data.bracket_image_scale ?? 1.0,
      bracket_image_opacity: data.bracket_image_opacity ?? 0.4,
      bracket_image_position: data.bracket_image_position || 'behind',
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
  if (data.picks_available_at !== undefined) updates.picks_available_at = data.picks_available_at
  if (data.series_format !== undefined) updates.series_format = data.series_format
  if (data.bracket_image !== undefined) updates.bracket_image = data.bracket_image
  if (data.bracket_image_x !== undefined) updates.bracket_image_x = data.bracket_image_x
  if (data.bracket_image_y !== undefined) updates.bracket_image_y = data.bracket_image_y
  if (data.bracket_image_scale !== undefined) updates.bracket_image_scale = data.bracket_image_scale
  if (data.bracket_image_opacity !== undefined) updates.bracket_image_opacity = data.bracket_image_opacity
  if (data.bracket_image_position !== undefined) updates.bracket_image_position = data.bracket_image_position

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

  // Cascade team updates to all tournaments using this template
  await cascadeTeamUpdatesToTournaments(templateId, final || [])

  return final || []
}

async function cascadeTeamUpdatesToTournaments(templateId, templateMatchups) {
  if (!templateMatchups?.length) return

  const { data: tournaments } = await supabase
    .from('bracket_tournaments')
    .select('id')
    .eq('template_id', templateId)

  if (!tournaments?.length) return

  // Build template lookup by (round_number, position) for stable matching
  const templateByRoundPos = {}
  for (const tm of templateMatchups) {
    templateByRoundPos[`${tm.round_number}-${tm.position}`] = tm
  }

  for (const tournament of tournaments) {
    // Get existing tournament matchups
    const { data: existingMatchups } = await supabase
      .from('bracket_matchups')
      .select('*')
      .eq('tournament_id', tournament.id)

    // If no tournament matchups exist, create them all from template
    if (!existingMatchups?.length) {
      const newRows = templateMatchups.map((tm) => ({
        tournament_id: tournament.id,
        template_matchup_id: tm.id,
        round_number: tm.round_number,
        position: tm.position,
        region: tm.region || null,
        team_top: tm.team_top || null,
        team_bottom: tm.team_bottom || null,
        seed_top: tm.seed_top ?? null,
        seed_bottom: tm.seed_bottom ?? null,
        status: tm.is_bye ? 'completed' : 'pending',
      }))
      await supabase.from('bracket_matchups').insert(newRows)
      continue
    }

    // Build lookup of existing matchups by (round_number, position)
    const existingByRoundPos = {}
    for (const m of existingMatchups) {
      existingByRoundPos[`${m.round_number}-${m.position}`] = m
    }

    // Sync existing + insert missing matchups
    const missingRows = []
    for (const tm of templateMatchups) {
      const existing = existingByRoundPos[`${tm.round_number}-${tm.position}`]

      if (!existing) {
        // Missing matchup — insert it
        missingRows.push({
          tournament_id: tournament.id,
          template_matchup_id: tm.id,
          round_number: tm.round_number,
          position: tm.position,
          region: tm.region || null,
          team_top: tm.team_top || null,
          team_bottom: tm.team_bottom || null,
          seed_top: tm.seed_top ?? null,
          seed_bottom: tm.seed_bottom ?? null,
          status: tm.is_bye ? 'completed' : 'pending',
        })
        continue
      }

      // Always re-link template_matchup_id (may be null after SET NULL cascade)
      const updates = { template_matchup_id: tm.id }

      // Only update team data if matchup doesn't have a winner yet
      if (!existing.winner) {
        updates.team_top = tm.team_top || null
        updates.team_bottom = tm.team_bottom || null
        updates.seed_top = tm.seed_top ?? null
        updates.seed_bottom = tm.seed_bottom ?? null
        updates.region = tm.region || null
      }

      await supabase
        .from('bracket_matchups')
        .update(updates)
        .eq('id', existing.id)
    }

    // Insert any missing matchups
    if (missingRows.length > 0) {
      await supabase.from('bracket_matchups').insert(missingRows)
    }

    // Delete orphaned tournament matchups (template was regenerated, old matchups remain)
    const validTmIds = new Set(templateMatchups.map((tm) => tm.id))
    const { data: allTournamentMatchups } = await supabase
      .from('bracket_matchups')
      .select('id, template_matchup_id')
      .eq('tournament_id', tournament.id)
    const orphanIds = (allTournamentMatchups || [])
      .filter((m) => !m.template_matchup_id || !validTmIds.has(m.template_matchup_id))
      .map((m) => m.id)
    if (orphanIds.length > 0) {
      await supabase.from('bracket_matchups').delete().in('id', orphanIds)
    }

    // Re-fetch tournament matchups after updates
    const { data: refreshedMatchups } = await supabase
      .from('bracket_matchups')
      .select('*')
      .eq('tournament_id', tournament.id)

    // Build lookup by template_matchup_id for bye propagation
    const byeLookup = {}
    for (const m of refreshedMatchups || []) {
      byeLookup[m.template_matchup_id] = m
    }

    // Handle byes: if a matchup becomes a bye (only one team), auto-set winner
    for (const tm of templateMatchups) {
      if (!tm.is_bye) continue
      const existing = byeLookup[tm.id]
      if (!existing || existing.winner) continue

      const winnerSlot = tm.team_top ? 'top' : 'bottom'
      const winnerTeam = tm.team_top || tm.team_bottom
      const winnerSeed = tm.team_top ? tm.seed_top : tm.seed_bottom

      if (!winnerTeam) continue

      await supabase
        .from('bracket_matchups')
        .update({
          winner: winnerSlot,
          winning_team_name: winnerTeam,
          status: 'completed',
        })
        .eq('id', existing.id)

      // Propagate to next round
      if (tm.feeds_into_matchup_id) {
        const nextExisting = byeLookup[tm.feeds_into_matchup_id]
        if (nextExisting && !nextExisting.winner) {
          const update = tm.feeds_into_slot === 'top'
            ? { team_top: winnerTeam, seed_top: winnerSeed }
            : { team_bottom: winnerTeam, seed_bottom: winnerSeed }

          await supabase
            .from('bracket_matchups')
            .update(update)
            .eq('id', nextExisting.id)
        }
      }
    }
  }

  // Re-link bracket_picks that had template_matchup_id set to NULL by SET NULL cascade
  // Match by (round_number, position) which are stable across template re-saves
  const { data: nullPicks } = await supabase
    .from('bracket_picks')
    .select('id, round_number, position')
    .is('template_matchup_id', null)

  if (nullPicks?.length) {
    for (const pick of nullPicks) {
      const tm = templateByRoundPos[`${pick.round_number}-${pick.position}`]
      if (!tm) continue
      await supabase
        .from('bracket_picks')
        .update({ template_matchup_id: tm.id })
        .eq('id', pick.id)
    }
    logger.info({ count: nullPicks.length }, 'Re-linked bracket picks after template re-save')
  }

  logger.info({ templateId, tournaments: tournaments.length }, 'Cascaded team updates to tournaments')
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
// Tournament Settings
// ============================================

export async function updateBracketTournament(tournamentId, data) {
  const updates = { updated_at: new Date().toISOString() }
  if (data.locks_at !== undefined) updates.locks_at = data.locks_at

  const { data: updated, error } = await supabase
    .from('bracket_tournaments')
    .update(updates)
    .eq('id', tournamentId)
    .select()
    .single()

  if (error) throw error
  return updated
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

      const resultUpdate = {
        winner: tm.winner,
        winning_team_name: winningTeam,
        status: 'completed',
      }
      if (tm.score_top != null) resultUpdate.score_top = tm.score_top
      if (tm.score_bottom != null) resultUpdate.score_bottom = tm.score_bottom

      await supabase
        .from('bracket_matchups')
        .update(resultUpdate)
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

export async function submitBracket(tournamentId, userId, picks, entryName, tiebreakerScore) {
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

  const isBestOf7 = tournament.bracket_templates?.series_format === 'best_of_7'

  // Check if tournament lock deadline has passed
  const isLocked = new Date(tournament.locks_at) <= new Date()
  let ffGraceMode = false

  if (isLocked) {
    // Allow FF grace period: if user has an existing entry with missing FF/Championship picks,
    // they can still submit those picks (but not change earlier rounds)
    const { data: existingEntry } = await supabase
      .from('bracket_entries')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .single()

    if (!existingEntry) {
      const err = new Error('This bracket is locked and no longer accepting entries')
      err.status = 400
      throw err
    }

    // Check if they have missing FF/Championship picks
    const { data: existingPicks } = await supabase
      .from('bracket_picks')
      .select('round_number')
      .eq('entry_id', existingEntry.id)

    const existingRounds = new Set((existingPicks || []).map((p) => p.round_number))
    const templateRounds = [...new Set(
      (await supabase.from('bracket_template_matchups').select('round_number').eq('template_id', tournament.template_id))
        .data?.map((m) => m.round_number) || []
    )]
    const maxRound = Math.max(...templateRounds)
    const ffRounds = templateRounds.filter((r) => r >= maxRound - 1) // FF + Championship

    const hasMissingFFPicks = ffRounds.some((r) => !existingRounds.has(r))

    if (!hasMissingFFPicks) {
      const err = new Error('This bracket is locked and no longer accepting changes')
      err.status = 400
      throw err
    }

    ffGraceMode = true
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

  // Get completed tournament matchups to skip chain validation for settled games
  const { data: tournamentMatchups } = await supabase
    .from('bracket_matchups')
    .select('template_matchup_id, status, winner')
    .eq('tournament_id', tournamentId)

  const completedTemplateIds = new Set(
    (tournamentMatchups || [])
      .filter((m) => m.status === 'completed')
      .map((m) => m.template_matchup_id)
  )

  // Validate pick chains: picked team must come from a feeder pick or be a direct team on the matchup
  // Skip validation for matchups whose feeder games are already completed (picks are locked)
  for (const m of templateMatchups) {
    if (m.is_bye) continue
    const feeders = templateMatchups.filter(
      (f) => f.feeds_into_matchup_id === m.id
    )
    if (feeders.length === 0) continue // First-round matchup (no feeders to validate)

    const pick = pickMap[m.id]
    if (!pick) continue

    // If any feeder game is completed, skip chain validation for this matchup
    // (the user can't change those picks, so broken chains from settled games are accepted)
    const hasCompletedFeeder = feeders.some((f) => completedTemplateIds.has(f.id))
    if (hasCompletedFeeder) continue

    // The picked team must be picked in a feeder OR be a directly-set team on this matchup
    const pickedInFeeder = feeders.some((f) => pickMap[f.id] === pick)
    const directTeams = [m.team_top, m.team_bottom].filter(Boolean)
    const isDirectTeam = directTeams.includes(pick)

    if (!pickedInFeeder && !isDirectTeam) {
      const err = new Error(`Invalid pick chain: "${pick}" in round ${m.round_number} was not picked as a winner in the previous round`)
      err.status = 400
      throw err
    }
  }

  // Validate pick count (skip in FF grace mode — user is only submitting FF picks)
  if (!ffGraceMode) {
    const nonByeMatchups = templateMatchups.filter((m) => !m.is_bye)
    const requiredMatchups = nonByeMatchups.filter((m) => m.round_number >= 1)
    if (picks.length < requiredMatchups.length) {
      const err = new Error(`Must fill at least ${requiredMatchups.length} bracket slots (got ${picks.length})`)
      err.status = 400
      throw err
    }
    if (picks.length > nonByeMatchups.length) {
      const err = new Error(`Too many picks: max ${nonByeMatchups.length} slots (got ${picks.length})`)
      err.status = 400
      throw err
    }
  }

  // Calculate possible points
  const rounds = tournament.bracket_templates?.rounds || []
  let possiblePoints = 0
  for (const pick of picks) {
    const matchup = matchupMap[pick.template_matchup_id]
    if (matchup) {
      const roundConfig = rounds.find((r) => r.round_number === matchup.round_number)
      possiblePoints += roundConfig?.points_per_correct || 0
      // Include max series length bonus (+4 for exact prediction)
      if (isBestOf7 && pick.series_length) possiblePoints += 4
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
        tiebreaker_score: tiebreakerScore ?? null,
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

  if (ffGraceMode) {
    // FF grace mode: only insert/update FF and Championship picks, keep earlier rounds
    const templateRoundsData = await supabase
      .from('bracket_template_matchups')
      .select('round_number')
      .eq('template_id', tournament.template_id)
    const maxRound = Math.max(...(templateRoundsData.data || []).map((m) => m.round_number))
    const ffMinRound = maxRound - 1 // FF round

    // Only accept picks for FF+ rounds
    const ffPicks = picks.filter((p) => {
      const matchup = matchupMap[p.template_matchup_id]
      return matchup && matchup.round_number >= ffMinRound
    })

    // Delete only FF+ picks and re-insert
    await supabase
      .from('bracket_picks')
      .delete()
      .eq('entry_id', entry.id)
      .gte('round_number', ffMinRound)

    const pickRows = ffPicks.map((p) => {
      const matchup = matchupMap[p.template_matchup_id]
      const row = {
        entry_id: entry.id,
        template_matchup_id: p.template_matchup_id,
        round_number: matchup?.round_number || 0,
        position: matchup?.position || 0,
        picked_team: p.picked_team,
      }
      if (isBestOf7 && p.series_length && [4, 5, 6, 7].includes(p.series_length)) {
        row.series_length = p.series_length
      }
      return row
    })

    if (pickRows.length) {
      const { error: pickError } = await supabase
        .from('bracket_picks')
        .insert(pickRows)
      if (pickError) {
        logger.error({ pickError }, 'Failed to insert FF grace picks')
        throw pickError
      }
    }

    // Mark any picks as eliminated if the team has already lost in an earlier round
    await eliminateAlreadyLostPicks(entry.id, tournament.template_id)

    return { entry, picks: pickRows }
  }

  // Normal mode: delete existing picks and re-insert all
  await supabase
    .from('bracket_picks')
    .delete()
    .eq('entry_id', entry.id)

  const pickRows = picks.map((p) => {
    const matchup = matchupMap[p.template_matchup_id]
    const row = {
      entry_id: entry.id,
      template_matchup_id: p.template_matchup_id,
      round_number: matchup?.round_number || 0,
      position: matchup?.position || 0,
      picked_team: p.picked_team,
    }
    // Series length prediction for best-of-7 formats
    if (isBestOf7 && p.series_length && [4, 5, 6, 7].includes(p.series_length)) {
      row.series_length = p.series_length
    }
    return row
  })

  const { error: pickError } = await supabase
    .from('bracket_picks')
    .insert(pickRows)

  if (pickError) {
    logger.error({ pickError }, 'Failed to insert bracket picks')
    throw pickError
  }

  // Mark any picks as eliminated if the team has already lost in an earlier round
  await eliminateAlreadyLostPicks(entry.id, tournament.template_id)

  return { entry, picks: pickRows }
}

export async function getBracketEntry(tournamentId, userId) {
  const { data: entry, error } = await supabase
    .from('bracket_entries')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .single()

  // PGRST116 = "no rows found" — that's a legitimate empty result.
  // Any other error (RLS, network, etc.) should throw so the client retries
  // instead of silently caching null and showing "not submitted in time."
  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message || 'Failed to fetch bracket entry')
  }
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
  const { data: tournament } = await supabase
    .from('bracket_tournaments')
    .select('championship_total_score')
    .eq('id', tournamentId)
    .single()

  const { data: entries, error } = await supabase
    .from('bracket_entries')
    .select('*, users(id, username, display_name, avatar_url, avatar_emoji, tier, total_points)')
    .eq('tournament_id', tournamentId)
    .order('total_points', { ascending: false })

  if (error) throw error
  if (!entries?.length) return []

  const actualScore = tournament?.championship_total_score
  return sortEntriesWithTiebreaker(entries, actualScore)
}

// ============================================
// Tournament Data
// ============================================

export async function getTournament(leagueId) {
  const { data: tournament, error } = await supabase
    .from('bracket_tournaments')
    .select('*, bracket_templates(*, bracket_template_matchups(*))')
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

export async function enterTemplateResult(templateId, templateMatchupId, winner, scoreTop, scoreBottom, seriesWinsTop, seriesWinsBottom) {
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
  const templateUpdate = { winner, winning_team_name: winningTeam }
  if (scoreTop != null) templateUpdate.score_top = scoreTop
  if (scoreBottom != null) templateUpdate.score_bottom = scoreBottom
  if (seriesWinsTop != null) templateUpdate.series_wins_top = seriesWinsTop
  if (seriesWinsBottom != null) templateUpdate.series_wins_bottom = seriesWinsBottom
  // Calculate actual series length from series wins
  if (seriesWinsTop != null && seriesWinsBottom != null) {
    templateUpdate.actual_series_length = seriesWinsTop + seriesWinsBottom
  }

  await supabase
    .from('bracket_template_matchups')
    .update(templateUpdate)
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
    await cascadeResultToTournament(tournament, templateMatchup, winner, winningTeam, winningSeed, scoreTop, scoreBottom, seriesWinsTop, seriesWinsBottom)
  }

  return { templateMatchupId, winner, winningTeam }
}

async function cascadeResultToTournament(tournament, templateMatchup, winner, winningTeam, winningSeed, scoreTop, scoreBottom, seriesWinsTop, seriesWinsBottom) {
  const tournamentId = tournament.id
  const actualSeriesLength = (seriesWinsTop != null && seriesWinsBottom != null) ? seriesWinsTop + seriesWinsBottom : null

  // Update the tournament matchup
  const matchupUpdate = {
    winner,
    winning_team_name: winningTeam,
    status: 'completed',
  }
  if (scoreTop != null) matchupUpdate.score_top = scoreTop
  if (scoreBottom != null) matchupUpdate.score_bottom = scoreBottom
  if (seriesWinsTop != null) matchupUpdate.series_wins_top = seriesWinsTop
  if (seriesWinsBottom != null) matchupUpdate.series_wins_bottom = seriesWinsBottom
  if (actualSeriesLength != null) matchupUpdate.actual_series_length = actualSeriesLength

  await supabase
    .from('bracket_matchups')
    .update(matchupUpdate)
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

  const isBestOf7 = tournament.bracket_templates?.series_format === 'best_of_7'

  for (const pick of allPicks || []) {
    const isCorrect = pick.picked_team === winningTeam
    let points = isCorrect ? pointsPerCorrect : 0

    // Series length bonus (only for best-of-7 and correct winner picks).
    // Bumped from 2/1 to 4/2 so series-length skill is meaningful enough to
    // differentiate skilled predictors from chalk pickers — at 2/1 it was
    // ~5% of the total ceiling and barely registered in standings.
    if (isBestOf7 && isCorrect && pick.series_length && actualSeriesLength) {
      const diff = Math.abs(pick.series_length - actualSeriesLength)
      if (diff === 0) points += 4      // Exact prediction
      else if (diff === 1) points += 2 // One game off
      // Two or more off: no bonus
    }

    await supabase
      .from('bracket_picks')
      .update({
        is_correct: isCorrect,
        points_earned: points,
      })
      .eq('id', pick.id)

    if (!isCorrect && pick.picked_team === losingTeam) {
      await eliminateDownstreamPicks(pick.entry_id, losingTeam, templateMatchup.round_number, tournamentId)
    }
  }

  await recalculateEntryPoints(tournamentId, rounds, tournament.bracket_templates?.series_format === 'best_of_7')
  await updateTournamentStatus(tournamentId)
}

async function eliminateAlreadyLostPicks(entryId, templateId) {
  // Find all teams that have lost (settled matchups where we know the loser)
  const { data: settledMatchups } = await supabase
    .from('bracket_template_matchups')
    .select('*')
    .eq('template_id', templateId)
    .not('winner', 'is', null)

  // Map: teamName → earliest round they lost in
  const lostInRound = {}
  for (const m of settledMatchups || []) {
    const loser = m.winner === 'top' ? m.team_bottom : m.team_top
    if (loser) {
      const prev = lostInRound[loser]
      if (prev === undefined || m.round_number < prev) {
        lostInRound[loser] = m.round_number
      }
    }
  }

  if (!Object.keys(lostInRound).length) return

  // Get all unscored, non-eliminated picks for this entry
  const { data: picks } = await supabase
    .from('bracket_picks')
    .select('*')
    .eq('entry_id', entryId)
    .is('is_correct', null)
    .eq('is_eliminated', false)

  for (const pick of picks || []) {
    const teamLostIn = lostInRound[pick.picked_team]
    if (teamLostIn !== undefined && teamLostIn <= pick.round_number) {
      await supabase
        .from('bracket_picks')
        .update({ is_eliminated: true })
        .eq('id', pick.id)
    }
  }
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

async function recalculateEntryPoints(tournamentId, rounds, isBestOf7 = false) {
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
        // Include max series length bonus for unscored picks
        if (isBestOf7 && pick.series_length) possiblePoints += 4
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

  // Clear winner and scores on template matchup
  await supabase
    .from('bracket_template_matchups')
    .update({ winner: null, winning_team_name: null, score_top: null, score_bottom: null })
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

  // Clear the winning team from the next round matchup
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
    .update({ winner: null, winning_team_name: null, status: 'pending', score_top: null, score_bottom: null })
    .eq('tournament_id', tournamentId)
    .eq('template_matchup_id', templateMatchup.id)

  // Determine the losing team (the one whose downstream picks were eliminated)
  const losingTeam = templateMatchup.winner === 'top'
    ? templateMatchup.team_bottom
    : templateMatchup.team_top

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
  }

  // Un-eliminate downstream picks only for the losing team (those were eliminated when result was entered)
  if (losingTeam) {
    const entryIds = [...new Set((picks || []).map((p) => p.entry_id))]
    for (const entryId of entryIds) {
      await supabase
        .from('bracket_picks')
        .update({ is_eliminated: false })
        .eq('entry_id', entryId)
        .eq('picked_team', losingTeam)
        .gt('round_number', templateMatchup.round_number)
    }
  }

  // Recalculate points
  const rounds = tournament.bracket_templates?.rounds || []
  await recalculateEntryPoints(tournamentId, rounds, tournament.bracket_templates?.series_format === 'best_of_7')
  await updateTournamentStatus(tournamentId)
}

// ============================================
// Standings
// ============================================

export async function scoreBracketMatchups(homeTeam, awayTeam, winner, homeScore, awayScore, sportKey) {
  // Find unsettled template matchups where both teams match this game
  let query = supabase
    .from('bracket_template_matchups')
    .select('*, bracket_templates!inner(id, is_active, sport, series_format)')
    .is('winner', null)
    .not('team_top', 'is', null)
    .not('team_bottom', 'is', null)
    .eq('bracket_templates.is_active', true)

  // Filter by sport to prevent cross-sport contamination (e.g. ncaab vs wncaab)
  if (sportKey) {
    query = query.eq('bracket_templates.sport', sportKey)
  }

  const { data: matchups, error } = await query

  if (error) {
    logger.error({ error }, 'Failed to query bracket matchups for scoring')
    return
  }

  logger.info({ homeTeam, awayTeam, sportKey, matchupCount: matchups?.length || 0 }, 'scoreBracketMatchups: searching for matchups')

  if (!matchups?.length) {
    logger.info({ homeTeam, awayTeam, sportKey }, 'scoreBracketMatchups: no unsettled matchups found for sport')
    return
  }

  const winningTeam = winner === 'home' ? homeTeam : awayTeam

  for (const matchup of matchups) {
    const teams = [matchup.team_top, matchup.team_bottom]
    if (!teams.includes(homeTeam) || !teams.includes(awayTeam)) {
      logger.debug({ homeTeam, awayTeam, team_top: matchup.team_top, team_bottom: matchup.team_bottom }, 'scoreBracketMatchups: team name mismatch, skipping')
      continue
    }

    const winnerSlot = matchup.team_top === winningTeam ? 'top' : 'bottom'
    const isBestOf7 = matchup.bracket_templates.series_format === 'best_of_7'

    // Map home/away scores to top/bottom based on team positions
    let scoreTop, scoreBottom
    if (homeScore != null && awayScore != null) {
      scoreTop = matchup.team_top === homeTeam ? homeScore : awayScore
      scoreBottom = matchup.team_bottom === homeTeam ? homeScore : awayScore
    }

    try {
      if (isBestOf7) {
        // Increment series wins — only settle when a team reaches 4
        const currentWinsTop = matchup.series_wins_top || 0
        const currentWinsBottom = matchup.series_wins_bottom || 0
        const newWinsTop = winnerSlot === 'top' ? currentWinsTop + 1 : currentWinsTop
        const newWinsBottom = winnerSlot === 'bottom' ? currentWinsBottom + 1 : currentWinsBottom

        if (newWinsTop >= 4 || newWinsBottom >= 4) {
          // Series is over — settle the matchup with final series record
          await enterTemplateResult(
            matchup.bracket_templates.id, matchup.id, winnerSlot,
            scoreTop, scoreBottom, newWinsTop, newWinsBottom
          )
          logger.info({ matchupId: matchup.id, winningTeam, series: `${newWinsTop}-${newWinsBottom}` }, 'Auto-settled bracket series')
        } else {
          // Series still in progress — update series wins on template AND tournament matchups
          await supabase
            .from('bracket_template_matchups')
            .update({ series_wins_top: newWinsTop, series_wins_bottom: newWinsBottom })
            .eq('id', matchup.id)
          // Cascade to all tournament matchups referencing this template matchup
          await supabase
            .from('bracket_matchups')
            .update({ series_wins_top: newWinsTop, series_wins_bottom: newWinsBottom })
            .eq('template_matchup_id', matchup.id)
          logger.info({ matchupId: matchup.id, winningTeam, series: `${newWinsTop}-${newWinsBottom}` }, 'Updated bracket series score')
        }
      } else {
        // Single-game matchup — settle immediately
        await enterTemplateResult(matchup.bracket_templates.id, matchup.id, winnerSlot, scoreTop, scoreBottom)
        logger.info({ matchupId: matchup.id, winningTeam, winnerSlot }, 'Auto-settled bracket matchup')
      }
    } catch (err) {
      logger.error({ err, matchupId: matchup.id }, 'Failed to auto-settle bracket matchup')
    }
  }
}

export async function getUserEntriesForTemplate(templateId, userId, excludeTournamentId) {
  // Find all tournaments using this template (except the current one)
  const { data: tournaments, error: tError } = await supabase
    .from('bracket_tournaments')
    .select('id, league_id, leagues(name)')
    .eq('template_id', templateId)
    .neq('id', excludeTournamentId)

  if (tError || !tournaments?.length) return []

  const tournamentIds = tournaments.map((t) => t.id)
  const tournamentMap = {}
  for (const t of tournaments) {
    tournamentMap[t.id] = t
  }

  // Get user's entries across those tournaments
  const { data: entries, error: eError } = await supabase
    .from('bracket_entries')
    .select('*')
    .eq('user_id', userId)
    .in('tournament_id', tournamentIds)

  if (eError || !entries?.length) return []

  // Get picks for each entry
  const entryIds = entries.map((e) => e.id)
  const { data: picks } = await supabase
    .from('bracket_picks')
    .select('*')
    .in('entry_id', entryIds)
    .order('round_number', { ascending: true })
    .order('position', { ascending: true })

  const picksByEntry = {}
  for (const p of picks || []) {
    if (!picksByEntry[p.entry_id]) picksByEntry[p.entry_id] = []
    picksByEntry[p.entry_id].push(p)
  }

  return entries.map((e) => {
    const t = tournamentMap[e.tournament_id]
    return {
      ...e,
      league_name: t?.leagues?.name || 'Unknown League',
      picks: picksByEntry[e.id] || [],
    }
  })
}

export async function getBracketStandings(leagueId) {
  const { data: tournament } = await supabase
    .from('bracket_tournaments')
    .select('id, championship_total_score')
    .eq('league_id', leagueId)
    .single()

  if (!tournament) return []

  const { data: entries } = await supabase
    .from('bracket_entries')
    .select('*, users(id, username, display_name, avatar_url, avatar_emoji, tier, total_points)')
    .eq('tournament_id', tournament.id)
    .order('total_points', { ascending: false })

  if (!entries?.length) return []

  const actualScore = tournament.championship_total_score
  const sorted = sortEntriesWithTiebreaker(entries, actualScore)

  return sorted.map((e, i) => ({
    rank: i + 1,
    user_id: e.user_id,
    user: e.users,
    total_points: e.total_points,
    possible_points: e.possible_points,
    entry_name: e.entry_name,
    submitted_at: e.submitted_at,
    tiebreaker_score: e.tiebreaker_score,
    tiebreaker_distance: e.tiebreaker_distance,
  }))
}

// ============================================
// Tiebreaker Helpers
// ============================================

function sortEntriesWithTiebreaker(entries, actualScore) {
  return entries.map((e) => {
    const distance = actualScore != null && e.tiebreaker_score != null
      ? Math.abs(e.tiebreaker_score - actualScore)
      : null
    return { ...e, tiebreaker_distance: distance }
  }).sort((a, b) => {
    // Primary: total_points DESC
    if (b.total_points !== a.total_points) return b.total_points - a.total_points
    // Secondary: tiebreaker distance ASC (null = last)
    const aDist = a.tiebreaker_distance ?? Infinity
    const bDist = b.tiebreaker_distance ?? Infinity
    return aDist - bDist
  })
}

export async function setTemplateChampionshipScore(templateId, totalScore) {
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

  // Find all tournaments using this template and update championship_total_score
  const { data: tournaments } = await supabase
    .from('bracket_tournaments')
    .select('id')
    .eq('template_id', templateId)

  for (const t of tournaments || []) {
    await supabase
      .from('bracket_tournaments')
      .update({ championship_total_score: totalScore })
      .eq('id', t.id)
  }

  return { templateId, totalScore, tournamentsUpdated: tournaments?.length || 0 }
}
