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

export function useRecordPick(pickId) {
  return useQuery({
    queryKey: ['recordPick', pickId],
    queryFn: () => api.get(`/records/pick/${pickId}`),
    enabled: !!pickId,
  })
}

export function useRecordParlay(parlayId) {
  return useQuery({
    queryKey: ['recordParlay', parlayId],
    queryFn: () => api.get(`/records/parlay/${parlayId}`),
    enabled: !!parlayId,
  })
}

export function useRecordFuturesPick(pickId) {
  return useQuery({
    queryKey: ['recordFuturesPick', pickId],
    queryFn: () => api.get(`/records/futures-pick/${pickId}`),
    enabled: !!pickId,
  })
}

export function useRoyalty() {
  return useQuery({
    queryKey: ['royalty'],
    queryFn: () => api.get('/leaderboard/royalty'),
    refetchInterval: 60_000,
  })
}
