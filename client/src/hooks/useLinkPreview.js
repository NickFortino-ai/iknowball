import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useLinkPreview(url) {
  return useQuery({
    queryKey: ['linkPreview', url],
    queryFn: () => api.get(`/link-preview?url=${encodeURIComponent(url)}`),
    enabled: !!url,
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  })
}
