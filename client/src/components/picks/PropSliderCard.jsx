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
  // Which way you're betting the threshold. The slider says WHERE the line
  // is; this says which side of it you want — and because under is the
  // complement, the same stop pays opposite amounts on each side.
  const [side, setSide] = useState(() => (pick?.picked_side === 'under' ? 'under' : 'over'))
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
  const rewardFor = (s) => (s === 'under' ? current.under : current.over)
  // Once a pick exists the card describes THAT bet, not whatever the
  // controls happen to be set to.
  const shownSide = pickedLine != null ? (pick.picked_side || side) : side
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
          {/* Only once a side is actually chosen. While both are on offer,
              prefixing the number with "Over" picks a winner on the user's
              behalf — and the two buttons below name the sides anyway. */}
          {pickedLine != null && (
            <span className="text-text-muted text-sm capitalize">{shownSide}</span>
          )}
          <span className="font-display text-4xl tabular-nums text-text-primary">
            {isSettled || isLockedPick ? (pickedLine ?? current.line) : current.line}
          </span>
        </div>
        {/* The stake is the same 10 on every slider prop and on both sides,
            so it is stated once here rather than repeated on each button —
            which is also what lets the buttons carry only their own payout. */}
        <div className="text-xs text-text-muted uppercase tracking-wider">
          {prop.market_label}{canPick ? ` · risk ${slider.risk}` : ''}
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
          {/* Both sides, each carrying its own price, so the trade-off is
              visible without committing to see it. Under on the left and
              over on the right, matching the slider underneath: low numbers
              are to the left, and under is the bet that wants them.

              Tapping one places that bet. That is still an explicit,
              labelled commitment — the principle was that DRAGGING must not
              commit, not that a button press needs confirming twice. */}
          <div className="flex gap-2">
            {['under', 'over'].map((sideKey) => {
              const isThis = pickedLine === current.line && pick?.picked_side === sideKey
              return (
                <button
                  key={sideKey}
                  onPointerEnter={() => setSide(sideKey)}
                  onFocus={() => setSide(sideKey)}
                  onClick={() => { setSide(sideKey); onPickLine?.(prop.id, current.line, sideKey) }}
                  disabled={isSubmitting || isThis}
                  className={`flex-1 min-w-0 rounded-xl py-2.5 px-2 text-sm font-semibold disabled:opacity-60 ${
                    isThis
                      ? 'bg-accent text-white'
                      : 'border border-accent/60 text-accent hover:bg-accent/10'
                  }`}
                >
                  <span className="block truncate capitalize">
                    {isThis ? 'Picked ' : ''}{sideKey} {current.line}
                  </span>
                  {!isThis && (
                    <span className="block text-[11px] font-normal opacity-80">
                      win {rewardFor(sideKey)}
                    </span>
                  )}
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
            {/* Just the bounds. "Safer" was an over-only idea — with both
                sides on the table each end is the safe one for somebody, and
                the buttons above carry the actual prices. */}
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

      {/* Live progress, measured against the USER's line rather than the
          book's — the whole point of having chosen one. The old card shows a
          bare number; here the number alone would be unreadable, because the
          threshold it's being judged against isn't the one printed on the
          prop. */}
      {isLockedPick && (
        <div className="mt-3 pt-3 border-t border-text-primary/10 text-center">
          {pick.live_stat != null ? (
            <>
              <span className={`font-display text-2xl tabular-nums ${
                Number(pick.live_stat) > Number(pickedLine) ? 'text-correct' : 'text-text-primary'
              }`}>
                {pick.live_stat}
              </span>
              <span className="text-xs text-text-muted ml-1.5">{prop.market_label}</span>
              <div className="text-xs text-text-muted mt-0.5">
                {Number(pick.live_stat) > Number(pickedLine)
                  ? `past ${pickedLine} — winning`
                  : `needs ${fmt(Number(pickedLine) - Number(pick.live_stat))} more`}
              </div>
            </>
          ) : (
            <span className="text-xs text-text-muted">Locked at {pickedLine} · wins {pick.reward_at_submission ?? '—'}</span>
          )}
        </div>
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
