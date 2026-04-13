/**
 * Compute effective ADP for a player given scoring format and SuperFlex status.
 * Shared between fantasyService (league ranking seeding) and draftPrepService.
 */
export function effectiveAdp(player, scoringFormat, isSuperflex) {
  let raw
  if (scoringFormat === 'ppr') raw = player.adp_ppr ?? player.adp_half_ppr ?? player.search_rank
  else if (scoringFormat === 'standard') raw = player.search_rank ?? player.adp_half_ppr ?? player.adp_ppr
  else raw = player.adp_half_ppr ?? player.adp_ppr ?? player.search_rank
  raw = raw ?? 9999
  if (player.position === 'QB' && isSuperflex) raw -= 30
  return raw
}
