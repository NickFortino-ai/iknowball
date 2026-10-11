import { useState, useMemo } from 'react'
import { useNbaDfsPlayerLookup } from '../../hooks/useLeagues'
import PlayerDetailModal from '../ui/PlayerDetailModal'
import { getTeamAbbr } from '../../lib/teamLogos'

/**
 * A prop you set the line on.
 *
 * Centred layout because the slider is the point: headshot, name, the line
 * you're choosing, what it pays, then the control. The old side-by-side
 * over/under card put two equal choices next to each other — here there is
 * one choice on a continuum, and centring it says so.
 *
 * The slider REPLACES over/under. You pick a threshold you think the player
 * beats; sliding down is an easier bar for less, sliding up is a harder bar
 * for more.
 *
 * Dragging never commits. A slider is an exploratory control — people move it
 * to see what the numbers do — so letting go must be free, and a stray
 * scroll-drag on a phone must not place a bet on something with no undo once
 * the game starts. Confirming is a separate, deliberate tap.
 */
function abbreviateTeam(name) {
  return getTeamAbbr(name) || name
}

export default function PropSliderCard({
  prop,
  pick,
  onPickLine,
  onUndoPick,
  isSubmitting,
  sportKey = 'americanfootball_nfl',
}) {
  const slider = prop.slider
  const stops = slider?.stops || []

  const [index, setIndex] = useState(() => {
    // An existing pick reopens on the line it was made at, not the default —
    // otherwise revisiting your own card silently shows someone else's bet.
    if (pick?.chosen_line != null) {
      const i = stops.findIndex((s) => Number(s.line) === Number(pick.chosen_line))
      if (i >= 0) return i
    }
    return slider?.defaultIndex >= 0 ? slider.defaultIndex : Math.floor(stops.length / 2)
  })
  const [showPlayerModal, setShowPlayerModal] = useState(false)
  const { data: playerLookup } = useNbaDfsPlayerLookup(showPlayerModal ? prop.player_name : null, sportKey)

  const current = stops[index] || stops[slider?.defaultIndex] || null
  const isPicked = !!pick && pick.status !== 'settled'
  const isLockedPick = pick?.status === 'locked'
  const isSettled = pick?.status === 'settled'
  const canPick = prop.status === 'published' && !isLockedPick && !isSettled

  // Has the player moved off the book's number? Used for the reset affordance
  // and to word the confirm button.
  const movedOffDefault = slider && index !== slider.defaultIndex

  const kickoffLabel = useMemo(() => {
    const iso = prop.games?.starts_at
    if (!iso) return null
    const PT = { timeZone: 'America/Los_Angeles' }
    const day = new Date(iso).toLocaleDateString('en-CA', PT)
    const today = new Date().toLocaleDateString('en-CA', PT)
    if (day === today) return null
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', ...PT })
  }, [prop.games?.starts_at])

  if (!current) return null

  const pickedLine = pick?.chosen_line != null ? Number(pick.chosen_line) : null
  const resultTone = isSettled
    ? (pick.is_correct == null ? 'push' : pick.is_correct ? 'correct' : 'incorrect')
    : null

  return (
    <div
      className={`bg-bg-primary/50 backdrop-blur-sm rounded-2xl border p-4 ${
        resultTone === 'correct' ? 'border-correct'
        : resultTone === 'incorrect' ? 'border-incorrect'
        : resultTone === 'push' ? 'border-yellow-500/60'
        : isPicked ? 'border-accent' : 'border-text-primary/20'
      }`}
    >
      {/* Matchup sits top-right, out of the centred column */}
      {prop.games && (
        <div className="flex justify-end -mt-1 -mr-1">
          <div className="text-right whitespace-nowrap">
            <div className="text-xs text-text-muted">
              {abbreviateTeam(prop.games.away_team)} @ {abbreviateTeam(prop.games.home_team)}
            </div>
            {kickoffLabel && <div className="text-[10px] text-text-muted">{kickoffLabel}</div>}
            {prop.games.status === 'final' && (
              <div className="text-[10px] text-text-muted font-semibold">Final</div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col items-center text-center -mt-2">
        {prop.player_headshot_url ? (
          <button onClick={() => setShowPlayerModal(true)} className="shrink-0">
            <img
              src={prop.player_headshot_url}
              alt={prop.player_name}
              className="w-20 h-20 rounded-full object-cover bg-bg-secondary"
            />
          </button>
        ) : (
          <div className="w-20 h-20 rounded-full bg-bg-secondary flex items-center justify-center text-text-muted font-bold text-lg">
            {(prop.player_name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
          </div>
        )}

        <div className="mt-2 font-semibold text-text-primary">{prop.player_name}</div>

        {/* The line being chosen, large, with the market under it. This is the
            number the slider moves, so it is the biggest thing on the card. */}
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-text-muted text-sm">Over</span>
          <span className="font-display text-4xl tabular-nums text-text-primary">
            {isSettled || isLockedPick ? (pickedLine ?? current.line) : current.line}
          </span>
        </div>
        <div className="text-xs text-text-muted uppercase tracking-wider">{prop.market_label}</div>

        {/* Risk/reward moves with the slider. Shown as the two numbers that
            actually matter rather than as odds — the book's price is already
            baked into where the stops sit. */}
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-incorrect tabular-nums">−{slider.risk}</span>
          <span className="text-text-muted">→</span>
          <span className="text-correct tabular-nums font-semibold">
            +{isSettled || isLockedPick
              ? (stops.find((s) => Number(s.line) === pickedLine)?.reward ?? pick?.reward_at_submission ?? current.reward)
              : current.reward}
          </span>
        </div>

        {isSettled && (
          <div className={`mt-2 text-xs font-semibold ${
            resultTone === 'correct' ? 'text-correct' : resultTone === 'incorrect' ? 'text-incorrect' : 'text-yellow-500'
          }`}>
            {prop.actual_value != null
              ? `Actual ${prop.actual_value} · ${resultTone === 'push' ? 'Push' : resultTone === 'correct' ? `+${pick.points_earned}` : pick.points_earned}`
              : 'Push — did not play'}
          </div>
        )}
      </div>

      {canPick && (
        <div className="mt-4">
          <input
            type="range"
            min={0}
            max={stops.length - 1}
            step={1}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            disabled={isSubmitting}
            className="w-full accent-accent"
            aria-label={`Line for ${prop.player_name} ${prop.market_label}`}
          />
          {/* Ends labelled so the trade-off is legible without dragging. */}
          <div className="flex justify-between text-[10px] text-text-muted -mt-1">
            <span>{stops[0].line} · safer (+{stops[0].reward})</span>
            <span>{stops[stops.length - 1].line} · +{stops[stops.length - 1].reward}</span>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onPickLine?.(prop.id, current.line)}
              disabled={isSubmitting || (pickedLine != null && pickedLine === current.line)}
              className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pickedLine != null && pickedLine === current.line
                ? `Picked over ${current.line}`
                : pickedLine != null
                ? `Change to over ${current.line}`
                : `Pick over ${current.line} · win ${current.reward}`}
            </button>
            {movedOffDefault && (
              <button
                onClick={() => setIndex(slider.defaultIndex)}
                disabled={isSubmitting}
                title="Back to the book's line"
                className="rounded-xl border border-text-primary/20 px-3 text-xs font-semibold text-text-secondary"
              >
                Reset
              </button>
            )}
          </div>

          {pickedLine != null && (
            <button
              onClick={() => onUndoPick?.(prop.id)}
              disabled={isSubmitting}
              className="mt-2 w-full text-xs text-text-muted hover:text-incorrect"
            >
              Remove pick
            </button>
          )}
        </div>
      )}

      {isLockedPick && (
        <div className="mt-3 text-center text-xs text-text-muted">Locked at kickoff</div>
      )}

      {showPlayerModal && playerLookup && (
        <PlayerDetailModal
          player={playerLookup}
          onClose={() => setShowPlayerModal(false)}
          sport={prop.games?.sports?.key || sportKey}
        />
      )}
    </div>
  )
}
