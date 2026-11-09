// When a game starts, phrased for a prop card.
//
// Shared because PropCard and PropSliderCard each had their own copy of this
// and they have to agree — the same prop renders through both depending on
// whether the market is slideable.
//
// The old rule was "show a date unless the game is today, otherwise show
// nothing". That left a Monday-night game, viewed on Monday, with no timing
// information at all: just the matchup, on a board where everything else had
// already finished on Sunday. Reported 2026-11-09.
//
// A date was never the useful half anyway. On a Sunday slate every game is
// today and the date is noise, but 1:00 vs 4:25 vs 8:20 is exactly what a
// picker wants to know. So: time always, day when it isn't today, and the
// calendar date only when the weekday alone would be ambiguous.
const PT = { timeZone: 'America/Los_Angeles' }

export function kickoffLabel(startsAt, status) {
  if (!startsAt) return null
  const d = new Date(startsAt)
  if (Number.isNaN(d.getTime())) return null

  const day = d.toLocaleDateString('en-CA', PT)
  const today = new Date().toLocaleDateString('en-CA', PT)
  const isToday = day === today

  // A game in progress or finished is already described by the score and
  // status lines on the card. Printing when it was due to start there is the
  // "kickoff time for a game that ended hours ago" bug, so only the date
  // survives, and only to say which day it was.
  if (status === 'live' || status === 'final') {
    return isToday ? null : d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', ...PT })
  }

  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...PT })
  if (isToday) return time

  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', ...PT })
  // Within the week a weekday is unambiguous and reads better. Beyond it,
  // "Sun" could mean either of two Sundays — football props publish well
  // ahead — so the date comes back.
  const daysOut = Math.round((new Date(`${day}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000)
  if (daysOut > 6) {
    return `${weekday} ${d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', ...PT })} ${time}`
  }
  return `${weekday} ${time}`
}
