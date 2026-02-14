import { useState } from 'react'
import { useAdminPropsForGame, useSettleProps } from '../../hooks/useAdmin'
import { formatOdds } from '../../lib/scoring'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'

export default function PropSettlePanel({ game }) {
  const [settlements, setSettlements] = useState({})
  const { data: props, isLoading } = useAdminPropsForGame(game.id)
  const settleProps = useSettleProps()

  const settleableProps = (props || []).filter((p) => p.status === 'locked' || p.status === 'published')
  const settledProps = (props || []).filter((p) => p.status === 'settled')

  function setOutcome(propId, outcome) {
    setSettlements((prev) => ({
      ...prev,
      [propId]: { ...prev[propId], propId, outcome },
    }))
  }

  function setActualValue(propId, value) {
    setSettlements((prev) => ({
      ...prev,
      [propId]: { ...prev[propId], propId, actualValue: value === '' ? null : Number(value) },
    }))
  }

  async function handleSettle() {
    const toSettle = Object.values(settlements).filter((s) => s.outcome)
    if (!toSettle.length) {
      toast('Select outcomes for props to settle', 'error')
      return
    }
    try {
      const results = await settleProps.mutateAsync(toSettle)
      const totalScored = results.reduce((sum, r) => sum + r.scored, 0)
      setSettlements({})
      toast(`Settled ${toSettle.length} props, scored ${totalScored} picks`, 'success')
    } catch (err) {
      toast(err.message || 'Settlement failed', 'error')
    }
  }

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      {/* Props to settle */}
      {settleableProps.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Settle Props ({settleableProps.length})</h3>
            <button
              onClick={handleSettle}
              disabled={settleProps.isPending || !Object.values(settlements).some((s) => s.outcome)}
              className="bg-accent hover:bg-accent-hover text-white px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              {settleProps.isPending ? 'Settling...' : 'Settle Selected'}
            </button>
          </div>
          <div className="space-y-3">
            {settleableProps.map((prop) => {
              const settlement = settlements[prop.id] || {}
              return (
                <div key={prop.id} className="p-3 rounded-lg bg-bg-secondary">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium">{prop.player_name}</div>
                      <div className="text-xs text-text-muted">
                        {prop.market_label} — Line {prop.line}
                        <span className="ml-2">
                          O {prop.over_odds ? formatOdds(prop.over_odds) : '—'} / U {prop.under_odds ? formatOdds(prop.under_odds) : '—'}
                        </span>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${prop.status === 'locked' ? 'bg-accent/20 text-accent' : 'bg-correct/20 text-correct'}`}>
                      {prop.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {['over', 'under', 'push'].map((outcome) => (
                        <button
                          key={outcome}
                          onClick={() => setOutcome(prop.id, outcome)}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            settlement.outcome === outcome
                              ? outcome === 'over'
                                ? 'bg-correct text-white'
                                : outcome === 'under'
                                  ? 'bg-incorrect text-white'
                                  : 'bg-text-muted text-white'
                              : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
                          }`}
                        >
                          {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="Actual"
                      value={settlement.actualValue ?? ''}
                      onChange={(e) => setActualValue(prop.id, e.target.value)}
                      className="w-20 px-2 py-1 rounded text-xs bg-bg-card border border-border text-text-primary"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Already settled */}
      {settledProps.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border p-4">
          <h3 className="font-semibold text-sm mb-3 text-text-muted">Settled ({settledProps.length})</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {settledProps.map((prop) => (
              <div key={prop.id} className="flex items-center gap-3 p-2 rounded-lg opacity-70">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{prop.player_name}</div>
                  <div className="text-xs text-text-muted">
                    {prop.market_label} — Line {prop.line}
                    {prop.actual_value !== null && prop.actual_value !== undefined && (
                      <span className="ml-1">({prop.actual_value})</span>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-semibold ${
                  prop.outcome === 'over' ? 'text-correct' : prop.outcome === 'under' ? 'text-incorrect' : 'text-text-muted'
                }`}>
                  {prop.outcome?.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!settleableProps.length && !settledProps.length && (
        <div className="text-center text-text-muted text-sm py-8">
          No props to settle for this game. Sync and publish props first.
        </div>
      )}
    </div>
  )
}
