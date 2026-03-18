import OddsDisplay from './OddsDisplay'

const stateStyles = {
  default: 'bg-bg-card hover:bg-bg-card-hover border-border hover:border-border-hover',
  selected: 'bg-accent/20 border-accent',
  locked: 'bg-bg-primary border-border opacity-60 cursor-not-allowed',
  'locked-picked': 'bg-bg-primary border-accent/50 cursor-not-allowed',
  correct: 'bg-bg-primary border-correct',
  incorrect: 'bg-bg-primary border-incorrect',
}

export default function PickButton({ team, odds, score, isLive, state = 'default', onClick, disabled }) {
  const style = stateStyles[state] || stateStyles.default
  const hasResult = score != null

  // When showing scores (live/final), use dark background for all states
  const bgOverride = hasResult && state === 'default' ? 'bg-bg-primary border-border' : ''

  return (
    <button
      onClick={onClick}
      disabled={disabled || state === 'locked' || state === 'locked-picked' || state === 'correct' || state === 'incorrect'}
      className={`w-full min-w-0 p-4 rounded-xl border transition-all ${bgOverride || style} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className={`font-semibold text-xs sm:text-sm mb-1 truncate ${
        state === 'correct' ? 'text-correct'
        : state === 'incorrect' ? 'text-incorrect'
        : hasResult ? 'text-white'
        : 'text-text-primary'
      }`}>
        {team}
      </div>
      {score != null ? (
        <div className={`text-lg font-display ${
          isLive && (state === 'locked-picked') ? 'text-accent'
          : state === 'correct' ? 'text-correct'
          : state === 'incorrect' ? 'text-incorrect'
          : 'text-white'
        }`}>{score}</div>
      ) : (
        <OddsDisplay odds={odds} isSelected={state === 'selected'} />
      )}
    </button>
  )
}
