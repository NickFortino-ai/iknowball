import { useState, useEffect } from 'react'
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

export default function SettingsPage() {
  const { data: profile, isLoading, refetch } = useProfile()
  const fetchProfile = useAuthStore((s) => s.fetchProfile)

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarEmoji, setAvatarEmoji] = useState('')
  const [selectedSports, setSelectedSports] = useState([])
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
      await api.patch('/users/me', {
        display_name: displayName || undefined,
        bio,
        avatar_emoji: avatarEmoji,
        sports_interests: selectedSports,
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
      <div className="bg-bg-card rounded-xl border border-border p-4 mb-4">
        <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
          Display Name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          placeholder="Your display name"
        />
      </div>

      {/* Bio */}
      <div className="bg-bg-card rounded-xl border border-border p-4 mb-4">
        <label className="block text-xs text-text-muted uppercase tracking-wider mb-2">
          Bio
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={200}
          rows={3}
          className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent resize-none"
          placeholder="Tell people about yourself..."
        />
        <div className="text-right text-xs text-text-muted mt-1">{bio.length}/200</div>
      </div>

      {/* Avatar Emoji */}
      <div className="bg-bg-card rounded-xl border border-border p-4 mb-4">
        <label className="block text-xs text-text-muted uppercase tracking-wider mb-3">
          Profile Icon
        </label>
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
      </div>

      {/* Sports Interests */}
      <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
        <label className="block text-xs text-text-muted uppercase tracking-wider mb-3">
          Sports Interests
        </label>
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
      </div>

      {/* Push Notifications */}
      <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
        <label className="block text-xs text-text-muted uppercase tracking-wider mb-3">
          Push Notifications
        </label>

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
      </div>

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
