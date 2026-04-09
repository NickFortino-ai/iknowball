import { useState, useEffect } from 'react'

/**
 * Live "Draft starts in X days" / "Draft is tomorrow" / "Draft is today
 * at 5:00 PM" indicator. Renders the absolute draft moment in the user's
 * own local timezone.
 *
 * Props:
 *   draftDate    — ISO timestamp string (UTC)
 *   draftStatus  — 'pending' | 'in_progress' | 'completed' | null
 *   compact      — if true, single-line minimal styling for cards
 */
export default function DraftStartsIn({ draftDate, draftStatus, compact = true }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!draftDate) return
    const t = setInterval(() => setNow(Date.now()), 60 * 1000)
    return () => clearInterval(t)
  }, [draftDate])

  if (!draftDate) return null
  if (draftStatus === 'completed') return null
  if (draftStatus === 'in_progress') {
    return (
      <div className="text-[11px] font-semibold text-correct uppercase tracking-wider">
        Drafting now
      </div>
    )
  }

  const target = new Date(draftDate)
  if (isNaN(target.getTime())) return null
  const remaining = target.getTime() - now
  const localTime = target.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  // Past start but draft_status still 'pending' — about to start
  if (remaining <= 0) {
    return (
      <div className="text-[11px] font-semibold text-correct uppercase tracking-wider">
        Draft starting…
      </div>
    )
  }

  // Compute calendar-day delta in user's local timezone (not just hours/24)
  const today = new Date(now)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  const dayDiff = Math.round((startOfTarget - startOfToday) / 86400000)

  let label
  if (dayDiff === 0) {
    label = `Draft is today at ${localTime}`
  } else if (dayDiff === 1) {
    label = `Draft is tomorrow at ${localTime}`
  } else if (dayDiff < 7) {
    label = `Draft starts in ${dayDiff} days`
  } else {
    label = `Draft starts in ${dayDiff} days`
  }

  if (compact) {
    return (
      <div className="text-[11px] font-semibold text-accent uppercase tracking-wider">
        {label}
      </div>
    )
  }
  // Prominent display: bigger, with a subtle background pill
  return (
    <div className="inline-flex flex-col items-end">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">Draft</div>
      <div className="text-base md:text-lg font-display text-accent leading-tight">
        {label.replace(/^Draft (is |starts )/, '')}
      </div>
    </div>
  )
}
