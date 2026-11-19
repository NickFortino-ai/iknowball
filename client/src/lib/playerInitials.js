// First + last initial from a player name, for the disc shown when there is
// no headshot.
//
// Extracted because five components had grown their own copy and they had
// already drifted: PropCard rendered initials, while PropLadderCard and
// PropResultCard rendered an EMPTY grey circle that just looked broken. NCAAB
// is the sport that exposes it — `player_headshot_url` is NULL for every
// college basketball prop we carry, since NCAAF/NCAAB headshots have no
// source feeding them, so the fallback is the only thing those cards ever show.
//
// The two implementations it replaces also disagreed, and each was wrong on
// names the other handled. PropCard took the first TWO words, which turns
// "Michael Porter Jr" into MP but "Robert Lee Smith" into RL. PlayerHeadshot
// took first and LAST, which fixes the middle name but turns Porter into MJ.
// 234 of our 3,826 prop players end in a suffix, so that second failure is
// the common one. Strip the suffix first and both read correctly.
//
// D/ST is stripped for the same reason: "Carolina Panthers D/ST" otherwise
// gives CD. PropCard already dodges this by rendering the team crest instead,
// but the ladder and result cards have no such branch.
const DROPPED_TOKENS = /^(jr|sr|ii|iii|iv|v|d\/st|dst)\.?$/i

export function playerInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  while (parts.length > 1 && DROPPED_TOKENS.test(parts[parts.length - 1])) parts.pop()
  if (!parts.length) return ''
  if (parts.length === 1) return (parts[0][0] || '').toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
