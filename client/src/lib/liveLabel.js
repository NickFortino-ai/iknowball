// Human label for a live game's period + clock ("Q3 · 4:32", "Bot 7th",
// "2H · 34'").
//
// Extracted from SportsScoresStrip so the drill-in scoreboard can show the
// same thing — it was rendering a bare "LIVE" with no period or clock,
// because this lived as a private function in the strip and there was no way
// to reach it without copying. A second copy is exactly how the two would
// have drifted.
//
// Behaviour is unchanged from the strip's original.
export function formatLiveLabel(period, clock, sportFullKey) {
  if (!period) return clock || null
  const p = String(period)
  // MLB style — already contains letters (Top/Bot/Mid) so hand it back verbatim.
  if (/[a-zA-Z]/.test(p)) return p.toUpperCase()
  const num = parseInt(p, 10)
  if (isNaN(num)) return clock ? `${p} · ${clock}` : p

  if (sportFullKey?.startsWith('soccer_')) {
    const half = num === 1 ? '1H' : num === 2 ? '2H' : num === 3 ? 'ET' : num === 4 ? 'PK' : `P${num}`
    // Strip trailing colon/seconds from the ESPN clock (e.g. "34:22" → "34'")
    const mins = clock ? String(clock).split(':')[0] : null
    return mins ? `${half} · ${mins}'` : half
  }
  const quarter = `Q${num}`
  return clock ? `${quarter} · ${clock}` : quarter
}
