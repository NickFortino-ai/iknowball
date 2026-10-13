/**
 * Pricing for custom prop lines.
 *
 * A slider prop lets the player move the threshold ±33% off the book's line.
 * The range is the SAME for every market; the payout is not, because the same
 * proportional move means very different things depending on the stat.
 *
 * Measured from 6,981 settled football props where we hold both the line and
 * what the player actually did. At +33%, pass yards clears 16% of the time
 * and reception yards clears 36% — so paying those identically would hand
 * someone a standing arbitrage on whichever was generous.
 *
 * NFL and NCAAF calibrate almost identically (pass yards 86/53/16 against
 * 83/49/16; reception yards 65/50/36 against 65/48/34), so they share one
 * table and NCAAF's thinner sample leans on NFL's depth.
 *
 * Nothing here is invented. If the numbers drift as more props settle, they
 * should be re-measured rather than adjusted by feel — the whole point is
 * that the payout is the honest break-even price for the real hit rate.
 */

export const SLIDER_RANGE = 0.33

// Probability the player EXCEEDS the line, measured at five multipliers of
// the book's number.
//
// Deliberately measured OUT TO 0.5x and 1.5x even though the slider only
// travels ±33%. Rounding a stop outward to the nearest legal .5 can land
// past the band — on a 4.5 receptions line the bottom rounds to 2.5, which
// is 0.56x — and a stop priced off a clamped anchor would be a line we never
// calibrated sold at a calibrated price. That error is not symmetric: at the
// EASY end the true rate is higher than a clamped anchor, so clamping would
// OVERPAY, which is the direction someone farms. Measuring wider removes the
// question instead of guarding against it.
//
// Markets absent from this table have no slider. anytime_td, pass_tds and
// pass_interceptions all measured FLAT (14/14/14, 51/51/51, 52/52/52)
// because their line never moves off 0.5 or 1.5 — they are binary questions
// wearing a threshold's clothing, and there is nothing to slide.
const MULTIPLIERS = [0.5, 0.67, 1.0, 1.33, 1.5]

// NBA markets whose lines carry a points component, and so run in the 15-40
// range where a half-point step is false precision. See stepFor.
// rebounds_assists is absent on purpose: its lines sit around 5-12, where a
// whole-number step would leave too few stops to slide.
const POINTS_SCALE_MARKETS = new Set([
  'player_points',
  'player_points_rebounds_assists',
  'player_points_rebounds',
  'player_points_assists',
])

