import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { FuturesHitModal } from './FuturesFeedCard'

export default function FuturesHitModalWrapper({ futuresPickId, onClose }) {
  const { data } = useQuery({
    queryKey: ['futuresPick', futuresPickId],
    queryFn: () => api.get(`/futures/picks/${futuresPickId}`),
    enabled: !!futuresPickId,
  })

  if (!futuresPickId || !data) return null

  return (
    <FuturesHitModal
      pick={data.pick}
      market={data.market}
      user={data.user}
      onClose={onClose}
    />
  )
}
