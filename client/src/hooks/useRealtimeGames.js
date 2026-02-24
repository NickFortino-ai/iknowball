import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useRealtimeGames(isAuthenticated) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isAuthenticated) return

    const channel = supabase
      .channel('games-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games' },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['games'] })

          if (payload.new.status === 'final') {
            queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
            queryClient.invalidateQueries({ queryKey: ['picks'] })
            queryClient.invalidateQueries({ queryKey: ['parlays'] })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isAuthenticated, queryClient])
}
