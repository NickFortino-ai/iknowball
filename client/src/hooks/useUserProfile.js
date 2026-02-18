import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useUserProfile(userId) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => api.get(`/users/${userId}/profile`),
    enabled: !!userId,
  })
}

export function useUserPickHistory(userId) {
  return useQuery({
    queryKey: ['users', userId, 'picks'],
    queryFn: () => api.get(`/users/${userId}/picks`),
    enabled: !!userId,
  })
}

export function useUserParlayHistory(userId) {
  return useQuery({
    queryKey: ['users', userId, 'parlays'],
    queryFn: () => api.get(`/users/${userId}/parlays`),
    enabled: !!userId,
  })
}

export function useUserPropPickHistory(userId) {
  return useQuery({
    queryKey: ['users', userId, 'prop-picks'],
    queryFn: () => api.get(`/users/${userId}/prop-picks`),
    enabled: !!userId,
  })
}

export function useHeadToHead(userId) {
  return useQuery({
    queryKey: ['users', userId, 'head-to-head'],
    queryFn: () => api.get(`/users/${userId}/head-to-head`),
    enabled: !!userId,
  })
}
