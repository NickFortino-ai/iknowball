import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useProfile } from '../hooks/useProfile'
import { useAuthStore } from '../stores/authStore'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { toast } from '../components/ui/Toast'
import { usePushStatus, useSubscribePush, useUnsubscribePush } from '../hooks/usePushNotifications'
import { useAvatarUpload } from '../hooks/useAvatarUpload'
import Avatar from '../components/ui/Avatar'
import { useBlockedUsers, useUnblockUser } from '../hooks/useBlocked'

const avatarEmojis = [
  '🏀', '🏈', '⚾', '🏆', '🔥', '🎯',
  '🦅', '🐐', '🦁', '⭐', '🐺', '🦈',
  '💀', '👑', '💎', '⚡',
  '💰', '🗡️', '👁️', '🎰', '🧊', '🦾', '🎱', '🃏',
]

const sportsInterests = [
  { emoji: '🏀', label: 'Basketball' },
  { emoji: '🏈', label: 'Football' },
  { emoji: '⚾', label: 'Baseball' },
  { emoji: '⚽', label: 'Soccer' },
  { emoji: '🏒', label: 'Hockey' },
  { emoji: '🎾', label: 'Tennis' },
  { emoji: '⛳', label: 'Golf' },
  { emoji: '🏓', label: 'Ping Pong' },
]

