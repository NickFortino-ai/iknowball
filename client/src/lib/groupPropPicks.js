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

    // Ranges PER SIDE, not one range across the group.
    //
    // 27% of multi-pick groups mix over and under, and they are not noise —
    // they are the bet. "over 145.5-165.5 AND under 285.5-300.5" is someone
    // backing the stat to land between the two, and "over 241.5 AND under
    // 241.5" is a hedge on a single number. Collapsing either to one
    // undirected 145.5-300.5 span would describe a wager nobody placed.
    const bySide = new Map()
    for (const pick of picks) {
      const side = pick.picked_side
      const line = Number(pick.player_props?.line)
      if (!side || !Number.isFinite(line)) continue
      if (!bySide.has(side)) bySide.set(side, [])
      bySide.get(side).push(line)
    }
    // 'over' before 'under' so a range bet reads low-to-high.
    const sideRanges = [...bySide.entries()]
      .sort((a, b) => (a[0] === 'over' ? -1 : b[0] === 'over' ? 1 : 0))
      .map(([side, ls]) => ({ side, low: Math.min(...ls), high: Math.max(...ls), count: ls.length }))

    const sides = [...bySide.keys()]

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
      isMixed: sides.length > 1,
      sideRanges,
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

/**
 * "over 145.5–250.5" for a one-sided ladder, "over 160.5" for a single line,
 * and "over 145.5–165.5 · under 285.5–300.5" when the user took both sides.
 */
export function groupLineLabel(group) {
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
  const ranges = group.sideRanges || []
  if (!ranges.length) return ''
  return ranges
    .map(({ side, low, high }) => (low === high ? `${side} ${fmt(low)}` : `${side} ${fmt(low)}–${fmt(high)}`))
    .join(' · ')
}
