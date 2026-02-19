import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useFuturesMarkets(sportKey) {
  const params = sportKey ? `?sport=${sportKey}&status=active` : '?status=active'
  return useQuery({
    queryKey: ['futuresMarkets', sportKey || 'all'],
    queryFn: () => api.get(`/futures/markets${params}`),
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
