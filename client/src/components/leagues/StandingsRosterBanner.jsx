import { useQueryClient } from '@tanstack/react-query'
import { useProfile } from '../../hooks/useProfile'
import { api } from '../../lib/api'

// Explainer banner for the inline-roster expansion in fantasy standings.
// Dismissal persists on the user row (users.has_dismissed_standings_roster_banner)
// so "Understood" clicked on one device hides the banner on every other device too.
export default function StandingsRosterBanner() {
  const { data: profile } = useProfile()
  const queryClient = useQueryClient()

  if (!profile) return null
  if (profile.has_dismissed_standings_roster_banner) return null

  async function handleDismiss() {
    queryClient.setQueryData(['profile'], (prev) =>
      prev ? { ...prev, has_dismissed_standings_roster_banner: true } : prev
    )
    try {
      await api.patch('/users/me', { has_dismissed_standings_roster_banner: true })
    } catch (_) {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    }
  }

  return (
    <div className="relative bg-bg-primary border border-text-primary/20 rounded-xl p-4 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base text-text-primary leading-tight">Quick guide</h2>
          <p className="text-sm text-text-primary mt-1">
            Tap a manager's <span className="font-semibold">row</span> to see their roster.
            Tap their <span className="font-semibold">avatar</span> to open their profile.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors"
        >
          Understood
        </button>
      </div>
    </div>
  )
}
