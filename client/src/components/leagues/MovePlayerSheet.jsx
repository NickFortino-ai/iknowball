import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import InjuryBadge from '../ui/InjuryBadge'
import PositionBadge from './PositionBadge'
import { buildMoveOptions } from '../../lib/lineupMoves'

// The move sheet. Opens from a tapped position badge (an occupied slot) or a
// tapped empty slot, and lists everything legal on the other side.
//
// Portalled to <body> like every other modal here — rendered in place it would
// inherit the league page's `relative z-10` stacking context and the navbar
// would paint straight over the top of it.
function Line({ name, sub, headshot, injury, right }) {
  return (
    <>
      {headshot ? (
        <img
          src={headshot}
          alt=""
          className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0"
          onError={(e) => { e.target.style.display = 'none' }}
        />
      ) : (
        <div className="w-10 h-10 shrink-0" />
      )}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-text-primary truncate">{name}</span>
          {injury && <InjuryBadge status={injury} />}
        </div>
        {sub && <div className="text-xs text-text-muted truncate">{sub}</div>}
      </div>
      {right}
    </>
  )
}

function playerSub(p) {
  const pos = p?.nfl_players?.position
  const team = p?.nfl_players?.team || 'FA'
  const opp = p?.current_week_opponent
    ? `${p.current_week_is_home ? 'vs' : '@'} ${p.current_week_opponent}`
    : ('current_week_opponent' in (p || {}) && p?.nfl_players?.team) ? 'BYE' : ''
  return [pos && `${pos} · ${team}`, opp].filter(Boolean).join('  ')
}

function proj(p) {
  return p?.weekly_projection != null
    ? <span className="text-xs tabular-nums text-text-secondary shrink-0">Proj {p.weekly_projection.toFixed(1)}</span>
    : null
}

export default function MovePlayerSheet({
  anchor,
  roster,
  starterSlots,
  irLimit,
  onPick,
  onClose,
  isPending,
}) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !isPending) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, isPending])

  const { anchorPlayer, anchorSpot, options } = buildMoveOptions({ anchor, roster, starterSlots, benchLimit, irLimit })
  const slotLabel = (key) => starterSlots.find((s) => s.key === key)?.label
    || (key === 'bench' ? 'BN' : key === 'ir' ? 'IR' : String(key || '').toUpperCase())

  const anchorLabel = anchorSpot?.label || slotLabel(anchorSpot?.slotKey)
  const title = anchorPlayer
    ? `Select a new position for ${anchorPlayer.nfl_players?.full_name || 'this player'}, or keep them at ${anchorLabel}.`
    : `Select a player for your ${anchorLabel} slot.`

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center"
      onClick={() => { if (!isPending) onClose() }}
    >
      <div
        className="w-full sm:max-w-lg bg-bg-secondary rounded-t-2xl sm:rounded-2xl border border-text-primary/20 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* No grab handle: it reads as drag-to-dismiss, and this sheet doesn't
            implement that gesture. The close button is the way out. */}
        <div className="px-4 pb-4 pt-4 border-b border-text-primary/10 shrink-0 relative">
          {/* Title centred and the close button floated over it, rather than
              sharing a flex row: a row makes the title's centre depend on the
              button's width, so it sits visibly off-centre. */}
          <h3 className="font-display text-xl text-text-primary text-center px-14">Move Player</h3>
          <p className="text-sm text-text-muted mt-1 text-center px-6">{title}</p>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close"
            // 44px, the minimum comfortable touch target — this is the only
            // way out of an auto-saving sheet, so it should never need aiming.
            className="absolute right-3 top-3 w-11 h-11 rounded-full bg-bg-card text-text-primary text-xl hover:bg-bg-card-hover active:bg-bg-card-hover flex items-center justify-center shrink-0 disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-3 space-y-2">
          {/* The anchor, shown for context and deliberately inert — tapping it
              would be a no-op move, and Yahoo's sheet reads the same way. */}
          {anchorPlayer && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-bg-primary/40 border border-text-primary/10 opacity-70">
              <PositionBadge label={anchorLabel} locked />
              <Line
                name={anchorPlayer.nfl_players?.full_name}
                sub={playerSub(anchorPlayer)}
                headshot={anchorPlayer.nfl_players?.headshot_url}
                injury={anchorPlayer.nfl_players?.injury_status}
                right={proj(anchorPlayer)}
              />
            </div>
          )}

          {options.length === 0 && (
            <p className="text-sm text-text-muted text-center py-6">
              {anchorPlayer
                ? 'No other slot can take this player right now.'
                : 'No one on your roster is eligible for this slot.'}
            </p>
          )}

          {options.map((opt) => {
            const p = opt.kind === 'player' ? opt.player : opt.occupant
            return (
              <button
                key={opt.key}
                type="button"
                disabled={isPending}
                onClick={() => onPick(opt)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-bg-primary/40 border border-text-primary/10 hover:bg-bg-card-hover hover:border-accent/40 transition-colors disabled:opacity-50"
              >
                <PositionBadge label={opt.kind === 'player' ? slotLabel(p.slot) : opt.label} />
                {p ? (
                  <Line
                    name={p.nfl_players?.full_name}
                    sub={playerSub(p)}
                    headshot={p.nfl_players?.headshot_url}
                    injury={p.nfl_players?.injury_status}
                    right={proj(p)}
                  />
                ) : (
                  // An empty destination. Dashed, matching the empty rows on
                  // My Team so the sheet reads as the same surface.
                  <div className="flex-1 border border-dashed border-text-primary/20 rounded-lg py-2 text-center text-sm text-text-muted">
                    Empty
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
