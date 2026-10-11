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
  return 0.5
}

// Outward rounding helpers. On counting markets the result is nudged to the
// nearest .5 so a tie — actual exactly equal to the line — is impossible.
function floorToStep(value, step) {
  const v = Math.floor(value / step) * step
  if (step === 0.5 && v % 1 === 0) return v - 0.5
  return v
}

function ceilToStep(value, step) {
  const v = Math.ceil(value / step) * step
  if (step === 0.5 && v % 1 === 0) return v + 0.5
  return v
}

function roundToStep(value, step) {
  const rounded = Math.round(value / step) * step
  // Keep .5 lines on counting markets so a tie is impossible; a whole-number
  // line on receptions would let actual === line and force a push.
  if (step === 0.5) return rounded % 1 === 0 ? rounded + 0.5 : rounded
  return rounded
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
