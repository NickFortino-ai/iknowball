/**
 * Collapse a user's prop picks into one entry per player + market + game.
 *
 * A slider prop invites a ladder: eight separate "Jameis Winston over N" picks
 * on one quarterback in one game. Listed individually they bury everything
 * else a user did that day behind near-identical rows that differ only in the
 * half-point. Collapsed, the same eight read as one line with a net number,
 * which is what someone actually wants to know.
 *
 * Keyed on the GAME as well as the player and market. Without it, Josh Allen's
 * week 3 ladder and his week 7 ladder would merge into a single nonsense row
 * summing points from two different Sundays.
 *
 * player_props.line is already the EFFECTIVE line — the server's
 * applyChosenLine overwrites it with the user's chosen_line on slider picks
 * and moves the book's number to book_line — so lines here are the ones the
 * user actually took.
 */
export function groupPropPicks(propPicks) {
  const groups = new Map()

  for (const pick of propPicks || []) {
    const prop = pick.player_props || {}
    const key = [
      prop.player_name || '?',
      prop.market_key || prop.market_label || '?',
      prop.games?.id || prop.game_id || '?',
    ].join('|')

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        playerName: prop.player_name || null,
        marketLabel: prop.market_label || null,
        game: prop.games || null,
        picks: [],
      })
    }
    groups.get(key).picks.push(pick)
  }

  return [...groups.values()].map((g) => {
    // Highest line first, matching the ladder on the Results card so a user
    // reading both sees the same order.
    const picks = [...g.picks].sort(
      (a, b) => Number(b.player_props?.line ?? 0) - Number(a.player_props?.line ?? 0),
    )
    const settled = picks.filter((p) => p.status === 'settled')

    // Net across SETTLED picks only. An unsettled pick has points_earned
    // null, and counting it as zero would quietly report a half-finished
    // ladder as if it had already broken even.
    const netPoints = settled.reduce((sum, p) => sum + (Number(p.points_earned) || 0), 0)

    const lines = picks
      .map((p) => Number(p.player_props?.line))
      .filter((n) => Number.isFinite(n))
    const sides = [...new Set(picks.map((p) => p.picked_side).filter(Boolean))]

    return {
      ...g,
      picks,
      count: picks.length,
      settledCount: settled.length,
      wins: settled.filter((p) => p.is_correct === true).length,
      losses: settled.filter((p) => p.is_correct === false).length,
      netPoints,
      allSettled: settled.length === picks.length,
      // 'over' when every pick took the same side, null on a mixed ladder so
      // the label does not claim a direction the user did not take.
      side: sides.length === 1 ? sides[0] : null,
      lineLow: lines.length ? Math.min(...lines) : null,
      lineHigh: lines.length ? Math.max(...lines) : null,
      // Most recent activity in the group, for sorting a mixed list.
      sortDate: picks.reduce((latest, p) => {
        const d = p.updated_at || p.created_at
        return !latest || (d && d > latest) ? d : latest
      }, null),
    }
  })
}

/** "over 145.5–250.5", or "over 160.5" when a group holds one line. */
export function groupLineLabel(group) {
  if (group.lineLow == null) return ''
  const side = group.side ? `${group.side} ` : ''
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
  return group.lineLow === group.lineHigh
    ? `${side}${fmt(group.lineLow)}`
    : `${side}${fmt(group.lineLow)}–${fmt(group.lineHigh)}`
}
