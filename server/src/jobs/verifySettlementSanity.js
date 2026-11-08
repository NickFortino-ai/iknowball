import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { fetchAll } from '../utils/fetchAll.js'

/**
 * Catch a settlement pipeline that has started writing garbage.
 *
 * Exists because of 2026-11-07. A corrupted helper in the football box-score
 * parser made every athlete come back with a row of all zeros, so every NCAAF
 * prop settled against nothing for two days — 985 of 1,000 at exactly 0. Sam
 * Leavitt threw for 380 and settled at 0, which took twelve of one user's
 * picks down with it. Nick found it. Nothing in the system noticed.
 *
 * The important part is WHY it went unnoticed: the dry run that "verified" the
 * change imported the same broken function, so the check and the code agreed
 * with each other while both disagreed with reality. A guard that depends on
 * someone remembering to look is worth very little; this one runs whether or
 * not anyone is paying attention.
 *
 * It deliberately does NOT re-derive anything from ESPN. Re-deriving needs a
 * per-sport fetcher and an API call per game, which is the sort of thing that
 * rots. A settled prop that is zero is a fact we already hold, and the signal
 * turned out to be deafening.
 */

// Markets where a zero is ordinary and tells us nothing. Measured over 18,481
// props settled 2026-10-01..11-05: batter_home_runs 90%, anytime_td 84/73%,
// batter_rbis 76%, pass_interceptions 50%, batter_hits 44%, blocks 43%,
// steals 28%, pass_tds 23%, threes 21%. Alarming on these would be noise.
const EVENT_MARKETS = new Set([
  'batter_home_runs', 'batter_rbis', 'batter_hits', 'batter_stolen_bases',
  'player_anytime_td', 'player_1st_td', 'player_last_td',
  'player_pass_tds', 'player_pass_interceptions',
  'player_blocks', 'player_steals', 'player_threes',
])

// Over that same baseline the WORST volume market was 12%
// (nfl|player_receptions) and most sit at 0-6%. A parser failure produces
// 100%. 40% is far above anything real and far below the failure, which is
// the whole point of picking it from measurement rather than taste.
const ZERO_RATE_ALERT = 0.4

// Small slates are noisy — four props on a Tuesday can be 50% zero by
// coincidence. Ten is enough for the rate to mean something.
const MIN_SAMPLE = 10

const LOOKBACK_HOURS = 6

// An alarm that repeats hourly for the same fault trains you to ignore it.
// Module-level, so a deploy clears it — that is fine, a redeploy is exactly
// when you want to hear about it again.
const ALERT_COOLDOWN_MS = 12 * 60 * 60 * 1000
const lastAlerted = new Map()

export async function verifySettlementSanity() {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600 * 1000).toISOString()

  const { data: sports } = await supabase.from('sports').select('id, key')
  const sportKey = Object.fromEntries((sports || []).map((s) => [s.id, s.key]))

  // fetchAll, not a bare select: a busy Saturday settles well past the
  // 1,000-row cap, and a truncated sample would quietly measure a slice.
  const rows = await fetchAll(
    supabase
      .from('player_props')
      .select('id, sport_id, market_key, actual_value, player_name, updated_at')
      .eq('status', 'settled')
      .gte('updated_at', since)
      .order('id'),
  )

  if (!rows?.length) {
    logger.info({ since }, 'Settlement sanity: nothing settled in the window')
    return { checked: 0, alerts: 0 }
  }

  const groups = {}
  for (const r of rows) {
    // actual_value null is a DNP void, not a zero. Counting voids as zeros
    // would make a night of injuries look like a parser failure.
    if (r.actual_value == null) continue
    if (EVENT_MARKETS.has(r.market_key)) continue
    const key = `${sportKey[r.sport_id] || r.sport_id}|${r.market_key}`
    const g = (groups[key] ||= { n: 0, zero: 0, examples: [] })
    g.n++
    if (Number(r.actual_value) === 0) {
      g.zero++
      if (g.examples.length < 5) g.examples.push(r.player_name)
    }
  }

  const alerts = []
  for (const [key, g] of Object.entries(groups)) {
    if (g.n < MIN_SAMPLE) continue
    const rate = g.zero / g.n
    if (rate < ZERO_RATE_ALERT) continue
    const last = lastAlerted.get(key) || 0
    if (Date.now() - last < ALERT_COOLDOWN_MS) continue
    lastAlerted.set(key, Date.now())
    alerts.push({ key, rate, ...g })
  }

  if (!alerts.length) {
    logger.info({ groups: Object.keys(groups).length, rows: rows.length }, 'Settlement sanity: clean')
    return { checked: rows.length, alerts: 0 }
  }

  const body = alerts.map((a) =>
    `${a.key}\n`
    + `  ${a.zero} of ${a.n} settled at exactly 0 (${Math.round(a.rate * 100)}%)\n`
    + `  e.g. ${a.examples.join(', ')}`,
  ).join('\n\n')

  logger.error({ alerts: alerts.map((a) => ({ key: a.key, zero: a.zero, n: a.n })) },
    'ABORT-WORTHY: settlement zero-rate anomaly')

  try {
    const { sendAdminEmail } = await import('../services/emailService.js')
    await sendAdminEmail(
      `IKB: settlement looks wrong (${alerts.length} market${alerts.length === 1 ? '' : 's'})`,
      `A suspicious share of props just settled at exactly 0.\n\n${body}\n\n`
      + `Volume markets historically settle at 0 between 0% and 12% of the time, so anything\n`
      + `over 40% means the stat source is probably not being read.\n\n`
      + `This is what a broken box-score parser looks like — see the 2026-11-07 incident,\n`
      + `where a corrupted helper returned all-zero rows and NCAAF settled against nothing\n`
      + `for two days.\n\n`
      + `Check a settled prop against the real box score BEFORE re-settling anything.\n`
      + `Do not verify by running our own parser: that is how the original bug survived.\n\n`
      + `Window: last ${LOOKBACK_HOURS}h. Props examined: ${rows.length}.`,
    )
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to send settlement sanity alert')
  }

  return { checked: rows.length, alerts: alerts.length }
}
