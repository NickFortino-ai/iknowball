import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/Toast'

export function useCreateHotTake() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ content, team_tags, image_url }) =>
      api.post('/hot-takes', { content, team_tags, image_url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'activity'] })
    },
  })
}

export function useUserHotTakes(userId) {
  return useQuery({
    queryKey: ['hotTakes', 'user', userId],
    queryFn: () => api.get(`/hot-takes/user/${userId}`),
    enabled: !!userId,
  })
}

export function useRemindHotTake() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (hotTakeId) => api.post(`/hot-takes/${hotTakeId}/remind`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'activity'] })
    },
  })
}

export function useUpdateHotTake() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, content, team_tags, image_url }) =>
      api.patch(`/hot-takes/${id}`, { content, team_tags, image_url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'activity'] })
    },
  })
}

export function useDeleteHotTake() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (hotTakeId) => api.delete(`/hot-takes/${hotTakeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'activity'] })
    },
  })
}

export function useTeamsForSport(sportKey) {
  return useQuery({
    queryKey: ['teams', sportKey],
    queryFn: () => api.get(`/teams?sport=${sportKey}`),
    enabled: !!sportKey,
  })
}

export function useTeamHotTakes(teamName) {
  return useInfiniteQuery({
    queryKey: ['hotTakes', 'team', teamName],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ team: teamName })
      if (pageParam) params.set('before', pageParam)
      return api.get(`/hot-takes/team?${params}`)
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.items?.length
        ? lastPage.items[lastPage.items.length - 1].timestamp
        : undefined,
    enabled: !!teamName,
  })
}

function resizeImage(file, maxWidth = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Failed to compress image'))),
        'image/webp',
        0.85
      )
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

export function useHotTakeImageUpload() {
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [imageFile, setImageFile] = useState(null)

  async function selectImage(file) {
    if (!file) return

    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast('Please upload a JPEG, PNG, or WebP image', 'error')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('Image must be under 5MB', 'error')
      return
    }

    setImageFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  function removeImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setImageFile(null)
    setPreviewUrl(null)
  }

  async function uploadImage() {
    if (!imageFile) return null
    setUploading(true)
    try {
      const blob = await resizeImage(imageFile)

      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('Not authenticated')

      const fileName = `${userId}/${Date.now()}.webp`
      const { error: uploadError } = await supabase.storage
        .from('hot-take-images')
        .upload(fileName, blob, { contentType: 'image/webp' })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('hot-take-images')
        .getPublicUrl(fileName)

      return publicUrl
    } catch (err) {
      toast(err.message || 'Failed to upload image', 'error')
      return null
    } finally {
      setUploading(false)
    }
  }

  return { uploading, previewUrl, selectImage, removeImage, uploadImage, hasImage: !!imageFile }
}
