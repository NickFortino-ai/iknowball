/**
 * The arcade's back control, used on every screen in it.
 *
 * One component because a back affordance that comes and goes is worse than
 * none: the memory result screen had no way out at all, so finishing a round
 * left you with "Play again" or "Change difficulty" and nothing else — the
 * only exit was the browser's own back button.
 *
 * It always goes exactly one level up: mid-round back out to the setup
 * screen, setup and results back out to the arcade. Top-left at a 44px
 * target, which is where a thumb looks for it.
 */
export default function ArcadeBack({ onClick, label = 'Arcade' }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Back to ${label}`}
      className="-ml-2 flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg px-2 text-text-muted transition-colors hover:text-text-primary"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      <span className="text-xs font-semibold">{label}</span>
    </button>
  )
}
