import { useEffect } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { useInjuryDetail } from '../../hooks/useInjuries'
import LoadingSpinner from '../ui/LoadingSpinner'

const STATUS_STYLES = {
  Out: 'text-incorrect',
  Doubtful: 'text-orange-400',
  Questionable: 'text-yellow-400',
  Probable: 'text-text-muted',
  'Day-To-Day': 'text-text-muted',
}

const STATUS_LABELS = {
  Out: 'Out',
  Doubtful: 'Doubt',
  Questionable: 'Ques',
  Probable: 'Prob',
  'Day-To-Day': 'DTD',
}

const BORDER_COLORS = {
  Out: 'border-incorrect',
  Doubtful: 'border-orange-400',
  Questionable: 'border-yellow-400',
  Probable: 'border-text-muted',
  'Day-To-Day': 'border-text-muted',
}

function TeamSection({ teamName, starters, injuries }) {
  const hasStarters = starters?.length > 0
  const hasInjuries = injuries?.length > 0

  return (
    <div className="min-w-0">
      <h3 className="font-display text-base mb-3 truncate">{teamName}</h3>

      {hasStarters && (
        <div className="mb-4">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Starting 5</div>
          <div className="space-y-1.5">
            {starters.map((s) => (
              <div key={s.position} className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-accent w-7 shrink-0">{s.position}</span>
                <span className="text-text-primary truncate">{s.shortName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Injuries</div>
        {hasInjuries ? (
          <div className="space-y-1.5">
            {injuries.map((inj) => (
              <div
                key={inj.name}
                className={`border-l-2 ${BORDER_COLORS[inj.status] || 'border-text-muted'} pl-2 py-0.5`}
              >
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-text-muted text-xs w-6 shrink-0">{inj.position}</span>
                  <span className="text-text-primary truncate">{inj.shortName}</span>
                  <span className={`text-xs font-semibold shrink-0 ${STATUS_STYLES[inj.status] || 'text-text-muted'}`}>
                    {STATUS_LABELS[inj.status] || inj.status}
                  </span>
                </div>
                {inj.detail && (
                  <div className="text-xs text-text-muted ml-[1.875rem] truncate">{inj.detail}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-correct">No injuries reported</p>
        )}
      </div>
    </div>
  )
}

export default function InjuryReportModal({ gameId, onClose }) {
  const { data, isLoading } = useInjuryDetail(gameId)

  useEffect(() => {
    if (!gameId) return
    lockScroll()
    return () => unlockScroll()
  }, [gameId])

  if (!gameId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-card border border-border w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 max-h-[90vh] md:max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
        >
          &times;
        </button>

        <h2 className="font-display text-lg mb-4">Game Intel</h2>

        {isLoading ? (
          <LoadingSpinner />
        ) : !data ? (
          <p className="text-text-muted text-center">No data available</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TeamSection
              teamName={data.away_team}
              starters={data.away?.starters}
              injuries={data.away?.injuries}
            />
            <TeamSection
              teamName={data.home_team}
              starters={data.home?.starters}
              injuries={data.home?.injuries}
            />
          </div>
        )}
      </div>
    </div>
  )
}
