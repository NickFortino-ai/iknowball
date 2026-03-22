import { useMemo } from 'react'
import { useFeaturedProps, useMyPropPicks, useSubmitPropPick, useDeletePropPick } from '../../hooks/useProps'
import PropCard from './PropCard'
import { toast } from '../ui/Toast'
import { triggerHaptic } from '../../lib/haptics'

export default function FeaturedPropSection({ date, sportKey, fallback = false }) {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const { data: props, isLoading } = useFeaturedProps(dateStr, { fallback })
  const { data: myPropPicks } = useMyPropPicks()
  const submitPick = useSubmitPropPick()
  const deletePick = useDeletePropPick()

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

  return (
    <div data-onboarding="featured-prop" className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <h2 className="font-display text-lg">
          {activeProps.length === 1 ? 'Daily Featured Player Prop' : 'Daily Featured Player Props'}
        </h2>
      </div>
      <div className="space-y-3">
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
    </div>
  )
}