// Markets absent from this table have no slider. anytime_td, pass_tds and
// pass_interceptions all measured FLAT (14/14/14, 51/51/51, 52/52/52)
// because their line never moves off 0.5 or 1.5 — they are binary questions
// wearing a threshold's clothing, and there is nothing to slide.
//
// RATES ARE BANDED BY LINE SIZE, because the size of the line changes the
// shape of the distribution and a single curve mispriced the ends badly.
// A 2.5-reception line clears +33% by catching one more ball; a 7.5-line
// needs two and a half more. Measured at 1.33x:
//
//   receptions      <=2.5  38%   <=3.5  29%    >3.5  28%
//   rush yards     <=27.5  36%  <=55.5  28%   >55.5  26%
//   reception yds  <=22.5  39%  <=40.5  39%   >40.5  29%
//
// One curve charged every receptions prop as if it were 34%. A low-line
// receiver maxed out therefore paid 20 on a 38% shot, which is a standing
// edge for anyone who noticed — and under-rewarded the same bet on a
// high-line player, who was being asked for a genuinely harder thing.
//
// Bands are terciles of the observed line distribution, so each carries a
// comparable sample (240-540 rows). Three markets are NOT banded —
// pass attempts, completions and rush attempts have 130-250 settled props
// in total, and splitting those three ways would be fitting noise.
const HIT_RATES = {
  player_pass_yds: [
    { maxLine: 212.5, rates: [0.92, 0.83, 0.54, 0.19, 0.10] }, // n=396
    { maxLine: 236.5, rates: [0.92, 0.81, 0.47, 0.15, 0.07] }, // n=394
    { maxLine: Infinity, rates: [0.98, 0.89, 0.49, 0.15, 0.09] }, // n=386
  ],
  player_rush_yds: [
    { maxLine: 27.5, rates: [0.61, 0.53, 0.42, 0.36, 0.32] }, // n=397
    { maxLine: 55.5, rates: [0.79, 0.65, 0.44, 0.28, 0.20] }, // n=383
    { maxLine: Infinity, rates: [0.83, 0.73, 0.46, 0.26, 0.16] }, // n=381
  ],
  player_receptions: [
    { maxLine: 2.5, rates: [0.74, 0.61, 0.48, 0.38, 0.26] }, // n=545
    { maxLine: 3.5, rates: [0.86, 0.67, 0.44, 0.29, 0.19] }, // n=248
    { maxLine: Infinity, rates: [0.82, 0.67, 0.51, 0.28, 0.17] }, // n=242
  ],
  player_reception_yds: [
    { maxLine: 22.5, rates: [0.65, 0.59, 0.48, 0.39, 0.34] }, // n=537
    { maxLine: 40.5, rates: [0.80, 0.71, 0.54, 0.39, 0.32] }, // n=502
    { maxLine: Infinity, rates: [0.73, 0.65, 0.46, 0.29, 0.23] }, // n=498
  ],
  // Single curve: too few settled props to band without inventing precision.
  player_pass_attempts: [
    { maxLine: Infinity, rates: [0.96, 0.91, 0.48, 0.13, 0.08] },
  ],
  player_pass_completions: [
    { maxLine: Infinity, rates: [0.97, 0.92, 0.52, 0.14, 0.05] },
  ],
  player_rush_attempts: [
    { maxLine: Infinity, rates: [0.89, 0.77, 0.48, 0.20, 0.10] },
  ],

  // ── NBA ──────────────────────────────────────────────────────────────
  //
  // Measured differently from the NFL markets above, and the difference
  // matters when reading these numbers.
  //
  // The NFL rates come from SETTLED PROPS — real quoted lines with real
  // outcomes. NBA had only 202 of those, 146 of them points, which is not
  // enough to cut into three bands without fitting noise. These instead come
  // from 4,123 player-games in nba_dfs_player_stats, with each player's own
  // season average standing in for the book's line. Roughly 1,350 rows per
  // band — more than the NFL markets carry.
  //
  // Why the proxy is defensible: every band lands at 0.42-0.46 on the 1.0
  // anchor, which is the coin flip a book line is supposed to produce. The
  // 146 real settled points props went over 49%, and the gap to 44% is well
  // inside the noise on that sample (±8% at 95%). Using each player's median
  // instead moved the centre further from 0.50, not closer, so the mean is
  // the better stand-in.
  //
  // Games where the player did not appear are excluded: settlement pushes
  // those and returns the stake, so a DNP is not an under and must not be
  // counted as one.
  //
  // REPLACE THESE with settled-prop measurements once a few weeks of the
  // 2026-27 season have accumulated, the way the NFL table was built.
  player_points: [
    { maxLine: 6.6, rates: [0.63, 0.53, 0.41, 0.29, 0.23] }, // n=1356
    { maxLine: 13.1, rates: [0.79, 0.68, 0.45, 0.26, 0.19] }, // n=1404
    { maxLine: Infinity, rates: [0.91, 0.83, 0.47, 0.18, 0.10] }, // n=1363
  ],
  player_rebounds: [
    { maxLine: 2.8, rates: [0.63, 0.58, 0.41, 0.30, 0.25] }, // n=1341
    { maxLine: 4.7, rates: [0.79, 0.65, 0.44, 0.27, 0.19] }, // n=1345
    { maxLine: Infinity, rates: [0.88, 0.76, 0.48, 0.20, 0.13] }, // n=1437
  ],
  player_assists: [
    { maxLine: 1.3, rates: [0.50, 0.50, 0.35, 0.28, 0.27] }, // n=1404
    { maxLine: 2.8, rates: [0.72, 0.59, 0.44, 0.29, 0.23] }, // n=1329
    { maxLine: Infinity, rates: [0.84, 0.72, 0.46, 0.24, 0.16] }, // n=1365
  ],
  player_points_rebounds_assists: [
    { maxLine: 11.8, rates: [0.68, 0.58, 0.41, 0.27, 0.22] }, // n=1356
    { maxLine: 21.3, rates: [0.86, 0.76, 0.47, 0.23, 0.14] }, // n=1407
    { maxLine: Infinity, rates: [0.95, 0.87, 0.49, 0.13, 0.06] }, // n=1360
  ],
  player_points_rebounds: [
    { maxLine: 10.2, rates: [0.67, 0.58, 0.41, 0.28, 0.23] }, // n=1362
    { maxLine: 18.4, rates: [0.85, 0.74, 0.46, 0.24, 0.14] }, // n=1372
    { maxLine: Infinity, rates: [0.94, 0.85, 0.49, 0.15, 0.08] }, // n=1389
  ],
  player_points_assists: [
    { maxLine: 8.3, rates: [0.65, 0.55, 0.41, 0.29, 0.23] }, // n=1353
    { maxLine: 16.4, rates: [0.82, 0.71, 0.46, 0.25, 0.16] }, // n=1418
    { maxLine: Infinity, rates: [0.93, 0.85, 0.48, 0.16, 0.07] }, // n=1352
  ],
  player_rebounds_assists: [
    { maxLine: 4.6, rates: [0.66, 0.58, 0.42, 0.27, 0.23] }, // n=1342
    { maxLine: 7.9, rates: [0.84, 0.71, 0.45, 0.24, 0.16] }, // n=1361
    { maxLine: Infinity, rates: [0.92, 0.81, 0.48, 0.17, 0.09] }, // n=1420
  ],
  // player_threes, player_blocks and player_steals are deliberately ABSENT.
  // All three measured FLAT in their lower bands — threes [0.31, 0.31,
  // 0.31, ...], blocks [0.13 x5], steals [0.26 x5] — and correctly so: for
  // a player averaging 0.8 threes, "more than 0.4" and "more than 0.8" are
  // the same event, made at least one. The price is right and the slider is
  // pointless, which is exactly why anytime_td is excluded above. The Props
  // tab still offers all three as ordinary over/under cards.
}

