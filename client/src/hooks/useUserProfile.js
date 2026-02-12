import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useUserProfile(userId) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => api.get(`/users/${userId}/profile`),
    enabled: !!userId,
  })
}
