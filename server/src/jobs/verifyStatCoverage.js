import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { sendAdminEmail } from '../services/emailService.js'
import { yesterdaySportsDay, todaySportsDay } from '../utils/sportsDay.js'
import { fetchCompletedGameStats as fetchMlbGameStats } from './scoreMLBDFS.js'
import { fetchCompletedGameStats as fetchNbaGameStats } from './scoreNBADFS.js'

// Stat coverage verifier with value validation + auto-heal.
//
// Runs hourly during game windows. For each daily contest:
//   1. Re-fetch fresh box scores from ESPN for the date.
//   2. For every pick, look up the player's authoritative stat value
//      upstream and compare to the value our pick row carries.
//   3. If upstream is missing entirely (game wasn't scraped) — log as
//      unfixable and surface in the admin email.
//   4. If upstream differs from ours (we're stale) — auto-update
//      mlb_dfs_player_stats / nba_dfs_player_stats and the pick row.
//   5. Write a row to stat_coverage_log for trend analysis.
//   6. If any unfixable items remain, email all admins so they can
//      manually investigate before users notice.
//
// Picks where (espn_player_id, statKey) is missing from BOTH our DB
// and upstream are surfaced — these are the cases where ESPN itself
// dropped the player and we need eyes on it.

const CONTESTS = [
  {
    label: 'Strikeouts',
    picksTable: 'strikeouts_picks',
    pickStatColumn: 'strikeouts',
    statsTable: 'mlb_dfs_player_stats',
    upstreamStatKey: 'strikeouts',
    requiresPitcher: true,
    fetchUpstream: fetchMlbGameStats,
  },
  {
    label: 'HR Derby',
    picksTable: 'hr_derby_picks',
    pickStatColumn: 'home_runs',
    statsTable: 'mlb_dfs_player_stats',
    upstreamStatKey: 'home_runs',
    requiresPitcher: false,
    fetchUpstream: fetchMlbGameStats,
  },
  {
    label: 'NBA 3-Point',
    picksTable: 'three_point_picks',
    pickStatColumn: 'made_threes',
    statsTable: 'nba_dfs_player_stats',
    upstreamStatKey: 'three_pointers_made',
    requiresPitcher: false,
    fetchUpstream: fetchNbaGameStats,
  },
]

async function verifyAndHealContest(contest, date) {
  const { data: picks } = await supabase
    .from(contest.picksTable)
    .select(`id, espn_player_id, player_name, ${contest.pickStatColumn}`)
    .eq('game_date', date)
  if (!picks?.length) return { picksCount: 0, healed: [], unfixable: [] }

  // Re-fetch upstream box scores for the date. Both MLB and NBA
  // helpers go straight to ESPN, so this is the current source of
  // truth. Skip the call entirely if we have no picks to verify.
  let upstream = []
  try {
    const result = await contest.fetchUpstream(date)
    upstream = result.playerStats || []
  } catch (err) {
    logger.error({ err: err.message, contest: contest.label, date }, 'Upstream fetch failed during verify')
    return { picksCount: picks.length, healed: [], unfixable: [], error: err.message }
  }

  // Build espn_player_id → upstream stat value lookup. Honors the
  // pitcher/batter distinction for MLB (Strikeouts wants pitcher rows,
  // HR Derby wants batter rows).
  const upstreamByEspnId = {}
  for (const row of upstream) {
    if (contest.requiresPitcher && !row.stats?.is_pitcher) continue
    if (contest.requiresPitcher === false && row.stats?.is_pitcher === true) continue
    const v = row.stats?.[contest.upstreamStatKey]
    if (v == null) continue
    upstreamByEspnId[row.espnPlayerId] = Number(v) || 0
  }

  const healed = []
  const unfixable = []
  // Dedup picks by espn_player_id so we don't fix the same player N
  // times — the stats table is keyed once per player per date.
  const seenStatsFix = new Set()

  for (const pick of picks) {
    if (!pick.espn_player_id) continue
    const upstreamVal = upstreamByEspnId[pick.espn_player_id]
    const ourVal = Number(pick[contest.pickStatColumn]) || 0

    if (upstreamVal == null) {
      unfixable.push({
        player: pick.player_name,
        espn_player_id: pick.espn_player_id,
        reason: 'no upstream stats row',
      })
      continue
    }

    if (ourVal === upstreamVal) continue // already correct

    // Mismatch: upstream is authoritative. Update both the stats row
    // (so future scoring runs pull the right value) and this pick.
    if (!seenStatsFix.has(pick.espn_player_id)) {
      try {
        const { error: statsErr } = await supabase
          .from(contest.statsTable)
          .update({ [contest.upstreamStatKey]: upstreamVal, updated_at: new Date().toISOString() })
          .eq('espn_player_id', pick.espn_player_id)
          .eq('game_date', date)
        if (statsErr) {
          logger.warn({ err: statsErr, contest: contest.label, espnId: pick.espn_player_id }, 'Stats row update failed during heal')
        }
        seenStatsFix.add(pick.espn_player_id)
      } catch (err) {
        logger.warn({ err: err.message }, 'Stats update threw during heal')
      }
    }

    const { error: pickErr } = await supabase
      .from(contest.picksTable)
      .update({ [contest.pickStatColumn]: upstreamVal })
      .eq('id', pick.id)
    if (pickErr) {
      unfixable.push({
        player: pick.player_name,
        espn_player_id: pick.espn_player_id,
        reason: `pick update failed: ${pickErr.message}`,
      })
      continue
    }
    healed.push({
      player: pick.player_name,
      espn_player_id: pick.espn_player_id,
      from: ourVal,
      to: upstreamVal,
    })
  }

  return { picksCount: picks.length, healed, unfixable }
}

