import { useMemo } from 'react'
import { useFuturesMarkets, useMyFuturesPicks, useSubmitFuturesPick } from '../../hooks/useFutures'
import FuturesMarketCard from './FuturesMarketCard'
import LoadingSpinner from '../ui/LoadingSpinner'
import EmptyState from '../ui/EmptyState'
import { toast } from '../ui/Toast'

export default function FuturesSection({ sportKey }) {
  const { data: markets, isLoading } = useFuturesMarkets(sportKey)
  const { data: myPicks } = useMyFuturesPicks()
  const submitPick = useSubmitFuturesPick()

  const picksMap = useMemo(() => {
    if (!myPicks) return {}
    const map = {}
    for (const pick of myPicks) {
      map[pick.market_id] = pick
    }
    return map
  }, [myPicks])

  async function handlePick(marketId, outcomeName) {
    if (!confirm(`Lock in "${outcomeName}"? This cannot be changed.`)) return
    try {
      await submitPick.mutateAsync({ marketId, pickedOutcome: outcomeName })
      toast('Futures pick locked in!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to submit futures pick', 'error')
    }
  }

  if (isLoading) return <LoadingSpinner />

  if (!markets?.length) {
    return <EmptyState title="No futures" message="No futures markets available for this sport yet. Check back later or try another sport." />
  }

  return (
    <div className="space-y-4">
      {markets.map((market) => (
        <FuturesMarketCard
          key={market.id}
          market={market}
          userPick={picksMap[market.id]}
          onPick={handlePick}
          isSubmitting={submitPick.isPending}
        />
      ))}
    </div>
  )
}
