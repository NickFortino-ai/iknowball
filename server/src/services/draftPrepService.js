import { supabase } from '../config/supabase.js'
import { effectiveAdp } from '../utils/effectiveAdp.js'
import { buildRosterConfigHash } from '../utils/rosterConfigHash.js'
import { fetchAll } from '../utils/fetchAll.js'

const RANKINGS_SEED_SIZE = 400

const PLAYER_SELECT = 'player_id, rank, nfl_players(id, full_name, position, team, headshot_url, injury_status, bye_week, projected_pts_half_ppr, projected_pts_ppr, projected_pts_std, search_rank)'

// ── Helpers ──────────────────────────────────────────────────────────

async function fetchPlayerPool() {
  // Parallel queries — DEFs and Ks each need their own pull since both
  // typically have very high (null or large) ADP/search_rank values and
  // would otherwise be sliced out of the seed alongside late-round skill
  // players.
  const [offensiveResult, kickerResult, defResult] = await Promise.all([
    supabase
      .from('nfl_players')
      .select('id, position, search_rank, adp_ppr, adp_half_ppr')
      .in('position', ['QB', 'RB', 'WR', 'TE'])
      .not('team', 'is', null)
      .order('search_rank', { ascending: true, nullsFirst: false })
      .limit(800),
    supabase
      .from('nfl_players')
      .select('id, position, search_rank, adp_ppr, adp_half_ppr')
      .eq('position', 'K')
      .not('team', 'is', null),
    supabase
      .from('nfl_players')
      .select('id, position, search_rank, adp_ppr, adp_half_ppr')
      .eq('position', 'DEF')
      .not('team', 'is', null),
  ])
  return [...(offensiveResult.data || []), ...(kickerResult.data || []), ...(defResult.data || [])]
}

// When a user syncs a league whose roster config differs from any they've
// customized before, we don't want to hand them a fresh ADP order — they
// lose all the manual work they've done. Instead, copy their most-recently-
// customized board with the same scoring format as the ordering skeleton,
// then append any target-config players missing from that list by ADP so
// new positions (extra DEF, extra flex) still appear at reasonable spots.
// Returns true if a copy was written, false if there was nothing to copy.
async function copyRankingsFromAnotherConfig(userId, targetConfigHash, targetScoringFormat, targetRosterSlots) {
  const { data: candidates } = await supabase
    .from('draft_prep_rankings')
    .select('roster_config_hash, created_at')
    .eq('user_id', userId)
    .eq('scoring_format', targetScoringFormat)
    .eq('is_customized', true)
    .neq('roster_config_hash', targetConfigHash)
    .order('created_at', { ascending: false })
    .limit(1)

  const sourceHash = candidates?.[0]?.roster_config_hash
  if (!sourceHash) return false

  const sourceRows = await fetchAll(
    supabase
      .from('draft_prep_rankings')
      .select('player_id, rank')
      .eq('user_id', userId)
      .eq('roster_config_hash', sourceHash)
      .eq('scoring_format', targetScoringFormat)
      .order('rank', { ascending: true })
  )
  if (!sourceRows.length) return false

  const orderedIds = sourceRows.map((r) => r.player_id)
  const seenIds = new Set(orderedIds)

  const isSuperflex = (targetRosterSlots?.superflex || targetRosterSlots?.sflex || 0) > 0 || (targetRosterSlots?.qb || 0) >= 2
  const pool = await fetchPlayerPool()
  const ranked = pool
    .map((p) => ({ ...p, _adp: effectiveAdp(p, targetScoringFormat, isSuperflex) }))
    .sort((a, b) => a._adp - b._adp)
  for (const p of ranked) {
    if (!seenIds.has(p.id)) {
      orderedIds.push(p.id)
      seenIds.add(p.id)
    }
  }

  const capped = orderedIds.slice(0, RANKINGS_SEED_SIZE)
  const rows = capped.map((pid, i) => ({
    user_id: userId,
    roster_config_hash: targetConfigHash,
    scoring_format: targetScoringFormat,
    player_id: pid,
    rank: i,
    is_customized: true,
  }))
  const { error } = await supabase.from('draft_prep_rankings').insert(rows)
  if (error) throw error
  return true
}

