import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from '../services/notificationService.js'
import { yesterdaySportsDay } from '../utils/sportsDay.js'

// Stat coverage verifier — runs at 4am PT daily and confirms every
// pick from the previous PT day has a corresponding stats row in the
// table the scoring job reads from. Gaps mean the scoring job
// silently missed the player and standings are stale.
//
// Sends a `headlines` notification to admins listing the gaps. This
// is monitoring infrastructure — surfaces issues before users have
// to screenshot them.

// Daily contest formats wired into this checker. Add new daily
// contests here as they come online.
const DAILY_CONTESTS = [
  {
    label: 'Strikeouts',
    picksTable: 'strikeouts_picks',
    statsTable: 'mlb_dfs_player_stats',
    // Strikeouts picks reference pitcher rows specifically.
    statsFilter: (q) => q.eq('is_pitcher', true),
    // Picks for two-way players (Ohtani) carry -P suffix. Stats row
    // is also -P. Match raw.
    idMatch: 'exact',
  },
  {
    label: 'HR Derby',
    picksTable: 'hr_derby_picks',
    statsTable: 'mlb_dfs_player_stats',
    // HR Derby picks are batters; ohtani's hitter row has no suffix.
    statsFilter: (q) => q.eq('is_pitcher', false),
    idMatch: 'exact',
  },
  {
    label: 'NBA 3-Point',
    picksTable: 'three_point_picks',
    statsTable: 'nba_dfs_player_stats',
    idMatch: 'exact',
  },
  {
    label: 'WNBA 3-Point',
    picksTable: 'wnba_three_point_picks',
    // WNBA has no DFS stats table — picks are scored from a different
    // path in wnbaThreePointService. Skip coverage check here.
    skip: true,
  },
]

async function checkContest(contest, date) {
  if (contest.skip) return null

  const { data: picks } = await supabase
    .from(contest.picksTable)
    .select('espn_player_id, player_name')
    .eq('game_date', date)
  if (!picks?.length) return { label: contest.label, picksCount: 0, gaps: [] }

  // Dedup by (espn_player_id) so a player picked by N users only
  // counts as one expected stats row.
  const expected = new Map()
  for (const p of picks) {
    if (!p.espn_player_id) continue
    if (!expected.has(p.espn_player_id)) {
      expected.set(p.espn_player_id, p.player_name)
    }
  }
  if (!expected.size) return { label: contest.label, picksCount: picks.length, gaps: [] }

  const espnIds = [...expected.keys()]
  let q = supabase
    .from(contest.statsTable)
    .select('espn_player_id')
    .eq('game_date', date)
    .in('espn_player_id', espnIds)
  if (contest.statsFilter) q = contest.statsFilter(q)
  const { data: stats } = await q
  const haveStats = new Set((stats || []).map((s) => s.espn_player_id))

  const gaps = []
  for (const [espnId, name] of expected.entries()) {
    if (!haveStats.has(espnId)) gaps.push({ espnId, name })
  }
  return { label: contest.label, picksCount: picks.length, gaps }
}

export async function verifyStatCoverage() {
  const date = yesterdaySportsDay()
  const reports = []
  for (const contest of DAILY_CONTESTS) {
    try {
      const r = await checkContest(contest, date)
      if (r && r.gaps.length > 0) reports.push(r)
    } catch (err) {
      logger.error({ err, contest: contest.label, date }, 'Stat coverage check failed for contest')
    }
  }

  if (!reports.length) {
    logger.info({ date }, 'Stat coverage verification — no gaps')
    return
  }

  // Build a single concise admin message
  const lines = reports.map((r) => {
    const names = r.gaps.map((g) => g.name).filter(Boolean).slice(0, 5).join(', ')
    const more = r.gaps.length > 5 ? ` (+${r.gaps.length - 5} more)` : ''
    return `${r.label}: ${r.gaps.length} missing — ${names}${more}`
  })
  const message = `Stat coverage gap on ${date}:\n${lines.join('\n')}`

  // Notify all admins
  const { data: admins } = await supabase
    .from('users')
    .select('id, username')
    .eq('is_admin', true)
  if (!admins?.length) {
    logger.warn({ date, reports }, 'Stat coverage gaps detected but no admins to notify')
    return
  }

  for (const a of admins) {
    try {
      await createNotification(a.id, 'headlines', message, {
        kind: 'stat_coverage_gap',
        date,
        reports,
      })
    } catch (err) {
      logger.error({ err, userId: a.id }, 'Failed to send stat coverage notification')
    }
  }
  logger.warn({ date, gapsByContest: reports.map((r) => ({ label: r.label, gaps: r.gaps.length })) }, 'Stat coverage gaps detected — admins notified')
}
