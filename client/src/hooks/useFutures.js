import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useFuturesMarkets(sportKey) {
  return useQuery({
    queryKey: ['futuresMarkets', sportKey],
    queryFn: () => api.get(`/futures/markets?sport=${sportKey}&status=active`),
    enabled: !!sportKey,
  })
}

export function useMyFuturesPicks(status) {
  const params = status ? `?status=${status}` : ''
  return useQuery({
    queryKey: ['futuresPicks', 'me', status],
    queryFn: () => api.get(`/futures/picks/me${params}`),
  })
}

export function useFuturesPickHistory() {
  return useQuery({
    queryKey: ['futuresPicks', 'history'],
    queryFn: () => api.get('/futures/picks/me/history'),
  })
}

export function useSubmitFuturesPick() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ marketId, pickedOutcome }) =>
      api.post('/futures/picks', { market_id: marketId, picked_outcome: pickedOutcome }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['futuresPicks'] })
    },
  })
}
