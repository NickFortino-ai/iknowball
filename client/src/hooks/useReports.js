import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useSubmitReport() {
  return useMutation({
    mutationFn: (report) => api.post('/reports', report),
  })
}

export function useCheckReport(targetType, targetId) {
  return useQuery({
    queryKey: ['reportCheck', targetType, targetId],
    queryFn: () => api.get(`/reports/check?target_type=${targetType}${targetId ? `&target_id=${targetId}` : ''}`),
    enabled: !!targetType,
  })
}

export function useAdminReports(status = 'all') {
  return useQuery({
    queryKey: ['adminReports', status],
    queryFn: () => api.get(`/admin/reports${status !== 'all' ? `?status=${status}` : ''}`),
  })
}

export function useUpdateReportStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, action }) => api.patch(`/admin/reports/${id}`, { status, action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminReports'] })
    },
  })
}
