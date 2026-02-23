import { useState, useEffect, useCallback } from 'react'
import { useProfile } from '../hooks/useProfile'
import { useAuthStore } from '../stores/authStore'
import { api } from '../lib/api'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { toast } from '../components/ui/Toast'
import { usePushStatus, useSubscribePush, useUnsubscribePush } from '../hooks/usePushNotifications'

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

export default function SettingsPage() {
  const { data: profile, isLoading, refetch } = useProfile()
  const fetchProfile = useAuthStore((s) => s.fetchProfile)

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarEmoji, setAvatarEmoji] = useState('')
  const [selectedSports, setSelectedSports] = useState([])
  const [titlePreference, setTitlePreference] = useState(null)
  const [xHandle, setXHandle] = useState('')
  const [instagramHandle, setInstagramHandle] = useState('')
  const [tiktokHandle, setTiktokHandle] = useState('')
  const [snapchatHandle, setSnapchatHandle] = useState('')
  const [saving, setSaving] = useState(false)

  // Push notification state
  const { data: pushStatus } = usePushStatus()
  const subscribePush = useSubscribePush()
  const unsubscribePush = useUnsubscribePush()
  const pushSupported = typeof window !== 'undefined' && 'PushManager' in window && 'serviceWorker' in navigator && !!import.meta.env.VITE_VAPID_PUBLIC_KEY
  const pushEnabled = pushStatus?.hasSubscriptions || false

  const [pushPrefs, setPushPrefs] = useState({ parlay_result: true, streak_milestone: true })

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
      })
      await refetch()
      await fetchProfile()
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
      <Section label="Title & Pronouns">
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'king', icon: '♚', label: 'King', pronouns: 'he/him' },
            { value: 'queen', icon: '♛', label: 'Queen', pronouns: 'she/her' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setTitlePreference(titlePreference === option.value ? null : option.value)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg text-sm transition-all ${
                titlePreference === option.value
                  ? 'bg-accent/20 border-2 border-accent'
                  : 'bg-bg-input border border-border hover:border-border-hover'
              }`}
            >
              <span className="text-lg">{option.icon}</span>
              <span className={titlePreference === option.value ? 'text-accent font-semibold' : 'text-text-secondary'}>
                {option.label}
              </span>
              <span className="text-xs text-text-muted">{option.pronouns}</span>
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
            { label: 'Snapchat', value: snapchatHandle, set: setSnapchatHandle, placeholder: 'username' },
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
        {!pushSupported ? (
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

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  )
}
