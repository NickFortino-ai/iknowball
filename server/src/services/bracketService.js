import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from './notificationService.js'

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
      ends_at: data.ends_at || null,
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

  const { data: templates, error } = await query
  if (error) throw error
  if (!templates?.length) return []

  // Annotate each template with whether the championship total has been
  // entered. Sourced from bracket_tournaments (one per league using the
  // template) — admin's "Save championship total" propagates to every
  // tournament row, so any non-null row means the template has been
  // finalized for at least one league.
  const templateIds = templates.map((t) => t.id)
  const { data: tournamentsWithScore } = await supabase
    .from('bracket_tournaments')
    .select('template_id')
    .in('template_id', templateIds)
    .not('championship_total_score', 'is', null)

  const finalizedSet = new Set((tournamentsWithScore || []).map((t) => t.template_id))

  return templates.map((t) => ({
    ...t,
    championship_score_set: finalizedSet.has(t.id),
  }))
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
  // Fetch the prior picks_available_at + name + sport in addition to created_by
  // so we can detect the "bracket goes live" transition and notify members.
  const { data: template } = await supabase
    .from('bracket_templates')
    .select('created_by, picks_available_at, name, sport')
    .eq('id', templateId)
    .single()

  if (!template) {
    const err = new Error('Template not found')
    err.status = 404
    throw err
  }

  const updates = { updated_at: new Date().toISOString() }
  // Same hazard as `sport` below, but worse: there is no CHECK on name, so a
  // blank one would silently wipe the template's name instead of erroring.
  if (data.name !== undefined && String(data.name).trim() !== '') {
    updates.name = data.name
  }
  if (data.description !== undefined) updates.description = data.description
  // A BLANK sport is never a legitimate edit — the builder locks the sport on
  // an edit because changing it would invalidate every matchup and team name.
  // But the form still ships `sport` from React state on every save, and that
  // state initializes to '' before the template fetch resolves. If a save is
  // assembled from that pre-hydration state, we'd hand Postgres an empty
  // string, which fails bracket_templates_sport_check with a message no admin
  // can act on ("violates check constraint") while the real casualty is the
  // edit they were actually making — e.g. attaching a bracket image.
  //
  // Treat blank as "not provided" and keep the stored sport. Verified against
  // production 2026-09-25: `update({sport: ''})` reproduces that exact error,
  // while the same update carrying the image alone succeeds.
  if (data.sport !== undefined && String(data.sport).trim() !== '') {
    updates.sport = data.sport
  }
  if (data.team_count !== undefined) updates.team_count = data.team_count
  if (data.rounds !== undefined) updates.rounds = data.rounds
  if (data.regions !== undefined) updates.regions = data.regions
  if (data.picks_available_at !== undefined) updates.picks_available_at = data.picks_available_at
  if (data.ends_at !== undefined) updates.ends_at = data.ends_at
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

  // Publish detection: if the admin just set picks_available_at to now/past
  // and it was previously null OR in the future, this is the "bracket goes
  // live" moment. Fan out a notification to every league member using this
  // template. Fire-and-forget — the update returns immediately; the fan-out
  // runs in the background.
  if (data.picks_available_at !== undefined) {
    const wasUnavailable = !template.picks_available_at ||
      new Date(template.picks_available_at).getTime() > Date.now()
    const nowAvailable = data.picks_available_at &&
      new Date(data.picks_available_at).getTime() <= Date.now()
    if (wasUnavailable && nowAvailable) {
      notifyBracketPublished(templateId, updated.name || template.name).catch((err) =>
        logger.warn({ err, templateId }, 'bracket_published fan-out failed')
      )
    }
  }

  return updated
}

