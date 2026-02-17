import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const array = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    array[i] = raw.charCodeAt(i)
  }
  return array
}

export function usePushStatus() {
  return useQuery({
    queryKey: ['push', 'status'],
    queryFn: () => api.get('/push/status'),
    enabled: !!VAPID_PUBLIC_KEY,
  })
}

export function useSubscribePush() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        throw new Error('Notification permission denied')
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      const { endpoint, keys } = subscription.toJSON()
      return api.post('/push/subscribe', { endpoint, keys })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push', 'status'] })
    },
  })
}

export function useUnsubscribePush() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        const { endpoint } = subscription.toJSON()
        await api.post('/push/unsubscribe', { endpoint })
        await subscription.unsubscribe()
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push', 'status'] })
    },
  })
}
