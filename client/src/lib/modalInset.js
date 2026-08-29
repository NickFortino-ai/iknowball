// Padding for a full-screen modal overlay so its card can never sit under the
// fixed navbar or a device notch.
//
// The navbar is 3.5rem and is itself pushed down by env(safe-area-inset-top),
// so a centred card needs to clear both. Without this, any modal tall enough
// to hit its max-height loses its top edge — including, usually, the close
// button. On a 844px iPhone with ~59px of inset, chrome is ~115px while a
// centred 90vh card starts at 42px, so ~73px is hidden behind the header.
//
// That exact failure shipped twice: Game Center (users couldn't dismiss it at
// all) and the league preview modal.
//
// Use with `max-h-full` on the card rather than a hardcoded max-h-[85vh] —
// the padded flex container then does the constraining, so the two can't
// drift out of sync the way a magic number does.
export const MODAL_INSET_STYLE = {
  paddingTop: 'max(1.5rem, calc(3.5rem + env(safe-area-inset-top) + 1rem))',
  paddingBottom: 'max(1.5rem, calc(3.5rem + env(safe-area-inset-bottom) + 1rem))',
}
