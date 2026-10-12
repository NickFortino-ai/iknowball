/**
 * The Hub's room marks.
 *
 * Each is a square-canvas PNG keyed off its own flat background and trimmed
 * to the subject, so `w-N h-N` sizes it without distorting anything. They
 * bring their own colour rather than following currentColor.
 *
 */
export function NewsIcon({ className = 'w-5 h-5' }) {
  return <img src="/news-icon.png" alt="" aria-hidden="true" draggable={false} className={`${className} object-contain`} />
}

export function FeedIcon({ className = 'w-5 h-5' }) {
  return <img src="/feed-icon.png" alt="" aria-hidden="true" draggable={false} className={`${className} object-contain`} />
}

/**
 * One room launcher: the mark, the word, and nothing else.
 *
 * NOTHING IS DIMMED. The marks are the brightest thing on the Hub and the
 * point of them is that they look good — fading two of the three to show
 * which room you are in spent that to say something the screen already
 * says. You can see which room you are in; the accent label confirms it.
 *
 * So the active state lives in the LABEL's colour alone, and every mark
 * stays at full strength.
 *
 * `iconClass` is per-room on purpose. The marks fill their square canvases
 * very differently — the cabinet is tall and narrow, the feed card nearly
 * square — so one size makes them look like three different sizes. These
 * are tuned to look equal, not to be equal.
 */
export function RoomButton({ icon: Icon, label, active, onClick, iconClass = 'w-14 h-14', ...rest }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className="flex flex-col items-center justify-end gap-1 rounded-xl py-1 transition-transform active:scale-95"
      {...rest}
    >
      <Icon className={iconClass} />
      <span className={`text-xs font-semibold leading-none ${active ? 'text-accent' : 'text-text-secondary'}`}>
        {label}
      </span>
    </button>
  )
}
