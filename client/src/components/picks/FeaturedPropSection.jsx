import { useMemo } from 'react'
import { useFeaturedProp, useMyPropPicks, useSubmitPropPick, useDeletePropPick } from '../../hooks/useProps'
import PropCard from './PropCard'
import { toast } from '../ui/Toast'
import { triggerHaptic } from '../../lib/haptics'

export default function FeaturedPropSection({ date, sportKey }) {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const { data: prop, isLoading } = useFeaturedProp(dateStr)
  const { data: myPropPicks } = useMyPropPicks()
  const submitPick = useSubmitPropPick()
  const deletePick = useDeletePropPick()

  const pick = useMemo(() => {
    if (!prop || !myPropPicks) return null
    return myPropPicks.find((p) => p.prop_id === prop.id) || null
  }, [prop, myPropPicks])

  if (isLoading || !prop) return null

  // Hide settled props on the picks page (like finalized games)
  if (prop.status === 'settled') return null

  // Only show when viewing the sport this prop belongs to
  if (sportKey && prop.games?.sports?.key !== sportKey) return null

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
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        <h2 className="font-display text-lg">Daily Featured Player Prop</h2>
      </div>
      <PropCard
        prop={prop}
        pick={pick}
        onPick={handlePick}
        onUndoPick={handleUndoPick}
        isSubmitting={submitPick.isPending || deletePick.isPending}
        compact
      />
    </div>
  )
}