export async function verifyStatCoverage() {
  // Check yesterday (full slate done) and today (catches issues during
  // active games before they linger). Both pass through the same
  // verify-and-heal pipeline.
  const dates = [yesterdaySportsDay(), todaySportsDay()]

  const summary = []
  for (const date of dates) {
    for (const contest of CONTESTS) {
      let result
      try {
        result = await verifyAndHealContest(contest, date)
      } catch (err) {
        logger.error({ err: err.message, contest: contest.label, date }, 'Verify/heal threw')
        continue
      }
      if (result.picksCount === 0) continue

      // Log every check, even clean ones — lets us see trends.
      await supabase.from('stat_coverage_log').insert({
        check_date: date,
        contest: contest.label,
        picks_count: result.picksCount,
        healed_count: result.healed.length,
        unfixable_count: result.unfixable.length,
        details: { healed: result.healed, unfixable: result.unfixable, error: result.error || null },
      })

      if (result.healed.length || result.unfixable.length) {
        summary.push({ date, contest: contest.label, ...result })
      }
    }
  }

  if (!summary.length) {
    logger.info('Stat coverage verification — no issues')
    return
  }

  // Send email digest. Only includes contests with non-zero healed or
  // unfixable counts. Clean checks are silent.
  const lines = []
  for (const s of summary) {
    lines.push(`[${s.date}] ${s.contest} — picks: ${s.picksCount}`)
    if (s.healed.length) {
      lines.push(`  AUTO-HEALED ${s.healed.length}:`)
      for (const h of s.healed) lines.push(`    ${h.player}: ${h.from} → ${h.to}`)
    }
    if (s.unfixable.length) {
      lines.push(`  UNFIXABLE ${s.unfixable.length}:`)
      for (const u of s.unfixable) lines.push(`    ${u.player} (${u.espn_player_id}) — ${u.reason}`)
    }
    lines.push('')
  }

  const hasUnfixable = summary.some((s) => s.unfixable.length > 0)
  const subject = hasUnfixable
    ? `Stat coverage gap — ${summary.reduce((sum, s) => sum + s.unfixable.length, 0)} unfixable`
    : `Stat coverage auto-healed (${summary.reduce((sum, s) => sum + s.healed.length, 0)} fixed)`

  try {
    await sendAdminEmail(subject, lines.join('\n'))
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to send stat coverage admin email')
  }

  logger.warn({
    summary: summary.map((s) => ({
      date: s.date,
      contest: s.contest,
      healed: s.healed.length,
      unfixable: s.unfixable.length,
    })),
  }, 'Stat coverage verifier — issues detected')
}
