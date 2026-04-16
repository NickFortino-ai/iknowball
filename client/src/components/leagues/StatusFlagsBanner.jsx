import { useQueryClient } from '@tanstack/react-query'
import { useProfile } from '../../hooks/useProfile'
import { api } from '../../lib/api'

// Explainer banner for the small green/yellow/red flag in the top-right
// corner of each league card. Dismissal persists on the user row
// (users.has_dismissed_readiness_banner) so "Understood" clicked on
// one device hides the banner on every other device too.

const DOTS = [
  {
    color: 'bg-correct',
    label: 'Green',
    description: 'You\'re set — lineup submitted, pick made, nothing to do right now.',
  },
  {
    color: 'bg-yellow-500',
    label: 'Yellow',
    description: 'You\'re set, but you need to keep an eye on something (e.g. one of your starters is questionable to play).',
  },
  {
    color: 'bg-incorrect',
    label: 'Red',
    description: 'Action needed — you haven\'t made this period\'s pick or set your lineup yet.',
  },
]

export default function StatusFlagsBanner() {
  const { data: profile } = useProfile()
  const queryClient = useQueryClient()

  // While the profile is loading, don't flash the banner — wait for
  // the source of truth. This also prevents the banner from briefly
  // appearing for users who have already dismissed it on another device.
  if (!profile) return null
  if (profile.has_dismissed_readiness_banner) return null

  async function handleDismiss() {
    // Optimistic update so the banner disappears immediately
    queryClient.setQueryData(['profile'], (prev) =>
      prev ? { ...prev, has_dismissed_readiness_banner: true } : prev
    )
    try {
      await api.patch('/users/me', { has_dismissed_readiness_banner: true })
    } catch (_) {
      // If the PATCH fails, roll back the optimistic update so the user
      // gets another chance. Rare; no toast needed.
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    }
  }

  return (
    <div className="relative bg-bg-primary border border-text-primary/20 rounded-xl p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-display text-base text-text-primary leading-tight">Quick guide: status flags</h2>
          <p className="text-sm text-text-primary mt-1">
            Each league card has a small colored flag in the top right corner showing whether you
            need to act.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition-colors"
        >
          Understood
        </button>
      </div>
      <div className="space-y-2">
        {DOTS.map((dot) => (
          <div key={dot.label} className="flex items-start gap-3">
            <span className={`mt-1 shrink-0 w-3 h-3 rounded-full ${dot.color}`} />
            <div className="text-sm text-text-secondary">
              <span className="font-semibold text-text-primary">{dot.label}:</span> {dot.description}
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm text-text-primary mt-3">
        Flags only appear for formats that take per-contest action (e.g. Fantasy, survivor picks,
        pick'em). Tap the flag on a card for the specific reason.
      </p>
    </div>
  )
}
