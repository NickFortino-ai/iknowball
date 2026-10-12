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
    mutationFn: ({ roundId, moves, informedMisses, recallChances, recallHits }) =>
      api.post('/arcade/memory/finish', { roundId, moves, informedMisses, recallChances, recallHits }),
    onSuccess: () => {
      // The board the player just tried to climb.
      queryClient.invalidateQueries({ queryKey: ['arcade', 'leaderboard'] })
    },
  })
}

export function useStartTriviaRound() {
  return useMutation({
    mutationFn: ({ variant, count }) => api.post('/arcade/trivia/start', { variant, count }),
  })
}

// One answer, checked server-side. The key never ships with the questions,
// so saying "right" requires asking — which is also what lets streak mode
// know the run is over.
export function useAnswerTrivia() {
  return useMutation({
    mutationFn: ({ roundId, index, choice }) =>
      api.post('/arcade/trivia/answer', { roundId, index, choice }),
  })
}

export function useStartTriviaStreak() {
  return useMutation({
    mutationFn: ({ variant }) => api.post('/arcade/trivia/streak/start', { variant }),
  })
}

export function useNextStreakQuestion() {
  return useMutation({
    mutationFn: ({ roundId, index }) => api.post('/arcade/trivia/streak/next', { roundId, index }),
  })
}

export function useFinishTriviaStreak() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ roundId }) => api.post('/arcade/trivia/streak/finish', { roundId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['arcade', 'leaderboard'] }),
  })
}

export function useFinishTriviaRound() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ roundId, answers }) => api.post('/arcade/trivia/finish', { roundId, answers }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['arcade', 'leaderboard'] })
    },
  })
}
