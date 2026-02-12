import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get('/users/me'),
  })
}

export function useSportStats() {
  return useQuery({
    queryKey: ['profile', 'sports'],
    queryFn: () => api.get('/users/me/sports'),
  })
}
