// Sync the NFL regular-season schedule from Sleeper into nfl_schedule.
// nfl_schedule is what the fantasy football, TD Pass, salary cap, and
// single-stat contest modals key on for week labels + opponent/is_home
// info. Without this data ingested for the current season, the WK
// column shows "—" and the opponent lacks its vs/@ prefix.
//
// Sleeper response: [{ status, date (YYYY-MM-DD), home, week, game_id, away }]
//
// The nfl_schedule table has UNIQUE(season, week, home_team), so a
// single upsert reruns cleanly without dupes.

import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

const SLEEPER_SCHEDULE = 'https://api.sleeper.app/schedule/nfl/regular'

export async function syncNflSchedule(season) {
  const year = parseInt(season, 10)
  if (!year || year < 2000 || year > 2100) {
    throw new Error(`invalid season: ${season}`)
  }

  const url = `${SLEEPER_SCHEDULE}/${year}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Sleeper schedule ${res.status}`)
  const games = await res.json()
  if (!Array.isArray(games) || games.length === 0) {
    throw new Error(`Sleeper returned no games for ${year}`)
  }

  const rows = games
    .filter((g) => g.home && g.away && g.week && g.date)
    .map((g) => ({
      season: year,
      week: g.week,
      home_team: g.home,
      away_team: g.away,
      game_date: g.date,
      status: g.status === 'complete' ? 'complete'
        : g.status === 'in_progress' ? 'in_progress'
        : 'scheduled',
    }))

  const { error } = await supabase
    .from('nfl_schedule')
    .upsert(rows, { onConflict: 'season,week,home_team' })

  if (error) {
    logger.error({ error, season: year }, 'nfl_schedule upsert failed')
    throw error
  }

  logger.info({ season: year, rows: rows.length }, 'nfl_schedule synced')
  return { season: year, rows_synced: rows.length }
}
