import { supabase } from '../config/supabase.js'
import { effectiveAdp } from '../utils/effectiveAdp.js'
import { buildRosterConfigHash } from '../utils/rosterConfigHash.js'

const RANKINGS_SEED_SIZE = 220

const PLAYER_SELECT = 'player_id, rank, nfl_players(id, full_name, position, team, headshot_url, injury_status, bye_week, projected_pts_half_ppr, projected_pts_ppr, projected_pts_std, search_rank)'

// ── Helpers ──────────────────────────────────────────────────────────

async function fetchPlayerPool() {
  // Two parallel queries — DEFs need to be guaranteed in the pool even though
  // they typically have very high (null or large) search_rank values.
  const [offensiveResult, defResult] = await Promise.all([
    supabase
      .from('nfl_players')
      .select('id, position, search_rank, adp_ppr, adp_half_ppr')
      .in('position', ['QB', 'RB', 'WR', 'TE', 'K'])
      .not('team', 'is', null)
      .order('search_rank', { ascending: true, nullsFirst: false })
      .limit(500),
    supabase
      .from('nfl_players')
      .select('id, position, search_rank, adp_ppr, adp_half_ppr')
      .eq('position', 'DEF')
      .not('team', 'is', null),
  ])
  return [...(offensiveResult.data || []), ...(defResult.data || [])]
}

async function seedDraftPrepRankings(userId, configHash, scoringFormat, rosterSlots) {
  const isSuperflex = (rosterSlots?.superflex || rosterSlots?.sflex || 0) > 0 || (rosterSlots?.qb || 0) >= 2
  const pool = await fetchPlayerPool()
  if (!pool.length) return

  // Split by position so defenses are guaranteed to make the seed even
  // when their Sleeper ADP/search_rank is null (falls back to 9999).
  // Without this split, all 32 DEFs sort past the seed cutoff and never
  // appear in user rankings. Same risk for Ks when ADP data is thin.
  const ranked = pool
    .map((p) => ({ ...p, _adp: effectiveAdp(p, scoringFormat, isSuperflex) }))
    .sort((a, b) => a._adp - b._adp)

  const defs = ranked.filter((p) => p.position === 'DEF')
  const offense = ranked.filter((p) => p.position !== 'DEF')

  // Reserve slots for all defenses (typically ~32), fill the rest with
  // the top offensive players by ADP.
  const offenseSeed = offense.slice(0, Math.max(0, RANKINGS_SEED_SIZE - defs.length))
  const seed = [...offenseSeed, ...defs]

  const rows = seed.map((p, i) => ({
    user_id: userId,
    roster_config_hash: configHash,
    scoring_format: scoringFormat,
    player_id: p.id,
    rank: i,
  }))
  const { error } = await supabase.from('draft_prep_rankings').insert(rows)
  if (error) throw error
}

// ── Saved Configs ────────────────────────────────────────────────────

// Returns the distinct (configHash, scoringFormat) pairs the user has saved
// rankings for, along with player count and last-modified timestamp so the
// client can render a "saved boards" picker. Filters to is_customized rows
// so lazy-seeded / reset boards (pure ADP order) don't pollute the list.
// setDraftPrepRankings deletes + re-inserts on every save, so created_at
// acts as last-saved.
export async function getSavedRankingConfigs(userId) {
  const { data, error } = await supabase
    .from('draft_prep_rankings')
    .select('roster_config_hash, scoring_format, created_at')
    .eq('user_id', userId)
    .eq('is_customized', true)

  if (error) throw error
  if (!data?.length) return []

  const map = {}
  for (const row of data) {
    const key = `${row.roster_config_hash}|${row.scoring_format}`
    if (!map[key]) {
      map[key] = {
        config_hash: row.roster_config_hash,
        scoring_format: row.scoring_format,
        player_count: 0,
        last_updated: row.created_at,
      }
    }
    map[key].player_count += 1
    if (row.created_at && (!map[key].last_updated || row.created_at > map[key].last_updated)) {
      map[key].last_updated = row.created_at
    }
  }

  return Object.values(map).sort((a, b) => {
    if (!a.last_updated) return 1
    if (!b.last_updated) return -1
    return b.last_updated.localeCompare(a.last_updated)
  })
}

