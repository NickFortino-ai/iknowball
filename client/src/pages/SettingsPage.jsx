import { useState, useEffect, useRef } from 'react'
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
import PasswordInput from '../components/ui/PasswordInput'
import { useLeagueBackdrops } from '../hooks/useLeagues'
import { getBackdropUrl } from '../lib/backdropUrl'
import NotificationPreferences from '../components/settings/NotificationPreferences'

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
    <div className="bg-bg-primary rounded-xl border border-text-primary/20 mb-4 overflow-hidden">
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
      <form
        onSubmit={(e) => { e.preventDefault(); handleChangePassword() }}
        className="space-y-3"
        autoComplete="on"
      >
        {/* Hidden username field helps iOS identify which account to autofill */}
        <input type="hidden" name="username" autoComplete="username" value={session?.user?.email || ''} />
        <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" autoComplete="current-password" name="current-password" className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 pr-10 text-sm text-text-primary focus:outline-none focus:border-accent" />
        <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" autoComplete="new-password" name="new-password" className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 pr-10 text-sm text-text-primary focus:outline-none focus:border-accent" />
        <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" name="confirm-password" className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 pr-10 text-sm text-text-primary focus:outline-none focus:border-accent" />
        <button
          type="submit"
          disabled={changing}
          className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm"
        >
          {changing ? 'Changing...' : 'Change Password'}
        </button>
      </form>
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
  const [backdropImage, setBackdropImage] = useState('')
  const [customBackdropFile, setCustomBackdropFile] = useState(null)
  const [customBackdropPreview, setCustomBackdropPreview] = useState(null)
  const [backdropSport, setBackdropSport] = useState(null)
  const backdropFileRef = useRef(null)
  const { data: availableBackdrops } = useLeagueBackdrops(backdropSport)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Push notification state
  const { data: pushStatus } = usePushStatus()
  const subscribePush = useSubscribePush()
  const unsubscribePush = useUnsubscribePush()
  const pushSupported = typeof window !== 'undefined' && 'PushManager' in window && 'serviceWorker' in navigator && !!import.meta.env.VITE_VAPID_PUBLIC_KEY
  const pushEnabled = pushStatus?.hasSubscriptions || false

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
      setBackdropImage(profile.backdrop_image || '')
      // push_preferences now owned by NotificationPreferences component
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

  function toggleSport(emoji) {
    setSelectedSports((prev) =>
      prev.includes(emoji)
        ? prev.filter((s) => s !== emoji)
        : [...prev, emoji]
    )
  }

  const hasChanges = profile && (
    displayName !== (profile.display_name || '') ||
    bio !== (profile.bio || '') ||
    avatarEmoji !== (profile.avatar_emoji || '') ||
    JSON.stringify(selectedSports) !== JSON.stringify(profile.sports_interests || []) ||
    titlePreference !== (profile.title_preference ?? null) ||
    xHandle !== (profile.x_handle || '') ||
    instagramHandle !== (profile.instagram_handle || '') ||
    tiktokHandle !== (profile.tiktok_handle || '') ||
    snapchatHandle !== (profile.snapchat_handle || '') ||
    youtubeHandle !== (profile.youtube_handle || '') ||
    venmoHandle !== (profile.venmo_handle || '') ||
    threadsHandle !== (profile.threads_handle || '') ||
    backdropImage !== (profile.backdrop_image || '') ||
    customBackdropFile !== null
  )

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
        backdrop_image: backdropImage || null,
      })
      // Upload custom backdrop if selected
      if (customBackdropFile) {
        const formData = new FormData()
        formData.append('image', customBackdropFile)
        formData.append('type', 'user_backdrop')
        try {
          await api.postForm('/backdrops/submit', formData)
          toast('Custom backdrop submitted for review', 'info')
        } catch { /* best effort */ }
        setCustomBackdropFile(null)
        setCustomBackdropPreview(null)
      }
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

      {/* Profile Backdrop */}
      <Section label="Profile Backdrop" defaultOpen={true}>
        <p className="text-xs text-text-muted mb-3">Shows on your profile card and profile modal.</p>
        {/* Sport filter */}
        <div className="flex gap-1.5 flex-wrap mb-3">
          {[
            { key: null, label: 'All' },
            { key: 'basketball_nba', label: 'NBA' },
            { key: 'americanfootball_nfl', label: 'NFL' },
            { key: 'touchdown_survivor', label: 'TD Legends' },
            { key: 'td_pass_competition', label: 'QBs' },
            { key: 'baseball_mlb', label: 'MLB' },
          ].map((s) => (
            <button
              key={s.key || 'all'}
              onClick={() => setBackdropSport(s.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                backdropSport === s.key ? 'bg-accent text-white' : 'bg-bg-input text-text-secondary hover:bg-border'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto rounded-lg pr-1">
          {/* Upload your own */}
          <button
            type="button"
            onClick={() => backdropFileRef.current?.click()}
            className={`relative rounded-lg overflow-hidden border-2 border-dashed transition-all aspect-[16/9] flex flex-col items-center justify-center gap-1 ${
              customBackdropFile ? 'border-accent bg-accent/10' : 'border-text-primary/20 hover:border-accent/50 bg-bg-primary'
            }`}
          >
            {customBackdropPreview ? (
              <img src={customBackdropPreview} alt="Custom" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <>
                <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-[9px] text-text-muted font-semibold leading-tight text-center px-1">Upload your own</span>
              </>
            )}
          </button>
          <input
            ref={backdropFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5MB', 'error'); return }
              setCustomBackdropFile(file)
              setCustomBackdropPreview(URL.createObjectURL(file))
              setBackdropImage('')
            }}
          />
          {/* Remove option */}
          {(backdropImage || customBackdropFile) && (
            <button
              type="button"
              onClick={() => { setBackdropImage(''); setCustomBackdropFile(null); setCustomBackdropPreview(null) }}
              className="relative rounded-lg overflow-hidden border-2 border-dashed border-text-primary/20 hover:border-incorrect/50 transition-all aspect-[16/9] flex flex-col items-center justify-center gap-1 bg-bg-primary"
            >
              <svg className="w-5 h-5 text-incorrect" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-[9px] text-text-muted font-semibold">Remove</span>
            </button>
          )}
          {/* Preset backdrops */}
          {(availableBackdrops || []).map((b) => (
            <button
              key={b.filename}
              type="button"
              onClick={() => { setBackdropImage(backdropImage === b.filename ? '' : b.filename); setCustomBackdropFile(null); setCustomBackdropPreview(null) }}
              className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                backdropImage === b.filename ? 'border-accent ring-1 ring-accent' : 'border-text-primary/20 hover:border-text-primary/40'
              }`}
            >
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <img src={getBackdropUrl(b.filename)} alt={b.label} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                  <span className="text-[10px] text-white font-medium">{b.label}</span>
                </div>
                {backdropImage === b.filename && (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-1.5">Custom images are submitted for admin review.</p>
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

      {/* Notifications */}
      <Section label="Notifications" defaultOpen={false}>
        {/* Web-only master subscribe toggle. Native iOS handles the master
            permission at the OS level (Settings → Notifications → IKB).
            Per-type preferences below work on both platforms. */}
        {!Capacitor.isNativePlatform() && pushSupported && (
          <>
            <button
              onClick={handlePushToggle}
              disabled={subscribePush.isPending || unsubscribePush.isPending}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-bg-input border border-border hover:border-border-hover transition-colors disabled:opacity-50 mb-4"
            >
              <span className="text-sm text-text-primary">Enable browser push notifications</span>
              <div className={`w-10 h-6 rounded-full transition-colors flex items-center ${pushEnabled ? 'bg-accent justify-end' : 'bg-border justify-start'}`}>
                <div className="w-5 h-5 bg-white rounded-full mx-0.5 shadow" />
              </div>
            </button>

            {Notification.permission === 'denied' && (
              <p className="text-xs text-red-400 mb-4">
                Notifications are blocked. Please enable them in your browser settings.
              </p>
            )}
          </>
        )}

        {!Capacitor.isNativePlatform() && !pushSupported && (
          <p className="text-sm text-text-muted mb-4">
            Push notifications aren't supported in this browser, but you can still tune your
            in-app notification types below.
          </p>
        )}

        <NotificationPreferences profile={profile} />
      </Section>

      {/* Blocked Users */}
      <BlockedUsersSection />

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving || !hasChanges}
        className={`w-full font-semibold py-3 rounded-xl transition-colors ${saving || !hasChanges ? 'bg-text-muted/30 text-text-muted cursor-not-allowed' : 'bg-accent hover:bg-accent-hover text-white'}`}
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>

      {/* Subscription */}
      <Section label="Subscription" defaultOpen={false}>
        {profile?.is_lifetime ? (
          <div className="text-sm text-correct font-semibold">Lifetime Access</div>
        ) : profile?.subscription_status === 'active' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-primary">Plan</span>
              <span className="text-sm text-text-secondary font-semibold">{profile.subscription_plan === 'yearly' ? '$10/year' : '$1/month'}</span>
            </div>
            {profile.subscription_expires_at && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-primary">Renews</span>
                <span className="text-sm text-text-secondary">{new Date(profile.subscription_expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            )}
            <button
              onClick={async () => {
                try {
                  const { url } = await api.post('/payments/create-portal-session')
                  window.location.href = url
                } catch {
                  toast('Failed to open subscription management', 'error')
                }
              }}
              className="w-full py-2.5 rounded-lg text-sm font-semibold border border-accent text-accent hover:bg-accent/10 transition-colors"
            >
              Manage Subscription
            </button>
          </div>
        ) : (
          <div className="text-sm text-text-muted">No active subscription</div>
        )}
      </Section>

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
