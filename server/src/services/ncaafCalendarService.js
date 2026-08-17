// NCAAF season calendar (regular season weeks + postseason windows)
// sourced from ESPN's scoreboard endpoint. Powers the /scores/ncaaf-
// schedule and /scores/ncaaf-week routes so the scrubber reflects the
// FULL schedule regardless of whether odds have been posted yet.
//
// Unlike NFL, CFB has no preseason — regular season starts late Aug
// and rolls through mid-December. Postseason is bowls + CFP.

import { logger } from '../utils/logger.js'

const CACHE_TTL_MS = 60 * 60 * 1000
let cache = null

function toPtDate(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

async function fetchCalendar() {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?limit=0')
    if (!res.ok) throw new Error(`ESPN ${res.status}`)
    const data = await res.json()
    const league = data?.leagues?.[0] || {}
    const season = league?.season?.year || new Date().getFullYear()
    const cal = league?.calendar || []
    const regular = []

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

    return { season, regular, fetchedAt: Date.now() }
  } catch (err) {
    logger.warn({ err: err.message }, 'NCAAF calendar fetch failed')
    return { season: new Date().getFullYear(), regular: [], fetchedAt: Date.now() }
  }
}

export async function getNcaafCalendar() {
  const now = Date.now()
  if (cache && (now - cache.fetchedAt) < CACHE_TTL_MS) return cache
  cache = await fetchCalendar()
  return cache
}

export async function getNcaafWeekWindow(week) {
  const cal = await getNcaafCalendar()
  return cal.regular.find((w) => w.week === week) || null
}
