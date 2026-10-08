import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { toast } from '../components/ui/Toast'

export function useCreateHotTake() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ content, team_tags, sport_key, image_url, image_urls, video_url, stream_video_uid, user_tags, post_type, poll_options, embed_source }) =>
      api.post('/hot-takes', { content, team_tags, sport_key, image_url, image_urls, video_url, stream_video_uid, user_tags, post_type, poll_options, embed_source }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections', 'activity'] })
    },
  })
}

export function useCreateFlex() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ content, pickId, parlayId, propPickId }) =>
      api.post('/hot-takes/flex', { content, pickId, parlayId, propPickId }),
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
    mutationFn: ({ id, content, team_tags, image_url, video_url, user_tags, embed_source }) =>
      api.patch(`/hot-takes/${id}`, { content, team_tags, image_url, video_url, user_tags, ...(embed_source !== undefined ? { embed_source } : {}) }),
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

// Images per post. Nothing in the rendering constrains this — the feed card
// is a carousel, not a fixed grid, so it shows one image at a time whatever
// the count, and the dot indicators are 1.5 units wide with a 1.5 gap, so
// even twenty fit across a phone. The old cap of 4 matched Twitter's grid
// layout, which this UI never used. Kept finite because each image is a
// separate upload with no progress indicator.
const MAX_IMAGES_PER_POST = 10

function resizeImage(file, maxWidth = 2400, quality = 0.92) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    const done = (fn) => (arg) => { URL.revokeObjectURL(objectUrl); fn(arg) }
    const ok = done(resolve)
    const fail = done(reject)
    img.onload = () => {
      let { width, height } = img
      // Only downscale if the source is actually wider than the cap. A
      // smaller source is uploaded at native resolution to avoid the
      // double-blur of upscaling-then-resampling.
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => (blob ? ok(blob) : fail(new Error('Failed to compress image'))),
        'image/webp',
        quality
      )
    }
    img.onerror = () => fail(new Error('Failed to load image'))
    img.src = objectUrl
  })
}

/**
 * Shrink until it fits, rather than giving up after one attempt.
 *
 * The old path made a single pass at 2400px / 0.92 and, if that was still
 * over the cap, told the user to "try a smaller file" — which for a photo
 * straight off a phone is not advice they can act on. Reported after a
 * league-thread upload failed mid-draft on 2026-09-05.
 *
 * Each step drops both dimensions and quality, so a stubborn image
 * degrades gracefully instead of being refused. Returns the last attempt
 * even if nothing fit, so the caller can decide.
 */
const COMPRESSION_STEPS = [
  [2400, 0.92],
  [2000, 0.85],
  [1600, 0.80],
  [1200, 0.75],
  [900, 0.70],
]

async function compressToFit(file, maxBytes) {
  let last = null
  for (const [width, quality] of COMPRESSION_STEPS) {
    last = await resizeImage(file, width, quality)
    if (last.size <= maxBytes) return last
  }
  return last
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

    if (imageFiles.length >= MAX_IMAGES_PER_POST) {
      toast(`Maximum ${MAX_IMAGES_PER_POST} images per post`, 'error')
      return
    }

    // Auto-downscale if the image is over the size cap. Clipboard pastes
    // commonly produce huge PNGs (e.g. a 4096×4096 promo from 1.9 MB on
    // disk becomes 15+ MB PNG via clipboard), so a hard reject is a bad
    // UX. resizeImage caps width at 2400 and re-encodes as WebP @ 0.92,
    // which keeps high-quality photos well under 5 MB.
    const MAX_BYTES = 5 * 1024 * 1024
    let working = file
    if (working.size > MAX_BYTES) {
      try {
        const blob = await compressToFit(working, MAX_BYTES)
        const baseName = (file.name || 'pasted').replace(/\.\w+$/, '')
        working = new File([blob], `${baseName}.webp`, { type: blob.type || 'image/webp' })
      } catch (err) {
        toast('Could not process this image. Try a different file.', 'error')
        return
      }
      // Only give up after every compression step has been tried. A photo
      // from a phone will always fit well before the last one.
      if (working.size > MAX_BYTES) {
        toast('Image is too large even after resizing. Try a smaller file.', 'error')
        return
      }
    }

    const url = URL.createObjectURL(working)
    setImageFiles((prev) => [...prev, working])
    setPreviewUrls((prev) => [...prev, url])
    // Keep single-image compat
    if (!imageFile) {
      setImageFile(working)
      setPreviewUrl(url)
    }
  }

  // Budget computed ONCE from current state, then the batch is sliced to fit.
  // selectImage's own check reads imageFiles.length out of its closure while
  // appending via a functional update, and this loop doesn't await, so React
  // never re-renders between iterations — every file in one multi-select saw
  // the same stale count and the cap only ever applied across separate
  // interactions. Pasting twenty at once sailed past it and would now fail
  // server validation instead.
  function selectImages(files) {
    const list = Array.from(files || [])
    if (!list.length) return
    const room = MAX_IMAGES_PER_POST - imageFiles.length
    if (room <= 0) {
      toast(`Maximum ${MAX_IMAGES_PER_POST} images per post`, 'error')
      return
    }
    if (list.length > room) {
      toast(`Only ${room} more image${room === 1 ? '' : 's'} will fit — ${MAX_IMAGES_PER_POST} per post.`, 'error')
    }
    for (const file of list.slice(0, room)) {
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

// Declared to Cloudflare when minting the upload URL; Stream rejects any
// video longer than this. The server clamps to 600s, so this is the binding
// limit. It was 90s, which is under the length of a normal highlight clip —
// a 1:40 video sailed past the size check and then died inside Cloudflare.
const MAX_VIDEO_SECONDS = 180

// Cloudflare Stream's basic (form POST) direct upload caps at 200MB. Past
// that you need the resumable tus protocol, which is a different client.
const MAX_VIDEO_BYTES = 200 * 1024 * 1024

/**
 * Read a local video's duration without uploading it. Resolves null when the
 * browser can't parse the container (some .mov variants) or reports a
 * non-finite duration — in that case we let the upload proceed rather than
 * block on a probe we don't trust, since Cloudflare still enforces the limit.
 */
function formatClipLength(seconds) {
  const whole = Math.round(seconds)
  const mins = Math.floor(whole / 60)
  const secs = whole % 60
  if (!mins) return `${secs} seconds`
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function readVideoDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const probe = document.createElement('video')
    const done = (value) => { URL.revokeObjectURL(url); resolve(value) }
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => done(Number.isFinite(probe.duration) ? probe.duration : null)
    probe.onerror = () => done(null)
    probe.src = url
  })
}

