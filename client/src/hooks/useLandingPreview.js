import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useLandingPreview() {
  return useQuery({
    queryKey: ['landingPreview'],
    queryFn: () => api.get('/public/landing-preview'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
