// Injury indicator — colored letter only, no pill background. The
// color carries the meaning, the letter carries the specifics.
//   Q   bright yellow   Questionable
//   D   red             Doubtful (unlikely to play — treated like Out)
//   DTD bright yellow   Day-To-Day
//   O   red             Out — and suspended, which reads the same to a lineup
//   IR  red             Injured Reserve
//   P   green           Probable
// Case-insensitive lookup so Sleeper / ESPN / manual values all resolve.
// Previously "Doubtful" from any non-canonical casing fell through to gray.
// Sleeper spells a suspension 'Sus', 'Suspended' AND 'Suspension'. Matched by
// prefix below rather than listed here, because enumerating the spellings is
// what let 'Suspension' through: it missed this map (grey, not red) and missed
// shortLabel, so Montez Sweat wore a bare grey "S" — a letter this legend
// doesn't assign — in a starting lineup.
const isSuspension = (s) => String(s || '').trim().toLowerCase().startsWith('sus')

const INJURY_COLORS = {
  out: 'text-incorrect',
  ir: 'text-incorrect',
  pup: 'text-incorrect',
  doubtful: 'text-yellow-400',
  questionable: 'text-yellow-400',
  probable: 'text-correct',
  'day-to-day': 'text-yellow-400',
  dtd: 'text-yellow-400',
  na: 'text-text-muted',
}

function shortLabel(status) {
  const s = String(status).toLowerCase()
  // A suspended player reads as OUT. Nick's call 2026-10-20: the distinction
  // between "hurt" and "banned" doesn't change the only thing a lineup screen
  // needs to say, which is that he will score nothing.
  if (isSuspension(s)) return 'O'
  if (s === 'day-to-day' || s === 'dtd') return 'DTD'
  if (s === 'questionable') return 'Q'
  if (s === 'doubtful') return 'D'
  if (s === 'probable') return 'P'
  if (s === 'out') return 'O'
  if (s === 'ir') return 'IR'
  if (s === 'pup') return 'PUP'
  return status?.charAt(0)?.toUpperCase() || ''
}

// Values that are NOT injuries. shortLabel ends in
// `status.charAt(0).toUpperCase()`, so anything unlisted invents a badge out
// of its first letter — which is how a healthy player ends up marked.
//
// This has now bitten three times with the same shape, each patched
// individually: Sleeper's "NA" placeholder rendered a bare "N" next to
// healthy players through a whole draft; ESPN's roster feed then supplied
// "Active", which rendered a grey "A" on every fit starter in Game Intel;
// and "Practice Squad" rendered a grey "P" — the letter this component's own
// legend assigns to Probable.
//
// Listing them explicitly rather than widening shortLabel again, because the
// fallback is the defect: a roster state is not an injury designation, and a
// feed is free to add another one tomorrow.
//
// Deliberately NOT inverted to "render only recognised injuries". An
// unfamiliar but genuine designation should still show something rather than
// vanish — a visible letter we haven't styled is recoverable, a silently
// hidden injury is not.
const NOT_AN_INJURY = new Set([
  'na',              // Sleeper: no designation
  'active',          // ESPN roster: fit and available
  'practice squad',  // ESPN roster: a roster state, not a health one
  'healthy',
])

export default function InjuryBadge({ status, className = '' }) {
  if (!status) return null
  if (NOT_AN_INJURY.has(String(status).trim().toLowerCase())) return null
  const color = isSuspension(status)
    ? 'text-incorrect'
    : INJURY_COLORS[String(status).toLowerCase()] || 'text-text-muted'
  return (
    <span
      className={`text-[12px] font-mono font-bold shrink-0 ${color} ${className}`}
      title={status}
    >
      {shortLabel(status)}
    </span>
  )
}
