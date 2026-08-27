// Shared, settings-aware explainer copy for the NFL single-stat contests
// (sacks / ints / tackles / receptions) and TD Pass.
//
// Extracted from LeagueConditions' buildNarrative() so the pre-start banner
// on the Picks tab and the rules block on the league Info section render the
// SAME sentences. Two hand-maintained copies would drift, and the reuse rule
// in particular has to track fantasy_settings.pick_reuse — commissioners set
// it per league (1x / 2x / 3x / 4x / unlimited), so hardcoding "once per
// season" would be wrong for most leagues in production.

const STAT_NOUN = {
  sacks: 'sack',
  ints: 'interception',
  tackles: 'tackle',
  receptions: 'reception',
}

export const SINGLE_STAT_FORMATS = ['sacks', 'ints', 'tackles', 'receptions']

// pick_reuse is stored as 'season' (once), 'unlimited', or a numeric string.
export function maxUsesFromSettings(fantasySettings) {
  const raw = fantasySettings?.pick_reuse
  if (raw === 'unlimited') return Infinity
  if (raw === 'season') return 1
  return parseInt(raw, 10) || 1
}

export function reuseRuleSentence(maxUses, poolNoun) {
  if (maxUses === Infinity) {
    return `No reuse limit — pick the same ${poolNoun} as many weeks as you want.`
  }
  if (maxUses === 1) {
    return `Each ${poolNoun} can only be used once all season.`
  }
  return `Each ${poolNoun} can be used up to ${maxUses} times this season.`
}

// Returns an array of bullet lines, or null when the format isn't one of the
// NFL single-stat contests.
export function buildSingleStatNarrative(format, fantasySettings) {
  if (!SINGLE_STAT_FORMATS.includes(format)) return null
  const poolNoun = format === 'receptions' ? 'pass catcher' : 'defender'
  const stat = STAT_NOUN[format]
  return [
    `Pick 3 ${poolNoun}s each week that you think will record ${stat}s.`,
    reuseRuleSentence(maxUsesFromSettings(fantasySettings), poolNoun),
    "You can change your picks until each player's game starts.",
    `Every ${stat} your picks record adds to your league total.`,
    'Your finishing position impacts your global IKB score — see the table below.',
  ]
}

// Condensed variant for the pre-start banner, where the full bullet list is
// too heavy and the "see the table below" pointer has nothing to point at.
export function buildPreStartBlurb(format, fantasySettings, leagueSettings) {
  if (SINGLE_STAT_FORMATS.includes(format)) {
    const poolNoun = format === 'receptions' ? 'pass catcher' : 'defender'
    const stat = STAT_NOUN[format]
    return [
      `Pick 3 ${poolNoun}s each week and score for every ${stat} they record.`,
      reuseRuleSentence(maxUsesFromSettings(fantasySettings), poolNoun),
      "Picks stay editable until each player's game kicks off — you can set them early.",
      'Most points when the season ends takes the league.',
    ]
  }
  if (format === 'td_pass') {
    return [
      'Pick one quarterback each week and bank his passing touchdowns.',
      'You can only use a QB once all season, so plan ahead.',
      "Picks stay editable until that QB's game kicks off.",
      'Most passing TDs by the end of the regular season wins.',
    ]
  }
  if (format === 'survivor') {
    // Two different games share this format. Touchdown survivor picks a
    // PLAYER to score; classic survivor picks a TEAM to win. Describing one
    // as the other is worse than saying nothing, so branch on the setting
    // the view itself uses (SurvivorView reads survivor_mode === 'touchdown').
    const isTouchdown = leagueSettings?.survivor_mode === 'touchdown'
    const lives = Number(leagueSettings?.lives) || 1
    const livesLine = lives > 1
      ? `You start with ${lives} lives — a miss costs one, and you're out when they're gone.`
      : "One miss and you're out."
    return isTouchdown
      ? [
          'Pick one player each week you think will score a touchdown.',
          livesLine,
          'You can only use a player once, so plan ahead.',
          'Last one standing wins.',
        ]
      : [
          'Pick one team each week you think will win.',
          livesLine,
          'You can only use a team once all season, so plan ahead.',
          'Last one standing wins.',
        ]
  }
  return null
}
