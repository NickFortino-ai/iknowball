import { useMemo } from 'react'
import { getTeamAbbr } from '../../lib/teamLogos'

/**
 * Several bets on one player, shown as a ladder.
 *
 * A prop can carry more than one position now — over 200, 210, 220, 230, 240
 * on the same quarterback — and rendering those as five separate cards
 * repeats the player's face, name and market five times to communicate one
 * differing number each.
 *
 * As a ladder it says the thing the bets were FOR. He throws for 225 and the
 * rungs below it are green, the ones above are red, and the actual value
 * sits in the list at the height it landed — so the cut line is visible
 * rather than inferred by reading five outcomes in turn.
 *
 * Sorted ascending so the ladder runs the same way the slider does: low at
 * the bottom, high at the top, like a bar you are clearing.
 */
function abbreviateTeam(name) {
  return getTeamAbbr(name) || name
}

function fmt(n) {
  const v = Number(n)
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

export default function PropLadderCard({ picks }) {
  const first = picks[0]
  const prop = first?.player_props || {}
  const game = prop.games || {}

  // Highest line at the top. A ladder you clear reads upward, and it puts the
  // long shots where they feel like long shots.
  const rungs = useMemo(
    () => [...picks].sort((a, b) => Number(b.chosen_line ?? b.player_props?.line ?? 0)
                                  - Number(a.chosen_line ?? a.player_props?.line ?? 0)),
    [picks],
  )

  // What the player actually did: the settled figure once it exists, the
  // live one while the game is on.
  const actual = prop.actual_value ?? picks.find((p) => p.live_stat != null)?.live_stat ?? null
  const isFinal = prop.actual_value != null
  const settledCount = picks.filter((p) => p.status === 'settled').length
  const netPoints = picks.reduce((a, p) => a + (p.points_earned || 0), 0)

  if (!first) return null

  // Where the actual value slots into the ladder — drawn between the rungs it
  // falls between, which is what makes the cut visible.
  const actualAbove = (line) => actual != null && Number(actual) > Number(line)

  return (
    <div className={`rounded-2xl border overflow-hidden ${
      settledCount === picks.length
        ? (netPoints > 0 ? 'border-correct' : netPoints < 0 ? 'border-incorrect' : 'border-yellow-500/60')
        : 'border-accent'
    }`}>
      <div className="flex items-center gap-3 p-4 pb-3">
        {prop.player_headshot_url ? (
          <img src={prop.player_headshot_url} alt="" className="w-14 h-14 rounded-full object-cover bg-bg-secondary shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-bg-secondary shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-text-primary truncate">{prop.player_name}</div>
          <div className="text-xs text-text-muted uppercase tracking-wider">{prop.market_label}</div>
          {game.away_team && (
            <div className="text-[11px] text-text-muted truncate">
              {abbreviateTeam(game.away_team)} @ {abbreviateTeam(game.home_team)}
            </div>
          )}
        </div>
        {actual != null && (
          <div className="text-right shrink-0">
            <div className="font-display text-3xl tabular-nums text-text-primary leading-none">{fmt(actual)}</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">
              {isFinal ? 'final' : 'live'}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-4 space-y-1">
        {rungs.map((p, i) => {
          const line = p.chosen_line ?? p.player_props?.line
          const won = p.status === 'settled'
            ? p.is_correct
            // Not settled: show where it stands, which is only knowable once
            // there is a figure to compare against.
            : actual == null ? null
            : p.picked_side === 'under' ? Number(actual) < Number(line) : Number(actual) > Number(line)
          const tone = won === true ? 'text-correct' : won === false ? 'text-incorrect' : 'text-text-secondary'

          // The actual value drops in between the rungs it sits between, so
          // the boundary between green and red is a line on the card.
          const prev = rungs[i - 1]
          const showMarker = actual != null && actualAbove(line)
            && (!prev || !actualAbove(prev.chosen_line ?? prev.player_props?.line))

          return (
            <div key={p.id}>
              {showMarker && (
                <div className="flex items-center gap-2 py-1" aria-hidden="true">
                  <div className="h-px flex-1 bg-accent/60" />
                  <span className="text-[10px] font-semibold text-accent tabular-nums">{fmt(actual)}</span>
                  <div className="h-px flex-1 bg-accent/60" />
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <span className={`w-4 shrink-0 ${tone}`}>
                  {won === true ? '✓' : won === false ? '✗' : '·'}
                </span>
                <span className={`flex-1 min-w-0 capitalize truncate ${tone}`}>
                  {p.picked_side} {fmt(line)}
                </span>
                <span className="text-xs tabular-nums text-text-muted shrink-0">
                  {p.risk_at_submission} → {p.reward_at_submission}
                </span>
                {p.status === 'settled' && (
                  <span className={`w-12 text-right text-sm font-semibold tabular-nums shrink-0 ${
                    p.points_earned > 0 ? 'text-correct' : p.points_earned < 0 ? 'text-incorrect' : 'text-text-muted'
                  }`}>
                    {p.points_earned > 0 ? '+' : ''}{p.points_earned}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {/* The actual value can land below every rung, in which case the
            marker above never fires and the card would say nothing about why
            they all lost. */}
        {actual != null && !rungs.some((p) => actualAbove(p.chosen_line ?? p.player_props?.line)) && (
          <div className="flex items-center gap-2 pt-1" aria-hidden="true">
            <div className="h-px flex-1 bg-accent/60" />
            <span className="text-[10px] font-semibold text-accent tabular-nums">{fmt(actual)}</span>
            <div className="h-px flex-1 bg-accent/60" />
          </div>
        )}

        {settledCount === picks.length && picks.length > 1 && (
          <div className="flex justify-between border-t border-text-primary/10 pt-2 mt-2 text-sm">
            <span className="text-text-secondary">{picks.length} predictions</span>
            <span className={`font-semibold tabular-nums ${
              netPoints > 0 ? 'text-correct' : netPoints < 0 ? 'text-incorrect' : 'text-text-muted'
            }`}>
              {netPoints > 0 ? '+' : ''}{netPoints} net
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
