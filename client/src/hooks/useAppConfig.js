import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// Public remote-config knobs. Cached for 5 min — config rarely changes
// and the payload is tiny (~200 bytes). Use empty object as the default
// data so callers can `cfg.news_tab_order ?? FALLBACK` without null checks.
export function useAppConfig() {
  return useQuery({
    queryKey: ['app-config'],
    queryFn: () => api.get('/app-config'),
    staleTime: 5 * 60 * 1000,
    placeholderData: {},
  })
}

export function useUpdateAppConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, value }) => api.patch('/admin/app-config', { key, value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-config'] }),
  })
}
