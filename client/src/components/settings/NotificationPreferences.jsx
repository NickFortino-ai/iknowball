import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import { toast } from '../ui/Toast'

// Active notification types the server can fire pushes for, grouped
// into user-facing categories. If you add a new notification type to
// PUSH_ELIGIBLE_TYPES in notificationService.js, mirror it here so
// users can control it.
const CATEGORIES = [
  {
    label: 'Pick outcomes',
    types: [
      { key: 'parlay_result', label: 'Parlay results' },
      { key: 'futures_result', label: 'Futures results' },
      { key: 'streak_milestone', label: 'Streak milestones' },
      { key: 'squares_quarter_win', label: 'Squares quarter wins' },
    ],
  },
  {
    label: 'Achievements',
    types: [
      { key: 'record_broken', label: 'Record broken' },
      { key: 'survivor_win', label: 'Survivor pool wins' },
      { key: 'league_win', label: 'League wins' },
      { key: 'headlines', label: 'Weekly Headlines' },
    ],
  },
  {
    label: 'League activity',
    types: [
      { key: 'league_invitation', label: 'League invitations' },
      { key: 'league_thread_mention', label: 'Mentions in league threads' },
      { key: 'survivor_result', label: 'Survivor daily results' },
      { key: 'league_report', label: 'League reports' },
    ],
  },
  {
    label: 'Reminders',
    types: [
      { key: 'nfl_injury_warning', label: 'NFL injury warnings' },
    ],
  },
  {
    label: 'Fantasy football',
    types: [
      { key: 'fantasy_trade_proposed', label: 'Trade proposed' },
      { key: 'fantasy_trade_accepted', label: 'Trade accepted' },
      { key: 'fantasy_trade_declined', label: 'Trade declined' },
      { key: 'fantasy_waiver_awarded', label: 'Waiver claim awarded' },
      { key: 'fantasy_stat_correction', label: 'Stat corrections' },
    ],
  },
]

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-bg-secondary'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
      aria-checked={checked}
      role="switch"
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

export default function NotificationPreferences({ profile }) {
  const [prefs, setPrefs] = useState({})
  const [saving, setSaving] = useState(null) // key currently being toggled

  // Load prefs from profile. Missing key → default true.
  useEffect(() => {
    setPrefs(profile?.push_preferences || {})
  }, [profile])

  async function toggle(key) {
    const newValue = prefs[key] === false ? true : false
    const updated = { ...prefs, [key]: newValue }
    setPrefs(updated)
    setSaving(key)
    try {
      await api.patch('/users/me', { push_preferences: updated })
    } catch {
      // Revert on error
      setPrefs(prefs)
      toast('Failed to save preference', 'error')
    } finally {
      setSaving(null)
    }
  }

  // A key is "on" if it's not explicitly false (missing or true = on)
  const isOn = (key) => prefs[key] !== false

  return (
    <div className="space-y-5">
      <p className="text-xs text-text-muted">
        Control which notifications you receive. To manage where they appear (lock screen, sounds,
        banners), use your device's system Settings → Notifications → I KNOW BALL.
      </p>

      {CATEGORIES.map((category) => (
        <div key={category.label}>
          <h3 className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-2">
            {category.label}
          </h3>
          <div className="bg-bg-primary border border-text-primary/20 rounded-xl divide-y divide-text-primary/10">
            {category.types.map((t) => (
              <div key={t.key} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-text-primary">{t.label}</span>
                <Toggle
                  checked={isOn(t.key)}
                  onChange={() => toggle(t.key)}
                  disabled={saving === t.key}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