async function seedDraftPrepRankings(userId, configHash, scoringFormat, rosterSlots) {
  const isSuperflex = (rosterSlots?.superflex || rosterSlots?.sflex || 0) > 0 || (rosterSlots?.qb || 0) >= 2
  const pool = await fetchPlayerPool()
  if (!pool.length) return

  // Split by position so defenses AND kickers are both guaranteed to make
  // the seed even when their Sleeper ADP/search_rank is null (falls back
  // to 9999). Without this split, K/DEF sort past the seed cutoff and
  // never appear in user rankings — which is why kickers were missing
  // from draft boards entirely.
  const ranked = pool
    .map((p) => ({ ...p, _adp: effectiveAdp(p, scoringFormat, isSuperflex) }))
    .sort((a, b) => a._adp - b._adp)

  const defs = ranked.filter((p) => p.position === 'DEF')
  const kickers = ranked.filter((p) => p.position === 'K')
  const offense = ranked.filter((p) => p.position !== 'DEF' && p.position !== 'K')

  // Reserve slots for all defenses + kickers (typically ~32 each), fill
  // the rest with the top offensive players by ADP.
  const reserved = defs.length + kickers.length
  const offenseSeed = offense.slice(0, Math.max(0, RANKINGS_SEED_SIZE - reserved))
  const seed = [...offenseSeed, ...kickers, ...defs]

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
// MUST use fetchAll: a single board can exceed 1000 rows on its own now
// that getDraftPrepRankings appends the full draftable pool, so the plain
// select silently truncated at Supabase's 1000-row cap and whole boards
// vanished from the picker (a 1374-row board disappeared entirely).
export async function getSavedRankingConfigs(userId) {
  const data = await fetchAll(
    supabase
      .from('draft_prep_rankings')
      .select('roster_config_hash, scoring_format, created_at')
      .eq('user_id', userId)
      .eq('is_customized', true)
      // Explicit order on the PK — fetchAll pages with .range(), and an
      // unordered paginated scan lets Postgres return rows in a different
      // order per page, which silently skips and double-counts rows.
      .order('id', { ascending: true })
  )

  if (!data?.length) return []

  // Fetch user-supplied names for each (config, scoring) pair.
  const { data: names } = await supabase
    .from('draft_prep_ranking_names')
    .select('roster_config_hash, scoring_format, name')
    .eq('user_id', userId)
  const nameMap = {}
  for (const n of names || []) {
    nameMap[`${n.roster_config_hash}|${n.scoring_format}`] = n.name
  }

  const map = {}
  for (const row of data) {
    const key = `${row.roster_config_hash}|${row.scoring_format}`
    if (!map[key]) {
      map[key] = {
        config_hash: row.roster_config_hash,
        scoring_format: row.scoring_format,
        name: nameMap[key] || null,
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

// Delete every saved-ranking artifact for a (user, config, scoring)
// triple — the per-player ranking rows AND the user-supplied name row.
// Used by the ⋯ menu's Delete action; irreversible from the user's
// side (there's no undo since the customized ordering is gone).
export async function deleteSavedRanking(userId, configHash, scoringFormat) {
  const { error: rankingsErr } = await supabase
    .from('draft_prep_rankings')
    .delete()
    .eq('user_id', userId)
    .eq('roster_config_hash', configHash)
    .eq('scoring_format', scoringFormat)
  if (rankingsErr) throw rankingsErr
  const { error: nameErr } = await supabase
    .from('draft_prep_ranking_names')
    .delete()
    .eq('user_id', userId)
    .eq('roster_config_hash', configHash)
    .eq('scoring_format', scoringFormat)
  if (nameErr) throw nameErr
  return { deleted: true }
}

// Upsert / delete a user-supplied name for a saved ranking config.
// Empty name → delete the row (reverts display to auto-generated roster
// label). Trims + caps at 50 chars per the DB check constraint.
export async function setSavedRankingName(userId, configHash, scoringFormat, name) {
  const trimmed = (name || '').trim().slice(0, 50)
  if (!trimmed) {
    const { error } = await supabase
      .from('draft_prep_ranking_names')
      .delete()
      .eq('user_id', userId)
      .eq('roster_config_hash', configHash)
      .eq('scoring_format', scoringFormat)
    if (error) throw error
    return { name: null }
  }
  const { error } = await supabase
    .from('draft_prep_ranking_names')
    .upsert({
      user_id: userId,
      roster_config_hash: configHash,
      scoring_format: scoringFormat,
      name: trimmed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,roster_config_hash,scoring_format' })
  if (error) throw error
  return { name: trimmed }
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

  // MUST paginate: boards exceed 1000 rows now that this function appends
  // the full draftable pool and saves write it back. A plain select silently
  // dropped everything past rank 999, and the tail-append below then re-added
  // those players at the BOTTOM in ADP order — so their custom rank was lost
  // on read, and overwritten for good on the next save. Measured on a live
  // 1097-row board: 92 players served out of position.
  // `rank` is unique within a board, so it's a stable key to page on.
  const ranked = await fetchAll(
    supabase
      .from('draft_prep_rankings')
      .select(PLAYER_SELECT)
      .eq('user_id', userId)
      .eq('roster_config_hash', configHash)
      .eq('scoring_format', scoringFormat)
      .order('rank', { ascending: true })
  )

  // Append the rest of the draftable pool (any on-team player not already
  // in the user's saved rankings) so consumers like the in-person draft
  // board see every draftable name — not just the ~200-400 that were in
  // the seed at the time the config was first created. Ordered by ADP
  // and slotted below the user's customized rankings so their order is
  // preserved. Zero backfill needed; front-loads on read.
  const rankedIds = new Set(ranked.map((r) => r.player_id))
  const isSuperflex = (rosterSlots?.superflex || rosterSlots?.sflex || 0) > 0 || (rosterSlots?.qb || 0) >= 2
  const tail = await fetchDraftablePlayersNotIn(rankedIds, scoringFormat, isSuperflex)
  const tailRows = tail.map((p, i) => ({
    player_id: p.id,
    rank: ranked.length + i,
    nfl_players: p,
  }))
  return [...ranked, ...tailRows]
}

// Returns on-team NFL players not already in the excludeIds set, sorted
// by scoring-aware effective ADP. Used to backfill the tail of a user's
// saved ranking so every draftable name is visible.
async function fetchDraftablePlayersNotIn(excludeIds, scoringFormat, isSuperflex) {
  const SELECT = 'id, full_name, position, team, headshot_url, injury_status, bye_week, projected_pts_half_ppr, projected_pts_ppr, projected_pts_std, search_rank, adp_ppr, adp_half_ppr'
  const [offense, kickers, defs] = await Promise.all([
    fetchAll(
      supabase
        .from('nfl_players')
        .select(SELECT)
        .in('position', ['QB', 'RB', 'WR', 'TE'])
        .not('team', 'is', null)
        .order('search_rank', { ascending: true, nullsFirst: false })
    ),
    supabase
      .from('nfl_players')
      .select(SELECT)
      .eq('position', 'K')
      .not('team', 'is', null),
    supabase
      .from('nfl_players')
      .select(SELECT)
      .eq('position', 'DEF')
      .not('team', 'is', null),
  ])
  const pool = [
    ...(offense || []),
    ...(kickers.data || []),
    ...(defs.data || []),
  ].filter((p) => !excludeIds.has(p.id))
  return pool
    .map((p) => ({ ...p, _adp: effectiveAdp(p, scoringFormat, isSuperflex) }))
    .sort((a, b) => a._adp - b._adp)
    // Strip the transient _adp field before returning — the client
    // consumes nfl_players.* fields directly and doesn't need it.
    .map(({ _adp, ...rest }) => rest)
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
    // Paginated — this snapshot is the ONLY copy synced leagues keep once
    // the board is wiped below, so a truncated read means those leagues
    // silently lose every player past rank 999.
    const prepRankings = await fetchAll(
      supabase
        .from('draft_prep_rankings')
        .select('player_id, rank')
        .eq('user_id', userId)
        .eq('roster_config_hash', configHash)
        .eq('scoring_format', scoringFormat)
        .order('rank', { ascending: true })
    )

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
      // Try to carry over the user's most-recent customized ranking from
      // another roster config with the same scoring format first — that
      // preserves the manual work they've done on their prep board even
      // when the league's roster shape differs. Falls back to a pure ADP
      // seed only when no prior customization exists.
      const copied = await copyRankingsFromAnotherConfig(userId, configHash, scoringFormat, settings.roster_slots)
      if (!copied) {
        await seedDraftPrepRankings(userId, configHash, scoringFormat, settings.roster_slots)
      }
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

  // Fork: copy draft prep rankings into league-specific rankings.
  // Paginated — the fork is what the league keeps after disconnecting, so a
  // truncated read hands it a board missing everything past rank 999.
  const prepRankings = await fetchAll(
    supabase
      .from('draft_prep_rankings')
      .select('player_id, rank')
      .eq('user_id', userId)
      .eq('roster_config_hash', syncRecord.roster_config_hash)
      .eq('scoring_format', syncRecord.scoring_format)
      .order('rank', { ascending: true })
  )

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

/**
 * Copy one prep board's ORDER into another roster config for the same
 * user, replacing whatever was there.
 *
 * "Sync to All Leagues" is supposed to push the rankings you're looking at
 * to every traditional league. It didn't: syncLeague derives the board
 * from the LEAGUE's roster_slots, so a 1-FLEX "Master Rankings" board
 * could never reach a 2-FLEX league — that league kept its own
 * auto-seeded board and the panel still said "Synced", with only a small
 * amber "Different roster" hinting otherwise.
 *
 * Players in the source that the target config can't roster are copied
 * anyway; they simply never come up as legal picks. That's preferable to
 * dropping them and silently reordering everything below.
 *
 * No-op when source and target are the same board.
 */
async function copyRankingsIntoConfig(userId, srcHash, srcFormat, targetHash, targetFormat) {
  if (srcHash === targetHash && srcFormat === targetFormat) return { copied: 0, skipped: 'same-config' }

  const source = await fetchAll(
    supabase
      .from('draft_prep_rankings')
      .select('player_id, rank')
      .eq('user_id', userId)
      .eq('roster_config_hash', srcHash)
      .eq('scoring_format', srcFormat)
      .order('rank', { ascending: true }),
  )
  if (!source.length) return { copied: 0, skipped: 'empty-source' }

  await supabase
    .from('draft_prep_rankings')
    .delete()
    .eq('user_id', userId)
    .eq('roster_config_hash', targetHash)
    .eq('scoring_format', targetFormat)

  // Re-rank 0..N-1 so the target board is dense even if the source had
  // gaps from earlier edits.
  const rows = source.map((r, i) => ({
    user_id: userId,
    roster_config_hash: targetHash,
    scoring_format: targetFormat,
    player_id: r.player_id,
    rank: i,
    is_customized: true,
  }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('draft_prep_rankings').insert(rows.slice(i, i + 500))
    if (error) throw error
  }
  return { copied: rows.length }
}

export async function syncAllLeagues(userId, mode, configHash, scoringFormat) {
  // Reuse the matching-leagues logic — it already filters out salary cap,
  // completed drafts, and non-fantasy formats.
  const candidates = await getMatchingLeagues(userId, configHash || '', scoringFormat || 'half_ppr')
  if (!candidates.length) return { synced: [] }

  const synced = []
  for (const c of candidates) {
    if (mode === 'matching' && !c.isMatching) continue
    try {
      // "All" means all: push the board being viewed into each league's own
      // config, including leagues already synced — those are precisely the
      // ones holding a stale auto-seeded board. "Matching" only touches
      // leagues whose config already equals the source, so there is nothing
      // to copy there.
      if (mode !== 'matching' && configHash) {
        await copyRankingsIntoConfig(
          userId,
          configHash,
          scoringFormat || 'half_ppr',
          c.configHash,
          c.scoringFormat,
        )
      }
      if (!c.isSynced) await syncLeague(userId, c.leagueId)
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
  // No .limit(): the team-filter already prunes to ~1000 offensive players.
  // Deep leagues (20-team superflex + deep rosters) can exhaust an arbitrary
  // 300-cap; ~1000 covers even the wildest configs. fetchAll paginates past
  // Supabase's silent 1000-row default cap so the offensive pool is future-
  // proof if it grows past 1000.
  if (position && position !== 'All') {
    const data = await fetchAll(
      supabase
        .from('nfl_players')
        .select(SELECT)
        .eq('position', position)
        .not('team', 'is', null)
        .order('search_rank', { ascending: true, nullsFirst: false })
    )

    // Apply effective-ADP sort (scoring-aware) on the returned rows
    return data
      .map((p) => ({ ...p, _adp: effectiveAdp(p, scoringFormat, false) }))
      .sort((a, b) => a._adp - b._adp)
  }

  const [offensiveRows, defResult] = await Promise.all([
    fetchAll(
      supabase
        .from('nfl_players')
        .select(SELECT)
        .in('position', ['QB', 'RB', 'WR', 'TE', 'K'])
        .not('team', 'is', null)
        .order('search_rank', { ascending: true, nullsFirst: false })
    ),
    supabase
      .from('nfl_players')
      .select(SELECT)
      .eq('position', 'DEF')
      .not('team', 'is', null),
  ])
  if (defResult.error) throw defResult.error

  const offensiveSorted = offensiveRows
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
