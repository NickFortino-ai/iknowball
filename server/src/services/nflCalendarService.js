// NFL season calendar (preseason + regular season weeks with date
// ranges) sourced from ESPN's scoreboard endpoint. Used by the
// /scores/nfl-schedule and /scores/nfl-week routes so the scrubber
// reflects the FULL schedule regardless of whether odds have been
// posted for those games yet (odds API only publishes ~1-2 weeks
// ahead, so games-table-derived bucketing missed Pre 2 / Pre 3).
//
// Fold: ESPN lists 'Hall of Fame Weekend' + 'Preseason Week 1/2/3'
// separately. We roll HOF into PRE 1 (extend PRE 1's start back to
// HOF start) so users see the standard three preseason buttons
// instead of a mysterious extra one.

import { logger } from '../utils/logger.js'

const CACHE_TTL_MS = 60 * 60 * 1000
let cache = null // { fetchedAt, season, preseason: [...], regular: [...] }

function toPtDate(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

async function fetchCalendar() {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=0')
    if (!res.ok) throw new Error(`ESPN ${res.status}`)
    const data = await res.json()
    const league = data?.leagues?.[0] || {}
    const season = league?.season?.year || new Date().getFullYear()
    const cal = league?.calendar || []
    const preseason = []
    const regular = []

    // Preseason: fold Hall of Fame Weekend into Pre Week 1 so the
    // scrubber shows the standard three buttons. HOF game(s) end up
    // inside the PRE 1 date window.
    const preGroup = cal.find((c) => String(c.value) === '1' || /pre/i.test(c.label || ''))
    if (preGroup?.entries?.length) {
      const preEntries = [...preGroup.entries]
      const hofIdx = preEntries.findIndex((e) => /hall of fame/i.test(e.label || ''))
      let hof = null
      if (hofIdx >= 0) hof = preEntries.splice(hofIdx, 1)[0]
      // Now preEntries should be the Preseason Week 1/2/3 entries.
      for (let i = 0; i < preEntries.length; i++) {
        const e = preEntries[i]
        const weekNum = i + 1
        // Extend PRE 1's start back to HOF's start if HOF exists.
        const startIso = weekNum === 1 && hof ? hof.startDate : e.startDate
        preseason.push({
          week: weekNum,
          start: toPtDate(startIso),
          end: toPtDate(e.endDate),
          season_type: 'pre',
        })
      }
    }

    // Regular season: entries labeled 'Week N'.
    const regGroup = cal.find((c) => String(c.value) === '2' || /regular/i.test(c.label || ''))
    if (regGroup?.entries?.length) {
      for (const e of regGroup.entries) {
        const m = String(e.label || '').match(/(\d+)/)
        if (!m) continue
        regular.push({
          week: Number(m[1]),
          start: toPtDate(e.startDate),
          end: toPtDate(e.endDate),
          season_type: 'regular',
        })
      }
      regular.sort((a, b) => a.week - b.week)
    }

    return { season, preseason, regular, fetchedAt: Date.now() }
  } catch (err) {
    logger.warn({ err: err.message }, 'NFL calendar fetch failed')
    return { season: new Date().getFullYear(), preseason: [], regular: [], fetchedAt: Date.now() }
  }
}

export async function getNflCalendar() {
  const now = Date.now()
  if (cache && (now - cache.fetchedAt) < CACHE_TTL_MS) return cache
  cache = await fetchCalendar()
  return cache
}

// Find the (start, end) PT-date window for a given (week, season_type).
// Returns null if that week isn't in the calendar.
export async function getNflWeekWindow(week, seasonType) {
  const cal = await getNflCalendar()
  const list = seasonType === 'pre' ? cal.preseason : cal.regular
  return list.find((w) => w.week === week) || null
}
