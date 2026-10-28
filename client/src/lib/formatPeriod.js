// Turn a game's raw `period` into something that reads like the sport.
//
// The prop card used to prefix "Q" to any numeric period, which is wrong in
// two ways that were both live:
//
//   - College basketball plays HALVES. Period "2" is the second half and
//     appeared on 886 games, every one of them rendered "Q2".
//   - Overtime is just the next period number, so NFL "5", NBA "5"/"6" and
//     NCAAF "5"-"8" all rendered as Q5, Q6, Q8 instead of OT / 2OT / 4OT.
//
// Hockey is handled here too. It has no props today, so this is not fixing
// anything visible — but the old comment claimed "NBA/NFL/NHL send a numeric
// period, prefix Q", and a numeric NHL period is a PERIOD. Leaving that in
// place would hand the next person a wrong statement to build on.
//
// Non-numeric periods pass straight through: MLB sends "Bot 9th" / "End 10th"
// already formatted, and there is nothing to improve on that.
export function formatPeriod(sportKey, period) {
  const raw = String(period ?? '').trim()
  if (!raw) return ''
  if (!/^[0-9]+$/.test(raw)) return raw
  const n = parseInt(raw, 10)
  const key = String(sportKey || '')

  // Halves: MEN'S college basketball and soccer.
  //
  // Women's college basketball plays four QUARTERS (since 2015-16) and must
  // be tested first — 'basketball_wncaab'.includes('ncaab') is true, so a
  // bare ncaab check swallows it and would label a WNCAAB game in halves.
  // ParlayCard's formatter already encodes this distinction; this one nearly
  // shipped without it.
  if (key.includes('wncaab')) {
    if (n <= 4) return `Q${n}`
    return n === 5 ? 'OT' : `${n - 4}OT`
  }
  if (key.includes('ncaab')) {
    if (n <= 2) return `${n}H`
    return n === 3 ? 'OT' : `${n - 2}OT`
  }
  if (key.includes('soccer')) {
    if (n <= 2) return `${n}H`
    return 'ET'
  }

  // Baseball: usually arrives pre-formatted ("Bot 9th") and returns above,
  // but a bare number does appear — 121 MLB games carry period "9". That is
  // an INNING. Without this it fell through to the quarters branch and
  // rendered "5OT".
  if (key.includes('baseball')) {
    const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st'
      : n % 10 === 2 && n % 100 !== 12 ? 'nd'
      : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'
    return `${n}${suffix}`
  }

  // Hockey: three periods, then OT, then a shootout.
  if (key.includes('hockey')) {
    if (n <= 3) return `P${n}`
    return n === 4 ? 'OT' : 'SO'
  }

  // Quarters: NBA, WNBA, NFL, college football.
  if (n <= 4) return `Q${n}`
  return n === 5 ? 'OT' : `${n - 4}OT`
}
