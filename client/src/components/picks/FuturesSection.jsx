import { useState, useMemo } from 'react'
import { useFuturesMarkets, useMyFuturesPicks, useSubmitFuturesPick } from '../../hooks/useFutures'
import FuturesMarketCard from './FuturesMarketCard'
import LoadingSpinner from '../ui/LoadingSpinner'
import EmptyState from '../ui/EmptyState'
import { toast } from '../ui/Toast'

const SPORT_DISPLAY = {
  basketball_nba: 'NBA Champion',
  americanfootball_nfl: 'NFL Champion',
  baseball_mlb: 'MLB Champion',
  basketball_ncaab: 'NCAAB Champion',
  americanfootball_ncaaf: 'NCAAF Champion',
  basketball_wnba: 'WNBA Champion',
  icehockey_nhl: 'NHL Champion',
  golf: 'Golf',
  soccer: 'FIFA World Cup',
}

function sportLabel(key) {
  return SPORT_DISPLAY[key] || key
}

export default function FuturesSection() {
  const { data: markets, isLoading } = useFuturesMarkets()
  const { data: myPicks } = useMyFuturesPicks()
  const submitPick = useSubmitFuturesPick()
  const [expanded, setExpanded] = useState({})

  const picksMap = useMemo(() => {
    if (!myPicks) return {}
    const map = {}
    for (const pick of myPicks) {
      map[pick.market_id] = pick
    }
    return map
  }, [myPicks])

  // Locked picks on closed markets — the event is currently happening
  const livePicks = useMemo(() => {
    if (!myPicks) return []
    return myPicks.filter((p) => p.status === 'locked' && p.futures_markets?.status === 'closed')
  }, [myPicks])

  const grouped = useMemo(() => {
    if (!markets) return []
    const map = {}
    for (const m of markets) {
      if (!map[m.sport_key]) map[m.sport_key] = []
      map[m.sport_key].push(m)
    }
    // Sort by SPORT_DISPLAY order
    const order = Object.keys(SPORT_DISPLAY)
    return Object.entries(map).sort(
      ([a], [b]) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b))
    )
  }, [markets])

  async function handlePick(marketId, outcomeName) {
    if (!confirm(`Lock in "${outcomeName}"? This cannot be changed.`)) return
    try {
      await submitPick.mutateAsync({ marketId, pickedOutcome: outcomeName })
      toast('Futures pick locked in!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to submit futures pick', 'error')
    }
  }

  function toggle(sportKey) {
    setExpanded((prev) => ({ ...prev, [sportKey]: !prev[sportKey] }))
  }

  if (isLoading) return <LoadingSpinner />

  if (!grouped.length && !livePicks.length) {
    return <EmptyState title="No futures" message="No futures markets available yet. Check back later." />
  }

  return (
    <div className="space-y-3">
      {/* Live picks — user's locked picks on events currently in progress */}
      {livePicks.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display text-sm text-accent uppercase tracking-wider">Live</h3>
          {livePicks.map((pick) => {
            const market = pick.futures_markets
            return (
              <div key={pick.id} className="bg-bg-primary rounded-2xl border border-accent/40 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs text-accent font-semibold uppercase">In Progress</span>
                </div>
                <h4 className="font-display text-base text-text-primary mb-1">{market?.title || 'Futures Market'}</h4>
                <div className="flex items-center justify-between bg-accent/10 border border-accent/30 rounded-xl px-3 py-2.5 mt-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-sm text-accent truncate block">{pick.picked_outcome}</span>
                    <span className="text-[10px] text-text-muted uppercase tracking-wider">Your locked</span>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="text-base font-semibold">
                      <span className="text-incorrect">-{pick.risk_at_submission}</span>
                      <span className="text-text-muted mx-1">&rarr;</span>
                      <span className="text-correct">+{pick.reward_at_submission}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 text-sm text-text-secondary">
        <span className="font-semibold text-accent">Heads up:</span> Futures picks lock immediately and cannot be changed. You get one pick per market — choose wisely.
      </div>

      {grouped.map(([sportKey, sportMarkets]) => {
        const isOpen = !!expanded[sportKey]
        const hasPick = sportMarkets.some((m) => picksMap[m.id])
        return (
          <div key={sportKey} className="bg-bg-primary border border-text-primary/20 rounded-xl overflow-hidden">
            <button
              onClick={() => toggle(sportKey)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="font-display text-lg">{sportLabel(sportKey)}</span>
                {hasPick && (
                  <span className="w-2 h-2 rounded-full bg-accent" />
                )}
              </div>
              <svg
                className={`w-5 h-5 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 space-y-3">
                {sportMarkets.map((market) => (
                  <FuturesMarketCard
                    key={market.id}
                    market={market}
                    userPick={picksMap[market.id]}
                    onPick={handlePick}
                    isSubmitting={submitPick.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
