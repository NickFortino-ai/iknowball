import { useEffect } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { useRecordDetail } from '../../hooks/useRecords'
import LoadingSpinner from '../ui/LoadingSpinner'

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function StreakDetail({ picks, isActive, recordValue }) {
  return (
    <div className="space-y-4">
      {/* Status */}
      <div className={`text-sm font-medium px-3 py-2 rounded-lg ${
        isActive
          ? 'text-correct'
          : 'text-text-muted'
      }`}>
        {isActive
          ? `${recordValue} win streak is still active!`
          : 'Streak no longer active'}
      </div>

      {/* Picks list */}
      <div className="space-y-2">
        {picks.map((pick, i) => {
          const team = pick.picked_team === 'home' ? pick.games?.home_team : pick.games?.away_team
          const opponent = pick.picked_team === 'home' ? pick.games?.away_team : pick.games?.home_team

          return (
            <div key={pick.id} className="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-text-muted text-xs w-5 text-center shrink-0">{i + 1}</span>
                <div className="min-w-0">
                  <div className="text-text-primary font-medium truncate">{team}</div>
                  <div className="text-text-muted text-xs truncate">vs {opponent}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-text-muted text-xs">{pick.games?.starts_at ? formatDate(pick.games.starts_at) : ''}</span>
                {pick.points_earned != null && (
                  <span className="text-correct text-xs font-semibold">+{pick.points_earned}</span>
                )}
                <span className="text-correct">&#10003;</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ParlayStreakDetail({ parlays }) {
  return (
    <div className="space-y-2">
      {parlays.map((p, i) => (
        <div key={p.id} className="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-text-muted text-xs w-5 text-center shrink-0">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-text-primary font-medium">{p.leg_count}-leg parlay</div>
              <div className="text-text-muted text-xs">{formatDate(p.updated_at)}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-correct text-xs font-semibold">+{p.points_earned}</span>
            <span className="text-correct">&#10003;</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function SinglePickDetail({ pick }) {
  if (!pick) return null
  const team = pick.picked_team === 'home' ? pick.games?.home_team : pick.games?.away_team
  const opponent = pick.picked_team === 'home' ? pick.games?.away_team : pick.games?.home_team

  return (
    <div className="bg-bg-secondary rounded-lg px-4 py-3">
      <div className="text-text-primary font-semibold">{team}</div>
      <div className="text-text-muted text-xs mt-0.5">vs {opponent}</div>
      <div className="flex items-center gap-3 mt-2 text-sm">
        {pick.odds_at_pick != null && (
          <span className="text-yellow-500 font-bold">+{pick.odds_at_pick}</span>
        )}
        {pick.points_earned != null && (
          <span className="text-correct font-semibold">+{pick.points_earned} pts</span>
        )}
        <span className="text-text-muted text-xs">{pick.games?.starts_at ? formatDate(pick.games.starts_at) : ''}</span>
      </div>
    </div>
  )
}

function ParlayDetail({ parlay }) {
  if (!parlay) return null
  const legs = parlay.parlay_legs || []

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">{parlay.leg_count}-leg parlay</span>
        <span className="text-correct font-bold">+{parlay.points_earned} pts</span>
      </div>
      {legs.map((leg) => {
        const team = leg.picked_team === 'home' ? leg.games?.home_team : leg.games?.away_team
        return (
          <div key={leg.id} className="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2 text-sm">
            <span className="text-text-primary truncate">{team}</span>
            <span className="text-correct shrink-0">&#10003;</span>
          </div>
        )
      })}
      {parlay.combined_multiplier && (
        <div className="text-center text-xs text-yellow-500 font-bold mt-1">
          {parlay.combined_multiplier.toFixed(2)}x multiplier
        </div>
      )}
    </div>
  )
}

function FuturesDetail({ futuresPick }) {
  if (!futuresPick) return null
  const market = futuresPick.futures_markets

  return (
    <div className="bg-bg-secondary rounded-lg px-4 py-3">
      <div className="text-text-primary font-semibold">{futuresPick.selection}</div>
      <div className="text-text-muted text-xs mt-0.5">{market?.title || 'Futures'}</div>
      <div className="flex items-center gap-3 mt-2 text-sm">
        {futuresPick.odds_at_submission != null && (
          <span className="text-yellow-500 font-bold">+{futuresPick.odds_at_submission}</span>
        )}
        {futuresPick.points_earned != null && (
          <span className="text-correct font-semibold">+{futuresPick.points_earned} pts</span>
        )}
      </div>
    </div>
  )
}

function PropStreakDetail({ propPicks }) {
  return (
    <div className="space-y-2">
      {propPicks.map((p, i) => (
        <div key={p.id} className="flex items-center justify-between bg-bg-secondary rounded-lg px-3 py-2 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-text-muted text-xs w-5 text-center shrink-0">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-text-primary font-medium truncate">{p.player_name}</div>
              <div className="text-text-muted text-xs truncate">{p.market_label} {p.line}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {p.points_earned != null && (
              <span className="text-correct text-xs font-semibold">+{p.points_earned}</span>
            )}
            <span className="text-correct">&#10003;</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function StatsDetail({ metadata, recordKey }) {
  if (metadata.correct != null && metadata.total != null) {
    return (
      <div className="bg-bg-secondary rounded-lg px-4 py-3 text-center">
        <div className="text-2xl font-bold text-yellow-500">{metadata.correct}/{metadata.total}</div>
        <div className="text-text-muted text-xs mt-1">correct picks</div>
      </div>
    )
  }
  if (metadata.worstRank != null && metadata.bestRank != null) {
    return (
      <div className="bg-bg-secondary rounded-lg px-4 py-3 text-center">
        <div className="text-text-muted text-xs">Climbed from</div>
        <div className="text-xl font-bold text-text-primary">#{metadata.worstRank} → #{metadata.bestRank}</div>
      </div>
    )
  }
  if (metadata.scope) {
    return (
      <div className="bg-bg-secondary rounded-lg px-4 py-3 text-center">
        <div className="text-text-muted text-xs">Crown held for</div>
        <div className="text-xl font-bold text-yellow-500">{metadata.scope}</div>
      </div>
    )
  }
  return null
}

export default function RecordDetailModal({ recordHistoryId, onClose }) {
  const { data, isLoading } = useRecordDetail(recordHistoryId)

  useEffect(() => {
    if (!recordHistoryId) return
    lockScroll()
    return () => unlockScroll()
  }, [recordHistoryId])

  if (!recordHistoryId) return null

  const displayName = data?.record?.records?.display_name || 'Record'
  const newValue = data?.record?.new_value

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-primary border border-yellow-500/30 w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
        >
          &times;
        </button>

        {isLoading ? (
          <LoadingSpinner />
        ) : !data ? (
          <p className="text-text-muted text-center">Record not found</p>
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <span className="text-3xl">{'\uD83C\uDFC6'}</span>
              <div>
                <div className="font-bold text-yellow-500 text-xl">{displayName}</div>
                <div className="text-2xl font-bold text-text-primary">{newValue}</div>
              </div>
            </div>

            {/* Detail content based on type */}
            {data.type === 'streak' && data.detail && (
              <StreakDetail picks={data.detail.picks} isActive={data.detail.isActive} recordValue={newValue} />
            )}
            {data.type === 'parlay_streak' && data.detail && (
              <ParlayStreakDetail parlays={data.detail.parlays} />
            )}
            {data.type === 'prop_streak' && data.detail && (
              <PropStreakDetail propPicks={data.detail.propPicks} />
            )}
            {data.type === 'pick' && data.detail && (
              <SinglePickDetail pick={data.detail.pick} />
            )}
            {data.type === 'parlay' && data.detail && (
              <ParlayDetail parlay={data.detail.parlay} />
            )}
            {data.type === 'futures' && data.detail && (
              <FuturesDetail futuresPick={data.detail.futuresPick} />
            )}
            {data.type === 'stats' && (
              <StatsDetail metadata={data.record.metadata || {}} recordKey={data.record.record_key} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
