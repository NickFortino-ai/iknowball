import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/Toast'

export function useCreateHotTake() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ content, team_tags, sport_key, image_url, image_urls, video_url, user_tags, post_type, poll_options }) =>
      api.post('/hot-takes', { content, team_tags, sport_key, image_url, image_urls, video_url, user_tags, post_type, poll_options }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'activity'] })
    },
  })
}

export function useHotTakeById(hotTakeId) {
  return useQuery({
    queryKey: ['hotTakes', hotTakeId],
    queryFn: () => api.get(`/hot-takes/${hotTakeId}`),
    enabled: !!hotTakeId,
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
    mutationFn: ({ hotTakeId, comment }) => api.post(`/hot-takes/${hotTakeId}/remind`, { comment: comment || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'activity'] })
    },
  })
}

export function useAskForHotTakes() {
  return useMutation({
    mutationFn: (userId) => api.post(`/hot-takes/ask/${userId}`),
  })
}

export function useUpdateHotTake() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, content, team_tags, image_url, video_url, user_tags }) =>
      api.patch(`/hot-takes/${id}`, { content, team_tags, image_url, video_url, user_tags }),
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

export function useSportHotTakes(sportKey) {
  return useInfiniteQuery({
    queryKey: ['hotTakes', 'sport', sportKey],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ sport: sportKey })
      if (pageParam) params.set('before', pageParam)
      return api.get(`/hot-takes/sport?${params}`)
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.items?.length
        ? lastPage.items[lastPage.items.length - 1].timestamp
        : undefined,
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

export function useToggleBookmark() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (hotTakeId) => api.post(`/hot-takes/${hotTakeId}/bookmark`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] })
      queryClient.invalidateQueries({ queryKey: ['bookmarkStatus'] })
    },
  })
}

export function useBookmarkStatus(hotTakeIds) {
  const key = hotTakeIds?.length ? hotTakeIds.join(',') : ''
  return useQuery({
    queryKey: ['bookmarkStatus', key],
    queryFn: () => api.get(`/hot-takes/bookmarks/check?ids=${key}`),
    enabled: !!hotTakeIds?.length,
  })
}

export function useBookmarkedHotTakes() {
  return useInfiniteQuery({
    queryKey: ['bookmarks', 'list'],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams()
      if (pageParam) params.set('before', pageParam)
      return api.get(`/hot-takes/bookmarks/list?${params}`)
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.items?.length
        ? lastPage.items[lastPage.items.length - 1].bookmarkedAt
        : undefined,
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
  const [imageFiles, setImageFiles] = useState([])
  const [previewUrls, setPreviewUrls] = useState([])

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

    if (imageFiles.length >= 4) {
      toast('Maximum 4 images per post', 'error')
      return
    }

    const url = URL.createObjectURL(file)
    setImageFiles((prev) => [...prev, file])
    setPreviewUrls((prev) => [...prev, url])
    // Keep single-image compat
    if (!imageFile) {
      setImageFile(file)
      setPreviewUrl(url)
    }
  }

  function selectImages(files) {
    for (const file of files) {
      selectImage(file)
    }
  }

  function removeImage(index) {
    if (index === undefined) {
      // Remove all (backward compat)
      previewUrls.forEach((url) => URL.revokeObjectURL(url))
      setImageFiles([])
      setPreviewUrls([])
      setImageFile(null)
      setPreviewUrl(null)
      return
    }
    URL.revokeObjectURL(previewUrls[index])
    const newFiles = imageFiles.filter((_, i) => i !== index)
    const newUrls = previewUrls.filter((_, i) => i !== index)
    setImageFiles(newFiles)
    setPreviewUrls(newUrls)
    setImageFile(newFiles[0] || null)
    setPreviewUrl(newUrls[0] || null)
  }

  async function uploadImage() {
    if (!imageFiles.length) return null
    setUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('Not authenticated')

      const urls = []
      for (const file of imageFiles) {
        const blob = await resizeImage(file)
        const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.webp`
        const { error: uploadError } = await supabase.storage
          .from('hot-take-images')
          .upload(fileName, blob, { contentType: 'image/webp' })
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage
          .from('hot-take-images')
          .getPublicUrl(fileName)
        urls.push(publicUrl)
      }

      return urls
    } catch (err) {
      toast(err.message || 'Failed to upload image', 'error')
      return null
    } finally {
      setUploading(false)
    }
  }

  return { uploading, previewUrl, previewUrls, selectImage, selectImages, removeImage, uploadImage, hasImage: imageFiles.length > 0, imageCount: imageFiles.length }
}

export function useHotTakeVideoUpload() {
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [videoFile, setVideoFile] = useState(null)

  function selectVideo(file) {
    if (!file) return

    const validTypes = ['video/mp4', 'video/webm']
    if (!validTypes.includes(file.type)) {
      toast('Please convert your video to MP4 before uploading. Most video converter apps on iPhone can do this in seconds.', 'error')
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      toast('Video must be under 100MB', 'error')
      return
    }

    setVideoFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  function removeVideo() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setVideoFile(null)
    setPreviewUrl(null)
  }

  async function uploadVideo() {
    if (!videoFile) return null
    setUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('Not authenticated')

      const ext = videoFile.type === 'video/webm' ? 'webm' : 'mp4'
      const fileName = `${userId}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('hot-take-videos')
        .upload(fileName, videoFile, { contentType: videoFile.type })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('hot-take-videos')
        .getPublicUrl(fileName)

      return publicUrl
    } catch (err) {
      toast(err.message || 'Failed to upload video', 'error')
      return null
    } finally {
      setUploading(false)
    }
  }

  return { uploading, previewUrl, selectVideo, removeVideo, uploadVideo, hasVideo: !!videoFile }
}

export function usePollVote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ hotTakeId, optionId }) =>
      api.post(`/hot-takes/${hotTakeId}/vote`, { option_id: optionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'activity'] })
    },
  })
}

export function usePollResults(hotTakeId) {
  return useQuery({
    queryKey: ['poll', hotTakeId],
    queryFn: () => api.get(`/hot-takes/${hotTakeId}/poll`),
    enabled: !!hotTakeId,
  })
}
