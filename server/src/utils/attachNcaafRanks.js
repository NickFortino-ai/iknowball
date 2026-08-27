import { getStandingsTable } from '../services/teamRecordsService.js'
import { getNcaafApRankings } from '../services/ncaafRankingsService.js'

// Attach AP Top 25 ranks (home_rank / away_rank) to NCAAF game rows.
//
// Extracted from the /scores/strip handler, which was the only place doing
// this. The Picks page sorts NCAAF by getNcaafMatchupScore, which reads
// game.home_rank — but the picks payload never carried ranks, so every game
// fell back to 26+26 and the sort quietly collapsed to its prestige
// tiebreaker. Same data, three surfaces; one helper.
//
// Ranks come from ESPN keyed by team id, while our games table stores team
// NAMES, so the standings table is used as the name → id bridge. Both
// sources are already cached in-memory by their services.
//
// Mutates in place and returns the array, so callers can inline it. Any
// failure is swallowed — a missing rank badge is not worth failing a
// games list over.
export async function attachNcaafRanks(games) {
  const rows = (games || []).filter((g) => g && (g.sports?.key || g.sport_key) === 'americanfootball_ncaaf')
  if (!rows.length) return games

  try {
    const [standings, rankById] = await Promise.all([
      getStandingsTable('americanfootball_ncaaf'),
      getNcaafApRankings(),
    ])
    if (!rankById?.size) return games

    const nameToId = new Map()
    for (const row of standings || []) {
      if (!row.team_id) continue
      const id = String(row.team_id)
      if (row.team_name) nameToId.set(row.team_name.toLowerCase(), id)
      if (row.short_name) nameToId.set(row.short_name.toLowerCase(), id)
    }

    for (const g of rows) {
      const homeId = nameToId.get((g.home_team || '').toLowerCase())
      const awayId = nameToId.get((g.away_team || '').toLowerCase())
      const hr = homeId ? rankById.get(homeId) : null
      const ar = awayId ? rankById.get(awayId) : null
      if (hr) g.home_rank = hr
      if (ar) g.away_rank = ar
    }
  } catch {
    // Best-effort — ranks are decoration, not data the page depends on.
  }

  return games
}
