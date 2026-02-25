import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useRecords() {
  return useQuery({
    queryKey: ['records'],
    queryFn: () => api.get('/records'),
    refetchInterval: 60_000,
  })
}

export function useRecordHistory() {
  return useQuery({
    queryKey: ['record-history'],
    queryFn: () => api.get('/records/history'),
  })
}

export function useRoyalty() {
  return useQuery({
    queryKey: ['royalty'],
    queryFn: () => api.get('/leaderboard/royalty'),
    refetchInterval: 60_000,
  })
}
