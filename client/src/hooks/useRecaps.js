import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useLatestRecap() {
  return useQuery({
    queryKey: ['recaps', 'latest'],
    queryFn: () => api.get('/recaps/latest'),
    staleTime: 5 * 60 * 1000,
  })
}
