// Matching an external feed's player name to a row in our own tables.
//
// This is written down once because getting it wrong is silent. Four separate
// production bugs in a single day, all the same shape:
//
//   - the prop headshot lookup showed a cornerback's face on Lamar Jackson's
//     passing-yards card
//   - tapping Kenneth Walker III's headshot opened nothing at all
//   - 16 props on finished games never settled, so picks sat unresolved
//   - a Browns linebacker's "Out" landed on the Vikings' Justin Jefferson,
//     who had just caught three passes
//
// None threw. Each just resolved to the wrong row, or to none, and kept going.
//
// Twelve normalizers existed across the codebase before this and no two
// agreed. On eight test names they produced eight different answers —
// including settleMLBProps stripping accents AFTER removing non-letters, so
// "Ekéler" collapsed to "ekler" while every other site produced "ekeler".
//
// Two rules carry most of the weight:
//
//   1. Fold accents BEFORE removing punctuation. Otherwise é is not an
//      "accented e", it is a non-letter, and it gets deleted.
//   2. Names are NOT unique. Six pairs are rostered in the NFL right now
//      (Justin Jefferson, DeVonta Smith, Byron Young, Byron Murphy, Marcus
//      Harris, Michael Carter). A name-only map is last-write-wins, which is
//      a coin flip dressed up as a lookup.

/** Accents folded to ASCII. Always the first step. */
function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const SUFFIX_RE = /\s+(?:jr|sr|ii|iii|iv|v)\.?\s*$/i

/**
 * Canonical form. Accents folded, punctuation dropped, whitespace collapsed.
 * Suffixes are KEPT — they're a real part of the name and some sources store
 * them. `looseName` handles the sources that don't.
 *
 *   "Amon-Ra St. Brown"  -> "amonra st brown"
 *   "Ja'Marr Chase"      -> "jamarr chase"
 *   "Austin Ekéler"      -> "austin ekeler"
 *   "Kenneth Walker III" -> "kenneth walker iii"
 */
export function canonicalName(name) {
  return stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Canonical form with any generational suffix removed.
 *
 *   "Kenneth Walker III" -> "kenneth walker"
 *
 * Used as a FALLBACK only. Matching on it first would collide a father and
 * son on the same roster, which is rarer than the suffix mismatch but not
 * hypothetical.
 */
export function looseName(name) {
  return canonicalName(String(name || '').replace(SUFFIX_RE, ''))
}

/**
 * Build a lookup index over our own player rows.
 *
 * @param rows     player records
 * @param getName  row -> full name        (default: r.full_name)
 * @param getTeam  row -> team abbreviation (default: r.team). Return null for
 *                 sources with no team, and the index degrades to name-only.
 */
export function buildPlayerIndex(rows, { getName, getTeam } = {}) {
  const nameOf = getName || ((r) => r.full_name)
  const teamOf = getTeam || ((r) => r.team)

  const byNameTeam = new Map()
  const byLooseTeam = new Map()
  const byName = new Map()
  const byLoose = new Map()

  for (const row of rows || []) {
    const raw = nameOf(row)
    if (!raw) continue
    const name = canonicalName(raw)
    const loose = looseName(raw)
    const team = teamOf(row)

    if (team) {
      const t = String(team).toLowerCase()
      // First write wins on a team-scoped key: a genuine duplicate within one
      // team is a data problem, not something to silently overwrite.
      if (!byNameTeam.has(`${name}|${t}`)) byNameTeam.set(`${name}|${t}`, row)
      if (!byLooseTeam.has(`${loose}|${t}`)) byLooseTeam.set(`${loose}|${t}`, row)
    }

    // Name-only buckets collect EVERY match so ambiguity stays visible.
    // Collapsing to one row here is precisely the bug this module exists for.
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name).push(row)
    if (!byLoose.has(loose)) byLoose.set(loose, [])
    byLoose.get(loose).push(row)
  }

  return { byNameTeam, byLooseTeam, byName, byLoose }
}

/**
 * Resolve one external name (plus team, when known) to a single row.
 *
 * Order matters:
 *   1. exact name + team
 *   2. suffixless name + team
 *   3. exact name, only if league-unique
 *   4. suffixless name, only if league-unique
 *
 * Returns null when nothing matches OR when the name is shared and no team
 * was given. That second case is the important one: a wrong player is worse
 * than no player, because a wrong player looks like it worked.
 */
export function resolvePlayer(index, { name, team } = {}) {
  if (!index || !name) return null
  const exact = canonicalName(name)
  const loose = looseName(name)

  if (team) {
    const t = String(team).toLowerCase()
    const hit = index.byNameTeam.get(`${exact}|${t}`) || index.byLooseTeam.get(`${loose}|${t}`)
    if (hit) return hit
  }

  const byExact = index.byName.get(exact)
  if (byExact?.length === 1) return byExact[0]

  const byLoose = index.byLoose.get(loose)
  if (byLoose?.length === 1) return byLoose[0]

  return null
}

/**
 * Why a lookup failed — for logging a systematic mismatch rather than
 * discovering it weeks later through stuck props.
 *
 * Returns 'ok' | 'ambiguous' | 'missing'.
 */
export function resolveOutcome(index, { name, team } = {}) {
  if (resolvePlayer(index, { name, team })) return 'ok'
  const exact = canonicalName(name)
  const loose = looseName(name)
  const candidates = index.byName.get(exact) || index.byLoose.get(loose) || []
  return candidates.length > 1 ? 'ambiguous' : 'missing'
}
