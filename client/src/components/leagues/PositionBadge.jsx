// The slot badge on a roster row, and the primary way a lineup gets edited.
//
// The ring IS the affordance: a circled badge can move, bare coloured letters
// cannot. That distinction carries the kickoff lock — once a player's game has
// started he can't be moved, so his badge loses its ring rather than staying
// tappable and being refused on save.
//
// Colour is by slot family, so a row's badge and the eligible destinations
// inside the move sheet read as the same thing at a glance.
const SLOT_COLORS = {
  QB: 'text-sky-400 border-sky-400',
  RB: 'text-emerald-400 border-emerald-400',
  WR: 'text-orange-400 border-orange-400',
  TE: 'text-pink-400 border-pink-400',
  FLX: 'text-amber-300 border-amber-300',
  SFLX: 'text-violet-400 border-violet-400',
  K: 'text-lime-400 border-lime-400',
  DEF: 'text-cyan-400 border-cyan-400',
  DL: 'text-red-400 border-red-400',
  LB: 'text-yellow-400 border-yellow-400',
  DB: 'text-indigo-400 border-indigo-400',
  S: 'text-teal-400 border-teal-400',
  BN: 'text-text-muted border-text-muted',
  IR: 'text-incorrect border-incorrect',
}

function colorFor(label) {
  return SLOT_COLORS[String(label || '').toUpperCase()] || 'text-text-muted border-text-muted'
}

/**
 * locked  — bare coloured letters, no ring. The player can't be moved.
 * onTap   — makes the ringed badge a button. Omit it inside the move sheet,
 *           where the whole row is the tap target and the badge is decoration.
 */
export default function PositionBadge({ label, locked = false, onTap, title }) {
  const color = colorFor(label)
  const text = color.split(' ')[0]

  if (locked) {
    return (
      <span
        title={title || 'Already played — locked'}
        className={`w-11 h-11 shrink-0 flex items-center justify-center text-xs font-bold ${text}`}
      >
        {label}
      </span>
    )
  }

  // Just the letters inside the ring. A swap glyph was tried above them and
  // read as clutter at this size — the ring alone is enough to say "tappable"
  // once every movable row has one and every locked row doesn't.
  const inner = <span className="text-xs font-bold">{label}</span>
  const shell = `w-11 h-11 shrink-0 flex items-center justify-center rounded-full border bg-transparent leading-none ${color}`

  if (!onTap) return <span className={shell} title={title}>{inner}</span>

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onTap() }}
      title={title || `Move — ${label}`}
      aria-label={`Move the player in your ${label} slot`}
      className={`${shell} hover:bg-white/5 active:bg-white/10 transition-colors`}
    >
      {inner}
    </button>
  )
}