// ── Rankings CRUD ────────────────────────────────────────────────────

export async function getDraftPrepRankings(userId, configHash, scoringFormat, rosterSlots) {
  // Check if rankings exist; lazy-seed if not
  const { data: existing } = await supabase
    .from('draft_prep_rankings')
    .select('player_id')
    .eq('user_id', userId)
    .eq('roster_config_hash', configHash)
    .eq('scoring_format', scoringFormat)
    .limit(1)

  if (!existing?.length) {
    await seedDraftPrepRankings(userId, configHash, scoringFormat, rosterSlots)
  }

  const { data, error } = await supabase
    .from('draft_prep_rankings')
    .select(PLAYER_SELECT)
    .eq('user_id', userId)
    .eq('roster_config_hash', configHash)
    .eq('scoring_format', scoringFormat)
    .order('rank', { ascending: true })
  if (error) throw error
  return data || []
}

export async function setDraftPrepRankings(userId, configHash, scoringFormat, playerIds) {
  if (!Array.isArray(playerIds)) {
    const err = new Error('playerIds must be an array')
    err.status = 400
    throw err
  }
  await supabase
    .from('draft_prep_rankings')
    .delete()
    .eq('user_id', userId)
    .eq('roster_config_hash', configHash)
    .eq('scoring_format', scoringFormat)

  if (!playerIds.length) return { count: 0 }
  // Marking is_customized=true here is what graduates a board from
  // "lazy-seeded ADP" to "Saved Ranking" in the user's picker.
  const rows = playerIds.map((pid, i) => ({
    user_id: userId,
    roster_config_hash: configHash,
    scoring_format: scoringFormat,
    player_id: pid,
    rank: i,
    is_customized: true,
  }))
  const { error } = await supabase.from('draft_prep_rankings').insert(rows)
  if (error) throw error
  return { count: rows.length }
}

export async function resetDraftPrepRankings(userId, configHash, scoringFormat, rosterSlots) {
  // Before wiping, fork-then-unsync any leagues currently syncing this
  // (config + scoring) board. Otherwise the league would silently start
  // following the about-to-be-reset ADP order, which is confusing —
  // especially mid-draft. Fork preserves the league's customized order
  // at the moment of disconnect.
  const { data: syncRecords } = await supabase
    .from('draft_prep_sync')
    .select('league_id')
    .eq('user_id', userId)
    .eq('roster_config_hash', configHash)
    .eq('scoring_format', scoringFormat)

  if (syncRecords?.length) {
    // Snapshot the current (still-customized) rankings once — every synced
    // league forks from the same source.
    const { data: prepRankings } = await supabase
      .from('draft_prep_rankings')
      .select('player_id, rank')
      .eq('user_id', userId)
      .eq('roster_config_hash', configHash)
      .eq('scoring_format', scoringFormat)
      .order('rank', { ascending: true })

    if (prepRankings?.length) {
      for (const sync of syncRecords) {
        const rows = prepRankings.map((r) => ({
          league_id: sync.league_id,
          user_id: userId,
          player_id: r.player_id,
          rank: r.rank,
        }))
        await supabase.from('fantasy_user_rankings').insert(rows)
      }
    }

    await supabase
      .from('draft_prep_sync')
      .delete()
      .eq('user_id', userId)
      .eq('roster_config_hash', configHash)
      .eq('scoring_format', scoringFormat)
  }

  await supabase
    .from('draft_prep_rankings')
    .delete()
    .eq('user_id', userId)
    .eq('roster_config_hash', configHash)
    .eq('scoring_format', scoringFormat)
  await seedDraftPrepRankings(userId, configHash, scoringFormat, rosterSlots)
  return { reset: true, unsynced: syncRecords?.length || 0 }
}

// ── Sync Management ──────────────────────────────────────────────────

export async function getSyncPreferences(userId) {
  const { data, error } = await supabase
    .from('draft_prep_sync')
    .select('id, league_id, roster_config_hash, scoring_format, created_at, leagues(id, name)')
    .eq('user_id', userId)
  if (error) throw error
  return data || []
}