// Notify every member of every league using this template that the bracket
// is live and picks are open. Called from updateTemplate when picks_available_at
// transitions to now/past.
async function notifyBracketPublished(templateId, templateName) {
  const { data: tournaments } = await supabase
    .from('bracket_tournaments')
    .select('league_id')
    .eq('template_id', templateId)
  if (!tournaments?.length) return

  const leagueIds = [...new Set(tournaments.map((t) => t.league_id))]
  const { data: members } = await supabase
    .from('league_members')
    .select('user_id, league_id, leagues(name)')
    .in('league_id', leagueIds)
  if (!members?.length) return

  const label = templateName || 'your bracket'
  for (const m of members) {
    const leagueName = m.leagues?.name || 'your league'
    try {
      await createNotification(m.user_id, 'bracket_published',
        `${label} is live in ${leagueName} — make your picks before lock!`,
        { leagueId: m.league_id, templateId })
    } catch (err) {
      logger.warn({ err, userId: m.user_id, leagueId: m.league_id }, 'bracket_published createNotification failed')
    }
  }
  logger.info({ templateId, fanout: members.length }, 'bracket_published notifications fanned out')
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

  const rounds = tournament.bracket_templates?.rounds || []

  // Validate each predicted series length against ITS OWN round. The request
  // schema can only bound the shape (1..7) because it has no tournament
  // context, so this is the real gate — without it, widening that bound would
  // let someone call a best-of-3 in 7 games. roundSeriesConfig is the single
  // definition of what a round allows: best-of-3 clinches at 2, so 2 or 3;
  // best-of-5 gives 3..5; best-of-7 gives 4..7.
  for (const pick of picks) {
    if (pick.series_length == null) continue
    const matchup = matchupMap[pick.template_matchup_id]
    if (!matchup) continue
    const cfg = roundSeriesConfig(rounds, matchup.round_number, tournament.bracket_templates?.series_format)
    if (!cfg.isSeries) {
      const err = new Error(`Round ${matchup.round_number} is a single game — it has no series length to predict`)
      err.status = 400
      throw err
    }
    if (!cfg.lengths.includes(pick.series_length)) {
      const err = new Error(
        `Round ${matchup.round_number} is a best-of-${cfg.bestOf} — a series can only go ${cfg.lengths.join(', ')} games (got ${pick.series_length})`
      )
      err.status = 400
      throw err
    }
  }

  // Calculate possible points
  let possiblePoints = 0
  for (const pick of picks) {
    const matchup = matchupMap[pick.template_matchup_id]
    if (matchup) {
      const roundConfig = rounds.find((r) => r.round_number === matchup.round_number)
      possiblePoints += roundConfig?.points_per_correct || 0
      // Include max series length bonus (+4 for exact prediction). Per-round:
      // a single-game round has no series to predict.
      const lenCfg = roundSeriesConfig(rounds, matchup.round_number, tournament.bracket_templates?.series_format)
      if (pick.series_length && lenCfg.isSeries) possiblePoints += lenCfg.exactBonus
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
      // Valid lengths depend on the round: 2-3 for a best-of-3, 3-5 for a
      // best-of-5, 4-7 for a best-of-7. Hardcoding [4,5,6,7] silently dropped
      // every Wild Card and Division Series prediction.
      if (roundSeriesConfig(rounds, p.round_number, tournament.bracket_templates?.series_format).lengths.includes(p.series_length)) {
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
    if (roundSeriesConfig(rounds, p.round_number, tournament.bracket_templates?.series_format).lengths.includes(p.series_length)) {
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


/**
 * Pair the survivors of a completed round by SEED, for a round that reseeds.
 *
 * Every other bracket we support is statically wired: feeds_into_matchup_id
 * decides where a winner goes, fixed when the template was built. That holds
 * for MLB, the NBA, the NHL, the NCAA tournament and the World Cup, none of
 * which reseed.
 *
 * The NFL does. After the Wild Card round the 1 seed plays the LOWEST
 * remaining seed, so if the 7 upsets the 2, the 1 draws the 7 — and which
 * winner belongs in which Divisional matchup cannot be known in advance.
 *
 * Two consequences:
 *   1. Placement can't happen per-matchup as games finish. Nobody can be
 *      placed until EVERY matchup of the previous round in that region is
 *      settled, because the pairing depends on the whole survivor set.
 *   2. The bye team is already sitting in the reseeding round (the 1 seed as
 *      team_top), so it joins the survivor pool rather than being placed.
 *
 * Pairing, survivors sorted ascending by seed:
 *   matchup[0]  seeds[0] v seeds[last]      best vs worst
 *   matchup[1]  seeds[1] v seeds[last-1]
 *   ...
 * which for the NFL's four survivors is 1-vs-lowest and the middle two.
 *
 * No-op unless the round declares `reseed: true`.
 */
async function applyReseedForRound(templateId, rounds, completedRound, region) {
  const nextRound = (rounds || []).find((r) => r.round_number === completedRound + 1)
  if (!nextRound?.reseed) return

  const { data: all } = await supabase
    .from('bracket_template_matchups')
    .select('id, round_number, position, region, seed_top, seed_bottom, team_top, team_bottom, winner')
    .eq('template_id', templateId)
    .in('round_number', [completedRound, completedRound + 1])
    .order('position')

  const inRegion = (m) => (region == null ? m.region == null : m.region === region)
  const prev = (all || []).filter((m) => m.round_number === completedRound && inRegion(m))
  const next = (all || []).filter((m) => m.round_number === completedRound + 1 && inRegion(m))
  if (!prev.length || !next.length) return

  // Hold until the whole round is in. A partially-settled round would pair
  // the wrong teams and then have to be undone.
  if (prev.some((m) => !m.winner)) return

  const survivors = prev.map((m) => (m.winner === 'top'
    ? { team: m.team_top, seed: m.seed_top }
    : { team: m.team_bottom, seed: m.seed_bottom }))

  // Byes already seated in the reseeding round join the pool. They are
  // survivors too — the NFL's 1 seed never played a Wild Card game.
  for (const m of next) {
    if (m.team_top && m.seed_top != null) survivors.push({ team: m.team_top, seed: m.seed_top })
    if (m.team_bottom && m.seed_bottom != null) survivors.push({ team: m.team_bottom, seed: m.seed_bottom })
  }

  const seeded = survivors
    .filter((s) => s.team && s.seed != null)
    .sort((a, b) => a.seed - b.seed)

  // Needs exactly two survivors per matchup, or the bracket is malformed and
  // guessing would seat someone in the wrong game.
  if (seeded.length !== next.length * 2) {
    logger.error({ templateId, region, survivors: seeded.length, matchups: next.length }, 'Reseed aborted — survivor count does not fill the round')
    return
  }

  const ordered = [...next].sort((a, b) => a.position - b.position)
  for (let i = 0; i < ordered.length; i++) {
    const top = seeded[i]
    const bottom = seeded[seeded.length - 1 - i]
    await supabase
      .from('bracket_template_matchups')
      .update({
        team_top: top.team, seed_top: top.seed,
        team_bottom: bottom.team, seed_bottom: bottom.seed,
      })
      .eq('id', ordered[i].id)
  }
  logger.info(
    { templateId, region, round: completedRound + 1, pairs: ordered.map((m, i) => `${seeded[i].seed}v${seeded[seeded.length - 1 - i].seed}`) },
    'Reseeded round',
  )
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

  // Where the winner goes next.
  //
  // Two modes. Normally the wire is static and the winner is pushed straight
  // into feeds_into_slot. But if the NEXT round reseeds, no one can be placed
  // until that whole round is settled for this region — pairing depends on
  // the full survivor set — so the static push is skipped entirely and
  // applyReseedForRound seats everyone at once. Doing both would seat the
  // winner twice, once in the wrong game.
  const { data: tpl } = await supabase
    .from('bracket_templates')
    .select('rounds')
    .eq('id', templateId)
    .single()
  const nextRoundReseeds = !!(tpl?.rounds || [])
    .find((r) => r.round_number === templateMatchup.round_number + 1)?.reseed

  if (nextRoundReseeds) {
    await applyReseedForRound(templateId, tpl?.rounds, templateMatchup.round_number, templateMatchup.region)
  } else if (templateMatchup.feeds_into_matchup_id) {
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

  // Whether THIS round is a series at all, and therefore whether a length
  // prediction is worth bonus points.
  const isBestOf7 = roundSeriesConfig(
    rounds, templateMatchup.round_number, tournament.bracket_templates?.series_format,
  ).isSeries

  for (const pick of allPicks || []) {
    const isCorrect = pick.picked_team === winningTeam
    let points = isCorrect ? pointsPerCorrect : 0

    // Series length bonus (only for best-of-7 and correct winner picks).
    // Bumped from 2/1 to 4/2 so series-length skill is meaningful enough to
    // differentiate skilled predictors from chalk pickers — at 2/1 it was
    // ~5% of the total ceiling and barely registered in standings.
    if (isBestOf7 && isCorrect && pick.series_length && actualSeriesLength) {
      const diff = Math.abs(pick.series_length - actualSeriesLength)
      const cfg = roundSeriesConfig(rounds, templateMatchup.round_number, tournament.bracket_templates?.series_format)
      if (diff === 0) points += cfg.exactBonus
      else if (diff === 1) points += cfg.oneOffBonus
      // Two or more off: no bonus
    }

    await supabase
      .from('bracket_picks')
      .update({
        is_correct: isCorrect,
        points_earned: points,
      })
      .eq('id', pick.id)
  }

  // Sweep every entry's unscored picks for newly-dead teams. The old code
  // only called eliminateDownstreamPicks for entries that picked the
  // losing team IN THIS matchup — but an entry could have mispicked the
  // loser in a LATER round (e.g. correctly picked the conf-semi winner,
  // then absent-mindedly picked the conf-semi LOSER to win the finals).
  // Those orphan picks were never flagged is_eliminated, so possible_points
  // double-counted dead branches forever.
  const { data: allEntries } = await supabase
    .from('bracket_entries')
    .select('id')
    .eq('tournament_id', tournamentId)
  for (const entry of allEntries || []) {
    await eliminateAlreadyLostPicks(entry.id, tournament.template_id)
  }

  await recalculateEntryPoints(tournamentId, rounds, tournament.bracket_templates?.series_format)
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

async function recalculateEntryPoints(tournamentId, rounds, seriesFormat = 'single_elimination') {
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
        // Include max series length bonus for unscored picks, when that round
        // is actually a series.
        const lenCfg = roundSeriesConfig(rounds, pick.round_number, seriesFormat)
        if (pick.series_length && lenCfg.isSeries) possiblePoints += lenCfg.exactBonus
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
  await recalculateEntryPoints(tournamentId, rounds, tournament.bracket_templates?.series_format)
  await updateTournamentStatus(tournamentId)
}

// ============================================
// Standings
// ============================================

// Strip accents for team name comparison (e.g. Montréal → Montreal)
function normalizeTeam(name) {
  return name?.normalize('NFD').replace(/[\u0300-\u036f]/g, '') || ''
}


// Series length, per ROUND.
//
// It used to be one flag on the template — 'single_elimination' or
// 'best_of_7' — which covers the NBA and NHL, where every round is the same
// length. MLB is not: Wild Card is best-of-3, the Division Series best-of-5,
// and the LCS and World Series best-of-7. Neither template-level option can
// express that. best_of_7 leaves a Wild Card series unresolved waiting for a
// 4th win that never comes; single_elimination hands it to whoever wins game
// one.
//
// A round may now carry `best_of` in the template's rounds JSON. Everything
// else is derived: a series clinches at ceil(best_of / 2), and the only
// plausible lengths run from that number up to best_of — 2-3 for a best-of-3,
// 3-5 for a best-of-5, 4-7 for a best-of-7.
//
// Falls back to the template flag when a round says nothing, so every
// existing NBA / NHL / World Cup / UFL template keeps behaving exactly as it
// does today.
export function roundSeriesConfig(rounds, roundNumber, seriesFormat) {
  const round = (rounds || []).find((r) => r.round_number === roundNumber)
  const fromRound = Number(round?.best_of)
  const bestOf = Number.isFinite(fromRound) && fromRound > 0
    ? fromRound
    : (seriesFormat === 'best_of_7' ? 7 : 1)

  // best_of 1 is a single game: no series, and no length to predict.
  if (bestOf <= 1) return { bestOf: 1, clinch: 1, lengths: [], isSeries: false, exactBonus: 0, oneOffBonus: 0 }

  const clinch = Math.ceil(bestOf / 2)
  const lengths = []
  for (let n = clinch; n <= bestOf; n++) lengths.push(n)

  // The length bonus scales with how hard the guess actually is.
  //
  // A flat +4/+2 treated every series the same, but the number of possible
  // answers is not the same: a best-of-3 can only end 2-3, so an "exact"
  // prediction is a coin flip, while a best-of-7 has four outcomes. Paying
  // both the same rewarded luck in the early rounds as much as judgement in
  // the late ones.
  //
  //   best of 3   2 outcomes (50%)   +2 exact, no consolation
  //   best of 5   3 outcomes (33%)   +3 exact, +1 one-off
  //   best of 7   4 outcomes (25%)   +4 exact, +2 one-off
  //
  // Best-of-7 keeps 4/2, so the NBA and NHL brackets are unchanged.
  //
  // No one-off bonus on a best-of-3 on purpose: with only two answers,
  // "one game off" IS the other answer, so paying for it would mean paying
  // for every possible guess.
  const exactBonus = lengths.length
  const oneOffBonus = lengths.length >= 3 ? Math.floor(lengths.length / 2) : 0
  return { bestOf, clinch, lengths, isSeries: true, exactBonus, oneOffBonus }
}

export async function scoreBracketMatchups(homeTeam, awayTeam, winner, homeScore, awayScore, sportKey) {
  // Find unsettled template matchups where both teams match this game
  let query = supabase
    .from('bracket_template_matchups')
    .select('*, bracket_templates!inner(id, is_active, sport, series_format, rounds)')
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
    const nTop = normalizeTeam(matchup.team_top)
    const nBottom = normalizeTeam(matchup.team_bottom)
    const nHome = normalizeTeam(homeTeam)
    const nAway = normalizeTeam(awayTeam)
    const teamsMatch = (nTop === nHome && nBottom === nAway) || (nTop === nAway && nBottom === nHome)
    if (!teamsMatch) {
      logger.debug({ homeTeam, awayTeam, team_top: matchup.team_top, team_bottom: matchup.team_bottom }, 'scoreBracketMatchups: team name mismatch, skipping')
      continue
    }

    const nWinner = normalizeTeam(winningTeam)
    const winnerSlot = nTop === nWinner ? 'top' : 'bottom'
    const seriesCfg = roundSeriesConfig(
      matchup.bracket_templates.rounds,
      matchup.round_number,
      matchup.bracket_templates.series_format,
    )
    const isBestOf7 = seriesCfg.isSeries

    // Map home/away scores to top/bottom based on team positions
    let scoreTop, scoreBottom
    if (homeScore != null && awayScore != null) {
      scoreTop = nTop === nHome ? homeScore : awayScore
      scoreBottom = nBottom === nHome ? homeScore : awayScore
    }

    try {
      if (isBestOf7) {
        // Increment series wins — settle when a team reaches this ROUND's
        // clinch number (2 of 3, 3 of 5, 4 of 7).
        const currentWinsTop = matchup.series_wins_top || 0
        const currentWinsBottom = matchup.series_wins_bottom || 0
        const newWinsTop = winnerSlot === 'top' ? currentWinsTop + 1 : currentWinsTop
        const newWinsBottom = winnerSlot === 'bottom' ? currentWinsBottom + 1 : currentWinsBottom

        if (newWinsTop >= seriesCfg.clinch || newWinsBottom >= seriesCfg.clinch) {
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