export function useHotTakeVideoUpload() {
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [videoFile, setVideoFile] = useState(null)

  async function selectVideo(file) {
    if (!file) return

    // Cloudflare Stream transcodes any input container to HLS on the way
    // out — we just need to gate on "this is actually a video." iPhone
    // .mov, Android .mp4, WebM, MKV, all work.
    if (!(file.type || '').startsWith('video/')) {
      toast('That file doesn\'t look like a video. Try a video file.', 'error')
      return
    }
    // Say what's actually wrong. Size here is driven by resolution and frame
    // rate, not length: 4K/60 off a phone runs ~50 Mbps, so it clears 200MB
    // in about 30 seconds, while the same clip at 1080p is a quarter of that.
    // "Video must be under 200MB" sent people hunting for a shorter clip when
    // the fix is to record or export smaller.
    if (file.size > MAX_VIDEO_BYTES) {
      const mb = Math.round(file.size / (1024 * 1024))
      toast(`That video is ${mb}MB and the limit is 200MB. Recording at 1080p instead of 4K usually gets well under it.`, 'error')
      return
    }

    // Check length locally so an over-long video fails here, with a sentence
    // that explains itself, instead of being uploaded and then rejected
    // inside Cloudflare — which surfaced as raw API JSON in a toast.
    const duration = await readVideoDuration(file)
    if (duration != null && duration > MAX_VIDEO_SECONDS) {
      const mins = Math.floor(MAX_VIDEO_SECONDS / 60)
      toast(`That video is ${formatClipLength(duration)} and the limit is ${mins} minutes. Trim it and try again.`, 'error')
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

  /**
   * Cloudflare Stream direct-upload flow:
   *   1. Ask our server for a one-time upload URL + UID
   *   2. POST the file directly to Cloudflare's URL (bypasses our server)
   *   3. Return { hlsUrl, uid } so the caller can pass both onto createHotTake
   *
   * Cloudflare transcodes in the background; there's a brief window (usually
   * 5-30s depending on length) where the HLS manifest is 404. Callers
   * shouldn't block on that — the feed will render the video-not-ready state
   * for a moment then start streaming as soon as Cloudflare finishes.
   */
  async function uploadVideo() {
    if (!videoFile) return null
    setUploading(true)
    try {
      const { uploadURL, uid, hlsUrl } = await api.post('/stream/direct-upload', { maxDurationSeconds: MAX_VIDEO_SECONDS })
      if (!uploadURL || !uid) throw new Error('Video upload service is unavailable')

      const form = new FormData()
      form.append('file', videoFile)

      const uploadRes = await fetch(uploadURL, { method: 'POST', body: form })
      if (!uploadRes.ok) {
        const body = await uploadRes.text().catch(() => '')
        throw new Error(body || `Cloudflare upload failed (${uploadRes.status})`)
      }

      return { hlsUrl, uid }
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
