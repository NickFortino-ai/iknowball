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
 * The current room is full strength and the others are dimmed, so the row
 * reads as "where you are" rather than three equal buttons — which is the
 * only thing distinguishing them once they all look this prominent.
 */
export function RoomButton({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`flex flex-col items-center justify-end gap-1 rounded-xl py-1 transition-all ${
        active ? 'text-accent' : 'text-accent/50 hover:text-accent/80'
      }`}
    >
      <Icon className={`w-14 h-14 transition-transform ${active ? 'scale-100' : 'scale-90'}`} />
      <span className="text-xs font-semibold leading-none">{label}</span>
    </button>
  )
}
