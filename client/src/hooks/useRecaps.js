import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useLatestRecap() {
  return useQuery({
    queryKey: ['recaps', 'latest'],
    queryFn: () => api.get('/recaps/latest'),
    staleTime: 5 * 60 * 1000,
  })
}

export function useRecapArchive() {
  return useQuery({
    queryKey: ['recaps', 'archive'],
    queryFn: () => api.get('/recaps/archive'),
    staleTime: 30 * 60 * 1000,
  })
}