export async function syncLeague(userId, leagueId) {
  // Get league's fantasy settings to compute config hash
  const { data: settings } = await supabase
    .from('fantasy_settings')
    .select('scoring_format, roster_slots')
    .eq('league_id', leagueId)
    .single()
  if (!settings) {
    const err = new Error('League has no fantasy settings')
    err.status = 400
    throw err
  }

  const configHash = buildRosterConfigHash(settings.roster_slots || {})
  const scoringFormat = settings.scoring_format || 'half_ppr'

  // Ensure draft prep rankings exist for this config
  const { data: existing } = await supabase
    .from('draft_prep_rankings')
    .select('player_id')
    .eq('user_id', userId)
    .eq('roster_config_hash', configHash)
    .eq('scoring_format', scoringFormat)
    .limit(1)

  if (!existing?.length) {
    // Seed from the league's existing rankings if available, otherwise from ADP
    const { data: leagueRankings } = await supabase
      .from('fantasy_user_rankings')
      .select('player_id, rank')
      .eq('league_id', leagueId)
      .eq('user_id', userId)
      .order('rank', { ascending: true })

    if (leagueRankings?.length) {
      const rows = leagueRankings.map((r) => ({
        user_id: userId,
        roster_config_hash: configHash,
        scoring_format: scoringFormat,
        player_id: r.player_id,
        rank: r.rank,
      }))
      await supabase.from('draft_prep_rankings').insert(rows)
    } else {
      await seedDraftPrepRankings(userId, configHash, scoringFormat, settings.roster_slots)
    }
  }

  // Create sync record
  const { error: syncErr } = await supabase
    .from('draft_prep_sync')
    .upsert({ user_id: userId, league_id: leagueId, roster_config_hash: configHash, scoring_format: scoringFormat }, { onConflict: 'user_id, league_id' })
  if (syncErr) throw syncErr

  // Remove league-specific rankings (synced leagues read from draft_prep_rankings)
  await supabase
    .from('fantasy_user_rankings')
    .delete()
    .eq('league_id', leagueId)
    .eq('user_id', userId)

  return { synced: true, configHash, scoringFormat }
}

export async function unsyncLeague(userId, leagueId) {
  // Get the sync record to know which config to fork from
  const { data: syncRecord } = await supabase
    .from('draft_prep_sync')
    .select('roster_config_hash, scoring_format')
    .eq('user_id', userId)
    .eq('league_id', leagueId)
    .single()

  if (!syncRecord) {
    const err = new Error('League is not synced')
    err.status = 400
    throw err
  }

  // Fork: copy draft prep rankings into league-specific rankings
  const { data: prepRankings } = await supabase
    .from('draft_prep_rankings')
    .select('player_id, rank')
    .eq('user_id', userId)
    .eq('roster_config_hash', syncRecord.roster_config_hash)
    .eq('scoring_format', syncRecord.scoring_format)
    .order('rank', { ascending: true })

  if (prepRankings?.length) {
    const rows = prepRankings.map((r) => ({
      league_id: leagueId,
      user_id: userId,
      player_id: r.player_id,
      rank: r.rank,
    }))
    await supabase.from('fantasy_user_rankings').insert(rows)
  }

  // Remove sync record
  await supabase
    .from('draft_prep_sync')
    .delete()
    .eq('user_id', userId)
    .eq('league_id', leagueId)

  return { unsynced: true }
}

export async function syncAllLeagues(userId, mode, configHash, scoringFormat) {
  // Reuse the matching-leagues logic — it already filters out salary cap,
  // completed drafts, and non-fantasy formats.
  const candidates = await getMatchingLeagues(userId, configHash || '', scoringFormat || 'half_ppr')
  if (!candidates.length) return { synced: [] }

  const synced = []
  for (const c of candidates) {
    if (c.isSynced) continue
    if (mode === 'matching' && !c.isMatching) continue
    try {
      await syncLeague(userId, c.leagueId)
      synced.push({ leagueId: c.leagueId, name: c.name })
    } catch (e) {
      // Skip leagues that fail (e.g. no settings)
    }
  }
  return { synced }
}

// ── Sync Lookup (used by fantasyService) ─────────────────────────────

