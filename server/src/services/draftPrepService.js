import { supabase } from '../config/supabase.js'
import { effectiveAdp } from '../utils/effectiveAdp.js'
import { buildRosterConfigHash } from '../utils/rosterConfigHash.js'

const RANKINGS_SEED_SIZE = 200

const PLAYER_SELECT = 'player_id, rank, nfl_players(id, full_name, position, team, headshot_url, injury_status, bye_week, projected_pts_half_ppr, projected_pts_ppr, projected_pts_std, search_rank)'

// ── Helpers ──────────────────────────────────────────────────────────

async function fetchPlayerPool() {
  const { data } = await supabase
    .from('nfl_players')
    .select('id, position, search_rank, adp_ppr, adp_half_ppr')
    .in('position', ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
    .not('team', 'is', null)
    .neq('status', 'retired')
    .limit(500)
  return data || []
}

async function seedDraftPrepRankings(userId, configHash, scoringFormat, rosterSlots) {
  const isSuperflex = (rosterSlots?.superflex || rosterSlots?.sflex || 0) > 0 || (rosterSlots?.qb || 0) >= 2
  const pool = await fetchPlayerPool()
  if (!pool.length) return

  const ranked = pool
    .map((p) => ({ ...p, _adp: effectiveAdp(p, scoringFormat, isSuperflex) }))
    .sort((a, b) => a._adp - b._adp)
    .slice(0, RANKINGS_SEED_SIZE)

  const rows = ranked.map((p, i) => ({
    user_id: userId,
    roster_config_hash: configHash,
    scoring_format: scoringFormat,
    player_id: p.id,
    rank: i,
  }))
  const { error } = await supabase.from('draft_prep_rankings').insert(rows)
  if (error) throw error
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
  const rows = playerIds.map((pid, i) => ({
    user_id: userId,
    roster_config_hash: configHash,
    scoring_format: scoringFormat,
    player_id: pid,
    rank: i,
  }))
  const { error } = await supabase.from('draft_prep_rankings').insert(rows)
  if (error) throw error
  return { count: rows.length }
}

export async function resetDraftPrepRankings(userId, configHash, scoringFormat, rosterSlots) {
  await supabase
    .from('draft_prep_rankings')
    .delete()
    .eq('user_id', userId)
    .eq('roster_config_hash', configHash)
    .eq('scoring_format', scoringFormat)
  await seedDraftPrepRankings(userId, configHash, scoringFormat, rosterSlots)
  return { reset: true }
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
  // Get all user's fantasy leagues with pending/in_progress drafts
  const { data: memberships } = await supabase
    .from('league_members')
    .select('league_id, leagues(id, name, format, status), fantasy_settings:leagues!inner(league_id, scoring_format, roster_slots, draft_status)')
    .eq('user_id', userId)

  if (!memberships?.length) return { synced: [] }

  const synced = []
  for (const m of memberships) {
    const settings = Array.isArray(m.fantasy_settings) ? m.fantasy_settings[0] : m.fantasy_settings
    if (!settings || settings.draft_status === 'completed') continue
    if (!m.leagues || m.leagues.format !== 'fantasy') continue

    const leagueConfigHash = buildRosterConfigHash(settings.roster_slots || {})
    const leagueScoringFormat = settings.scoring_format || 'half_ppr'

    if (mode === 'matching' && (leagueConfigHash !== configHash || leagueScoringFormat !== scoringFormat)) {
      continue
    }

    try {
      await syncLeague(userId, m.league_id)
      synced.push({ leagueId: m.league_id, name: m.leagues.name })
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
  let query = supabase
    .from('nfl_players')
    .select('id, full_name, position, team, headshot_url, bye_week, injury_status, adp_ppr, adp_half_ppr, projected_pts_half_ppr, projected_pts_ppr, projected_pts_std, search_rank')
    .in('position', ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
    .not('team', 'is', null)
    .neq('status', 'retired')

  if (position && position !== 'All') {
    query = query.eq('position', position)
  }

  // Order by the scoring-appropriate ADP column
  const adpCol = scoringFormat === 'ppr' ? 'adp_ppr' : 'adp_half_ppr'
  query = query.order(adpCol, { ascending: true, nullsFirst: false }).limit(300)

  const { data, error } = await query
  if (error) throw error
  return data || []
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
    .select('league_id, scoring_format, roster_slots, draft_status')
    .in('league_id', leagueIds)

  if (!settingsList?.length) return []

  // Get existing sync records
  const { data: syncRecords } = await supabase
    .from('draft_prep_sync')
    .select('league_id')
    .eq('user_id', userId)

  const syncedSet = new Set((syncRecords || []).map((s) => s.league_id))

  return settingsList
    .filter((s) => s.draft_status !== 'completed')
    .map((s) => {
      const league = memberships.find((m) => m.league_id === s.league_id)?.leagues
      const hash = buildRosterConfigHash(s.roster_slots || {})
      return {
        leagueId: s.league_id,
        name: league?.name,
        status: league?.status,
        configHash: hash,
        scoringFormat: s.scoring_format,
        isMatching: hash === configHash && s.scoring_format === scoringFormat,
        isSynced: syncedSet.has(s.league_id),
      }
    })
}
