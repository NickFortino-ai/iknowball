import { useMemo, useState } from 'react'
import { useFeaturedProps, useMyPropPicks, useSubmitPropPick, useDeletePropPick } from '../../hooks/useProps'
import PropCard from './PropCard'
import { toast } from '../ui/Toast'
import { triggerHaptic } from '../../lib/haptics'

export default function FeaturedPropSection({ date, sportKey, fallback = false, defaultExpanded = false }) {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const { data: props, isLoading } = useFeaturedProps(dateStr, { fallback })
  const { data: myPropPicks } = useMyPropPicks()
  const submitPick = useSubmitPropPick()
  const deletePick = useDeletePropPick()
  const [expanded, setExpanded] = useState(defaultExpanded)

  const activeProps = useMemo(() => {
    if (!props?.length) return []
    return props.filter((p) => {
      if (p.status === 'settled') return false
      if (sportKey && p.games?.sports?.key !== sportKey) return false
      return true
    })
  }, [props, sportKey])

  if (isLoading || !activeProps.length) return null

  function getPick(propId) {
    if (!myPropPicks) return null
    return myPropPicks.find((p) => p.prop_id === propId) || null
  }

  async function handlePick(propId, side) {
    try {
      await submitPick.mutateAsync({ propId, pickedSide: side })
      triggerHaptic('Light')
      toast('Prop pick submitted!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to submit prop pick', 'error')
    }
  }

  async function handleUndoPick(propId) {
    try {
      await deletePick.mutateAsync(propId)
      toast('Prop pick removed', 'info')
    } catch (err) {
      toast(err.message || 'Failed to undo prop pick', 'error')
    }
  }

  // Single prop: show inline, no collapse
  if (activeProps.length === 1) {
    return (
      <div data-onboarding="featured-prop" className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <h2 className="font-display text-lg">Daily Featured Player Prop</h2>
        </div>
        <PropCard
          prop={activeProps[0]}
          pick={getPick(activeProps[0].id)}
          onPick={handlePick}
          onUndoPick={handleUndoPick}
          isSubmitting={submitPick.isPending || deletePick.isPending}
          compact
        />
      </div>
    )
  }

  // Multiple props: collapsible
  return (
    <div data-onboarding="featured-prop" className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full bg-bg-primary/30 backdrop-blur-sm rounded-xl border border-text-primary/20 px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="font-display text-base text-text-primary">
            {activeProps.length} Featured Player Props
          </span>
        </div>
        <svg className={`w-4 h-4 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="space-y-3 mt-3">
          {activeProps.map((prop) => (
            <PropCard
              key={prop.id}
              prop={prop}
              pick={getPick(prop.id)}
              onPick={handlePick}
              onUndoPick={handleUndoPick}
              isSubmitting={submitPick.isPending || deletePick.isPending}
              compact
            />
          ))}
        </div>
      )}
    </div>
  )
}
