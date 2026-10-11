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
const HIT_RATES = {
  player_pass_yds:         [0.94, 0.84, 0.50, 0.16, 0.08],
  player_pass_attempts:    [0.96, 0.91, 0.48, 0.13, 0.08],
  player_pass_completions: [0.97, 0.92, 0.52, 0.14, 0.05],
  player_rush_attempts:    [0.89, 0.77, 0.48, 0.20, 0.10],
  player_rush_yds:         [0.74, 0.63, 0.44, 0.30, 0.23],
  player_receptions:       [0.78, 0.64, 0.47, 0.34, 0.22],
  player_reception_yds:    [0.72, 0.65, 0.50, 0.36, 0.30],
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
  const anchors = HIT_RATES[marketKey]
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
