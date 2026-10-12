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
 * The slider sets WHERE the threshold is; over/under decides which way you
 * are betting it. Both are needed: a slider alone can only say "how far
 * over", and someone who thinks a player is going to be quiet has no way to
 * say so.
 *
 * Because under is the complement, the slider means opposite things on each
 * side — dragging down is the safe end for over and the long shot for under.
 * That is why both prices sit on the buttons and move as you drag.
 *
 * Dragging never commits. A slider is an exploratory control — people move it
 * to see what the numbers do — so letting go must be free, and a stray
 * scroll-drag on a phone must not place a bet on something with no undo once
 * the game starts. Confirming is a separate, deliberate tap.
 */
function abbreviateTeam(name) {
  return getTeamAbbr(name) || name
}

// "12" not "12.0", "12.5" not "12.50" — these are gaps to a half-point line,
// so one decimal is the most that can ever be meaningful.
function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export default function PropSliderCard({
  prop,
  picks = [],
  onPickLine,
  onUndoPick,
  isSubmitting,
  sportKey = 'americanfootball_nfl',
}) {
  const slider = prop.slider
  const stops = slider?.stops || []

  // Every bet held on this prop, newest line first. The card is the PLAYER;
  // these are your positions on them.
  const held = useMemo(
    () => [...picks].sort((a, b) => Number(a.chosen_line ?? 0) - Number(b.chosen_line ?? 0)),
    [picks],
  )
  const settled = held.find((p) => p.status === 'settled')
  const anyLocked = held.some((p) => p.status === 'locked')

  const [index, setIndex] = useState(() => {
    const first = picks[0]
    if (first?.chosen_line != null) {
      const i = stops.findIndex((s) => Number(s.line) === Number(first.chosen_line))
      if (i >= 0) return i
    }
    return slider?.defaultIndex >= 0 ? slider.defaultIndex : Math.floor(stops.length / 2)
  })
  const [showPlayerModal, setShowPlayerModal] = useState(false)
  const { data: playerLookup } = useNbaDfsPlayerLookup(showPlayerModal ? prop.player_name : null, sportKey)

  const current = stops[index] || stops[slider?.defaultIndex] || null
  const isSettled = !!settled
  const canPick = prop.status === 'published' && !anyLocked && !isSettled

  // Has the player moved off the book's number?
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

  const rewardFor = (s) => (s === 'under' ? current.under : current.over)
  // Does the user already hold this exact side at this exact line? That
  // combination is an edit rather than a new bet, so its button says so and
  // does nothing.
  const holds = (side) => held.some(
    (p) => p.picked_side === side && Number(p.chosen_line) === Number(current.line),
  )
  const resultTone = settled
    ? (settled.is_correct == null ? 'push' : settled.is_correct ? 'correct' : 'incorrect')
    : null

  return (
    <div
      className={`bg-bg-primary/50 backdrop-blur-sm rounded-2xl border p-4 ${
        resultTone === 'correct' ? 'border-correct'
        : resultTone === 'incorrect' ? 'border-incorrect'
        : resultTone === 'push' ? 'border-yellow-500/60'
        : held.length ? 'border-accent' : 'border-text-primary/20'
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

        {/* The number the slider moves, so it is the biggest thing here. No
            side prefix: both are on offer and several may already be held,
            so naming one would describe a bet rather than the control. */}
        <div className="mt-2">
          <span className="font-display text-4xl tabular-nums text-text-primary">{current.line}</span>
        </div>
        <div className="text-xs text-text-muted uppercase tracking-wider">{prop.market_label}</div>

        {isSettled && (
          <div className={`mt-2 text-xs font-semibold ${
            resultTone === 'correct' ? 'text-correct' : resultTone === 'incorrect' ? 'text-incorrect' : 'text-yellow-500'
          }`}>
            {prop.actual_value != null ? `Actual ${prop.actual_value}` : 'Push — did not play · stake returned'}
          </div>
        )}
      </div>

      {canPick && (
        <div className="mt-4">
          {/* Both sides, each carrying its own price. Under on the left and
              over on the right, matching the slider underneath: low numbers
              are to the left, and under is the bet that wants them.

              The card stays LIVE even once you hold bets on it, because a
              tap now ADDS a position rather than altering one — and a side
              you already hold at this line is disabled, so a stray tap on a
              line you have is a no-op rather than a duplicate. */}
          <div className="flex gap-2">
            {['under', 'over'].map((sideKey) => {
              const already = holds(sideKey)
              return (
                <button
                  key={sideKey}
                  onClick={() => onPickLine?.(prop.id, current.line, sideKey)}
                  disabled={isSubmitting || already}
                  className={`flex-1 min-w-0 rounded-xl py-2.5 px-2 text-sm font-semibold disabled:opacity-60 ${
                    already ? 'bg-accent text-white' : 'border border-accent/60 text-accent hover:bg-accent/10'
                  }`}
                >
                  <span className="block truncate capitalize">
                    {already ? 'Picked ' : ''}{sideKey} {current.line}
                  </span>
                  <span className="block leading-tight">
                    <span className="text-sm font-normal tabular-nums opacity-60">{slider.risk}</span>
                    <span className="text-sm font-normal opacity-60 mx-1">→</span>
                    <span className="text-xl font-bold tabular-nums">{rewardFor(sideKey)}</span>
                  </span>
                </button>
              )
            })}
          </div>

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
            <div className="flex items-center justify-between text-[10px] text-text-muted -mt-1">
              <span>{stops[0].line}</span>
              {movedOffDefault && (
                <button
                  onClick={() => setIndex(slider.defaultIndex)}
                  disabled={isSubmitting}
                  className="text-text-muted hover:text-text-primary underline underline-offset-2"
                >
                  back to {slider.baseLine}
                </button>
              )}
              <span>{stops[stops.length - 1].line}</span>
            </div>
          </div>
        </div>
      )}

      {/* The bets you are holding on this player. Each is its own position
          with its own price and its own remove — which is the whole point of
          letting a prop carry more than one. Tapping a row puts the slider
          back on that line. */}
      {held.length > 0 && (
        <div className="mt-4 border-t border-text-primary/10 pt-3">
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
            {held.length === 1 ? 'Your prediction' : `Your ${held.length} predictions`}
          </div>
          <div className="space-y-1">
            {held.map((p) => {
              const lineOf = p.chosen_line ?? prop.line
              const tone = p.status === 'settled'
                ? (p.is_correct == null ? 'text-yellow-500' : p.is_correct ? 'text-correct' : 'text-incorrect')
                : 'text-text-primary'
              return (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <button
                    onClick={() => {
                      const i = stops.findIndex((st) => Number(st.line) === Number(lineOf))
                      if (i >= 0) setIndex(i)
                    }}
                    className={`flex-1 min-w-0 text-left capitalize ${tone}`}
                  >
                    {p.picked_side} {lineOf}
                  </button>
                  {/* Live progress against THIS bet's line, not the book's. */}
                  {p.live_stat != null && (
                    <span className={`text-xs tabular-nums ${
                      Number(p.live_stat) > Number(lineOf) ? 'text-correct' : 'text-text-muted'
                    }`}>
                      {p.live_stat}
                    </span>
                  )}
                  <span className="text-xs tabular-nums text-text-muted shrink-0">
                    {p.risk_at_submission} → {p.reward_at_submission}
                  </span>
                  {p.status === 'pending' && (
                    <button
                      onClick={() => onUndoPick?.(prop.id, p.id)}
                      disabled={isSubmitting}
                      aria-label={`Remove ${p.picked_side} ${lineOf}`}
                      className="shrink-0 px-1 text-text-muted hover:text-incorrect"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {anyLocked && !isSettled && (
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