function Section({ label, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-bg-card rounded-xl border border-border mb-4 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4"
      >
        <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
        <svg
          className={`w-4 h-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

function BlockedUsersSection() {
  const { data: blockedUsers } = useBlockedUsers()
  const unblock = useUnblockUser()

  if (!blockedUsers?.length) return null

  return (
    <Section label="Blocked Users" defaultOpen={false}>
      <div className="space-y-2">
        {blockedUsers.map((b) => (
          <div key={b.blocked_id} className="flex items-center gap-3">
            <Avatar user={b.blocked} size="md" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{b.blocked?.display_name || b.blocked?.username}</div>
              <div className="text-xs text-text-muted">@{b.blocked?.username}</div>
            </div>
            <button
              onClick={async () => {
                await unblock.mutateAsync(b.blocked_id)
                toast(`@${b.blocked?.username} unblocked`, 'success')
              }}
              disabled={unblock.isPending}
              className="text-xs text-accent hover:underline disabled:opacity-50"
            >
              Unblock
            </button>
          </div>
        ))}
      </div>
    </Section>
  )
}

function PasswordInput({ value, onChange, placeholder }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 pr-10 text-sm text-text-primary focus:outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
      >
        {visible ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
    </div>
  )
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changing, setChanging] = useState(false)
  const session = useAuthStore((s) => s.session)

  async function handleChangePassword() {
    if (!currentPassword) return toast('Enter your current password', 'error')
    if (newPassword.length < 6) return toast('New password must be at least 6 characters', 'error')
    if (newPassword !== confirmPassword) return toast('New passwords do not match', 'error')

    setChanging(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: session?.user?.email,
        password: currentPassword,
      })
      if (signInError) {
        toast('Current password is incorrect', 'error')
        setChanging(false)
        return
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      toast('Password changed successfully!', 'success')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast(err.message || 'Failed to change password', 'error')
    } finally {
      setChanging(false)
    }
  }

  return (
    <Section label="Change Password" defaultOpen={false}>
      <div className="space-y-3">
        <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" />
        <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" />
        <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
        <button
          onClick={handleChangePassword}
          disabled={changing}
          className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm"
        >
          {changing ? 'Changing...' : 'Change Password'}
        </button>
      </div>
    </Section>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { data: profile, isLoading, refetch } = useProfile()
  const fetchProfile = useAuthStore((s) => s.fetchProfile)
  const signOut = useAuthStore((s) => s.signOut)

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarEmoji, setAvatarEmoji] = useState('')
  const [selectedSports, setSelectedSports] = useState([])
  const [titlePreference, setTitlePreference] = useState(null)
  const [xHandle, setXHandle] = useState('')
  const [instagramHandle, setInstagramHandle] = useState('')
  const [tiktokHandle, setTiktokHandle] = useState('')
  const [snapchatHandle, setSnapchatHandle] = useState('')
  const [youtubeHandle, setYoutubeHandle] = useState('')
  const [venmoHandle, setVenmoHandle] = useState('')
  const [threadsHandle, setThreadsHandle] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Push notification state
  const { data: pushStatus } = usePushStatus()
  const subscribePush = useSubscribePush()
  const unsubscribePush = useUnsubscribePush()
  const pushSupported = typeof window !== 'undefined' && 'PushManager' in window && 'serviceWorker' in navigator && !!import.meta.env.VITE_VAPID_PUBLIC_KEY
  const pushEnabled = pushStatus?.hasSubscriptions || false

  const [pushPrefs, setPushPrefs] = useState({ parlay_result: true, streak_milestone: true })
  const photoFileRef = useRef(null)
  const { uploading, uploadAvatar, removeAvatar } = useAvatarUpload()

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '')
      setBio(profile.bio || '')
      setAvatarEmoji(profile.avatar_emoji || '')
      setSelectedSports(profile.sports_interests || [])
      setTitlePreference(profile.title_preference ?? null)
      setXHandle(profile.x_handle || '')
      setInstagramHandle(profile.instagram_handle || '')
      setTiktokHandle(profile.tiktok_handle || '')
      setSnapchatHandle(profile.snapchat_handle || '')
      setYoutubeHandle(profile.youtube_handle || '')
      setVenmoHandle(profile.venmo_handle || '')
      setThreadsHandle(profile.threads_handle || '')
      if (profile.push_preferences) {
        setPushPrefs(profile.push_preferences)
      }
    }
  }, [profile])

  async function handlePushToggle() {
    try {
      if (pushEnabled) {
        await unsubscribePush.mutateAsync()
        toast('Push notifications disabled', 'success')
      } else {
        await subscribePush.mutateAsync()
        toast('Push notifications enabled!', 'success')
      }
    } catch (err) {
      if (err.message?.includes('denied')) {
        toast('Notification permission was denied. Enable it in your browser settings.', 'error')
      } else {
        toast(err.message || 'Failed to update push notifications', 'error')
      }
    }
  }

  async function handlePushPrefToggle(key) {
    const updated = { ...pushPrefs, [key]: !pushPrefs[key] }
    setPushPrefs(updated)
    try {
      await api.patch('/users/me', { push_preferences: updated })
    } catch (err) {
      setPushPrefs(pushPrefs) // revert on error
      toast('Failed to update preference', 'error')
    }
  }

  function toggleSport(emoji) {
    setSelectedSports((prev) =>
      prev.includes(emoji)
        ? prev.filter((s) => s !== emoji)
        : [...prev, emoji]
    )
  }

  async function handleSave() {
    setSaving(true)
    try {
      const strip = (v) => v.replace(/^@/, '').trim() || null
      await api.patch('/users/me', {
        display_name: displayName || undefined,
        bio,
        avatar_emoji: avatarEmoji,
        sports_interests: selectedSports,
        title_preference: titlePreference,
        x_handle: strip(xHandle),
        instagram_handle: strip(instagramHandle),
        tiktok_handle: strip(tiktokHandle),
        snapchat_handle: strip(snapchatHandle),
        youtube_handle: strip(youtubeHandle),
        venmo_handle: strip(venmoHandle),
        threads_handle: strip(threadsHandle),
      })
      await refetch()
      await fetchProfile()
      const uid = useAuthStore.getState().session?.user?.id
      if (uid) localStorage.setItem(`ikb_welcome_setup_profile_${uid}`, '1')
      toast('Settings saved!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <LoadingSpinner />
  if (!profile) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-6">Settings</h1>

      {/* Display Name */}
      <Section label="Display Name">
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          placeholder="Your display name"
        />
      </Section>

      {/* Bio */}
      <Section label="Bio">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={200}
          rows={3}
          className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent resize-none"
          placeholder="Tell people about yourself..."
        />
        <div className="text-right text-xs text-text-muted mt-1">{bio.length}/200</div>
      </Section>

      {/* Avatar Emoji */}
      <Section label="Profile Icon">
        {/* Photo upload */}
        <div className="flex items-center gap-4 mb-4 pb-4 border-b border-border">
          <Avatar user={profile} size="2xl" />
          <div className="flex gap-2">
            <button
              onClick={() => photoFileRef.current?.click()}
              disabled={uploading}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload Photo'}
            </button>
            {profile.avatar_url && (
              <button
                onClick={removeAvatar}
                disabled={uploading}
                className="px-3 py-2 rounded-lg text-sm font-semibold bg-bg-input border border-border text-text-secondary hover:text-incorrect transition-colors disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={photoFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) uploadAvatar(file)
              e.target.value = ''
            }}
          />
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {avatarEmojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => setAvatarEmoji(avatarEmoji === emoji ? '' : emoji)}
              className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all ${
                avatarEmoji === emoji
                  ? 'bg-accent/20 border-2 border-accent scale-110'
                  : 'bg-bg-input border border-border hover:border-border-hover'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
        {avatarEmoji && (
          <p className="text-xs text-text-muted mt-2">
            Selected: {avatarEmoji}
          </p>
        )}
      </Section>

      {/* Title Preference */}
      <Section label="Title">
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'king', icon: '♚', label: 'King' },
            { value: 'queen', icon: '♛', label: 'Queen' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setTitlePreference(titlePreference === option.value ? null : option.value)}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                titlePreference === option.value
                  ? 'bg-accent/20 border-2 border-accent'
                  : 'bg-bg-input border border-border hover:border-border-hover'
              }`}
            >
              <span className="text-lg">{option.icon}</span>
              <span className={titlePreference === option.value ? 'text-accent font-semibold' : 'text-text-secondary'}>
                {option.label}
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* Sports Interests */}
      <Section label="Sports Interests">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {sportsInterests.map((sport) => {
            const isSelected = selectedSports.includes(sport.emoji)
            return (
              <button
                key={sport.emoji}
                onClick={() => toggleSport(sport.emoji)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                  isSelected
                    ? 'bg-accent/20 border-2 border-accent'
                    : 'bg-bg-input border border-border hover:border-border-hover'
                }`}
              >
                <span className="text-lg">{sport.emoji}</span>
                <span className={isSelected ? 'text-accent font-semibold' : 'text-text-secondary'}>
                  {sport.label}
                </span>
              </button>
            )
          })}
        </div>
      </Section>

      {/* Socials */}
      <Section label="Socials">
        <div className="space-y-3">
          {[
            { label: 'X', value: xHandle, set: setXHandle, placeholder: 'username' },
            { label: 'Instagram', value: instagramHandle, set: setInstagramHandle, placeholder: 'username' },
            { label: 'TikTok', value: tiktokHandle, set: setTiktokHandle, placeholder: 'username' },
            { label: 'YouTube', value: youtubeHandle, set: setYoutubeHandle, placeholder: 'handle' },
            { label: 'Snapchat', value: snapchatHandle, set: setSnapchatHandle, placeholder: 'username' },
            { label: 'Threads', value: threadsHandle, set: setThreadsHandle, placeholder: 'username' },
            { label: 'Venmo', value: venmoHandle, set: setVenmoHandle, placeholder: 'username' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="text-sm text-text-secondary w-20 shrink-0">{s.label}</span>
              <input
                type="text"
                value={s.value}
                onChange={(e) => s.set(e.target.value)}
                maxLength={30}
                className="flex-1 bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                placeholder={s.placeholder}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Push Notifications */}
      <Section label="Push Notifications">
        {Capacitor.isNativePlatform() ? (
          <p className="text-sm text-text-muted">
            Manage push notifications in your device's Settings app.
          </p>
        ) : !pushSupported ? (
          <p className="text-sm text-text-muted">
            Push notifications are not supported in this browser.
          </p>
        ) : (
          <>
            {/* Master toggle */}
            <button
              onClick={handlePushToggle}
              disabled={subscribePush.isPending || unsubscribePush.isPending}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-bg-input border border-border hover:border-border-hover transition-colors disabled:opacity-50"
            >
              <span className="text-sm text-text-primary">Enable Push Notifications</span>
              <div className={`w-10 h-6 rounded-full transition-colors flex items-center ${pushEnabled ? 'bg-accent justify-end' : 'bg-border justify-start'}`}>
                <div className="w-5 h-5 bg-white rounded-full mx-0.5 shadow" />
              </div>
            </button>

            {Notification.permission === 'denied' && (
              <p className="text-xs text-red-400 mt-2">
                Notifications are blocked. Please enable them in your browser settings.
              </p>
            )}

            {/* Per-type toggles */}
            {pushEnabled && (
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => handlePushPrefToggle('parlay_result')}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-bg-input border border-border hover:border-border-hover transition-colors"
                >
                  <span className="text-sm text-text-secondary">Parlay Results</span>
                  <div className={`w-10 h-6 rounded-full transition-colors flex items-center ${pushPrefs.parlay_result ? 'bg-accent justify-end' : 'bg-border justify-start'}`}>
                    <div className="w-5 h-5 bg-white rounded-full mx-0.5 shadow" />
                  </div>
                </button>

                <button
                  onClick={() => handlePushPrefToggle('streak_milestone')}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-bg-input border border-border hover:border-border-hover transition-colors"
                >
                  <span className="text-sm text-text-secondary">Streak Milestones</span>
                  <div className={`w-10 h-6 rounded-full transition-colors flex items-center ${pushPrefs.streak_milestone ? 'bg-accent justify-end' : 'bg-border justify-start'}`}>
                    <div className="w-5 h-5 bg-white rounded-full mx-0.5 shadow" />
                  </div>
                </button>
              </div>
            )}
          </>
        )}
      </Section>

      {/* Blocked Users */}
      <BlockedUsersSection />

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>

      {/* Change Password */}
      <ChangePasswordSection />

      {/* Delete Account */}
      <div className="mt-12 mb-4 text-center">
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-text-muted hover:text-incorrect transition-colors"
          >
            Delete Account
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-incorrect">
              This will permanently delete your account and all your data. This cannot be undone.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={async () => {
                  setDeleting(true)
                  try {
                    await api.delete('/users/me')
                    await signOut()
                    navigate('/')
                  } catch (err) {
                    toast(err.message || 'Failed to delete account', 'error')
                    setDeleting(false)
                  }
                }}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-incorrect/20 text-incorrect hover:bg-incorrect/30 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-lg text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