// The band a prop belongs to, chosen on the BOOK's line — the prop's own
// size — not on whichever stop the slider is sitting at. Moving the slider
// must not move you into a different pricing regime.
function ratesFor(marketKey, baseLine) {
  const bands = HIT_RATES[marketKey]
  if (!bands) return null
  return (bands.find((b) => baseLine <= b.maxLine) || bands[bands.length - 1]).rates
}

export function isSlideable(marketKey) {
  return Object.prototype.hasOwnProperty.call(HIT_RATES, marketKey)
}

/**
 * Round a candidate line to something a person would actually say.
 *
 * Whole numbers or halves only. Yardage markets move in 5s because a slider
 * offering 283.5 against 284.5 is false precision — nobody holds an opinion
 * at that resolution, and it would take 90 steps to cross the range.
 */
function stepFor(marketKey, baseLine) {
  if (/_yds$/.test(marketKey)) return baseLine >= 100 ? 5 : 1
  // NBA points and points+rebounds+assists step by whole numbers, for the
  // same reason yardage steps by 5: nobody holds an opinion at half-a-point
  // resolution on a 25.5 scorer, and at 0.5 the ±33% range offers 34 stops
  // to drag through. At 1 it offers 17, the same order as a pass-yards
  // slider.
  //
  // Named explicitly rather than keyed off line size. A `baseLine >= 10`
  // rule reads as the same idea but would also re-step every shipped NFL
  // attempts market — all 179 pass_attempts lines, all 173 pass_completions
  // and 178 of 316 rush_attempts sit at 10 or above — moving the stops
  // under picks already placed against them. Whether those markets want a
  // coarser step is a fair question, and a separate one.
  //
  // Rebounds and assists stay on halves: their lines sit between 2 and 10,
  // where a whole-number step would leave three or four stops and no real
  // slider.
  if (POINTS_SCALE_MARKETS.has(marketKey)) return 1
  return 0.5
}

