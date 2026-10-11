import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useMemoryVariants() {
  return useQuery({
    queryKey: ['arcade', 'memory', 'variants'],
    queryFn: () => api.get('/arcade/memory/variants'),
    staleTime: 60 * 60 * 1000, // the backdrop catalogue barely changes
  })
}

export function useArcadeLeaderboard(game, variant) {
  return useQuery({
    queryKey: ['arcade', 'leaderboard', game, variant],
    queryFn: () => api.get(`/arcade/leaderboard?game=${game}&variant=${encodeURIComponent(variant)}`),
    enabled: !!game && !!variant,
    staleTime: 30 * 1000,
  })
}

export function useStartMemoryRound() {
  return useMutation({
    mutationFn: ({ difficulty, variant }) => api.post('/arcade/memory/start', { difficulty, variant }),
  })
}

export function useFinishMemoryRound() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ roundId, moves, informedMisses }) =>
      api.post('/arcade/memory/finish', { roundId, moves, informedMisses }),
    onSuccess: () => {
      // The board the player just tried to climb.
      queryClient.invalidateQueries({ queryKey: ['arcade', 'leaderboard'] })
    },
  })
}