export async function getLeagueSyncInfo(leagueId, userId) {
  const { data } = await supabase
    .from('draft_prep_sync')
    .select('roster_config_hash, scoring_format')
    .eq('user_id', userId)
    .eq('league_id', leagueId)
    .single()
  return data ? { isSynced: true, ...data } : { isSynced: false }
}

// ── ADP List ─────────────────────────────────────────────────────────

export async function getAdpList(scoringFormat, position) {
  const SELECT = 'id, full_name, position, team, headshot_url, bye_week, injury_status, adp_ppr, adp_half_ppr, projected_pts_half_ppr, projected_pts_ppr, projected_pts_std, search_rank'

  // Fetch offensive + defenses separately so DEFs are guaranteed in the list
  // even when filtered to All positions. If a specific position is requested,
  // short-circuit to a single query.
  if (position && position !== 'All') {
    const { data, error } = await supabase
      .from('nfl_players')
      .select(SELECT)
      .eq('position', position)
      .not('team', 'is', null)
      .order('search_rank', { ascending: true, nullsFirst: false })
      .limit(300)
    if (error) throw error

    // Apply effective-ADP sort (scoring-aware) on the returned rows
    return (data || [])
      .map((p) => ({ ...p, _adp: effectiveAdp(p, scoringFormat, false) }))
      .sort((a, b) => a._adp - b._adp)
  }

  const [offensiveResult, defResult] = await Promise.all([
    supabase
      .from('nfl_players')
      .select(SELECT)
      .in('position', ['QB', 'RB', 'WR', 'TE', 'K'])
      .not('team', 'is', null)
      .order('search_rank', { ascending: true, nullsFirst: false })
      .limit(300),
    supabase
      .from('nfl_players')
      .select(SELECT)
      .eq('position', 'DEF')
      .not('team', 'is', null),
  ])
  if (offensiveResult.error) throw offensiveResult.error
  if (defResult.error) throw defResult.error

  const offensiveSorted = (offensiveResult.data || [])
    .map((p) => ({ ...p, _adp: effectiveAdp(p, scoringFormat, false) }))
    .sort((a, b) => a._adp - b._adp)
  const defs = (defResult.data || [])
    .map((p) => ({ ...p, _adp: effectiveAdp(p, scoringFormat, false) }))
    .sort((a, b) => a._adp - b._adp)

  return [...offensiveSorted, ...defs]
}

// ── Matching Leagues ─────────────────────────────────────────────────

export async function getMatchingLeagues(userId, configHash, scoringFormat) {
  // Get all user's fantasy leagues
  const { data: memberships } = await supabase
    .from('league_members')
    .select('league_id, leagues(id, name, format, status)')
    .eq('user_id', userId)

  if (!memberships?.length) return []

  const leagueIds = memberships
    .filter((m) => m.leagues?.format === 'fantasy')
    .map((m) => m.league_id)

  if (!leagueIds.length) return []

  const { data: settingsList } = await supabase
    .from('fantasy_settings')
    .select('league_id, scoring_format, roster_slots, draft_status, format')
    .in('league_id', leagueIds)

  if (!settingsList?.length) return []

  // Get existing sync records
  const { data: syncRecords } = await supabase
    .from('draft_prep_sync')
    .select('league_id')
    .eq('user_id', userId)

  const syncedSet = new Set((syncRecords || []).map((s) => s.league_id))

  return settingsList
    // Only traditional fantasy football — exclude salary cap (DFS) leagues
    .filter((s) => s.format !== 'salary_cap')
    .filter((s) => s.draft_status !== 'completed')
    .map((s) => {
      const league = memberships.find((m) => m.league_id === s.league_id)?.leagues
      const hash = buildRosterConfigHash(s.roster_slots || {})
      const rosterMatches = hash === configHash
      const scoringMatches = s.scoring_format === scoringFormat
      return {
        leagueId: s.league_id,
        name: league?.name,
        status: league?.status,
        configHash: hash,
        scoringFormat: s.scoring_format,
        rosterMatches,
        scoringMatches,
        isMatching: rosterMatches && scoringMatches,
        isSynced: syncedSet.has(s.league_id),
      }
    })
}