// Outward rounding helpers. A stop is never a whole number, on ANY market,
// so a tie — actual exactly equal to the line — cannot happen.
//
// This used to apply only to counting markets, where the step is 0.5 and a
// whole number is obviously wrong. Yardage steps by 1 or 5, so its stops
// were whole and tie-able: Sam Darnold threw for exactly 195 against a 195
// line and the pick pushed. A push is a wasted pick — right about the
// direction and paid nothing for it — and books end every line in .5 for
// precisely this reason.
//
// The book's own line is left exactly as quoted, since it is the prop's real
// number and the slider's default. Books quote .5 anyway.
function floorToStep(value, step) {
  const v = Math.floor(value / step) * step
  return v % 1 === 0 ? v - 0.5 : v
}

function ceilToStep(value, step) {
  const v = Math.ceil(value / step) * step
  return v % 1 === 0 ? v + 0.5 : v
}

function roundToStep(value, step) {
  const rounded = Math.round(value / step) * step
  return rounded % 1 === 0 ? rounded + 0.5 : rounded
}

/**
 * Every line the slider can stop on, low to high, for one prop.
 * Returns [] when the market has no slider.
 */
export function sliderLines(marketKey, baseLine) {
  if (!isSlideable(marketKey) || !(baseLine > 0)) return []
  const step = stepFor(marketKey, baseLine)
  const lo = baseLine * (1 - SLIDER_RANGE)
  const hi = baseLine * (1 + SLIDER_RANGE)

  // Rounded OUTWARD — down at the bottom, up at the top — so the slider
  // covers the whole ±33% rather than truncating inside it. On a 4.5
  // receptions line, truncating inward left a single usable stop and no
  // slider at all; rounding outward gives 2.5 through 6.5.
  //
  // Safe because the hit-rate table is measured out to 0.5x and 1.5x, well
  // past anywhere a rounded stop can land, so every stop is priced from
  // measurement rather than from a clamp.
  const lines = new Set()
  const bottom = floorToStep(lo, step)
  const top = ceilToStep(hi, step)
  for (let v = bottom; v <= top + step / 2; v += step) {
    const r = roundToStep(v, step)
    if (r > 0 && r >= bottom - 1e-9 && r <= top + 1e-9) lines.add(r)
  }
  // The book's own line is always offered, even if the stepping would have
  // skipped it — it is the default position and the one the odds describe.
  lines.add(baseLine)
  return [...lines].sort((a, b) => a - b)
}

/**
 * Probability the player exceeds `line`, interpolated between the three
 * measured anchors.
 *
 * Linear between anchors rather than fitted to a curve: we have three honest
 * points per market and no basis for a shape between them, so a fit would be
 * inventing precision we did not measure.
 */
export function hitProbability(marketKey, baseLine, line) {
  const anchors = ratesFor(marketKey, baseLine)
  if (!anchors || !(baseLine > 0)) return null
  const m = line / baseLine

  // Below/above everything we measured, hold the end anchor. Reachable only
  // if a caller asks for a line the slider would never offer.
  if (m <= MULTIPLIERS[0]) return anchors[0]
  if (m >= MULTIPLIERS[MULTIPLIERS.length - 1]) return anchors[anchors.length - 1]

  // Linear between the two bracketing anchors. Not fitted to a curve: we
  // have five honest points and no basis for a shape between them, so a fit
  // would invent precision we did not measure.
  for (let i = 0; i < MULTIPLIERS.length - 1; i++) {
    const a = MULTIPLIERS[i], b = MULTIPLIERS[i + 1]
    if (m >= a && m <= b) {
      const t = (m - a) / (b - a)
      return anchors[i] + (anchors[i + 1] - anchors[i]) * t
    }
  }
  return anchors[2]
}

