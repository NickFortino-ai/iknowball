import OddsDisplay from './OddsDisplay'

const stateStyles = {
  default: 'bg-bg-card hover:bg-bg-card-hover border-border hover:border-border-hover',
  selected: 'bg-accent/20 border-accent',
  locked: 'bg-bg-card border-border opacity-60 cursor-not-allowed',
  correct: 'bg-correct-muted border-correct',
  incorrect: 'bg-incorrect-muted border-incorrect',
}

export default function PickButton({ team, odds, score, state = 'default', onClick, disabled }) {
  const style = stateStyles[state] || stateStyles.default

  return (
    <button
      onClick={onClick}
      disabled={disabled || state === 'locked' || state === 'correct' || state === 'incorrect'}
      className={`flex-1 min-w-0 p-4 rounded-xl border transition-all ${style} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className={`font-semibold text-xs sm:text-sm mb-1 truncate ${state === 'correct' ? 'text-correct' : state === 'incorrect' ? 'text-incorrect' : 'text-text-primary'}`}>
        {team}
      </div>
      {score != null ? (
        <div className="text-lg font-display text-text-primary">{score}</div>
      ) : (
        <OddsDisplay odds={odds} isSelected={state === 'selected'} />
      )}
    </button>
  )
}
