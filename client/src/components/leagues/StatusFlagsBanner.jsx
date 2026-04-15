import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'

// Explainer banner for the small green/yellow/red flag in the top-right
// corner of each league card. User feedback asked for this to be
// documented somewhere. Shows once per user; 'Understood' writes to
// localStorage and dismisses forever.

const DOTS = [
  {
    color: 'bg-correct',
    label: 'Green',
    description: 'You\'re set — lineup submitted, pick made, nothing to do right now.',
  },
  {
    color: 'bg-yellow-500',
    label: 'Yellow',
    description: 'You\'re set, but something needs a second look (e.g. one of your starters just picked up an injury).',
  },
  {
    color: 'bg-incorrect',
    label: 'Red',
    description: 'Action needed — you haven\'t made this period\'s pick or set your lineup yet.',
  },
]

export default function StatusFlagsBanner() {
  const userId = useAuthStore((s) => s.session?.user?.id)
  const storageKey = userId ? `ikb_readiness_banner_dismissed_${userId}` : null

  // Lazy-init from localStorage so we never flash the banner on mount.
  // Users logged in on this page already have their session hydrated
  // synchronously, so this is reliable. React 19's new
  // react-hooks/set-state-in-effect rule forbids doing this inside a
  // useEffect, which is why we compute it at init.
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return true
    const key = storageKey
    if (!key) return true
    return localStorage.getItem(key) === '1'
  })

  function handleDismiss() {
    if (storageKey) localStorage.setItem(storageKey, '1')
    setDismissed(true)
  }

  if (dismissed || !storageKey) return null

  return (
    <div className="relative bg-bg-primary border border-text-primary/20 rounded-xl p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-display text-base text-text-primary leading-tight">Quick guide: status flags</h2>
          <p className="text-xs text-text-muted mt-1">
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
      <p className="text-[11px] text-text-muted mt-3">
        Flags only appear for formats that take per-contest action (e.g. DFS lineups, survivor picks,
        pick'em). Tap the flag on a card for the specific reason.
      </p>
    </div>
  )
}