/**
 * What a correct pick pays, for a fixed risk of 10.
 *
 * The break-even price for the measured hit rate: reward = risk × (1−p) / p.
 * Deliberately UNCAPPED. A 16% shot is honestly worth 52, and capping it
 * would be taking a margin we have no reason to take — if someone wants to
 * shoot for the stars, the number should be the real one.
 *
 * UNDER is the complement and needs no second table: the player either
 * exceeds the line or doesn't, and the stepping keeps counting markets on .5
 * so there is no third outcome to price. That makes the slider mean opposite
 * things depending on the side — dragging down is the safe end for over and
 * the long shot for under — which is the whole point of offering both.
 *
 * Floored at 1 so the safest position still pays something.
 */
export function rewardFor(marketKey, baseLine, line, risk = 10, side = 'over') {
  const pOver = hitProbability(marketKey, baseLine, line)
  if (pOver == null) return null
  const p = side === 'under' ? 1 - pOver : pOver
  if (p <= 0) return null
  if (p >= 1) return 1
  return Math.max(1, Math.round((risk * (1 - p)) / p))
}

/**
 * The full ladder for one prop — what the client renders the slider from.
 * Each entry is a stop the player can land on.
 */
export function buildSlider(marketKey, baseLine, risk = 10) {
  const lines = sliderLines(marketKey, baseLine)
  if (!lines.length) return null
  return {
    marketKey,
    baseLine,
    risk,
    defaultIndex: lines.indexOf(baseLine),
    // Both sides on every stop, so the card can show what each would pay
    // without asking the server again as the slider moves.
    //
    // `reward` is the over price under its old name. Renaming it outright
    // broke the deployed client the moment this shipped — it reads
    // stop.reward and rendered "win undefined" on every card, because the
    // server redeploys in seconds and a browser keeps whatever bundle it
    // loaded. A field the shipped client reads is a contract; add alongside,
    // never rename.
    stops: lines.map((line) => {
      const over = rewardFor(marketKey, baseLine, line, risk, 'over')
      return {
        line,
        over,
        under: rewardFor(marketKey, baseLine, line, risk, 'under'),
        reward: over,
        probability: Number(hitProbability(marketKey, baseLine, line).toFixed(3)),
      }
    }),
  }
}

/**
 * Validate and price a line the client claims the user picked.
 *
 * Never trusts the submitted reward. The client sends only the line; the
 * payout is recomputed here, so a tampered request buys the same price as an
 * honest one.
 */
export function priceChosenLine(marketKey, baseLine, chosenLine, risk = 10, side = 'over') {
  const stops = sliderLines(marketKey, baseLine)
  if (!stops.length) return { ok: false, error: 'This market does not support a custom line' }
  if (side !== 'over' && side !== 'under') {
    return { ok: false, error: 'picked_side must be over or under' }
  }
  const line = Number(chosenLine)
  if (!Number.isFinite(line)) return { ok: false, error: 'chosen_line must be a number' }
  if (!stops.some((s) => Math.abs(s - line) < 1e-9)) {
    return { ok: false, error: `Line ${line} is not an available stop for this prop` }
  }
  const pOver = hitProbability(marketKey, baseLine, line)
  return {
    ok: true,
    line,
    side,
    risk,
    reward: rewardFor(marketKey, baseLine, line, risk, side),
    probability: side === 'under' ? 1 - pOver : pOver,
  }
}
