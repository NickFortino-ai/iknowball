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
 * Only the ICON carries the active state. Dimming the label too made the
 * words unreadable at the size they sit at — Nick had to zoom in to tell
 * News from Arcade — and a label you can't read is a worse trade than a
 * slightly quieter "you are here".
 *
 * `iconClass` is per-room on purpose. The marks fill their square canvases
 * very differently — the cabinet is tall and narrow, the feed card nearly
 * square — so one size makes them look like three different sizes. These
 * are tuned to look equal, not to be equal.
 */
export function RoomButton({ icon: Icon, label, active, onClick, iconClass = 'w-14 h-14' }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className="flex flex-col items-center justify-end gap-1 rounded-xl py-1"
    >
      <Icon className={`${iconClass} transition-all ${active ? 'opacity-100 scale-100' : 'opacity-60 scale-90'}`} />
      <span className={`text-xs font-semibold leading-none ${active ? 'text-accent' : 'text-text-secondary'}`}>
        {label}
      </span>
    </button>
  )
}
