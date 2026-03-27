import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '../components/ui/Toast'

function cropAndResize(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const size = Math.min(img.width, img.height)
      const sx = (img.width - size) / 2
      const sy = (img.height - size) / 2
      const canvas = document.createElement('canvas')
      canvas.width = 800
      canvas.height = 800
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 800, 800)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Failed to compress image'))),
        'image/webp',
        0.9
      )
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

export function useAvatarUpload() {
  const [uploading, setUploading] = useState(false)
  const fetchProfile = useAuthStore((s) => s.fetchProfile)
  const queryClient = useQueryClient()

  async function uploadAvatar(file) {
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

    setUploading(true)
    try {
      const blob = await cropAndResize(file)

      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('Not authenticated')

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(`${userId}.webp`, blob, { upsert: true, contentType: 'image/webp' })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(`${userId}.webp`)

      const avatarUrl = `${publicUrl}?t=${Date.now()}`

      await api.patch('/users/me', { avatar_url: avatarUrl })
      await fetchProfile()
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast('Profile photo updated!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to upload photo', 'error')
    } finally {
      setUploading(false)
    }
  }

  async function removeAvatar() {
    setUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) throw new Error('Not authenticated')

      await supabase.storage.from('avatars').remove([`${userId}.webp`])
      await api.patch('/users/me', { avatar_url: null })
      await fetchProfile()
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast('Profile photo removed', 'success')
    } catch (err) {
      toast(err.message || 'Failed to remove photo', 'error')
    } finally {
      setUploading(false)
    }
  }

  return { uploading, uploadAvatar, removeAvatar }
}
